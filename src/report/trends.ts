import { spaceMetrics } from './space.js';
import { sessionMetrics } from './sessions.js';
import type { DatabaseReport, ReportSection } from './index.js';
import type { ReportHistory } from './history.js';
import { DIFF_THRESHOLDS } from './diff.js';

export interface TrendPoint { generatedAt: string; value: number | null; source: string | null }
export interface TrendSeries {
	id: string; label: string; unit: string; points: TrendPoint[];
	first: number | null; last: number | null; min: number | null; max: number | null; change: number | null; worsening: boolean;
}
export interface ReportTrends {
	target: string; runs: number; scanned: number; skipped: number; notes: string[];
	availability: { generatedAt: string; unavailable: string[]; missing: string[] }[]; series: TrendSeries[];
}
const expected = ['tablespaces', 'scheduler_failures', 'optimizer_stats', 'index_health', 'index_partitions', 'index_subpartitions', 'backups'];
const rows = (s: ReportSection) => s.rows.map(r => Object.fromEntries(s.columns.map((c, i) => [c.toUpperCase(), r[i]])));
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const present = (v: unknown) => v !== null && v !== undefined && v !== '';
const compatible = (s: ReportSection | undefined, columns: string[]) => s?.status === 'ok' && columns.every(c => s.columns.some(n => n.toUpperCase() === c));
/** Pure snapshot trends. Null is a gap, never a zero or an assumed recovery. */
export function buildReportTrends(history: ReportHistory): ReportTrends {
	const reports = [...history.reports].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
	const result: ReportTrends = { target: history.target, runs: reports.length, scanned: history.scanned, skipped: history.skipped, notes: [...history.notes], availability: reports.map(r => ({ generatedAt: r.generatedAt, unavailable: r.sections.filter(s => s.status === 'unavailable').map(s => s.name).sort(), missing: expected.filter(n => !r.sections.some(s => s.name === n)) })), series: [] };
	let gaps = 0;
	function add(id: string, label: string, unit: string, sections: string[], extract: (sections: ReportSection[], report: DatabaseReport) => number | null, columns: string[][], rule: 'count' | 'tablespace' | 'backup' = 'count') {
		const points = reports.map(report => {
			const found = sections.map(n => report.sections.find(s => s.name === n));
			const source = found.every((s, i) => compatible(s, columns[i]!)) ? JSON.stringify(found.map(s => s!.source)) : null;
			const value = source === null ? null : extract(found as ReportSection[], report);
			if (value === null) gaps++;
			return { generatedAt: report.generatedAt, value, source };
		});
		const values = points.flatMap(p => p.value === null ? [] : [p.value]);
		const first = values[0] ?? null, last = values.at(-1) ?? null;
		// Flag the net first-to-last change only when those observations share a source.
		const observed = points.filter(p => p.value !== null);
		const comparable = first !== null && last !== null && observed.length > 1 && observed.every(p => p.source === observed[0]!.source);
		const change = comparable ? last! - first! : null;
		const worsening = change !== null && (rule === 'tablespace' ? change >= DIFF_THRESHOLDS.tablespaceIncreasePoints || first! < DIFF_THRESHOLDS.tablespaceWarningPercent && last! >= DIFF_THRESHOLDS.tablespaceWarningPercent : rule === 'backup' ? first! <= DIFF_THRESHOLDS.backupRecentHours && last! > DIFF_THRESHOLDS.backupRecentHours : change > 0);
		result.series.push({ id, label, unit, points, first, last, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, change, worsening });
	}
	const tablespaces = [...new Set(reports.flatMap(r => r.sections.filter(s => s.name === 'tablespaces' && s.status === 'ok').flatMap(s => rows(s).flatMap(row => typeof row.TABLESPACE_NAME === 'string' ? [row.TABLESPACE_NAME] : []))))].sort();
	for (const name of tablespaces) add(`tablespace:${name}`, `Tablespace ${name}`, '%', ['tablespaces'], ([s]) => {
		const r = rows(s!).find(r => r.TABLESPACE_NAME === name); if (!r) return null;
		if (present(r.USED_PERCENT)) { const n = number(r.USED_PERCENT); return n !== null && n >= 0 && n <= 100 ? n : null; }
		const used = number(r.USED_BYTES), allocated = number(r.ALLOCATED_BYTES);
		return used !== null && allocated !== null && used >= 0 && allocated > 0 && used <= allocated ? 100 * used / allocated : null;
	}, [['TABLESPACE_NAME']], 'tablespace');
	add('scheduler_failures', 'Failed scheduler runs', 'count', ['scheduler_failures'], ([s]) => s!.rows.length, [['OWNER', 'JOB_NAME', 'LOG_DATE']]);
	add('optimizer_stats', 'Stale or locked tables', 'count', ['optimizer_stats'], ([s]) => new Set(rows(s!).filter(r => r.STALE_STATS === 'YES' || present(r.STATTYPE_LOCKED)).map(r => JSON.stringify([r.OWNER, r.TABLE_NAME]))).size, [['OWNER', 'TABLE_NAME', 'STALE_STATS', 'STATTYPE_LOCKED']]);
	add('index_health', 'Unusable or invisible indexes', 'count', ['index_health', 'index_partitions', 'index_subpartitions'], sections => new Set(sections.flatMap(s => rows(s).filter(r => r.STATUS === 'UNUSABLE' || r.VISIBILITY === 'INVISIBLE').map(r => JSON.stringify([r.OWNER ?? r.INDEX_OWNER, r.INDEX_NAME])))).size, [['OWNER', 'INDEX_NAME', 'STATUS', 'VISIBILITY'], ['INDEX_OWNER', 'INDEX_NAME', 'STATUS'], ['INDEX_OWNER', 'INDEX_NAME', 'STATUS']]);
	add('backups', 'Hours since newest completed backup', 'hours', ['backups'], ([s], report) => {
		const at = Date.parse(report.generatedAt);
		const times = rows(s!).filter(r => String(r.STATUS).startsWith('COMPLETED') && typeof r.END_TIME === 'string').map(r => Date.parse(String(r.END_TIME))).filter(t => Number.isFinite(t) && t <= at);
		return times.length ? (at - Math.max(...times)) / 3600000 : null;
	}, [['STATUS', 'END_TIME']], 'backup');
	if (reports.some(r => r.sections.some(s => s.name === 'security'))) {
		for (const severity of ['high', 'medium', 'low', 'info']) add(`security:${severity}`, `Security ${severity} findings`, 'count', ['security'], ([section]) => {
			const data = rows(section!).filter(r => r.SEVERITY === severity);
			if (!data.length || data.some(r => r.STATUS !== 'ok')) return null;
			return data.filter(r => r.SUBJECT !== null).length;
		}, [['CHECK', 'SEVERITY', 'STATUS', 'SUBJECT']]);
	}
	if (reports.some(r => r.sections.some(s => s.name === 'sessions'))) {
		for (const metric of ['blockers', 'long_transactions']) add(`sessions:${metric}`, `Sessions ${metric.replaceAll('_', ' ')}`, 'count', ['sessions'], ([section]) => {
			const r = sessionMetrics(section).find(r => r.METRIC === metric);
			return r ? Number(r.VALUE) : null;
		}, [['METRIC', 'VALUE', 'STATUS']]);
		const classes = [...new Set(reports.flatMap(r => sessionMetrics(r.sections.find(s => s.name === 'sessions')).filter(r => r.METRIC === 'wait_seconds' && typeof r.WAIT_CLASS === 'string').map(r => String(r.WAIT_CLASS))))].sort();
		for (const waitClass of classes) add(`sessions:wait:${waitClass}`, `Non-idle wait ${waitClass} (interval delta)`, 'seconds', ['sessions'], ([section], report) => {
			const index = reports.indexOf(report), previous = reports[index - 1];
			if (!previous) return null;
			const before = previous.sections.find(s => s.name === 'sessions');
			if (before?.source !== section!.source) return null;
			const a = sessionMetrics(before).find(r => r.METRIC === 'wait_seconds' && r.WAIT_CLASS === waitClass);
			const b = sessionMetrics(section).find(r => r.METRIC === 'wait_seconds' && r.WAIT_CLASS === waitClass);
			return a && b && typeof a.STARTUP_TIME === 'string' && a.STARTUP_TIME.length > 0 && a.STARTUP_TIME === b.STARTUP_TIME && Number(b.VALUE) >= Number(a.VALUE) ? Number(b.VALUE) - Number(a.VALUE) : null;
		}, [['METRIC', 'WAIT_CLASS', 'VALUE', 'STATUS', 'STARTUP_TIME']]);
		result.notes.push('Session wait points are deltas between adjacent reports with the same instance startup; missing snapshots, restarts and counter decreases are gaps. Counts describe visible snapshots.');
	}
	if (reports.some(r => r.sections.some(s => s.name === 'space'))) {
		const metrics = new Map<string, { metric: string; name: string }>();
		for (const report of reports) for (const row of spaceMetrics(report.sections.find(s => s.name === 'space'))) if (typeof row.NAME === 'string') metrics.set(JSON.stringify([row.METRIC, row.NAME]), { metric: String(row.METRIC), name: row.NAME });
		for (const { metric, name } of [...metrics.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) add(`space:${metric}:${name}`, `Space ${metric} ${name}`, 'bytes', ['space'], ([section]) => {
			const row = spaceMetrics(section).find(r => r.METRIC === metric && r.NAME === name);
			return row ? Number(row.VALUE) : null;
		}, [['METRIC', 'NAME', 'VALUE', 'MAX_BYTES', 'STATUS']]);
	}
	for (const [section, metrics] of [['backup', ['findings', 'archive_gaps', 'oldest_full_age_hours']], ['jobs', ['failed_runs_24h']]] as const) {
		if (!reports.some(r => r.sections.some(s => s.name === section))) continue;
		for (const metric of metrics) add(`${section}:${metric}`, `${section} ${metric.replaceAll('_', ' ')}`, metric.endsWith('hours') ? 'hours' : 'count', [section], ([s]) => {
			if (/row limit/i.test(s!.note)) return null;
			const r = rows(s!).find(r => r.METRIC === metric && r.STATUS === 'ok');
			return r ? number(r.VALUE) : null;
		}, [['METRIC', 'VALUE', 'STATUS']]);
	}
	if (gaps) result.notes.push(`${gaps} series observation(s) missing, unavailable or incompatible; shown as gaps.`);
	if (reports.some(r => r.sections.some(s => /row limit/i.test(s.note)))) result.notes.push('Row-limited snapshots: counts describe visible saved rows, not database totals.');
	return result;
}
const safe = (s: string) => s.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, ' ');
export function renderTrends(result: ReportTrends): string {
	const value = (n: number | null) => n === null ? '—' : Number(n.toFixed(2)).toString();
	return [`History: ${safe(result.target)} (${result.runs} runs; ${result.skipped} skipped)`, 'Series\tUnit\tFirst\tLast\tMin\tMax\tChange\tWorsening', ...result.series.map(s => [safe(s.label), s.unit, ...[s.first, s.last, s.min, s.max, s.change].map(value), s.worsening ? 'yes' : 'no'].join('\t')), ...result.availability.map(a => `${a.generatedAt}: unavailable=${a.unavailable.map(safe).join(',') || 'none'}; missing=${a.missing.map(safe).join(',') || 'none'}`), ...result.notes.map(n => `Note: ${n}`)].join('\n');
}
