import { createHash } from 'node:crypto';
import type { ToolContext } from '../contracts.js';
import { sinceHours } from '../triage/parse.js';
import { redactCredentials } from '../triage/redact.js';

export interface WindowOptions { since?: string; from?: string | Date; to?: string | Date; limit?: number }
export interface AlertLogOptions extends WindowOptions {
	codes?: string[];
	text?: string;
	/** Default includes MESSAGE_LEVEL <= 8 and diagnostic text markers. A number selects a maximum level. */
	level?: 'default' | 'all' | number;
}
export interface AlertRow {
	timestamp: string; firstTime: string; lastTime: string; count: number;
	level: number | null; codes: string[]; problemKey: string; incidentId: string | null;
	traceFile: string | null; messageText: string; textTruncated: boolean;
	/** Bounded unions across the group; singular fields retain the newest example. */
	incidentIds: string[]; traceFiles: string[]; problemKeys: string[]; metadataTruncated: boolean;
}
export interface IncidentRow { incidentId: string; problemKey: string; createTime: string; status: number | null }
export interface AlertResult<T> {
	target: string; status: 'ok' | 'unavailable'; view: string; rows: T[];
	window: { from: string; to: string }; limit: number; truncated: boolean;
	/** Exact executed SQL and binds for downstream evidence; binds are never audited. */
	sql: string; binds: Record<string, unknown>; grants: string[]; attempts: { view: string; code: string }[];
}
const str = (v: unknown): string => v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
const safe = (v: unknown): string => redactCredentials(str(v));
const codesIn = (text: string): string[] => [...new Set([...text.toUpperCase().matchAll(/\b(ORA|TNS)-(\d{1,5})\b/g)].map(m => `${m[1]}-${m[2]!.padStart(5, '0')}`))];
function windowOptions(options: WindowOptions) {
	if (options.since !== undefined && (options.from !== undefined || options.to !== undefined)) throw new Error('Choose since or from/to');
	if ((options.from === undefined) !== (options.to === undefined)) throw new Error('Explicit window requires both from and to');
	const to = options.to === undefined ? new Date() : date(options.to);
	const from = options.from === undefined ? new Date(to.getTime() - sinceHours(options.since) * 3600000) : date(options.from);
	if (from >= to || to.getTime() - from.getTime() > 30 * 86400000) throw new Error('Window must be positive and at most 30d');
	return { from: from.toISOString(), to: to.toISOString() };
}
function date(value: string | Date): Date {
	// Require an explicit zone so operator and database time zones cannot silently disagree.
	if (typeof value === 'string' && !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value)) throw new Error('Window timestamps require ISO date/time with a timezone');
	const result = new Date(value);
	if (!Number.isFinite(result.getTime())) throw new Error('Invalid window timestamp');
	return result;
}
async function read<T>(ctx: ToolContext, target: string, options: WindowOptions, view: string, views: string[], build: (time: string) => { select: string; where: string; order: string; binds: Record<string, unknown> }, map: (row: unknown[]) => T): Promise<AlertResult<T>> {
	const configured = ctx.config.targets.find(t => t.name === target);
	if (!configured || (ctx.pinnedTarget && ctx.pinnedTarget !== target)) throw new Error('Unknown or unpinned alert-log target');
	const requested = options.limit ?? 50;
	if (!Number.isInteger(requested) || requested < 1) throw new Error('limit must be a positive integer');
	const limit = Math.min(requested, ctx.config.limits.maxRows), window = windowOptions(options);
	const time = `TO_TIMESTAMP_TZ(:fromTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`;
	const query = build(time);
	const sql = `${query.select} WHERE ${query.where} ORDER BY ${query.order} FETCH FIRST :fetchLimit ROWS ONLY`;
	// Fetch one sentinel row when limits permit, to report SQL-level truncation accurately.
	const fetchLimit = Math.min(limit + 1, ctx.config.limits.maxRows);
	const binds = { fromTime: window.from.replace('Z', '+00:00'), toTime: window.to.replace('Z', '+00:00'), ...query.binds, fetchLimit };
	const base: AlertResult<T> = { target, status: 'ok', view, rows: [], window, limit, truncated: false, sql, binds, grants: [], attempts: [] };
	const session = await ctx.sessions.get(target);
	const audit = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'alertlog:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
	try {
		const result = await session.query(sql, binds, { maxRows: fetchLimit, timeoutSeconds: ctx.config.limits.statementTimeoutSeconds });
		await ctx.audit.record({ ...audit, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated || result.rows.length >= fetchLimit, elapsedMs: result.elapsedMs });
		return { ...base, rows: result.rows.slice(0, limit).map(map), truncated: result.truncated || result.rows.length >= fetchLimit };
	} catch (error) {
		const code = /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED';
		await ctx.audit.record({ ...audit, kind: 'tool_error', detail: code });
		if (!['ORA-00942', 'ORA-01031'].includes(code)) throw error;
		return { ...base, status: 'unavailable', grants: views.map(v => `GRANT SELECT ON SYS.${v.replace('V$', 'V_$')} TO ${configured.username};`), attempts: [{ view, code }] };
	} finally { await session.close(); }
}
export async function readAlertLog(ctx: ToolContext, target: string, options: AlertLogOptions = {}): Promise<AlertResult<AlertRow>> {
	const codes = [...new Set((options.codes ?? []).map(c => c.toUpperCase()))];
	if (codes.length > 20 || codes.some(c => !/^(ORA|TNS)-\d{5}$/.test(c))) throw new Error('codes must contain at most 20 ORA-/TNS- codes with five digits');
	if (options.text !== undefined && (typeof options.text !== 'string' || options.text.length > 2048)) throw new Error('text must be at most 2048 characters');
	const level = options.level ?? 'default';
	if (level !== 'default' && level !== 'all' && (!Number.isInteger(level) || level < 1 || level > 32)) throw new Error('level must be default, all, or an integer from 1 to 32');
	const result = await read(ctx, target, options, 'V$DIAG_ALERT_EXT', ['V$DIAG_ALERT_EXT'], time => {
		const binds: Record<string, unknown> = {}, clauses = [`ORIGINATING_TIMESTAMP >= ${time}`, `ORIGINATING_TIMESTAMP < ${time.replace(':fromTime', ':toTime')}`];
		if (level === 'default') {
			binds.maxLevel = 8;
			const markers = ['ORA-', 'TNS-', 'ERRORS IN FILE', 'INCIDENT=', 'DEADLOCK'];
			clauses.push('(MESSAGE_LEVEL <= :maxLevel OR ' + markers.map((marker, i) => {
				binds[`marker${i}`] = marker; return `INSTR(UPPER(MESSAGE_TEXT), :marker${i}) > 0`;
			}).join(' OR ') + ')');
		}
		else if (level !== 'all') { clauses.push('MESSAGE_LEVEL <= :maxLevel'); binds.maxLevel = level; }
		if (codes.length) clauses.push('(' + codes.map((code, i) => { const [prefix, digits] = code.split('-'); binds[`code${i}`] = `(^|[^A-Z0-9_])${prefix}-0*${Number(digits)}([^0-9]|$)`; return `REGEXP_LIKE(UPPER(MESSAGE_TEXT), :code${i})`; }).join(' OR ') + ')');
		if (options.text) { clauses.push('INSTR(UPPER(MESSAGE_TEXT), UPPER(:text)) > 0'); binds.text = options.text; }
		return { select: 'SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT FROM V$DIAG_ALERT_EXT', where: clauses.join(' AND '), order: 'ORIGINATING_TIMESTAMP DESC, RECORD_ID DESC', binds };
	}, row => {
		const raw = str(row[3]), redacted = redactCredentials(raw).replace(/[\r\n]+$/, '');
		let messageText = '', bytes = 0;
		for (const char of redacted) { const n = Buffer.byteLength(char); if (bytes + n > 2048) break; messageText += char; bytes += n; }
		const timestamp = str(row[0]);
		const incidentIds = [...new Set([...raw.matchAll(/\bincident\s*=\s*(\d+)/gi)].map(m => m[1]!))];
		const traceFiles = [...new Set([...redacted.matchAll(/[^\s'"<>]*\.trc\b/gi)].map(m => m[0]))];
		const codes = codesIn(raw), problemKey = safe(row[2]);
		const normalized = raw.replace(/[\r\n]+$/, '').replace(/\b0x[0-9a-f]+\b|\b(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, '<hex>').replace(/\d+/g, '<n>');
		return { timestamp, firstTime: timestamp, lastTime: timestamp, count: 1, level: row[1] == null ? null : Number(row[1]), codes: codes.slice(0, 20), problemKey, incidentId: incidentIds[0] ?? null, traceFile: traceFiles[0] ?? null, incidentIds: incidentIds.slice(0, 20), traceFiles: traceFiles.slice(0, 20), problemKeys: problemKey ? [problemKey] : [], metadataTruncated: codes.length > 20 || incidentIds.length > 20 || traceFiles.length > 20, messageText: messageText.replace(/[\r\n]+$/, ''), textTruncated: Buffer.byteLength(redacted) > 2048, _identity: createHash('sha256').update(normalized).digest('hex') };
	});
	// Group throughout the bounded result, using complete text before preview clipping.
	const folded: AlertRow[] = [], groups = new Map<string, AlertRow>();
	for (const row of result.rows) {
		const { _identity, ...clean } = row;
		const previous = groups.get(_identity);
		if (!previous) { folded.push(clean); groups.set(_identity, clean); continue; }
		previous.count++;
		if (row.timestamp < previous.firstTime) previous.firstTime = row.timestamp;
		if (row.timestamp > previous.lastTime) previous.lastTime = row.timestamp;
		if (row.level !== null) previous.level = previous.level === null ? row.level : Math.min(previous.level, row.level);
		previous.textTruncated ||= row.textTruncated;
		previous.metadataTruncated ||= row.metadataTruncated;
		for (const field of ['codes', 'incidentIds', 'traceFiles', 'problemKeys'] as const) {
			const union = [...new Set([...previous[field], ...row[field]])];
			previous.metadataTruncated ||= union.length > 20;
			previous[field] = union.slice(0, 20);
		}
	}
	return { ...result, rows: folded };
}
export function readIncidents(ctx: ToolContext, target: string, options: WindowOptions = {}): Promise<AlertResult<IncidentRow>> {
	return read(ctx, target, options, 'V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM', ['V$DIAG_INCIDENT', 'V$DIAG_PROBLEM'], time => ({
		select: 'SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG_PROBLEM p ON p.PROBLEM_ID = i.PROBLEM_ID AND p.CON_ID = i.CON_ID',
		where: `i.CREATE_TIME >= ${time} AND i.CREATE_TIME < ${time.replace(':fromTime', ':toTime')}`,
		order: 'i.CREATE_TIME DESC, i.INCIDENT_ID DESC', binds: {},
	}), row => ({ incidentId: str(row[0]), problemKey: safe(row[1]), createTime: str(row[2]), status: row[3] == null ? null : Number(row[3]) }));
}
const escape = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
export function renderAlertLogMarkdown(result: AlertResult<AlertRow> | AlertResult<IncidentRow>): string {
	const lines = [`# ${result.view === 'V$DIAG_ALERT_EXT' ? 'Alert log' : 'ADR incidents'}: ${escape(result.target)}`, '', `${result.status}; ${escape(result.view)}; ${result.window.from} to ${result.window.to} (exclusive)`, '', ...result.grants.map(g => '`' + g + '`')];
	if (result.view === 'V$DIAG_ALERT_EXT') {
		lines.push('| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |', '|---|---|---|---|---|---|---|---|');
		for (const r of result.rows as AlertRow[]) lines.push(`| ${r.count === 1 ? escape(r.timestamp) : escape(r.firstTime) + ' / ' + escape(r.lastTime)} | ${r.level} | ${r.codes.join(', ')} | ${r.count} | ${r.problemKeys.map(escape).join(', ')} | ${r.incidentIds.map(escape).join(', ')} | ${r.traceFiles.map(escape).join(', ')} | ${escape(r.messageText)}${r.textTruncated ? ' [text capped]' : ''}${r.metadataTruncated ? ' [metadata capped]' : ''} |`);
	} else {
		lines.push('| Created | Incident | Problem | Status |', '|---|---|---|---|');
		for (const r of result.rows as IncidentRow[]) lines.push(`| ${escape(r.createTime)} | ${escape(r.incidentId)} | ${escape(r.problemKey)} | ${r.status} |`);
	}
	if (!result.rows.length) lines.push('No rows returned.');
	if (result.truncated) lines.push('Row cap reached; partial result (folding covers only fetched rows).');
	return lines.join('\n') + '\n';
}
