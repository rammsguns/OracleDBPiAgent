import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readBackup } from '../backup/index.js';
import { sampleTop } from '../top/index.js';

export const needsBackup = (issue: string) => /\b(?:can\s+(?:we|i)\s+(?:recover|restore)|recoverability|backup\s+(?:failed|failure)|(?:failed|last|latest|successful|missing|no)\s+backups?|restore\s+to|RMAN(?:-\d+)?|ORA-19\d{3})\b/i.test(issue);
export const needsTop = (issue: string) => /\b(?:slow|slowness)\s+(?:right\s+now|now|at\s+the\s+moment)\b/i.test(issue);
export const needsJobs = (issue: string) => /\bORA-12012\b|\b(?:job|scheduler)\b[\s\S]{0,100}\b(?:failed|failure|error|broken)\b|\b(?:failed|failing|broken)\s+(?:scheduler\s+)?job\b/i.test(issue);

/** Shared bounded/audited adapter; no credentials or bind values enter audit events. */
export async function withFeatureSession<T>(ctx: ToolContext, target: string, tool: string, read: (session: OracleSession) => Promise<T>): Promise<T> {
	if (!ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target)) throw new Error('Unknown or unpinned feature target');
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = {
		target: raw.target, identity: raw.identity, close: () => raw.close(),
		query: async (sql, binds, options) => {
			const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool, sqlSha256: createHash('sha256').update(sql).digest('hex') };
			try {
				const data = await raw.query(sql, binds, { maxRows: ctx.config.limits.maxRows, timeoutSeconds: ctx.config.limits.statementTimeoutSeconds, ...options });
				await ctx.audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
				return data;
			} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
		},
	};
	try { return await read(session); } finally { await session.close(); }
}
export const collectBackup = (ctx: ToolContext, target: string) => withFeatureSession(ctx, target, 'feature:backup', readBackup);
export const collectTop = (ctx: ToolContext, target: string, seconds = 15, signal?: AbortSignal) => withFeatureSession(ctx, target, 'feature:top', session => {
	signal?.throwIfAborted();
	return sampleTop(session, seconds, { now: () => performance.now(), sleep: async ms => { await setTimeout(ms, undefined, { signal }); signal?.throwIfAborted(); } });
});
