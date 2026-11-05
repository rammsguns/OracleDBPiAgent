import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSecurityPosture, type SecurityPosture } from '../security/index.js';
import type { ReportSection } from './index.js';
export const SECURITY_COLUMNS = ['CHECK', 'SEVERITY', 'STATUS', 'SUBJECT', 'DETAIL', 'ADVICE'];
/** Reuse the security reader, auditing metadata reads without binds or driver text. */
export async function readReportSecurity(ctx: ToolContext, target: string, tool: string, checks?: string[]): Promise<SecurityPosture> {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = {
		target: raw.target, identity: raw.identity, close: () => raw.close(),
		query: async (sql, binds, options) => {
			const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool, sqlSha256: createHash('sha256').update(sql).digest('hex') };
			try {
				const data = await raw.query(sql, binds, options);
				await ctx.audit.record({ ...base, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
				return data;
			} catch (error) { await ctx.audit.record({ ...base, kind: 'tool_error', detail: 'SecurityReadError' }); throw error; }
		},
	};
	try { return await readSecurityPosture(session, { checks: checks ?? ['default-passwords', 'powerful-privileges', 'public-grants', 'profiles', 'accounts', 'audit', 'parameters'] }); }
	finally { await session.close(); }
}
export function securitySection(posture: SecurityPosture): ReportSection {
	return {
		name: 'security', status: posture.status, source: 'readSecurityPosture', columns: [...SECURITY_COLUMNS],
		rows: posture.checks.flatMap(c => (c.findings.length ? c.findings : [{ subject: null, detail: null }]).map(f => [c.id, c.severity, c.status, f.subject, f.detail, c.advice])),
		note: ['Counts describe findings in available evidence, not a compliance score.', ...posture.checks.flatMap(c => [...c.notes, ...c.evidence.filter(e => e.status === 'unavailable').map(e => `${c.id}: unavailable ${e.view}`)])].join(' '),
	};
}
