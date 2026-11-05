import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { findSqlCandidates, readSqlInsight, renderSqlInsightMarkdown, SqlUsageError, validateSqlOptions } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runSql(options: { target: string; sqlId?: string; text?: string; child?: string; json?: boolean; markdown?: boolean }): Promise<void> {
	if ((options.sqlId === undefined) === (options.text === undefined)) throw new SqlUsageError('Choose exactly one of --sql-id or --text');
	if (options.json && options.markdown) throw new SqlUsageError('Choose --json or --markdown');
	const child = options.child === undefined ? undefined : /^\d+$/.test(options.child) ? Number(options.child) : NaN;
	if (options.sqlId) validateSqlOptions({ sqlId: options.sqlId, child });
	else {
		if (!options.text?.trim() || options.text.length > 2048) throw new SqlUsageError('text must contain 1–2048 characters');
		if (child !== undefined && (!Number.isInteger(child) || child < 0)) throw new SqlUsageError('child must be a nonnegative integer');
	}
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new SqlUsageError('Unknown SQL insight target');
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'sql:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		let sqlId = options.sqlId;
		if (sqlId === undefined) {
			const candidates = await findSqlCandidates(session, options.text!);
			if (candidates.rows.length !== 1 || candidates.truncated) {
				const result = { status: 'skipped', target: options.target, message: candidates.rows.length ? 'Select a candidate with --sql-id; never guessing.' : 'No cached SQL matched.', truncated: candidates.truncated || candidates.rows.length > 10, candidates: candidates.rows.slice(0, 10).map(r => ({ sqlId: r[0], text: r[1] })) };
				console.log(options.json ? JSON.stringify(result) : result.message + '\n' + result.candidates.map(r => String(r.sqlId) + ' | ' + String(r.text).replace(/[\r\n]/g, ' ')).join('\n') + (result.truncated ? '\nCandidate cap reached.' : '')); return;
			}
			sqlId = String(candidates.rows[0]![0]);
		}
		const result = await readSqlInsight(session, { sqlId, child });
		console.log(options.json ? JSON.stringify(result) : renderSqlInsightMarkdown(result));
	} finally { await sessions.closeAll(); }
}
