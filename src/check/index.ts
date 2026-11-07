import { SafeConfigError } from '../config/safeErrors.js';
import { createHash } from 'node:crypto';
import type { ToolContext, OracleSession } from '../contracts.js';
import { readSpaceUsage } from '../space/index.js';
import { readSessionActivity, type BlockingNode } from '../sessions/index.js';
import { readBackup } from '../backup/index.js';
import { readJobs } from '../jobs/index.js';
import { readAlertLog, readIncidents } from '../alertlog/index.js';
import { readSecurityPosture } from '../security/index.js';
import { redactCredentials } from '../triage/redact.js';
import { redactJobCredentials } from '../jobs/redact.js';
import { CheckUsageError, DEFAULTS, type Thresholds } from './config.js';
export * from './config.js';
export type Status = 'OK' | 'WARN' | 'CRIT' | 'UNKNOWN';
export interface Verdict { id: string; status: Status; value: number | null; unit: string; threshold: { warn: number; crit: number | null } | null; scope: string; command: string; note: string }
export interface CheckRun { version: 1; capturedAt: string; status: Status; targets: { target: string; status: Status; checks: Verdict[] }[] }
export const collectors = { space: readSpaceUsage, sessions: readSessionActivity, backup: readBackup, jobs: readJobs, alerts: readAlertLog, incidents: readIncidents, security: readSecurityPosture };
export function worst(statuses: Status[]): Status { return statuses.includes('UNKNOWN') ? 'UNKNOWN' : statuses.includes('CRIT') ? 'CRIT' : statuses.includes('WARN') ? 'WARN' : 'OK'; }
export function exitCode(status: Status, failOn?: 'warn' | 'crit'): number { return status === 'UNKNOWN' ? 3 : status === 'CRIT' ? 2 : status === 'WARN' ? failOn === 'crit' ? 0 : 1 : 0; }
export function classify(value: number | null, threshold: {warn: number; crit: number | null}, descending = false): Status {
	if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
	return descending ? threshold.crit !== null && value <= threshold.crit ? 'CRIT' : value <= threshold.warn ? 'WARN' : 'OK' : threshold.crit !== null && value >= threshold.crit ? 'CRIT' : value >= threshold.warn ? 'WARN' : 'OK';
}
const complete = (s: {status: string; truncated?: boolean}) => s.status === 'ok' && !s.truncated;
/** Strings are redacted recursively before either display or persistence. No raw evidence is emitted. */
export function redact<T>(value: T): T {
	if (typeof value === 'string') return redactJobCredentials(redactCredentials(value)) as T;
	if (Array.isArray(value)) return value.map(redact) as T;
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [redact(k), redact(v)])) as T;
	return value;
}
export async function runChecks(ctx: ToolContext, targets: readonly string[], settings: (target: string) => Thresholds = () => DEFAULTS, readers = collectors, now = new Date()): Promise<CheckRun> {
	if (!targets.length || targets.some(target => !ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target))) throw new CheckUsageError('Check requires configured targets within the pinned target scope');
	const result: CheckRun = { version: 1, capturedAt: now.toISOString(), status: 'OK', targets: [] };
	for (const target of targets) {
		const checks: Verdict[] = [], t = settings(target);
		let scope = 'Scope unknown (connection unavailable)';
		let sessionPromise: Promise<OracleSession> | undefined;
		const add = (id: string, value: number | null, threshold: Verdict['threshold'], unit: string, command: string, valid = true, note = '', shared = false, descending = false) => {
			const known = valid && value !== null && Number.isFinite(value);
			checks.push({ id, value: known ? value : null, threshold, unit, scope: shared && scope.startsWith('This PDB') ? 'CDB-wide (shared by all PDBs)' : scope, command: `piagent ${command} --target ${target}`, status: !known ? 'UNKNOWN' : threshold ? classify(value, threshold, descending) : value! > 0 ? 'CRIT' : 'OK', note: known ? note : note || 'Evidence unavailable, incomplete or inapplicable; no OK inferred.' });
		};
		// Each collector is a probe. The wrapper enforces a single deadline across all its
		// statements/pages and passes the remaining time into the existing query timeout.
		async function probe(ids: string[], command: string, fn: (session: OracleSession, context: ToolContext) => Promise<void>) {
			const start = checks.length;
			try {
				const raw = await (sessionPromise ??= ctx.sessions.get(target));
				scope = raw.identity.isCdb ? `This PDB (${raw.identity.containerName ?? 'unknown'})` : 'Database-wide (non-CDB)';
				const deadline = Date.now() + ctx.config.limits.statementTimeoutSeconds * 1000;
				const session: OracleSession = { target: raw.target, identity: raw.identity, close: async () => {}, query: async (sql, binds, options) => {
					const remaining = (deadline - Date.now()) / 1000;
					if (remaining <= 0) throw new Error('CHECK_TIMEOUT');
					const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'check:read', sqlSha256: createHash('sha256').update(sql).digest('hex') };
					try {
						const data = await raw.query(sql, binds, { ...options, timeoutSeconds: Math.min(options?.timeoutSeconds ?? remaining, remaining) });
						if (Date.now() > deadline) throw new Error('CHECK_TIMEOUT');
						await ctx.audit.record({ ...event, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
						return data;
					} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
				} };
				await fn(session, { ...ctx, sessions: { get: async () => session, closeAll: async () => {} } });
			} catch (error) {
				if (error instanceof SafeConfigError) throw error;
				checks.splice(start);
				for (const id of ids) add(id, null, id === 'tablespaces' || id === 'temp' || id === 'undo' ? t.space : id === 'recovery' ? t.recovery : Object.hasOwn(t,id) && id !== 'windowHours' ? t[id as Exclude<keyof Thresholds,'windowHours'>] : null, '', command, false, /ORA-\d{5}/.exec(String(error))?.[0] ?? 'Probe failed or timed out; check connectivity and configuration.');
			}
		}
		await probe(['tablespaces','temp','undo','recovery'], 'space', async s => {
			const r = await readers.space(s, { sections: ['tablespaces','temp','undo','recovery'] });
			const valid = (section: { status: string; evidence: {status: string; truncated?: boolean}; supportingEvidence: {status: string; truncated?: boolean}[] }) => complete(section) && [section.evidence,...section.supportingEvidence].every(complete);
			for (const kind of ['PERMANENT','UNDO'] as const) {
				const rows = r.sections.tablespaces.rows.filter(x => x.contents === kind);
				for (const row of rows) {
					add((kind === 'UNDO' ? 'undo:' : 'tablespace:') + row.name, row.usedPercentMax, t.space, '%', 'space', valid(r.sections.tablespaces) && row.maxBytes > 0 && (kind !== 'UNDO' || valid(r.sections.undo)), '', kind === 'UNDO');
					if (kind === 'UNDO' && s.identity.isCdb && r.sections.undo.note?.includes('PDB-local')) checks.at(-1)!.scope = scope + ' (local undo)';
				}
				if (!rows.length) add(kind === 'UNDO' ? 'undo' : 'tablespaces', null, t.space, '%', 'space', false);
			}
			const temps = r.sections.temp.rows.filter(x => x.kind === 'Usage');
			for (const row of temps) {
				const files = r.sections.temp.rows.filter(x => x.kind === 'File' && x.tablespace === row.tablespace);
				const max = files.reduce((n,f) => n + Number(f.maxBytes), 0);
				add('temp:' + row.tablespace, max > 0 ? Number(row.usedBytes) / max * 100 : null, t.space, '%', 'space', valid(r.sections.temp));
			}
			if (!temps.length) add('temp', null, t.space, '%', 'space', false);
			const areas = r.sections.recovery.rows.filter(x => x.kind === 'Area');
			add('recovery', areas.length ? Math.max(...areas.map(x => Number(x.usedPercent))) : null, t.recovery, '%', 'space', valid(r.sections.recovery), '', true);
		});
		await probe(['blocking'], 'sessions', async s => {
			const r = await readers.sessions(s, { sections: ['blocking'] }), section = r.sections.blocking;
			const waits: number[] = [];
			function walk(nodes: BlockingNode[]) { for (const node of nodes) { if (node.session && (node.session.blockerSid != null || node.session.finalBlockerSid != null)) waits.push(node.session.secondsInWait); walk(node.children); } }
			walk(section.rows);
			add('blocking', Math.max(0,...waits), t.blocking, 'seconds', 'sessions', complete(section) && [section.evidence,...section.supportingEvidence].every(complete));
		});
		await probe(['backupAge','archiveGaps'], 'backup', async s => {
			const r = await readers.backup(s, now), e = r.evidence;
			const good = (ids: (keyof typeof e)[]) => ids.every(id => complete(e[id]));
			const jobs = e.jobs.rows.filter(x => x.STATUS === 'COMPLETED' && ['DB FULL','DB INCR'].includes(String(x.INPUT_TYPE)));
			// DB INCR jobs may be level 1: require level-0/full file coverage as well.
			const dates = r.files.map(f => f.level0 ? Date.parse(f.level0) : NaN);
			const age = dates.length && dates.every(Number.isFinite) ? Math.max(...dates.map(d => (now.getTime()-d)/3600000)) : null;
			add('backupAge', age, t.backupAge, 'hours', 'backup', good(['database','jobs','datafiles','backups','sets','pieces']) && (age === null || jobs.length > 0) && !(s.identity.isCdb && !dates.length), 'Oldest latest full/level-0 completion across visible datafiles; missing history is UNKNOWN.', true);
			add('archiveGaps', r.gaps.length, null, 'gaps', 'backup', good(['database','archives','history','datafiles','backups','sets','pieces']) && e.database.rows[0]?.LOG_MODE === 'ARCHIVELOG' && dates.length > 0 && dates.every(Number.isFinite) && (!s.identity.isCdb || e.archives.rows.length > 0), '', true);
		});
		await probe(['failedJobs','maintenance'], 'jobs', async (_s,c) => {
			const r = await readers.jobs(c, target, { since: `${t.windowHours}h` }), e = r.sections;
			add('failedJobs', e.runs!.rows.filter(x => x.STATUS === 'FAILED').length, t.failedJobs, 'runs', 'jobs', complete(e.runs!));
			const security = await readers.security(_s, { checks: ['accounts'] });
			const users = security.checks[0]?.evidence.find(x => x.label === 'users');
			const owners = new Set(users?.rows.filter(x => x[1] === 'N').map(x => String(x[0])));
			const ids = ['invalidObjects','indexes','indexPartitions','indexSubpartitions'];
			const count = ids.reduce((sum,id) => sum + e[id]!.rows.filter(x => owners.has(String(x.OWNER ?? x.INDEX_OWNER))).reduce((n,x) => n + (id === 'invalidObjects' ? Number(x.OBJECT_COUNT) : 1),0),0);
			add('maintenance', count, t.maintenance, 'objects/index units', 'jobs', !!users && complete(users) && ids.every(id => complete(e[id]!)), 'Index, partition and subpartition units counted separately.');
		});
		await probe(['alertErrors'], 'alertlog', async (_s,c) => {
			const r = await readers.alerts(c,target,{ since: `${t.windowHours}h`, level: 'all', limit: c.config.limits.maxRows });
			add('alertErrors', r.rows.filter(x => x.codes.some(code => code.startsWith('ORA-'))).reduce((n,x) => n+x.count,0), t.alertErrors, 'errors', 'alertlog', complete(r), 'ORA occurrences in the lookback window.', true);
		});
		await probe(['incidents'], 'alertlog', async (_s,c) => { const r = await readers.incidents(c,target,{since:`${t.windowHours}h`,limit:c.config.limits.maxRows}); add('incidents',r.rows.length,null,'incidents','alertlog',complete(r),'',true); });
		await probe(['expiry','defaultPasswords'], 'security', async s => {
			const r = await readers.security(s,{checks:['accounts','default-passwords']});
			const accounts = r.checks.find(x => x.id === 'accounts')!, defaults = r.checks.find(x => x.id === 'default-passwords')!;
			const users = accounts.evidence.find(x => x.label === 'users');
			const days = (users?.rows ?? []).filter(x => x[1] === 'N' && !String(x[2]).includes('LOCKED') && (x[4] != null || String(x[2]).includes('EXPIRED'))).map(x => x[4] == null ? 0 : (new Date(String(x[4])).getTime()-now.getTime())/86400000);
			add('expiry', days.length ? Math.min(...days) : null, t.expiry, 'days', 'security', !!users && complete(users), days.length ? '' : 'No expiring unlocked non-Oracle-maintained accounts visible.', false, true);
			add('defaultPasswords', defaults.findings.length, null, 'accounts', 'security', complete(defaults));
		});
		result.targets.push({target,status:worst(checks.map(x => x.status)),checks});
	}
	result.status = worst(result.targets.map(x => x.status));
	return redact(result);
}
export function renderCheckMarkdown(run: CheckRun): string {
	const esc = (v: unknown) => String(v ?? 'UNKNOWN').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[|\r\n]/g,' ');
	return [`# Check: ${run.status}`, `Captured ${run.capturedAt} (UTC). Sequential snapshots; windowed history is not a continuous monitor.`, '', '| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |','| --- | --- | --- | --- | --- | --- | --- | --- |', ...run.targets.flatMap(t => t.checks.map(c => '| '+[t.target,c.id,c.status,c.value === null ? 'UNKNOWN' : `${c.value} ${c.unit}`,c.threshold ? `${c.threshold.warn} / ${c.threshold.crit ?? "incident only"}` : 'any > 0 = CRIT',c.scope,c.command,c.note].map(esc).join(' | ')+' |'))].join('\n')+'\n';
}
