/** DB-only backup truth smoke: npx tsx evals/validate-p25.ts --target d1-19c-lab */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { createSessionProvider } from '../src/oracle/index.js';
import type { OracleSession } from '../src/contracts.js';
import type { EvalCase } from './types.js';
import { checkP25Cases, loadHardCases } from './validate-hard.js';

export const BACKUP_VIEWS = ['V$RMAN_BACKUP_JOB_DETAILS', 'V$BACKUP_SET', 'V$BACKUP_PIECE', 'V$BACKUP_DATAFILE', 'V$ARCHIVED_LOG', 'V$LOG_HISTORY', 'V$CONTROLFILE', 'V$RMAN_CONFIGURATION', 'V$DATABASE_BLOCK_CORRUPTION', 'V$RECOVER_FILE'] as const;

function accessCode(error: unknown): string | undefined {
	if (error && typeof error === 'object' && 'code' in error && ['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(String(error.code))) return String(error.code);
	return undefined;
}

/** Missing views are evidence gaps, never zero backup/gap counts. Unexpected errors fail. */
export async function inspectP25(session: Pick<OracleSession, 'query' | 'identity'>, cases: EvalCase[]) {
	checkP25Cases(cases);
	const containerResult = await session.query("SELECT SYS_CONTEXT('USERENV','CON_ID'), SYS_CONTEXT('USERENV','CON_NAME') FROM dual", {}, { maxRows: 1 });
	const [rawId, rawName] = containerResult.rows[0] ?? [];
	const containerId = Number(rawId);
	if (rawId == null || String(rawId).trim() === '' || !Number.isSafeInteger(containerId) || containerId < 0 || typeof rawName !== 'string' || !rawName.trim()) throw new Error('Invalid session container metadata');
	const container = { id: containerId, name: rawName };
	// CON_ID 0 is a non-CDB, 1 is CDB$ROOT, and >1 identifies a PDB (including seed).
	const isPdb = container.id > 1;
	const views = [];
	for (const view of BACKUP_VIEWS) {
		try {
			await session.query(`SELECT 1 FROM ${view} WHERE ROWNUM = 0`, {}, { maxRows: 1 });
			views.push({ view, status: 'readable' });
		} catch (error) {
			const code = accessCode(error);
			if (!code) throw error;
			views.push({ view, status: 'not verifiable from this database', code });
		}
	}
	const records = [];
	for (const test of cases) {
		if (isPdb) {
			records.push({ id: test.id, status: 'not verifiable from this database', code: 'PDB_VISIBILITY_UNVERIFIED' });
			continue;
		}
		try {
			const result = await session.query(test.groundTruth!.sql, {}, { maxRows: 100 });
			if (result.truncated || !result.rows.length || result.rows.some(row => row.some(cell => cell == null))) throw new Error(`Invalid p25 truth: ${test.id}`);
			records.push({ id: test.id, status: 'readable', rows: result.rows });
		} catch (error) {
			const code = accessCode(error);
			if (!code) throw error;
			records.push({ id: test.id, status: 'not verifiable from this database', code });
		}
	}
	return {
		scope: 'CDB-wide (shared by all PDBs)',
		container,
		note: isPdb ? 'PDB visibility may hide control-file records; empty rows do not establish absence.' : 'Readable empty control-file history does not prove external backups absent or restoration impossible.',
		views, records,
	};
}

export async function validateP25(target: string) {
	if (!['d1-19c-lab', 'p1-19c-prod'].includes(target)) throw new Error('Only the two lab targets are allowed');
	// Pin packaged lab config: this worker command never follows an owner private target file.
	const config = loadConfig({ ...process.env, PIAGENT_TARGETS_FILE: fileURLToPath(new URL('../config/targets.json', import.meta.url)) });
	const sessions = createSessionProvider(config);
	try {
		const session = await sessions.get(target);
		try {
			const cases = (await loadHardCases()).filter(test => test.category === 'backup');
			return { target, validatedAt: new Date().toISOString(), ...await inspectP25(session, cases) };
		} finally { await session.close(); }
	} finally { await sessions.closeAll(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.length !== 4 || process.argv[2] !== '--target') throw new Error('Usage: npx tsx evals/validate-p25.ts --target <lab-target>');
	const report = await validateP25(process.argv[3]!);
	await writeFile(new URL(`../docs/wp-25d-live-${report.target}.json`, import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report, null, '\t'));
}
