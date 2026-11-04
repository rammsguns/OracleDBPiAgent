import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReportHistory, saveReport, MAX_HISTORY_FILE_BYTES } from '../../src/report/history.js';
import { buildReportTrends, renderTrends } from '../../src/report/trends.js';
import type { DatabaseReport, ReportSection } from '../../src/report/index.js';
const targets = [{ name: 'lab' }];
const section = (name: string, columns: string[], rows: unknown[][]): ReportSection => ({ name, columns, rows, status: 'ok', source: 'fixture', note: '' });
const report = (day: number, percent = 80): DatabaseReport => ({ target: 'lab', generatedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`, sections: [
	section('tablespaces', ['TABLESPACE_NAME', 'USED_PERCENT'], [['USERS', percent]]),
	section('scheduler_failures', ['OWNER', 'JOB_NAME', 'LOG_DATE'], []),
	section('optimizer_stats', ['OWNER', 'TABLE_NAME', 'STALE_STATS', 'STATTYPE_LOCKED'], [['SH', 'T', 'YES', 'ALL'], ['SH', 'T', 'YES', null]]),
	section('index_health', ['OWNER', 'INDEX_NAME', 'STATUS', 'VISIBILITY'], [['SH', 'I', 'UNUSABLE', 'INVISIBLE']]),
	section('index_partitions', ['INDEX_OWNER', 'INDEX_NAME', 'STATUS'], [['SH', 'I', 'UNUSABLE']]),
	section('index_subpartitions', ['INDEX_OWNER', 'INDEX_NAME', 'STATUS'], []),
	section('backups', ['STATUS', 'END_TIME'], [['COMPLETED WITH WARNINGS', '2026-10-01T00:00:00.000Z']]),
] });
const trends = (reports: DatabaseReport[]) => buildReportTrends({ target: 'lab', reports, scanned: reports.length, skipped: 0, notes: [] });
it('summarizes chronological series, deduplicates findings and uses shared thresholds', () => {
	const result = trends([report(3, 85), report(1, 80), report(2, 79)]);
	expect(result.series[0]).toMatchObject({ first: 80, last: 85, min: 79, max: 85, change: 5, worsening: true });
	expect(result.series.find(s => s.id === 'optimizer_stats')?.last).toBe(1);
	expect(result.series.find(s => s.id === 'index_health')?.last).toBe(1);
	expect(result.series.find(s => s.id === 'backups')).toMatchObject({ first: 12, last: 60, worsening: true });
});
it('preserves missing/unavailable/old-shape gaps and never assumes zero', () => {
	const a = report(1), b = report(2), c = report(3, 90);
	b.sections[0]!.status = 'unavailable'; b.sections.splice(1, 1);
	b.sections.find(s => s.name === 'backups')!.columns = ['OLD']; b.sections.find(s => s.name === 'backups')!.rows = [];
	const result = trends([a, b, c]);
	expect(result.series[0]?.points.map(p => p.value)).toEqual([80, null, 90]);
	expect(result.availability[1]).toMatchObject({ unavailable: ['tablespaces'], missing: ['scheduler_failures'] });
	expect(result.notes.join(' ')).toContain('gaps');
});
it('does not compare changed sources, single observations or empty histories', () => {
	const b = report(2, 95); b.sections[0]!.source = 'different';
	expect(trends([report(1), b]).series[0]).toMatchObject({ change: null, worsening: false });
	expect(trends([report(1)]).series[0]?.worsening).toBe(false);
	expect(renderTrends(trends([]))).toContain('0 runs');
});
it('handles bytes, absent backups and count growth without double-counting tables', () => {
	const a = report(1), b = report(2);
	b.sections[0] = section('tablespaces', ['TABLESPACE_NAME', 'USED_BYTES', 'ALLOCATED_BYTES'], [['USERS', 90, 100]]);
	b.sections[1]!.rows.push(['SH', 'J', '2026-10-02']);
	b.sections.find(s => s.name === 'backups')!.rows = [];
	const r = trends([a, b]);
	expect(r.series[0]?.last).toBe(90);
	expect(r.series.find(s => s.id === 'scheduler_failures')?.worsening).toBe(true);
	expect(r.series.find(s => s.id === 'backups')?.points[1]?.value).toBeNull();
});
it('reads bounded files; counts corrupt, old, oversized, mismatched and symlink files', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'history-untrusted-'));
	try {
		await saveReport(dir, report(1), targets);
		const file = (day: number) => join(dir, 'lab', report(day).generatedAt.replace(/:/g, '-') + '.json');
		await writeFile(file(2), '{');
		await writeFile(file(3), JSON.stringify({ ...report(3), sections: [{}] }));
		await writeFile(file(4), ' '.repeat(MAX_HISTORY_FILE_BYTES + 1));
		await writeFile(file(5), JSON.stringify({ ...report(5), target: 'other' }));
		await symlink(file(1), file(6));
		await mkdir(file(7));
		const r = await loadReportHistory(dir, 'lab', targets);
		expect(r).toMatchObject({ scanned: 7, skipped: 6 }); expect(r.reports).toHaveLength(1);
		expect(await loadReportHistory(dir, 'lab', targets, 2)).toMatchObject({ scanned: 2, skipped: 2, reports: [] });
		await expect(loadReportHistory(dir, '../lab', targets)).rejects.toThrow();
		for (const n of [0, 31, 1.5, NaN]) await expect(loadReportHistory(dir, 'lab', targets, n)).rejects.toThrow();
	} finally { await rm(dir, { recursive: true, force: true }); }
});
it('honors 30-run retention and last N boundaries without creating missing directories', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'history-retention-'));
	try {
		expect(await loadReportHistory(join(dir, 'missing'), 'lab', targets)).toMatchObject({ reports: [], scanned: 0 });
		for (let day = 1; day <= 31; day++) await saveReport(dir, report(day), targets);
		const r = await loadReportHistory(dir, 'lab', targets);
		expect(r.reports).toHaveLength(30); expect(r.reports[0]?.generatedAt).toBe(report(2).generatedAt);
		expect((await loadReportHistory(dir, 'lab', targets, 1)).reports[0]?.generatedAt).toBe(report(31).generatedAt);
	} finally { await rm(dir, { recursive: true, force: true }); }
});
it('escapes terminal control characters from saved labels', () => {
	const a = report(1); a.sections[0]!.rows[0]![0] = '\x1b[31mBAD\nNAME';
	expect(renderTrends(trends([a]))).not.toContain('\x1b');
});
