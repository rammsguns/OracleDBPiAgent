import { createHash } from 'node:crypto';
import { UnsupportedVersionError, type ToolContext } from '../contracts.js';
export interface Evidence<T> { status: 'ok' | 'unavailable'; view: string; rows: T[]; truncated: boolean; attempts: { view: string; code: string }[] }
export interface ObjectRow { owner: string; name: string; type: string; status: string; lastDdl: string; lines: number }
export interface SourceRow { type: string; line: number; text: string }
export interface ProcedureRow { name: string; subprogramId: number; overload: string | null }
export interface ArgumentRow { name: string | null; subprogramId: number; overload: string | null; position: number; sequence: number; level: number; mode: string; type: string; defaulted: string }
export interface DependencyRow { owner: string; name: string; type: string; referencedOwner: string; referencedName: string; referencedType: string }
export interface ErrorRow { type: string; line: number; position: number; text: string; attribute: string }
export interface JobRow { owner: string; name: string; type: string; action: string; enabled: string; state: string }
export function identifier(value: string): string {
	if (!/^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(value)) throw new Error('Expected an unquoted Oracle identifier');
	return value.toUpperCase();
}
export function objectName(value: string): { owner: string; name: string } {
	const parts = value.split('.'); if (parts.length !== 2) throw new Error('Object must be OWNER.NAME');
	return { owner: identifier(parts[0]!), name: identifier(parts[1]!) };
}
/** Conservative literal redaction, preserving newlines for source evidence. */
export function redact(text: string): string {
	// Redact all quoted literals conservatively: a credential can be split across
	// dictionary lines or assigned through an innocently named variable.
	return text.replace(/q'\[[\s\S]*?(?:\]'|$)|q'\{[\s\S]*?(?:\}'|$)|q'\([\s\S]*?(?:\)'|$)|q'<[\s\S]*?(?:>'|$)|q'([^\w\s])[\s\S]*?(?:\1'|$)|'(?:''|[^'])*(?:'|$)/gi, match => "'[REDACTED]'" + '\n'.repeat((match.match(/\n/g) ?? []).length))
		.replace(/((?:password|passwd|pwd|secret|token|api[_ -]?key)\s*(?::=|=>|=|:)\s*)(\"(?:\"\"|[^\"])*\"|[0-9]+|[A-Za-z0-9_+\/-]+)/gi, '$1[REDACTED]')
		.replace(/(identified\s+by\s+)("(?:""|[^"])*"|[^\s;,]+)/gi, '$1[REDACTED]');
}

const str = (v: unknown) => v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
export class Dictionary {
	constructor(private ctx: ToolContext, readonly target: string, private redactText: (text: string) => string = redact) {
		if (!ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target)) throw new Error('Unknown or unpinned PL/SQL target');
	}
	private async read<T>(suffix: string, select: string, where: string, binds: Record<string, unknown>, map: (r: unknown[]) => T, cap = this.ctx.config.limits.maxRows): Promise<Evidence<T>> {
		const attempts: Evidence<T>['attempts'] = [];
		for (const prefix of ['DBA', 'ALL']) {
			const view = `${prefix}_${suffix}`, sql = `SELECT ${select} FROM ${view} ${where}`;
			const base = { at: new Date().toISOString(), runId: this.ctx.runId, target: this.target, tool: 'plsql:dictionary', sqlSha256: createHash('sha256').update(sql).digest('hex') };
			const session = await this.ctx.sessions.get(this.target);
			try {
				const result = await session.query(sql, binds, { maxRows: cap, timeoutSeconds: this.ctx.config.limits.statementTimeoutSeconds });
				await this.ctx.audit.record({ ...base, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
				return { status: 'ok', view, rows: result.rows.map(r => map(r.map(v => typeof v === 'string' && suffix !== 'SOURCE' ? this.redactText(v) : v))), truncated: result.truncated, attempts };
			} catch (error) {
				if (error instanceof UnsupportedVersionError) throw error;
				const code = /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED';
				await this.ctx.audit.record({ ...base, kind: 'tool_error', detail: code });
				attempts.push({ view, code });
				if (!['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) return { status: 'unavailable', view, rows: [], truncated: false, attempts };
			} finally { await session.close(); }
		}
		return { status: 'unavailable', view: `ALL_${suffix}`, rows: [], truncated: false, attempts };
	}
	objects(owner?: string, name?: string) {
		return this.read<ObjectRow>('OBJECTS', 'OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, LAST_DDL_TIME', `WHERE OBJECT_TYPE IN ('PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','TYPE','TYPE BODY')${owner ? ' AND OWNER = :owner' : ''}${name ? ' AND OBJECT_NAME = :name' : ''} ORDER BY OWNER, OBJECT_NAME, OBJECT_TYPE`, { ...(owner ? { owner: identifier(owner) } : {}), ...(name ? { name: identifier(name) } : {}) }, r => ({ owner: str(r[0]), name: str(r[1]), type: str(r[2]), status: str(r[3]), lastDdl: str(r[4]), lines: 0 }));
	}
	async source(owner: string, name: string): Promise<Evidence<SourceRow>> {
		const rows: SourceRow[] = [], attempts: Evidence<SourceRow>['attempts'] = [];
		let afterType = '', afterLine = 0, result: Evidence<SourceRow>;
		do {
			result = await this.read<SourceRow>('SOURCE', 'TYPE, LINE, TEXT', 'WHERE OWNER = :owner AND NAME = :name AND (TYPE > :afterType OR (TYPE = :afterType AND LINE > :afterLine)) ORDER BY TYPE, LINE', { owner: identifier(owner), name: identifier(name), afterType: afterType || ' ', afterLine }, r => ({ type: str(r[0]), line: Number(r[1]), text: str(r[2]) }), Math.min(2000 - rows.length, this.ctx.config.limits.maxRows));
			rows.push(...result.rows); attempts.push(...result.attempts);
			const last = rows.at(-1); if (last) { afterType = last.type; afterLine = last.line; }
		} while (result.status === 'ok' && result.truncated && result.rows.length && rows.length < 2000);
		// Redact after assembling pages, preserving dictionary line boundaries.
		const lines = this.redactText(rows.map(r => r.text).join('\n')).split('\n');
		let offset = 0;
		const safe = rows.map(r => { const count = r.text.split('\n').length; const text = lines.slice(offset, offset + count).join('\n'); offset += count; return { ...r, text }; });
		return { ...result, rows: safe, attempts: [...new Map(attempts.map(a => [a.view + a.code, a])).values()] };
	}

	procedures(owner: string, name: string) { return this.read<ProcedureRow>('PROCEDURES', 'PROCEDURE_NAME, SUBPROGRAM_ID, OVERLOAD', 'WHERE OWNER = :owner AND OBJECT_NAME = :name ORDER BY SUBPROGRAM_ID', { owner, name }, r => ({ name: str(r[0]) || name, subprogramId: Number(r[1]), overload: r[2] == null ? null : str(r[2]) })); }
	arguments(owner: string, name: string) { return this.read<ArgumentRow>('ARGUMENTS', 'ARGUMENT_NAME, SUBPROGRAM_ID, OVERLOAD, POSITION, SEQUENCE, DATA_LEVEL, IN_OUT, DATA_TYPE, DEFAULTED, TYPE_OWNER, TYPE_NAME, TYPE_SUBNAME', 'WHERE OWNER = :owner AND (PACKAGE_NAME = :name OR (PACKAGE_NAME IS NULL AND OBJECT_NAME = :name)) ORDER BY SUBPROGRAM_ID, SEQUENCE', { owner, name }, r => ({ name: r[0] == null ? null : str(r[0]), subprogramId: Number(r[1]), overload: r[2] == null ? null : str(r[2]), position: Number(r[3]), sequence: Number(r[4]), level: Number(r[5]), mode: str(r[6]), type: r[10] ? [r[9], r[10], r[11]].filter(Boolean).join('.') : str(r[7]), defaulted: str(r[8]) })); }
	dependencies(owner: string, name: string, callers = false) { return this.read<DependencyRow>('DEPENDENCIES', 'OWNER, NAME, TYPE, REFERENCED_OWNER, REFERENCED_NAME, REFERENCED_TYPE', `WHERE ${callers ? 'REFERENCED_OWNER' : 'OWNER'} = :owner AND ${callers ? 'REFERENCED_NAME' : 'NAME'} = :name ORDER BY OWNER, NAME, REFERENCED_OWNER, REFERENCED_NAME`, { owner, name }, r => ({ owner: str(r[0]), name: str(r[1]), type: str(r[2]), referencedOwner: str(r[3]), referencedName: str(r[4]), referencedType: str(r[5]) })); }
	errors(owner: string, name: string) { return this.read<ErrorRow>('ERRORS', 'TYPE, LINE, POSITION, TEXT, ATTRIBUTE', 'WHERE OWNER = :owner AND NAME = :name ORDER BY TYPE, SEQUENCE', { owner, name }, r => ({ type: str(r[0]), line: Number(r[1]), position: Number(r[2]), text: str(r[3]), attribute: str(r[4]) })); }
	jobs(owner: string, name: string) { return this.read<JobRow>('SCHEDULER_JOBS', 'OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION, ENABLED, STATE', 'WHERE INSTR(UPPER(JOB_ACTION), :name) > 0 ORDER BY OWNER, JOB_NAME', { name }, r => ({ owner: str(r[0]), name: str(r[1]), type: str(r[2]), action: str(r[3]), enabled: str(r[4]), state: str(r[5]) })).then(result => ({ ...result, rows: result.rows.filter(r => new RegExp(`(?:^|[^A-Z0-9_$#])(?:${owner.replace(/[$]/g, '\\$')}\\s*\\.\\s*)?${name.replace(/[$]/g, '\\$')}(?:[^A-Z0-9_$#]|$)`, 'i').test(r.action) && (r.owner === owner || r.action.toUpperCase().includes(`${owner}.${name}`))) })); }
}
