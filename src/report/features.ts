import type { ToolContext } from '../contracts.js';
import { collectBackup } from '../triage/features.js';
import { readJobs } from '../jobs/index.js';
import type { ReportSection } from './index.js';
export async function readFeatureReport(ctx: ToolContext, target: string, name: 'backup' | 'jobs'): Promise<ReportSection> {
	const rows: unknown[][] = [];
	let note: string, complete: boolean;
	if (name === 'backup') {
		const r = await collectBackup(ctx, target);
		complete = r.status === 'ok'; note = r.scope + ' ' + r.restoreEstimate.detail;
		for (const [id, e] of Object.entries(r.evidence)) {
			rows.push(['evidence:' + id, null, e.status, JSON.stringify(e.rows)]);
			if (e.note) note += ` ${id}: ${e.note}`;
			if (e.truncated) note += ` ${id}: row limit reached.`;
		}
		rows.push(['findings', r.findings.length, complete ? 'ok' : 'unavailable', JSON.stringify(r.findings)], ['archive_gaps', r.files.length > 0 && r.files.every(f => f.level0) ? r.gaps.length : null, complete ? 'ok' : 'unavailable', JSON.stringify(r.gaps)], ['restore_estimate', null, 'ok', JSON.stringify(r.restoreEstimate)]);
		const times = r.files.map(f => f.level0 ? Date.parse(f.level0) : NaN);
		rows.push(['oldest_full_age_hours', times.length && times.every(Number.isFinite) ? (Date.parse(r.capturedAt) - Math.min(...times)) / 3600000 : null, complete ? 'ok' : 'unavailable', 'Available full / level 0 metadata; no media validation.']);
	} else {
		const r = await readJobs(ctx, target, { since: '24h' });
		complete = Object.values(r.sections).every(s => s.status === 'ok' && !s.truncated); note = r.note + ` Window: ${r.window.from} to ${r.window.to}.`;
		for (const [id, s] of Object.entries(r.sections)) {
			rows.push(['evidence:' + id, null, s.status, JSON.stringify(s.rows)]);
			if (s.note) note += ` ${id}: ${s.note}`;
			if (s.truncated) note += ` ${id}: row limit reached.`;
		}
		const runs = r.sections.runs!;
		rows.push(['failed_runs_24h', runs.rows.filter(row => row.STATUS === 'FAILED').length, runs.status === 'ok' && !runs.truncated ? 'ok' : 'unavailable', 'Visible retained failed runs; rolling 24h snapshot, not interval deltas.']);
	}
	return { name, status: complete ? 'ok' : 'unavailable', source: name === 'backup' ? 'readBackup' : 'readJobs', columns: ['METRIC', 'VALUE', 'STATUS', 'DETAIL'], rows, note };
}
