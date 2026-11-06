import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { sampleTop, renderTop, validateSeconds } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runTop(options: { target: string; seconds?: string; json?: boolean }): Promise<void> {
	const seconds = options.seconds === undefined ? 15 : /^\d+$/.test(options.seconds) ? Number(options.seconds) : NaN;
	validateSeconds(seconds);
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new Error('Unknown top target');
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'top:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		const result = await sampleTop(session, seconds);
		console.log(options.json ? JSON.stringify(result) : renderTop(result));
		if (result.status === 'failed') process.exitCode = 1;
	} finally { await sessions.closeAll(); }
}
