import { formatDuration } from './duration.js';
import { createHash } from 'node:crypto';
import type { ToolContext, DatabaseIdentity } from '../contracts.js';
import { sinceHours } from '../triage/parse.js';
import { redactCredentials } from '../triage/redact.js';
import { redactJobCredentials } from './redact.js';

export class JobsUsageError extends Error {}
export interface JobsOptions { since?: string; owner?: string; failedOnly?: boolean }
export interface JobsSection {
	view: string; status: 'ok' | 'unavailable'; rows: Record<string, unknown>[];
	truncated: boolean; sql: string; note?: string;
}
export interface JobsResult {
	target: string; identity: DatabaseIdentity; window: { from: string; to: string };
	owner?: string; failedOnly: boolean; note: string; sections: Record<string, JobsSection>;
}
interface Definition { view: string; columns: string; where?: string; owner?: string; order: string; group?: string; failed?: string; latest?: boolean }
export const jobQueries: Record<string, Definition> = {
	jobs: { view: 'DBA_SCHEDULER_JOBS', columns: 'OWNER, JOB_NAME, ENABLED, STATE, LAST_START_DATE, NEXT_RUN_DATE, RUN_COUNT, FAILURE_COUNT', owner: 'OWNER', order: 'OWNER, JOB_NAME', failed: "(FAILURE_COUNT > 0 OR STATE IN ('FAILED', 'BROKEN', 'RETRY SCHEDULED'))" },
	lastErrors: { view: 'DBA_SCHEDULER_JOB_RUN_DETAILS', columns: 'OWNER, JOB_NAME, LOG_ID, LOG_DATE, STATUS, ERROR#, ADDITIONAL_INFO', owner: 'OWNER', where: "LOG_DATE >= :fromTime AND LOG_DATE < :toTime AND STATUS = 'FAILED'", order: 'OWNER, JOB_NAME', latest: true },
	runs: { view: 'DBA_SCHEDULER_JOB_RUN_DETAILS', columns: 'OWNER, JOB_NAME, LOG_ID, LOG_DATE, STATUS, ERROR#, ACTUAL_START_DATE, RUN_DURATION, ADDITIONAL_INFO', owner: 'OWNER', where: 'LOG_DATE >= :fromTime AND LOG_DATE < :toTime', order: 'LOG_DATE DESC, LOG_ID DESC', failed: "STATUS <> 'SUCCEEDED'" },
	jobLog: { view: 'DBA_SCHEDULER_JOB_LOG', columns: 'OWNER, JOB_NAME, LOG_ID, LOG_DATE, OPERATION, STATUS', owner: 'OWNER', where: 'LOG_DATE >= :fromTime AND LOG_DATE < :toTime', order: 'LOG_DATE DESC, LOG_ID DESC', failed: "STATUS IN ('FAILED', 'STOPPED', 'BROKEN')" },
	windows: { view: 'DBA_SCHEDULER_WINDOWS', columns: 'WINDOW_NAME, ENABLED, ACTIVE, LAST_START_DATE, NEXT_START_DATE, DURATION', order: 'WINDOW_NAME' },
	autotaskClients: { view: 'DBA_AUTOTASK_CLIENT', columns: 'CLIENT_NAME, STATUS, WINDOW_GROUP', order: 'CLIENT_NAME' },
	autotaskHistory: { view: 'DBA_AUTOTASK_JOB_HISTORY', columns: 'CLIENT_NAME, WINDOW_NAME, WINDOW_START_TIME, JOB_NAME, JOB_STATUS, JOB_START_TIME, JOB_DURATION, JOB_ERROR', where: 'WINDOW_START_TIME >= :fromTime AND WINDOW_START_TIME < :toTime', order: 'WINDOW_START_TIME DESC, CLIENT_NAME, JOB_NAME', failed: "JOB_STATUS <> 'SUCCEEDED'" },
	statisticsHistory: { view: 'DBA_OPTSTAT_OPERATIONS', columns: 'ID, OPERATION, TARGET, START_TIME, END_TIME, STATUS', where: 'START_TIME >= :fromTime AND START_TIME < :toTime', order: 'START_TIME DESC, ID DESC', failed: "STATUS = 'FAILED'" },
	invalidObjects: { view: 'DBA_OBJECTS', columns: 'OWNER, OBJECT_TYPE, COUNT(*) OBJECT_COUNT', owner: 'OWNER', where: "STATUS = 'INVALID'", group: 'OWNER, OBJECT_TYPE', order: 'OWNER, OBJECT_TYPE' },
	indexes: { view: 'DBA_INDEXES', columns: 'OWNER, INDEX_NAME, TABLE_OWNER, TABLE_NAME, STATUS', owner: 'OWNER', where: "STATUS IN ('UNUSABLE', 'INVALID')", order: 'OWNER, INDEX_NAME' },
	indexPartitions: { view: 'DBA_IND_PARTITIONS', columns: 'INDEX_OWNER, INDEX_NAME, PARTITION_NAME, STATUS', owner: 'INDEX_OWNER', where: "STATUS IN ('UNUSABLE', 'INVALID')", order: 'INDEX_OWNER, INDEX_NAME, PARTITION_NAME' },
	indexSubpartitions: { view: 'DBA_IND_SUBPARTITIONS', columns: 'INDEX_OWNER, INDEX_NAME, PARTITION_NAME, SUBPARTITION_NAME, STATUS', owner: 'INDEX_OWNER', where: "STATUS IN ('UNUSABLE', 'INVALID')", order: 'INDEX_OWNER, INDEX_NAME, PARTITION_NAME, SUBPARTITION_NAME' },
	staleStatistics: { view: 'DBA_TAB_STATISTICS', columns: 'OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT', owner: 'OWNER', where: "STALE_STATS = 'YES'", group: 'OWNER, OBJECT_TYPE', order: 'OWNER, OBJECT_TYPE' },
};
export function safeJobText(value: string): { text: string; truncated: boolean } {
	const redacted = redactJobCredentials(redactCredentials(value));
	let text = '';
	for (const char of redacted) { if (Buffer.byteLength(text + char) > 2048) break; text += char; }
	return { text, truncated: text.length < redacted.length };
}
export async function readJobs(ctx: ToolContext, target: string, options: JobsOptions = {}): Promise<JobsResult> {
	if (!ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target)) throw new JobsUsageError('Unknown or unpinned jobs target');
	let hours: number;
	try { hours = sinceHours(options.since); } catch (error) { throw new JobsUsageError((error as Error).message); }
	const owner = options.owner?.toUpperCase();
	if (owner !== undefined && !/^[A-Z][A-Z0-9_$#]{0,127}$/.test(owner)) throw new JobsUsageError('--owner must be an unquoted Oracle identifier');
	const to = new Date(), from = new Date(to.getTime() - hours * 3600000);
	const session = await ctx.sessions.get(target);
	const result: JobsResult = { target, identity: session.identity, window: { from: from.toISOString(), to: to.toISOString() }, owner, failedOnly: options.failedOnly ?? false,
		note: 'Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.' + (session.identity?.isCdb ? ' Current PDB visibility only; empty rows do not establish CDB-wide absence.' : ''), sections: {} };
	try {
		for (const [name, def] of Object.entries(jobQueries)) {
			const lastRunFailed = `(SELECT MAX(latest_run.STATUS) KEEP (DENSE_RANK LAST ORDER BY latest_run.LOG_DATE, latest_run.LOG_ID) FROM DBA_SCHEDULER_JOB_RUN_DETAILS latest_run WHERE latest_run.OWNER = DBA_SCHEDULER_JOBS.OWNER AND latest_run.JOB_NAME = DBA_SCHEDULER_JOBS.JOB_NAME) = 'FAILED'`;
			const failureFilter = name === 'jobs' && def.failed ? `(${def.failed} OR ${lastRunFailed})` : def.failed;
			const clauses = [def.where, owner && def.owner ? `${def.owner} = :owner` : undefined, options.failedOnly ? failureFilter : undefined].filter(Boolean);
			const columns = def.columns.replace(/\b(LOG_DATE|ACTUAL_START_DATE|LAST_START_DATE|NEXT_RUN_DATE|NEXT_START_DATE|WINDOW_START_TIME|JOB_START_TIME|START_TIME|END_TIME)\b/g, column => `TO_CHAR(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') ${column}`);
			const where = clauses.join(' AND ').replace(/:(fromTime|toTime)/g, bind => `TO_TIMESTAMP_TZ(${bind}, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`);
			const order = def.order.replace(/\b(LOG_DATE|WINDOW_START_TIME|START_TIME)\b/g, column => `${def.view}.${column}`);
			const selectSql = `SELECT ${columns} FROM ${def.view}${clauses.length ? ' WHERE ' + where : ''}${def.group ? ' GROUP BY ' + def.group : ''} ORDER BY ${order}`;
			let sql = def.latest ? `SELECT ${def.columns} FROM (SELECT ${columns}, ROW_NUMBER() OVER (PARTITION BY OWNER, JOB_NAME ORDER BY ${def.view}.LOG_DATE DESC, ${def.view}.LOG_ID DESC) RN FROM ${def.view} WHERE ${where}) WHERE RN = 1 ORDER BY ${def.order}` : selectSql;
			const binds = { ...(def.where?.includes(':fromTime') ? { fromTime: from.toISOString().replace('Z', '+00:00'), toTime: to.toISOString().replace('Z', '+00:00') } : {}), ...(owner && def.owner ? { owner } : {}) };
			const audit = () => ({ at: new Date().toISOString(), runId: ctx.runId, target, tool: `jobs:${name}`, sqlSha256: createHash('sha256').update(sql).digest('hex') });
			try {
				const queryOptions = { maxRows: ctx.config.limits.maxRows, timeoutSeconds: ctx.config.limits.statementTimeoutSeconds };
				let note: string | undefined;
				const data = await session.query(sql, binds, queryOptions).catch(async error => {
					const code = /ORA-\d{5}/.exec(String(error))?.[0];
					if (name !== 'jobs' || !options.failedOnly || !['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code ?? '')) throw error;
					await ctx.audit.record({ ...audit(), kind: 'tool_error', detail: code });
					sql = sql.replace(failureFilter!, def.failed!);
					note = `${code}: last-run status not available in this PDB / not granted; filtered by current state and failure count only.`;
					return session.query(sql, binds, queryOptions);
				});
				const rows = data.rows.map(row => Object.fromEntries(data.columns.flatMap((column, i): [string, unknown][] => {
					const value = row[i];
					if (typeof value === 'string') { const safe = safeJobText(value); return [[column, safe.text], ...(safe.truncated ? [[column + '_TRUNCATED', true] as [string, unknown]] : [])]; }
					return [[column, value instanceof Date ? value.toISOString() : value]];
				})));
				result.sections[name] = { view: def.view, status: 'ok', rows, truncated: data.truncated, sql, ...(note ? { note } : {}) };
				await ctx.audit.record({ ...audit(), kind: 'tool_call', rows: rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
			} catch (error) {
				const code = /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED';
				await ctx.audit.record({ ...audit(), kind: 'tool_error', detail: code });
				if (!['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) throw error;
				result.sections[name] = { view: def.view, status: 'unavailable', rows: [], truncated: false, sql, note: `${code}: not available in this PDB / not granted; no absence inferred.` };
			}
		}
		return result;
	} finally { await session.close(); }
}
const escape = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, '<br>');
// Only timestamp columns are normalized; JSON durations and free-form job text stay intact; intervals are formatted only below.
const timestampColumns = new Set(['LOG_DATE', 'ACTUAL_START_DATE', 'LAST_START_DATE', 'NEXT_RUN_DATE', 'NEXT_START_DATE', 'WINDOW_START_TIME', 'JOB_START_TIME', 'START_TIME', 'END_TIME']);
function utcTimestamp(value: unknown): unknown {
	if (value == null) return value;
	const parsed = value instanceof Date ? value : typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : null;
	return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}
export function renderJobs(result: JobsResult): string {
	const lines = [`# Jobs: ${result.target}`, '', `${utcTimestamp(result.window.from)} to ${utcTimestamp(result.window.to)} (exclusive; UTC)`, '', result.note];
	for (const [name, section] of Object.entries(result.sections)) {
		lines.push('', `## ${name} (${section.view}): ${section.status}`);
		if (section.note) lines.push(section.note);
		if (!section.rows.length) lines.push(section.status === 'ok' ? 'No rows returned within visible scope.' : 'Evidence unavailable.');
		else { const columns = [...new Set(section.rows.flatMap(r => Object.keys(r)))]; lines.push('| ' + columns.join(' | ') + ' |', '| ' + columns.map(() => '---').join(' | ') + ' |'); for (const row of section.rows) lines.push('| ' + columns.map(c => escape(timestampColumns.has(c) ? utcTimestamp(row[c]) : formatDuration(row[c]))).join(' | ') + ' |'); }
		if (section.truncated) lines.push('', 'Row cap reached; partial evidence.');
	}
	return lines.join('\n') + '\n';
}
