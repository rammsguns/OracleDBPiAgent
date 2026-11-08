import { withOracleAction } from '../oracle/observability.js';
import { readDatabaseRole, readDgLag } from '../backup/role.js';
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
import { CheckUsageError, DEFAULTS, type Thresholds, type CheckName } from './config.js';
export * from './config.js';
export type Status = 'OK' | 'WARN' | 'CRIT' | 'UNKNOWN';
export type CheckStatus = Status | 'SKIPPED';
export interface Verdict { id: string; status: CheckStatus; observedStatus?: Status; lowerBound?: boolean; display: string; value: number | null; unit: string; threshold: { warn: number; crit: number | null } | null; scope: string; command: string; note: string }
export interface CheckRun { version: 1; capturedAt: string; status: Status; targets: { target: string; status: Status; checks: Verdict[] }[] }
export const collectors = { space: readSpaceUsage, sessions: readSessionActivity, backup: readBackup, jobs: readJobs, alerts: readAlertLog, incidents: readIncidents, security: readSecurityPosture };
export function worst(statuses: CheckStatus[]): Status { return statuses.includes('CRIT') ? 'CRIT' : statuses.includes('WARN') ? 'WARN' : statuses.includes('UNKNOWN') ? 'UNKNOWN' : 'OK'; }
export function exitCode(status: Status, failOn?: 'warn' | 'crit'): number { return status === 'UNKNOWN' ? 3 : status === 'CRIT' ? 2 : status === 'WARN' ? failOn === 'crit' ? 0 : 1 : 0; }
export function classify(value: number | null, threshold: {warn: number; crit: number | null}, descending = false): Status {
	if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
	return descending ? threshold.crit !== null && value <= threshold.crit ? 'CRIT' : value <= threshold.warn ? 'WARN' : 'OK' : threshold.crit !== null && value >= threshold.crit ? 'CRIT' : value >= threshold.warn ? 'WARN' : 'OK';
}
const complete = (s: {status: string; truncated?: boolean}) => s.status === 'ok' && !s.truncated;
/** Collector notes are fixed guidance; retain view names and Oracle codes without raw SQL. */
interface EvidenceSummary { status: string; view?: string; label?: string; truncated?: boolean; note?: string; attempts?: {view?: string; code: string}[]; evidence?: EvidenceSummary; supportingEvidence?: EvidenceSummary[] }
export function evidenceReason(...items: (EvidenceSummary | undefined)[]): string {
	return [...new Set(items.flatMap(item => {
		if (!item) return ['Required collector evidence was not returned.'];
		const children = [item.evidence, ...(item.supportingEvidence ?? [])].filter((x): x is EvidenceSummary => !!x);
		const reasons = children.length ? evidenceReason(...children) : '';
		if (reasons) return [reasons];
		const view = item.view || item.attempts?.map(a => a.view).filter(Boolean).join(', ') || item.label || 'Collector';
		if (item.truncated) return [`${view}: row cap reached; results are incomplete.`];
		if (item.status !== 'ok') {
			const codes = [...new Set([...(item.attempts ?? []).map(a => a.code), ...(item.note?.match(/ORA-\d{5}/g) ?? [])])];
			if (!codes.length && item.note) return [`${view}: ${item.note}`];
			return [`${view}: ${codes.includes('ORA-65040') ? 'not available in this PDB' : 'not readable / missing grant'}${codes.length ? ' (' + codes.join(', ') + ')' : ''}.`];
		}
		return [];
	}))].join(' ');
}
export function displayValue(value: number | null, unit: string): string {
	if (value === null || !Number.isFinite(value)) return 'UNKNOWN';
	const number = ['%','days','hours'].includes(unit) ? value.toFixed(1) : unit === 'seconds' ? value.toFixed(0) : String(value);
	return `${number}${unit ? ' ' + unit : ''}`;
}
function checkName(id: string): CheckName { return (id.startsWith('tablespace:') ? 'tablespaces' : id.split(':')[0]) as CheckName; }
export function defaultPasswordAccounts(subjects: string[]): string {
	const names = [...new Set(subjects.filter(name => typeof name === 'string' && /^(?:C##)?[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(name) && name.length <= 128))].sort();
	return names.length ? 'Accounts: ' + names.slice(0,10).join(', ') + (names.length > 10 ? ` +${names.length-10} more` : '') + '.' : '';
}
/** Strings are redacted recursively before either display or persistence. No raw evidence is emitted. */
export function redact<T>(value: T): T {
	if (typeof value === 'string') return redactJobCredentials(redactCredentials(value)) as T;
	if (Array.isArray(value)) return value.map(redact) as T;
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [redact(k), redact(v)])) as T;
	return value;
}
async function runChecksImpl(ctx: ToolContext, targets: readonly string[], settings: (target: string) => Thresholds = () => DEFAULTS, readers = collectors, now = new Date()): Promise<CheckRun> {
	if (!targets.length || targets.some(target => !ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target))) throw new CheckUsageError('Check requires configured targets within the pinned target scope');
	const result: CheckRun = { version: 1, capturedAt: now.toISOString(), status: 'OK', targets: [] };
	for (const target of targets) {
		const checks: Verdict[] = [], t = settings(target);
		let scope = 'Scope unknown (connection unavailable)';
		let sessionPromise: Promise<OracleSession> | undefined;
		const thresholdFor = (id: string) => ['tablespaces','temp','undo'].includes(id) ? t.space : id === 'recovery' ? t.recovery : ['dgLag','blocking','backupAge','failedJobs','alertErrors','maintenance','expiry'].includes(id) ? t[id as 'dgLag'|'blocking'|'backupAge'|'failedJobs'|'alertErrors'|'maintenance'|'expiry'] : null;
		const disabled = (id: string) => t.disable?.includes(checkName(id));
		const add = (id: string, value: number | null, threshold: Verdict['threshold'], unit: string, command: string, valid = true, note = '', shared = false, descending = false, measurement?: { status?: Status; display?: string; lowerBound?: boolean }) => {
			const known = valid && value !== null && Number.isFinite(value);
			const observed: Status = measurement?.status ?? (!known ? 'UNKNOWN' : threshold ? classify(value, threshold, descending) : value! > 0 ? 'CRIT' : 'OK');
			const policy = t.checks?.[checkName(id)]?.unknownAs ?? 'unknown';
			const status: CheckStatus = disabled(id) ? 'SKIPPED' : observed === 'UNKNOWN' ? policy.toUpperCase() as Status : observed;
			const reason = known ? note : note || `${id}: collector returned a non-finite or absent ${unit || 'measurement'} value.`;
			checks.push({ id, value: known && status !== 'SKIPPED' ? value : null, display: status === 'SKIPPED' ? 'SKIPPED' : measurement?.display ?? displayValue(known ? value : null,unit), threshold, unit,
				scope: shared && scope.includes('This PDB') ? scope.replace(/This PDB \([^)]*\)/, 'CDB-wide (shared by all PDBs)') : scope, command: `piagent ${command} --target ${target}`, status,
				...(known && status !== 'SKIPPED' && measurement?.lowerBound ? {lowerBound: true} : {}),
				...(observed === 'UNKNOWN' && status !== 'UNKNOWN' && status !== 'SKIPPED' ? {observedStatus: observed} : {}),
				note: status === 'SKIPPED' ? 'Disabled by check.json; does not contribute to totals or overall status.' : reason + (observed === 'UNKNOWN' && policy !== 'unknown' ? ` Policy unknownAs=${policy} maps UNKNOWN to ${status}.` : '') });
		};
		// Each collector is a probe. The wrapper enforces a single deadline across all its
		// statements/pages and passes the remaining time into the existing query timeout.
		async function probe(ids: string[], command: string, fn: (session: OracleSession, context: ToolContext) => Promise<void>) {
			if (ids.every(disabled)) { for (const id of ids) add(id,null,thresholdFor(id),'',command); return; }
			const start = checks.length;
			let failureReason = '';
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
					} catch (error) {
						const views = [...new Set([...sql.matchAll(/(?:FROM|JOIN)\s+((?:V\$|DBA_|ALL_|DATABASE_|PRODUCT_)[A-Z0-9_$]+)/gi)].map(m => m[1]))].join(', ');
						const code = /ORA-\d{5}/.exec(String(error))?.[0];
						failureReason = `${views || command}: ${code ?? (String(error).includes('CHECK_TIMEOUT') ? 'statement-timeout budget exhausted' : 'query failed')}.`;
						await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
				} };
				const role = await readDatabaseRole(session);
				scope = role.label + '; ' + scope;
				await fn(session, { ...ctx, sessions: { get: async () => session, closeAll: async () => {} } });
			} catch (error) {
				if (error instanceof SafeConfigError) throw error;
				checks.splice(start);
				for (const id of ids) add(id, null, thresholdFor(id), '', command, false, failureReason || (/ORA-\d{5}/.exec(String(error))?.[0] ? `${command} collector: ${/ORA-\d{5}/.exec(String(error))![0]}; no readable collector evidence.` : String(error).includes('CHECK_TIMEOUT') ? `${command}: statement-timeout budget exhausted.` : `${command}: probe failed; check connectivity and configuration.`));
			}
		}
		await probe(['tablespaces','temp','undo','recovery'], 'space', async s => {
			const r = await readers.space(s, { sections: ['tablespaces','temp','undo','recovery'] });
			const valid = (section: { status: string; evidence: {status: string; truncated?: boolean}; supportingEvidence: {status: string; truncated?: boolean}[] }) => complete(section) && [section.evidence,...section.supportingEvidence].every(complete);
			for (const kind of ['PERMANENT','UNDO'] as const) {
				const rows = r.sections.tablespaces.rows.filter(x => x.contents === kind);
				for (const row of rows) {
					add((kind === 'UNDO' ? 'undo:' : 'tablespace:') + row.name, row.usedPercentMax, t.space, '%', 'space', valid(r.sections.tablespaces) && row.maxBytes > 0 && (kind !== 'UNDO' || valid(r.sections.undo)), evidenceReason(r.sections.tablespaces, ...(kind === 'UNDO' ? [r.sections.undo] : [])) || (row.maxBytes > 0 ? '' : `No positive file capacity reported for tablespace ${row.name}.`), kind === 'UNDO');
					if (kind === 'UNDO' && s.identity.isCdb && r.sections.undo.note?.includes('PDB-local')) checks.at(-1)!.scope = scope + ' (local undo)';
				}
				if (!rows.length) add(kind === 'UNDO' ? 'undo' : 'tablespaces', null, t.space, '%', 'space', false, evidenceReason(r.sections.tablespaces) || (s.identity.isCdb ? 'No tablespace rows visible in this PDB; PDB-hidden metadata cannot establish absence.' : 'No tablespace allocation rows returned by the space collector.'));
			}
			const temps = r.sections.temp.rows.filter(x => x.kind === 'Usage');
			for (const row of temps) {
				const files = r.sections.temp.rows.filter(x => x.kind === 'File' && x.tablespace === row.tablespace);
				const max = files.reduce((n,f) => n + Number(f.maxBytes), 0);
				add('temp:' + row.tablespace, max > 0 ? Number(row.usedBytes) / max * 100 : null, t.space, '%', 'space', valid(r.sections.temp), evidenceReason(r.sections.temp) || (max > 0 ? '' : 'Temp file capacity is not visible; utilization cannot be calculated.'));
			}
			if (!temps.length) add('temp', null, t.space, '%', 'space', false, evidenceReason(r.sections.temp) || (s.identity.isCdb ? 'No temp usage rows visible in this PDB; PDB-hidden metadata cannot establish absence.' : 'No temp usage rows returned by the space collector.'));
			const areas = r.sections.recovery.rows.filter(x => x.kind === 'Area');
			add('recovery', areas.length ? Math.max(...areas.map(x => Number(x.usedPercent))) : null, t.recovery, '%', 'space', valid(r.sections.recovery), evidenceReason(r.sections.recovery) || (!areas.length ? s.identity.isCdb ? 'No recovery-area rows visible in this PDB; PDB-hidden metadata cannot establish configuration.' : 'No recovery area configured (DB_RECOVERY_FILE_DEST unset); V$RECOVERY_FILE_DEST has no configured area.' : ''), true);
		});
		await probe(['blocking'], 'sessions', async s => {
			const r = await readers.sessions(s, { sections: ['blocking'] }), section = r.sections.blocking;
			const waits: number[] = [];
			function walk(nodes: BlockingNode[]) { for (const node of nodes) { if (node.session && (node.session.blockerSid != null || node.session.finalBlockerSid != null)) waits.push(node.session.secondsInWait); walk(node.children); } }
			walk(section.rows);
			add('blocking', Math.max(0,...waits), t.blocking, 'seconds', 'sessions', complete(section) && [section.evidence,...section.supportingEvidence].every(complete), evidenceReason(section));
		});
		await probe(['dgLag'], 'backup', async s => {
			const lag = await readDgLag(s);
			add('dgLag', lag.value, t.dgLag, 'seconds', 'backup', lag.value !== null, lag.note, true);
		});
		await probe(['backupAge','archiveGaps'], 'backup', async s => {
			const r = await readers.backup(s, now), e = r.evidence;
			const role = await readDatabaseRole(s);
			const good = (ids: (keyof typeof e)[]) => ids.every(id => complete(e[id]));
			const jobs = e.jobs.rows.filter(x => x.STATUS === 'COMPLETED' && ['DB FULL','DB INCR'].includes(String(x.INPUT_TYPE)));
			// DB INCR jobs may be level 1: require level-0/full file coverage as well.
			const dates = r.files.map(f => f.level0 ? Date.parse(f.level0) : NaN);
			const age = dates.length && dates.every(Number.isFinite) ? Math.max(...dates.map(d => (now.getTime()-d)/3600000)) : null;
			const ageEvidence = ['database','jobs','datafiles','backups','sets','pieces'] as const;
			const gapEvidence = ['database','archives','history','datafiles','backups','sets','pieces'] as const;
			const noHistory = !e.backups.rows.length && !e.jobs.rows.length && !e.sets.rows.length;
			const historyReason = s.identity.isCdb && !e.backups.rows.length ? 'No backup rows visible in this PDB; PDB-hidden control-file metadata cannot establish absence.' : noHistory ? 'No backups recorded in the visible control-file history; external catalogs and aged-out records are not checked.' : 'No successful full/level-0 backup established for every visible datafile; external catalogs are not checked.';
			add('backupAge', role.standby || !role.role ? null : age, t.backupAge, 'hours', 'backup', good([...ageEvidence]) && (age === null || jobs.length > 0 || (s.identity.isCdb && e.jobs.rows.length === 0)) && !(s.identity.isCdb && !dates.length), (!role.role ? 'Database role unknown; local backup age cannot be established. ' : role.standby ? 'Standby control-file metadata may be copied from the primary or RMAN duplicate; no local full backup established. Backups are normally taken on the primary. ' : '') + evidenceReason(...ageEvidence.map(id => e[id])) || (age === null ? historyReason : !jobs.length ? 'PDB fallback: oldest latest visible per-datafile full/level-0 completion; RMAN job details are empty. Media not verified.' : 'Oldest latest full/level-0 completion across visible datafiles.'), true);
			const gapReason = (!role.role ? 'Database role unknown; archive-gap semantics cannot be established.' : '') || evidenceReason(e.database) || (e.database.rows[0]?.LOG_MODE === 'NOARCHIVELOG' ? 'NOARCHIVELOG: archived-log sequence-gap check is not applicable.' : evidenceReason(...gapEvidence.map(id => e[id])) || (!dates.length || !dates.every(Number.isFinite) ? historyReason + ' A full-backup checkpoint is required for gap analysis.' : s.identity.isCdb && !e.archives.rows.length ? 'No archived-log rows visible in this PDB; PDB-hidden metadata cannot establish absence of gaps.' : ''));
			const standbyGapNote = role.standby && r.gaps.length ? r.gaps.map(gap => {
				const source = e.archiveGap.rows.some(row => Number(row['THREAD#']) === gap.thread && Number(row['LOW_SEQUENCE#']) <= gap.fromSequence && Number(row['HIGH_SEQUENCE#']) >= gap.toSequence) ? 'V$ARCHIVE_GAP' : 'RFS received-redo sequence continuity';
				return `${source}: missing sequences ${gap.fromSequence}–${gap.toSequence} on thread ${gap.thread}.`;
			}).join(' ') + (evidenceReason(e.archiveGap,e.archives) ? ' ' + evidenceReason(e.archiveGap,e.archives) : '') : '';
			add('archiveGaps', r.gaps.length, null, 'gaps', 'backup', role.standby ? complete(e.archiveGap) && (r.gaps.length > 0 || complete(e.archives) && e.archives.rows.some(r => r.REGISTRAR === 'RFS')) : !!role.role && good([...gapEvidence]) && e.database.rows[0]?.LOG_MODE === 'ARCHIVELOG' && dates.length > 0 && dates.every(Number.isFinite) && (!s.identity.isCdb || e.archives.rows.length > 0), role.standby ? standbyGapNote || evidenceReason(e.archiveGap,e.archives) || (!e.archives.rows.some(r => r.REGISTRAR === 'RFS') ? 'No RFS received redo visible; standby sequence baseline cannot be established.' : 'V$ARCHIVE_GAP plus sequence continuity within RFS received redo only; duplicate history excluded.') : gapReason, true);
		});
		await probe(['failedJobs','maintenance'], 'jobs', async (_s,c) => {
			const role = await readDatabaseRole(_s);
			const replicated = role.standby ? 'Standby: scheduler history and object status are replicated from the primary; jobs do not run here. ' : '';
			const r = await readers.jobs(c, target, { since: `${t.windowHours}h` }), e = r.sections;
			add('failedJobs', e.runs!.rows.filter(x => x.STATUS === 'FAILED').length, t.failedJobs, 'runs', 'jobs', complete(e.runs!), replicated + evidenceReason(e.runs!));
			const security = await readers.security(_s, { checks: ['accounts'] });
			const users = security.checks[0]?.evidence.find(x => x.label === 'users');
			const owners = new Set(users?.rows.filter(x => x[1] === 'N').map(x => String(x[0])));
			const ids = ['invalidObjects','indexes','indexPartitions','indexSubpartitions'];
			const count = ids.reduce((sum,id) => sum + e[id]!.rows.filter(x => owners.has(String(x.OWNER ?? x.INDEX_OWNER))).reduce((n,x) => n + (id === 'invalidObjects' ? Number(x.OBJECT_COUNT) : 1),0),0);
			add('maintenance', count, t.maintenance, 'objects/index units', 'jobs', !!users && complete(users) && ids.every(id => complete(e[id]!)), replicated + (evidenceReason(users,...ids.map(id => e[id])) || 'Index, partition and subpartition units counted separately.'));
		});
		await probe(['alertErrors'], 'alertlog', async (_s,c) => {
			const r = await readers.alerts(c,target,{ since: `${t.windowHours}h`, level: 'all', text: 'ORA-', limit: c.config.limits.maxRows });
			const count = r.rows.filter(x => x.codes.some(code => code.startsWith('ORA-'))).reduce((n,x) => n+x.count,0);
			const reached = ['WARN','CRIT'].includes(classify(count,t.alertErrors));
			const lowerBound = r.status === 'ok' && r.truncated && reached;
			add('alertErrors', count, t.alertErrors, 'errors', 'alertlog', complete(r) || lowerBound, (_s.identity.isCdb ? 'PDB plus CDB-wide/instance ADR evidence (CON_ID 0/1); other PDBs excluded; Oracle may hide instance rows from this PDB, so absence is not established. ' : '') + (r.truncated ? `${evidenceReason(r)} Visible ORA count is at least ${count}; ${reached ? 'threshold already reached.' : 'below threshold; unseen rows may change the verdict.'}` : evidenceReason(r) || 'ORA occurrences in the lookback window.'), false, false, lowerBound ? {display: `>= ${count} errors`,lowerBound:true} : undefined);
			if (_s.identity.isCdb) checks.at(-1)!.scope = scope + ' + visible CDB-wide/instance ADR';
		});
		await probe(['incidents'], 'alertlog', async (_s,c) => {
			const r = await readers.incidents(c,target,{since:`${t.windowHours}h`,limit:c.config.limits.maxRows});
			const lowerBound = r.status === 'ok' && r.truncated && r.rows.length > 0;
			add('incidents',r.rows.length,null,'incidents','alertlog',complete(r) || lowerBound,(_s.identity.isCdb ? 'PDB plus CDB-wide/instance ADR evidence (CON_ID 0/1); other PDBs excluded; Oracle may hide instance rows from this PDB, so absence is not established. ' : '') + evidenceReason(r),false,false,lowerBound ? {display:`>= ${r.rows.length} incidents`,lowerBound:true} : undefined);
			if (_s.identity.isCdb) checks.at(-1)!.scope = scope + ' + visible CDB-wide/instance ADR';
		});
		await probe(['expiry','defaultPasswords'], 'security', async s => {
			const r = await readers.security(s,{checks:['accounts','default-passwords']});
			const accounts = r.checks.find(x => x.id === 'accounts')!, defaults = r.checks.find(x => x.id === 'default-passwords')!;
			const users = accounts.evidence.find(x => x.label === 'users');
			const days = (users?.rows ?? []).filter(x => x[1] === 'N' && !String(x[2]).includes('LOCKED') && (x[4] != null || String(x[2]).includes('EXPIRED'))).map(x => x[4] == null ? 0 : (new Date(String(x[4])).getTime()-now.getTime())/86400000);
			const noExpiry = !!users && complete(users) && days.length === 0;
			add('expiry', days.length ? Math.min(...days) : null, t.expiry, 'days', 'security', !!users && complete(users), evidenceReason(users) || (days.some(d => !Number.isFinite(d)) ? 'Invalid expiry timestamp in DBA_USERS.' : noExpiry ? 'No expiring unlocked accounts (unlimited or no expiry)' : ''), false, true, noExpiry ? {status:'OK',display:'none'} : undefined);
			add('defaultPasswords', defaults.findings.length, null, 'accounts', 'security', complete(defaults), evidenceReason(...defaults.evidence) || defaultPasswordAccounts(defaults.findings.map(f => f.subject)));
		});
		result.targets.push({target,status:worst(checks.map(x => x.status)),checks});
	}
	result.status = worst(result.targets.map(x => x.status));
	return redact(result);
}
export function renderCheckMarkdown(run: CheckRun): string {
	const esc = (v: unknown) => String(v ?? 'UNKNOWN').replace(/\|/g,'\\|').replace(/`/g,'\\`').replace(/[\r\n]/g,' ');
	const checks = run.targets.flatMap(t => t.checks).filter(c => c.status !== 'SKIPPED');
	const counts = ['CRIT','WARN','UNKNOWN','OK'].map(status => `${checks.filter(c => c.status === status).length} ${status}`).join(', ');
	return [`# Check: ${run.status} — ${counts} (${run.targets.map(t => esc(t.target)).join(', ')})`, `Captured ${run.capturedAt} (UTC). Sequential snapshots; windowed history is not a continuous monitor.`, '', '| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |','| --- | --- | --- | --- | --- | --- | --- | --- |', ...run.targets.flatMap(t => t.checks.map(c => '| '+[t.target,c.id,c.status,c.display,c.threshold ? `${c.threshold.warn} / ${c.threshold.crit ?? 'incident only'}` : '> 0 = CRIT',c.scope,c.command,c.note].map(esc).join(' | ')+' |'))].join('\n')+'\n';
}

export const runChecks = (...args: Parameters<typeof runChecksImpl>) => withOracleAction('check', () => runChecksImpl(...args));
