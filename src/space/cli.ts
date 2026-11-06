import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { readSpaceUsage, renderSpaceMarkdown, SpaceUsageError, validateSpaceOptions } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runSpace(options: { target: string; section?: string; all?: boolean; owner?: string; top?: string; json?: boolean; markdown?: boolean }): Promise<void> {
	if (options.json && options.markdown) throw new SpaceUsageError('Choose --json or --markdown');
	const filters = { sections: options.section?.split(',').map(id => id.trim()), includeOracleMaintained: options.all, owner: options.owner, top: options.top === undefined ? undefined : /^\d+$/.test(options.top) ? Number(options.top) : NaN };
	validateSpaceOptions(filters);
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new SpaceUsageError('Unknown space target');
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'space:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		const result = await readSpaceUsage(session, filters);
		console.log(options.json ? JSON.stringify(result) : renderSpaceMarkdown(result));
		if (result.status === 'failed') process.exitCode = 1;
	} finally { await sessions.closeAll(); }
}
