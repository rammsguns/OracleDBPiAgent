import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { findSqlCandidates, readSqlInsight, renderSqlInsightMarkdown, validateSqlOptions } from '../sqlperf/index.js';
export function validateWebSql(data: Record<string, unknown>) {
	if ((data.sqlId === undefined) === (data.text === undefined)) throw new Error('Choose SQL_ID or text');
	if (data.sqlId !== undefined) validateSqlOptions({ sqlId: String(data.sqlId) });
	else if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2048) throw new Error('Invalid text');
}
export async function readWebSql(ctx: ToolContext, target: string, data: Record<string, unknown>, readers: { readSqlInsight?: typeof readSqlInsight; findSqlCandidates?: typeof findSqlCandidates }) {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, options) => {
		const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'web:sql', sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, options);
			await ctx.audit.record({ ...event, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs }); return result;
		} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
	} };
	if (data.text !== undefined) {
		const result = await (readers.findSqlCandidates ?? findSqlCandidates)(session, String(data.text));
		return { candidates: result.rows.slice(0, 10).map(row => ({ sqlId: String(row[0]), text: String(row[1]) })), truncated: result.truncated || result.rows.length > 10 };
	}
	const result = await (readers.readSqlInsight ?? readSqlInsight)(session, { sqlId: String(data.sqlId) });
	return { result, markdown: renderSqlInsightMarkdown(result) };
}
