import { expect, it } from 'vitest';
import { diff, renderDiffMarkdown } from '../../src/report/diff.js';
import type { DatabaseReport, ReportSection } from '../../src/report/index.js';
const report = (sections: ReportSection[], generatedAt = '2026-10-29T12:00:00.000Z'): DatabaseReport => ({ target: 'lab', generatedAt, sections });
const section = (name: string, columns: string[], rows: unknown[][]): ReportSection => ({ name, columns, rows, status: 'ok', source: name, note: '' });
it.each([
	['scheduler_failures', ['OWNER', 'JOB_NAME', 'LOG_DATE'], [['A', 'J', '2026-10-29']], 'new_failed_run'],
	['top_sql', ['SQL_ID'], [['abc']], 'new_top_sql'],
	['optimizer_stats', ['OWNER', 'TABLE_NAME', 'STALE_STATS'], [['A', 'T', 'YES']], 'newly_stale'],
	['optimizer_stats', ['OWNER', 'TABLE_NAME', 'STATTYPE_LOCKED'], [['A', 'T', 'ALL']], 'newly_locked'],
	['index_health', ['OWNER', 'INDEX_NAME', 'STATUS'], [['A', 'I', 'UNUSABLE']], 'newly_unusable'],
	['index_health', ['OWNER', 'INDEX_NAME', 'VISIBILITY'], [['A', 'I', 'INVISIBLE']], 'newly_invisible'],
	['index_partitions', ['INDEX_OWNER', 'INDEX_NAME', 'PARTITION_NAME', 'STATUS'], [['A', 'I', 'P', 'UNUSABLE']], 'newly_unusable'],
	['index_subpartitions', ['INDEX_OWNER', 'INDEX_NAME', 'PARTITION_NAME', 'SUBPARTITION_NAME', 'STATUS'], [['A', 'I', 'P', 'S', 'UNUSABLE']], 'newly_unusable'],
] as [string, string[], unknown[][], string][])('detects %s %s', (name, columns, rows, rule) => {
	const s = section(name, columns, rows), before = report([{ ...s, rows: [] }]), after = report([s]);
	expect(diff(before, after).changes.map(c => c.rule)).toEqual([rule]);
	expect(diff(after, after).changes).toEqual([]);
	expect(diff(after, before).changes).toEqual([]);
});
it.each([[80, 84.99, false], [80, 85, true], [84.9, 85, true], [90, 95, true], [90, 94.99, false]])('tablespace %s to %s', (a, b, changes) => {
	const s = (p: number) => report([section('tablespaces', ['TABLESPACE_NAME', 'ALLOCATED_BYTES', 'USED_BYTES'], [['USERS', 100, p]])]);
	expect(diff(s(a), s(b)).changes.length > 0).toBe(changes);
});
it('handles fallback percentages and skips incompatible sources', () => {
	const a = report([section('tablespaces', ['TABLESPACE_NAME', 'USED_PERCENT'], [['U', 80]])]);
	const b = structuredClone(a); b.sections[0]!.rows[0]![1] = 85;
	expect(diff(a, b).changes).toHaveLength(1);
	b.sections[0]!.source = 'fallback'; expect(diff(a, b).changes).toEqual([]); expect(diff(a, b).notes).toHaveLength(1);
});
it('matches stable keys despite reordered columns and detects a new log date', () => {
	const a = report([section('scheduler_failures', ['OWNER', 'JOB_NAME', 'LOG_DATE'], [['A', 'J', 'old']])]);
	const b = report([section('scheduler_failures', ['LOG_DATE', 'JOB_NAME', 'OWNER'], [['old', 'J', 'A'], ['new', 'J', 'A']])]);
	expect(diff(a, b).changes).toHaveLength(1);
});
it('detects stale/locked transitions on existing rows, excluding never-analyzed only', () => {
	const s = section('optimizer_stats', ['OWNER', 'TABLE_NAME', 'STALE_STATS', 'STATTYPE_LOCKED'], [['A', 'T', null, null]]);
	const a = report([s]); const b = structuredClone(a); b.sections[0]!.rows[0] = ['A', 'T', 'YES', 'ALL'];
	expect(diff(a, b).changes).toHaveLength(2); expect(diff(report([{ ...s, rows: [] }]), a).changes).toEqual([]);
});
it('ages completed backups using report time, not wall time', () => {
	const s = section('backups', ['STATUS', 'END_TIME'], [['COMPLETED', '2026-10-28T12:00:00.000Z']]);
	const a = report([s]), b = report([s], '2026-10-29T12:00:00.001Z');
	expect(diff(a, b).changes[0]?.rule).toBe('backup_not_recent');
	expect(diff(b, b).changes).toEqual([]);
	expect(diff(report([{ ...s, rows: [['FAILED', '2026-10-29']] }]), b).changes).toEqual([]);
});
it('handles baseline, unavailable and missing sections explicitly', () => {
	const a = report([section('top_sql', ['SQL_ID'], [['x']])]);
	expect(diff(null, a).changes).toEqual([]);
	const b = structuredClone(a); b.sections[0]!.status = 'unavailable';
	expect(diff(a, b).changes[0]?.rule).toBe('availability'); expect(diff(b, a).changes).toHaveLength(1);
	expect(diff(b, b).changes).toEqual([]); expect(diff(a, report([])).notes).toHaveLength(1);
	expect(() => diff(a, { ...a, target: 'other' })).toThrow();
});
it('escapes Markdown output and serializes JSON deterministically without mutation', () => {
	const a = report([section('top_sql', ['SQL_ID'], [])]); const b = report([section('top_sql', ['SQL_ID'], [['<script>']])]);
	const frozen = JSON.stringify(b); const d = diff(a, b);
	expect(renderDiffMarkdown(d)).toContain('&lt;script&gt;'); expect(JSON.parse(JSON.stringify(d))).toEqual(d); expect(JSON.stringify(b)).toBe(frozen);
});
