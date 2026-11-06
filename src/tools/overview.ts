import { createHash } from 'node:crypto';
import type { OracleSession, QueryResult, ToolContext } from '../contracts.js';

/** PDB overview reads each view independently so one missing grant loses only its facts. */
export async function readPdbOverview(session: OracleSession, ctx: ToolContext): Promise<QueryResult & { sourceNote: string; scopes: Record<string, string> }> {
	const wide = 'CDB-wide (shared by all PDBs in this CDB)';
	const scopes = { database: wide, instance: wide, sga: wide, pga: wide, character_set: 'Current PDB', datafiles: 'Current PDB', container: 'Current PDB' };
	const values: unknown[] = [session.identity.dbName, 'YES', session.identity.versionFull, session.identity.instanceName, session.identity.hostName, null, null, null, null, null, session.identity.containerName ?? 'unknown'];
	const notes: string[] = [];
	let elapsedMs = 0;
	const groups = [
		{ view: 'V$DATABASE', sql: 'SELECT name, cdb FROM v$database', positions: [0, 1] },
		{ view: 'V$INSTANCE', sql: 'SELECT version_full, instance_name, host_name, startup_time FROM v$instance', positions: [2, 3, 4, 5] },
		{ view: 'NLS_DATABASE_PARAMETERS', sql: "SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET'", positions: [6] },
		{ view: 'DBA_DATA_FILES', sql: 'SELECT SUM(bytes) FROM dba_data_files', positions: [7] },
		{ view: 'V$SGA', sql: 'SELECT SUM(value) FROM v$sga', positions: [8] },
		{ view: 'V$PGASTAT', sql: "SELECT value FROM v$pgastat WHERE name='total PGA allocated'", positions: [9] },
	];
	for (const group of groups) {
		const base = { at: new Date().toISOString(), runId: ctx.runId, target: session.target.name, tool: 'db_overview', sqlSha256: createHash('sha256').update(group.sql).digest('hex') };
		try {
			const data = await session.query(group.sql, {}, { maxRows: 1, timeoutSeconds: ctx.config.limits.statementTimeoutSeconds });
			elapsedMs += data.elapsedMs;
			if (data.rows[0]) group.positions.forEach((position, i) => { values[position] = data.rows[0]![i] ?? null; });
			else notes.push(`${group.view}: no visible rows; facts unavailable (identity fields retained from connection).`);
			await ctx.audit.record({ ...base, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
		} catch (error) {
			const code = /ORA-\d{5}/.exec(String(error))?.[0];
			await ctx.audit.record({ ...base, kind: 'tool_error', detail: code ?? 'OverviewQueryError' });
			if (!code || !['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) throw error;
			notes.push(`${group.view}: not available in this PDB / not granted (${code}); identity fields retained from connection, other facts NULL.`);
		}
	}
	return { columns: ['NAME', 'CDB', 'VERSION_FULL', 'INSTANCE_NAME', 'HOST_NAME', 'STARTUP_TIME', 'CHARACTER_SET', 'DATAFILE_BYTES', 'SGA_BYTES', 'PGA_BYTES', 'CONTAINER_NAME'], rows: [values], truncated: false, elapsedMs, scopes,
		sourceNote: `Container: ${session.identity.containerName ?? 'unknown'}. Database/instance/startup/SGA/PGA: ${wide}. Character set/datafile bytes: current PDB. ${notes.join(' ')}` };
}
