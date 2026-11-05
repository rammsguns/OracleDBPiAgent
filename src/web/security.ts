import { createHash } from 'node:crypto';
import type { Check } from '../triage/read.js';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSecurityPosture, renderSecurityMarkdown, validateSecurityOptions } from '../security/index.js';
export function validateWebSecurity(data: Record<string, unknown>) {
	if (data.whoCan !== undefined && typeof data.whoCan !== 'string') throw new Error('Invalid object');
	validateSecurityOptions({ whoCan: data.whoCan as string | undefined });
}
export async function readWebSecurity(ctx: ToolContext, target: string, data: Record<string, unknown>, readers: { readSecurityPosture?: typeof readSecurityPosture }) {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, options) => {
		const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'web:security', sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, options);
			await ctx.audit.record({ ...event, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs }); return result;
		} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
	} };
	const result = await (readers.readSecurityPosture ?? readSecurityPosture)(session, { whoCan: data.whoCan as string | undefined });
	// The core shares full Check objects across findings and paths. Sending those
	// repeatedly can exceed 1 MiB. Keep rows once per check and only source/status
	// on findings/paths; omit SQL/binds. Markdown uses the original full result.
	const evidence = (check: Check) => ({ view: check.view, status: check.status, truncated: check.truncated, attempts: check.attempts });
	return { result: {
		...result,
		checks: result.checks.map(check => ({ ...check, evidence: check.evidence.map(item => ({ ...evidence(item), columns: item.columns, rows: item.rows })), findings: check.findings.map(f => ({ ...f, evidence: evidence(f.evidence) })) })),
		...(result.whoCan ? { whoCan: result.whoCan.map(path => ({ ...path, evidence: evidence(path.evidence) })) } : {}),
	}, markdown: renderSecurityMarkdown(result) };
}
