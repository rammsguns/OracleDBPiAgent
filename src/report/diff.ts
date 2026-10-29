import type { DatabaseReport, ReportSection } from './index.js';

export const DIFF_THRESHOLDS = { tablespaceIncreasePoints: 5, tablespaceWarningPercent: 85, backupRecentHours: 24 } as const;
export interface ReportChange { section: string; rule: string; key: string; message: string }
export interface ReportDiff { target: string; previousGeneratedAt: string | null; currentGeneratedAt: string; changes: ReportChange[]; notes: string[] }
const records = (s: ReportSection) => s.rows.map(row => Object.fromEntries(s.columns.map((c, i) => [c.toUpperCase(), row[i]])));
type Row = ReturnType<typeof records>[number];
const key = (r: Row, fields: string[]) => JSON.stringify(fields.map(f => r[f] instanceof Date ? (r[f] as Date).toISOString() : r[f]));
const present = (v: unknown) => v !== null && v !== undefined && v !== '';
const percent = (r: Row): number => present(r.USED_PERCENT) ? Number(r.USED_PERCENT) : Number(r.ALLOCATED_BYTES) > 0 ? 100 * Number(r.USED_BYTES) / Number(r.ALLOCATED_BYTES) : NaN;
function recent(s: ReportSection, at: string): boolean {
	return records(s).some(r => String(r.STATUS).startsWith('COMPLETED') && present(r.END_TIME) && Number.isFinite(new Date(String(r.END_TIME)).getTime()) && Date.parse(at) - new Date(String(r.END_TIME)).getTime() <= DIFF_THRESHOLDS.backupRecentHours * 3600000 && Date.parse(at) >= new Date(String(r.END_TIME)).getTime());
}
/** Pure, bounded-snapshot comparison; no wall clock, I/O or LLM. */
export function diff(previous: DatabaseReport | null | undefined, current: DatabaseReport): ReportDiff {
	if (previous && previous.target !== current.target) throw new Error('Cannot compare different targets');
	const result: ReportDiff = { target: current.target, previousGeneratedAt: previous?.generatedAt ?? null, currentGeneratedAt: current.generatedAt, changes: [], notes: [] };
	if (!previous) { result.notes.push('No previous saved run; baseline established.'); return result; }
	const add = (section: string, rule: string, id: string, message: string) => result.changes.push({ section, rule, key: id, message });
	for (const name of [...new Set([...previous.sections, ...current.sections].map(s => s.name))].sort()) {
		const before = previous.sections.find(s => s.name === name), after = current.sections.find(s => s.name === name);
		if (!before || !after) { result.notes.push(`${name}: missing from ${!before ? 'previous' : 'current'} report; not compared.`); continue; }
		if (before.status !== after.status) add(name, 'availability', name, `${name}: ${before.status} → ${after.status}`);
		if (before.status !== 'ok' || after.status !== 'ok') continue;
		if (before.source !== after.source) { result.notes.push(`${name}: source changed; rows not compared.`); continue; }
		const oldRows = records(before), newRows = records(after);
		const added = (fields: string[], rule: string, predicate: (r: Row) => boolean = () => true) => {
			const old = new Set(oldRows.filter(predicate).map(r => key(r, fields)));
			for (const row of newRows.filter(predicate)) { const id = key(row, fields); if (!old.has(id)) add(name, rule, id, `${rule}: ${fields.map(f => String(row[f])).join(' / ')}`); }
		};
		if (name === 'scheduler_failures') added(['OWNER', 'JOB_NAME', 'LOG_DATE'], 'new_failed_run');
		if (name === 'top_sql') added(['SQL_ID'], 'new_top_sql');
		if (name === 'optimizer_stats') {
			added(['OWNER', 'TABLE_NAME'], 'newly_stale', r => r.STALE_STATS === 'YES');
			added(['OWNER', 'TABLE_NAME'], 'newly_locked', r => present(r.STATTYPE_LOCKED));
		}
		if (['index_health', 'index_partitions', 'index_subpartitions'].includes(name)) {
			const fields = [name === 'index_health' ? 'OWNER' : 'INDEX_OWNER', 'INDEX_NAME', ...(name !== 'index_health' ? ['PARTITION_NAME'] : []), ...(name === 'index_subpartitions' ? ['SUBPARTITION_NAME'] : [])];
			added(fields, 'newly_unusable', r => r.STATUS === 'UNUSABLE');
			if (name === 'index_health') added(fields, 'newly_invisible', r => r.VISIBILITY === 'INVISIBLE');
		}
		if (name === 'tablespaces') for (const row of newRows) {
			const old = oldRows.find(r => r.TABLESPACE_NAME === row.TABLESPACE_NAME);
			if (!old) continue;
			const a = percent(old), b = percent(row);
			if (b - a >= DIFF_THRESHOLDS.tablespaceIncreasePoints || (a < DIFF_THRESHOLDS.tablespaceWarningPercent && b >= DIFF_THRESHOLDS.tablespaceWarningPercent)) add(name, 'tablespace_usage', String(row.TABLESPACE_NAME), `${row.TABLESPACE_NAME}: used ${a.toFixed(2)}% → ${b.toFixed(2)}%`);
		}
		if (name === 'backups' && recent(before, previous.generatedAt) && !recent(after, current.generatedAt)) add(name, 'backup_not_recent', name, `No completed backup within ${DIFF_THRESHOLDS.backupRecentHours} hours.`);
	}
	result.changes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
	return result;
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');
export function renderDiffMarkdown(result: ReportDiff): string {
	return [`## Changes since ${result.previousGeneratedAt ?? 'baseline (no previous run)'}`, ...(result.changes.length ? result.changes.map(c => `- ${escape(c.message)}`) : ['No changes.']), ...result.notes.map(n => `Note: ${escape(n)}`)].join('\n\n') + '\n';
}
