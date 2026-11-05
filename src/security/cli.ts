import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { readSecurityPosture, renderSecurityMarkdown, SecurityUsageError, validateSecurityOptions } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runSecurity(options: { target: string; check?: string; whoCan?: string; json?: boolean; markdown?: boolean }): Promise<void> {
	if (options.json && options.markdown) throw new SecurityUsageError('Choose --json or --markdown');
	const filters = { checks: options.check?.split(',').map(id => id.trim()), whoCan: options.whoCan };
	validateSecurityOptions(filters);
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new SecurityUsageError('Unknown security target');
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'security:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		const result = await readSecurityPosture(session, filters);
		console.log(options.json ? JSON.stringify(result) : renderSecurityMarkdown(result));
	} finally { await sessions.closeAll(); }
}
