import { requireConfiguredTarget } from '../config/targetUsage.js';
import { randomUUID, createHash } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { readBackup, renderBackupMarkdown, BackupUsageError } from './index.js';
import type { OracleSession } from '../contracts.js';
export async function runBackup(options: { target: string; json?: boolean }): Promise<void> {
	const config = loadConfig();
	requireConfiguredTarget(options.target, config.targets, BackupUsageError);
	const sessions = createSessionProvider(config), audit = new JsonlAuditSink(config.auditFile), runId = randomUUID();
	try {
		const raw = await sessions.get(options.target);
		const session: OracleSession = {
			target: raw.target, identity: raw.identity, close: () => raw.close(),
			query: async (sql, binds, queryOptions) => {
				const event = { at: new Date().toISOString(), runId, target: options.target, tool: 'backup:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const data = await raw.query(sql, binds, queryOptions);
					await audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs }); return data;
				} catch (error) { await audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
			},
		};
		const result = await readBackup(session);
		console.log(options.json ? JSON.stringify(result) : renderBackupMarkdown(result));
	} finally { await sessions.closeAll(); }
}
