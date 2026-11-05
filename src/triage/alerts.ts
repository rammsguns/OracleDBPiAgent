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
		} else if (row.codes.includes('ORA-04031')) title = 'Shared pool memory pressure or fragmentation may explain ORA-04031.';
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
		const offset = merged.entries.length;
		merged.entries.push(...alert.entries); merged.incidents.push(...alert.incidents); merged.checks.push(...alert.checks);
		merged.correlations.push(...alert.correlations.map(c => ({ ...c, entryIndexes: c.entryIndexes.map(i => i + offset) })));
	}
	const grants = [...new Set(alerts.flatMap(a => a.grant ? a.grant.split('\n') : []))];
	if (grants.length) merged.grant = grants.join('\n');
	merged.incidents = [...new Map(merged.incidents.map(i => [i.incidentId, i])).values()];
	return merged;
}
