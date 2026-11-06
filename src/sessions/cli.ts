import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { readSessionActivity, renderSessionsMarkdown, SessionsUsageError, validateSessionsOptions } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runSessions(options: { target: string; section?: string; all?: boolean; minTxSeconds?: string; top?: string; json?: boolean; markdown?: boolean }): Promise<void> {
	if (options.json && options.markdown) throw new SessionsUsageError('Choose --json or --markdown');
	const filters = { sections: options.section?.split(',').map(id => id.trim()), includeBackground: options.all, minTxSeconds: options.minTxSeconds === undefined ? undefined : /^\d+$/.test(options.minTxSeconds) ? Number(options.minTxSeconds) : NaN, topWaits: options.top === undefined ? undefined : /^\d+$/.test(options.top) ? Number(options.top) : NaN };
	validateSessionsOptions(filters);
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new SessionsUsageError('Unknown sessions target');
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'sessions:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		const result = await readSessionActivity(session, filters);
		console.log(options.json ? JSON.stringify(result) : renderSessionsMarkdown(result));
		if (result.status === 'failed') process.exitCode = 1;
	} finally { await sessions.closeAll(); }
}
