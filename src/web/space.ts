import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSpaceUsage, renderSpaceMarkdown, validateSpaceOptions, type SpaceOptions } from '../space/index.js';
export function validateWebSpace(data: Record<string, unknown>): SpaceOptions {
	for (const key of Object.keys(data)) if (!['target', 'sections', 'owner', 'top', 'includeOracleMaintained'].includes(key)) throw new Error('Invalid option');
	if (data.includeOracleMaintained !== undefined && !['true', 'false'].includes(String(data.includeOracleMaintained))) throw new Error('Invalid owner option');
	if (data.top !== undefined && !/^\d+$/.test(String(data.top))) throw new Error('Invalid number');
	const options: SpaceOptions = {
		...(data.sections !== undefined ? { sections: String(data.sections).split(',') } : {}),
		...(data.owner !== undefined ? { owner: String(data.owner) } : {}),
		...(data.top !== undefined ? { top: Number(data.top) } : {}),
		includeOracleMaintained: data.includeOracleMaintained === 'true',
	};
	validateSpaceOptions(options); return options;
}
export async function readWebSpace(ctx: ToolContext, target: string, data: Record<string, unknown>, readers: { readSpaceUsage?: typeof readSpaceUsage }) {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, options) => {
		const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'web:space', sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, options);
			await ctx.audit.record({ ...event, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs }); return result;
		} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
	} };
	const activity = await (readers.readSpaceUsage ?? readSpaceUsage)(session, validateWebSpace(data));
	const evidence = ({ view, status, truncated, attempts }: typeof activity.sections.tablespaces.evidence) => ({ view, status, truncated, attempts });
	const sections = Object.fromEntries(Object.entries(activity.sections).map(([key, section]) => [key, { ...section, evidence: evidence(section.evidence), supportingEvidence: section.supportingEvidence.map(evidence) }]));
	return { result: { ...activity, sections }, markdown: renderSpaceMarkdown(activity) };
}
