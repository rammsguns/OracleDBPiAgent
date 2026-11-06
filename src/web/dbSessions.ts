import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSessionActivity, renderSessionsMarkdown, validateSessionsOptions, type SessionsOptions } from '../sessions/index.js';
export function validateWebDbSessions(data: Record<string, unknown>): SessionsOptions {
	for (const key of Object.keys(data)) if (!['target', 'sections', 'includeBackground', 'minTxSeconds', 'topWaits'].includes(key)) throw new Error('Invalid option');
	if (data.includeBackground !== undefined && !['true', 'false'].includes(String(data.includeBackground))) throw new Error('Invalid background option');
	for (const key of ['minTxSeconds', 'topWaits']) if (data[key] !== undefined && !/^\d+$/.test(String(data[key]))) throw new Error('Invalid number');
	const options: SessionsOptions = {
		...(data.sections !== undefined ? { sections: String(data.sections).split(',') } : {}),
		includeBackground: data.includeBackground === 'true',
		...(data.minTxSeconds !== undefined ? { minTxSeconds: Number(data.minTxSeconds) } : {}),
		...(data.topWaits !== undefined ? { topWaits: Number(data.topWaits) } : {}),
	};
	validateSessionsOptions(options); return options;
}
export async function readWebDbSessions(ctx: ToolContext, target: string, data: Record<string, unknown>, readers: { readSessionActivity?: typeof readSessionActivity }) {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, options) => {
		const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'web:db-sessions', sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, options);
			await ctx.audit.record({ ...event, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs }); return result;
		} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
	} };
	const activity = await (readers.readSessionActivity ?? readSessionActivity)(session, validateWebDbSessions(data));
	const evidence = ({ view, status, truncated, attempts }: typeof activity.sections.active.evidence) => ({ view, status, truncated, attempts });
	const sections = Object.fromEntries(Object.entries(activity.sections).map(([key, section]) => [key, { ...section, evidence: evidence(section.evidence), supportingEvidence: section.supportingEvidence.map(evidence) }]));
	return { result: { ...activity, sections }, markdown: renderSessionsMarkdown(activity) };
}
