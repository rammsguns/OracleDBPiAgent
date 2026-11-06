import { createHash } from 'node:crypto';
import { UnsupportedVersionError, type ToolContext } from '../contracts.js';
import { redactCredentials as redact } from './redact.js';
export interface Check { label: string; sql: string; binds: Record<string, unknown>; status: 'ok' | 'unavailable'; view: string; columns: string[]; rows: unknown[][]; truncated: boolean; attempts: { view: string; code: string }[] }
export class TriageReader {
	readonly checks: Check[] = [];
	constructor(private ctx: ToolContext, private target: string) {}
	async read(label: string, suffix: string, select: string, where: string, binds: Record<string, unknown> = {}, cap = 100): Promise<Check> {
		return this.query(label, ['DBA', 'ALL'].map(p => ({ view: `${p}_${suffix}`, sql: `SELECT ${select} FROM ${p}_${suffix} ${where}` })), binds, cap);
	}
	async query(label: string, candidates: { view: string; sql: string }[], binds: Record<string, unknown>, cap = 100): Promise<Check> {
		const check: Check = { label, sql: '', binds, status: 'unavailable', view: '', columns: [], rows: [], truncated: false, attempts: [] };
		this.checks.push(check);
		for (const candidate of candidates) {
			Object.assign(check, candidate);
			const session = await this.ctx.sessions.get(this.target);
			const audit = { at: new Date().toISOString(), runId: this.ctx.runId, target: this.target, tool: 'triage:evidence', sqlSha256: createHash('sha256').update(candidate.sql).digest('hex') };
			try {
				const result = await session.query(candidate.sql, binds, { maxRows: Math.min(cap, this.ctx.config.limits.maxRows), timeoutSeconds: this.ctx.config.limits.statementTimeoutSeconds });
				await this.ctx.audit.record({ ...audit, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
				Object.assign(check, result, { status: 'ok', rows: result.rows.map(r => r.map(v => v instanceof Date ? v.toISOString() : typeof v === 'string' ? redact(v) : v)) });
				break;
			} catch (error) {
				if (error instanceof UnsupportedVersionError) throw error;
				const code = /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED';
				check.attempts.push({ view: candidate.view, code });
				await this.ctx.audit.record({ ...audit, kind: 'tool_error', detail: code });
				if (!['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) break;
			} finally { await session.close(); }
		}
		return check;
	}
}
/** Checklist literals are limited to validated identifiers and numeric window/line bounds. */
export function displaySql(check: Check): string {
	return check.sql.replace(/:([A-Za-z]\w*)/g, (token, key: string) => {
		const value = check.binds[key];
		return typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' && /^[A-Z][A-Z0-9_$#]{0,127}$/.test(value) ? `'${value}'` : token;
	});
}
