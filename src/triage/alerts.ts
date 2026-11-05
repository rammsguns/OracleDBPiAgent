import { readAlertLog, readIncidents, type AlertRow, type IncidentRow, type AlertResult } from '../alertlog/index.js';
import type { ToolContext } from '../contracts.js';
import type { Check } from './read.js';
import type { Hypothesis } from './index.js';
export interface TriageAlertLog {
	status: 'ok' | 'unavailable' | 'skipped'; grant?: string;
	window: { from: string; to: string }; entries: AlertRow[]; incidents: IncidentRow[];
	correlations: { kind: 'code' | 'jobRun'; label: string; at?: string; entryIndexes: number[] }[];
	checks: Check[];
}
function check<T extends AlertRow | IncidentRow>(label: string, result: AlertResult<T>): Check {
	const columns = result.view === 'V$DIAG_ALERT_EXT' ? ['timestamp', 'codes', 'messageText', 'count', 'firstTime', 'lastTime', 'incidentIds', 'problemKeys', 'traceFiles'] : ['incidentId', 'problemKey', 'createTime', 'status'];
	return { label, sql: result.sql, binds: result.binds, status: result.status, view: result.view, columns, rows: result.rows.map(row => columns.map(key => row[key as keyof T])), truncated: result.truncated, attempts: result.attempts };
}
export async function collectAlerts(ctx: ToolContext, target: string, hours: number, codes: string[], runs: unknown[][]): Promise<TriageAlertLog> {
	const to = new Date(), from = new Date(to.getTime() - hours * 3600000);
	const window = { from: from.toISOString(), to: to.toISOString() };
	const result: TriageAlertLog = { status: 'ok', window, entries: [], incidents: [], correlations: [], checks: [] };
	const grants = new Set<string>();
	const add = (label: string, read: AlertResult<AlertRow>, kind: 'code' | 'jobRun', at?: string) => {
		result.checks.push(check(label, read));
		read.grants.forEach(g => grants.add(g));
		if (read.status === 'unavailable') result.status = 'unavailable';
		const entryIndexes = read.rows.map(row => {
			let index = result.entries.findIndex(e => JSON.stringify(e) === JSON.stringify(row));
			if (index < 0) { index = result.entries.length; result.entries.push(row); }
			return index;
		});
		if (entryIndexes.length) result.correlations.push({ kind, label, ...(at ? { at } : {}), entryIndexes });
	};
	const searchable = codes.filter(c => /^(ORA|TNS)-\d{5}$/.test(c)).slice(0, 20);
	if (searchable.length) add(`Alert log matching ${searchable.join(', ')}`, await readAlertLog(ctx, target, { ...window, codes: searchable }), 'code');
	for (const run of runs.filter(r => String(r[2]).toUpperCase() === 'FAILED' || Number(r[3]) > 0)) {
		const time = new Date(String(run[4])).getTime(); if (!Number.isFinite(time)) continue;
		const at = new Date(time).toISOString();
		add(`Alert log within ±10 minutes of ${run[0]}.${run[1]} (temporal correlation only)`, await readAlertLog(ctx, target, { from: new Date(time - 600000), to: new Date(time + 600000) }), 'jobRun', at);
	}
	const incidents = await readIncidents(ctx, target, window);
	result.checks.push(check('ADR incidents in triage window', incidents)); result.incidents = incidents.rows;
	incidents.grants.forEach(g => grants.add(g));
	if (incidents.status === 'unavailable') result.status = 'unavailable';
	if (grants.size) result.grant = [...grants].join('\n');
	return result;
}
export function alertHypotheses(alert: TriageAlertLog): Hypothesis[] {
	const hypotheses: Hypothesis[] = [];
	for (const row of alert.entries) {
		const evidence = [`${row.firstTime} to ${row.lastTime} (count ${row.count}): ${row.messageText}`];
		let title: string | undefined;
		const incident = alert.incidents.find(i => row.incidentIds.includes(i.incidentId) || (i.problemKey && row.problemKeys.includes(i.problemKey)));
		if (row.codes.some(c => ['ORA-00600', 'ORA-07445'].includes(c)) && (incident || row.incidentIds.length)) {
			title = 'Internal Oracle error: open an SR with the incident id and problem key.';
			evidence.push(`Incident ${incident?.incidentId ?? row.incidentIds.join(', ')}; problem key ${incident?.problemKey ?? row.problemKeys.join(', ')}`);
		} else if (isVktmPriorityError(row)) {
			title = 'The VKTM timekeeping process could not raise its OS scheduling priority';
			const ids = [...new Set(row.incidentIds)];
			evidence.push(ids.length ? ids.map(id => `Incident ${id}`).join('; ') : 'No incident id was present in the fetched alert entry.');
		} else if (row.codes.includes('ORA-00800')) title = 'ORA-00800 reports a soft external error; inspect its arguments to establish the cause.';
		else if (row.codes.includes('ORA-04031')) title = 'Shared pool memory pressure or fragmentation may explain ORA-04031.';
		else if (row.codes.includes('ORA-01555')) title = 'Undo retention or overwritten undo may explain ORA-01555.';
		else if (row.codes.some(c => ['ORA-01653', 'ORA-01654', 'ORA-01688'].includes(c))) title = 'Tablespace space exhaustion may explain the allocation failure.';
		else if (row.codes.includes('ORA-00060')) { title = 'A deadlock was recorded; review the named trace with the DBA.'; evidence.push(`Trace: ${row.traceFiles.join(', ') || 'not present in the fetched alert text'}`); }
		else if (row.codes.includes('ORA-12850') || row.codes.some(c => c.startsWith('TNS-'))) title = 'Network or parallel worker communication failure is a diagnostic lead.';
		if (title) hypotheses.push({ rank: 0, title, evidence });
	}
	return hypotheses;
}
export function mergeAlerts(alerts: TriageAlertLog[]): TriageAlertLog | undefined {
	if (!alerts.length) return undefined;
	const merged: TriageAlertLog = { status: alerts.some(a => a.status === 'unavailable') ? 'unavailable' : 'ok', window: alerts[0]!.window, entries: [], incidents: [], correlations: [], checks: [] };
	for (const alert of alerts) {
		const indexes = alert.entries.map(row => {
			let index = merged.entries.findIndex(e => JSON.stringify(e) === JSON.stringify(row));
			if (index < 0) { index = merged.entries.length; merged.entries.push(row); }
			return index;
		});
		merged.incidents.push(...alert.incidents); merged.checks.push(...alert.checks);
		merged.correlations.push(...alert.correlations.map(c => ({ ...c, entryIndexes: c.entryIndexes.map(i => indexes[i]!) })));
	}
	const grants = [...new Set(alerts.flatMap(a => a.grant ? a.grant.split('\n') : []))];
	if (grants.length) merged.grant = grants.join('\n');
	merged.incidents = [...new Map(merged.incidents.map(i => [i.incidentId, i])).values()];
	return merged;
}

/** Discover scheduler names from bounded SQL alert evidence before reading history. */
export async function discoverAlertJobs(ctx: ToolContext, target: string, hours: number, issue: string, fallback: boolean) {
	const to = new Date(), window = { from: new Date(to.getTime() - hours * 3600000).toISOString(), to: to.toISOString() };
	const read = await readAlertLog(ctx, target, { ...window, codes: ['ORA-12012'] });
	const words = new Set(issue.toUpperCase().match(/[A-Z]{4,}/g) ?? []);
	const mentionsJob = /\bjobs?\b/i.test(issue);
	const jobs: { owner: string; name: string }[] = [], entries: AlertRow[] = [];
	for (const row of read.rows) {
		const matches = [...row.messageText.matchAll(/ORA-12012:[\s\S]*?auto execute of job\s+"([A-Z][\w$#]{0,127})"\s*\.\s*"([A-Z][\w$#]{0,127})"/gi)];
		let matched = false;
		for (const m of matches) {
			const owner = m[1]!.toUpperCase(), name = m[2]!.toUpperCase();
			if (!mentionsJob && !name.split(/[_$#0-9]+/).some(w => w.length >= 4 && words.has(w))) continue;
			if (!jobs.some(j => j.owner === owner && j.name === name)) jobs.push({ owner, name });
			matched = true;
		}
		if (matched) entries.push(row);
	}
	const alert: TriageAlertLog = { status: read.status, window, entries, incidents: [], correlations: [], checks: [check('Alert log ORA-12012 job discovery in window', read)] };
	if (entries.length) alert.correlations.push({ kind: 'code', label: `ORA-12012 jobs discovered from alert log: ${jobs.map(j => `${j.owner}.${j.name}`).join(', ')}`, entryIndexes: entries.map((_, i) => i) });
	const grants = new Set(read.grants);
	if (!jobs.length && fallback) {
		const recent = await readAlertLog(ctx, target, { ...window, limit: 10 });
		alert.entries = recent.rows;
		alert.checks.push(check('Recent errors in the window, not matched to the issue', recent));
		recent.grants.forEach(g => grants.add(g));
		if (recent.status === 'unavailable') alert.status = 'unavailable';
	}
	if (grants.size) alert.grant = [...grants].join('\n');
	return { jobs, alert, matchedText: entries.map(e => e.messageText).join('\n') };
}

function isVktmPriorityError(row: AlertRow): boolean {
	return row.codes.includes('ORA-00800') && /arguments:\s*\[Set Priority Failed\]\s*,\s*\[VKTM\]/i.test(row.messageText);
}
export function alertSuggestions(alert: TriageAlertLog): string[] {
	if (!alert.entries.some(isVktmPriorityError)) return [];
	return [
		'Suggested check (not executed): inspect the oradism binary ownership and setuid permission in ORACLE_HOME/bin with the DBA or OS administrator.',
		'Suggested check (not executed): inspect whether the container or OS permits real-time scheduling priority changes, including CAP_SYS_NICE in Docker.',
		'ORA-00800 with [Set Priority Failed], [VKTM] is usually a soft, non-data error. Review the linked incidents and trace metadata; the exact OS or container configuration cause remains unverified.',
	];
}
