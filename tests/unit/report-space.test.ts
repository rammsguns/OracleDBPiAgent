import { expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { fitSpaceGrowth, readReportSpace, spaceHistoryPoints } from '../../src/report/space.js';
import { generateReport, renderMarkdown, type DatabaseReport, type ReportSection } from '../../src/report/index.js';
import { buildReportTrends } from '../../src/report/trends.js';
import { diff } from '../../src/report/diff.js';
import { compareTargets, renderDriftMarkdown } from '../../src/drift/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
const at = (day: number) => new Date(Date.UTC(2026, 10, 1) + day * 86400000).toISOString();
const points = (values: number[], step = 1) => values.map((value, i) => ({ generatedAt: at(i * step), value }));
it('fits linear growth against maximum capacity at the latest measured usage', () => {
	expect(fitSpaceGrowth(points([10, 20, 30]), 100)).toEqual({ status: 'growing', bytesPerDay: 10, daysToFull: 7 });
	expect(fitSpaceGrowth(points([10, 15, 20], 0.5), 100).daysToFull).toBe(8);
	expect(fitSpaceGrowth(points([10, 20, 110]), 100).daysToFull).toBe(0);
});
it('requires three distinct observations spanning a full day', () => {
	for (const p of [points([1, 2]), points([1, 2, 3], 0.49), [...points([1, 2]), points([3])[0]!], [{ generatedAt: 'bad', value: 1 }], points([1, NaN, 3])]) expect(fitSpaceGrowth(p, 100).status).toBe('not enough history');
	expect(fitSpaceGrowth(points([1, 2, 3]), 0).status).toBe('not enough history');
});
it('handles flat, negative and noisy slopes using all points', () => {
	expect(fitSpaceGrowth(points([20, 20, 20]), 100)).toEqual({ status: 'not growing', bytesPerDay: 0, daysToFull: null });
	expect(fitSpaceGrowth(points([30, 20, 10]), 100).status).toBe('not growing');
	const fit = fitSpaceGrowth(points([10, 25, 17, 40]), 100);
	expect(fit.bytesPerDay).toBeCloseTo(8.2); expect(fit.daysToFull).toBeCloseTo(60 / 8.2);
});
const section = (value = 10, rate: number | null = 10): ReportSection => ({ name: 'space', status: 'ok', source: 'readSpaceUsage', columns: ['METRIC', 'NAME', 'VALUE', 'MAX_BYTES', 'STATUS', 'BYTES_PER_DAY', 'DAYS_TO_FULL', 'FORECAST'], rows: [['tablespace', 'USERS', value, 100, 'ok', rate, null, null], ['temp', 'TEMP', 2, null, 'ok', null, null, null], ['fra', 'FRA', 3, 100, 'ok', null, null, null]], note: '' });
const report = (day: number, s = section()): DatabaseReport => ({ target: 'left', generatedAt: at(day), sections: [s] });
it('uses restart-free space gauges, with boundaries on missing, partial or changed capacity', () => {
	const reports = [report(0, section(10)), report(1, section(20)), report(2, section(30))];
	expect(fitSpaceGrowth(spaceHistoryPoints(reports, 'tablespace', 'USERS', 100), 100).daysToFull).toBe(7);
	for (const s of [{ ...section(), status: 'unavailable' as const }, { ...section(), rows: [] }, { ...section(), source: 'other' }]) expect(spaceHistoryPoints([reports[0]!, report(1, s), reports[2]!], 'tablespace', 'USERS', 100)).toHaveLength(1);
	expect(spaceHistoryPoints(reports, 'tablespace', 'USERS', 200)).toEqual([]);
});
it('adds byte trends and growth-rate markers only for valid fitted observations', () => {
	const reports = [report(0), report(1, section(20, 25))];
	const trends = buildReportTrends({ target: 'left', reports, scanned: 2, skipped: 0, notes: [] });
	expect(trends.series.filter(s => s.id.startsWith('space:')).map(s => s.unit)).toEqual(['bytes', 'bytes', 'bytes']);
	expect(diff(reports[0], reports[1]!).changes).toContainEqual(expect.objectContaining({ rule: 'space_growth_rate', key: 'USERS' }));
	expect(diff(report(0, section(10, null)), reports[1]!).changes).toEqual([]);
});
function setup() {
	const query = vi.fn(async (sql: string) => { classifySql(sql); return { columns: [], rows: [], truncated: false, elapsedMs: 0 }; });
	const close = vi.fn(async () => {}), record = vi.fn(async () => {});
	const ctx = { config: { defaultTarget: 'left', targets: [{ name: 'left', defaultSchema: 'SH' }, { name: 'right', defaultSchema: 'SH' }], limits: { maxRows: 100, statementTimeoutSeconds: 15 } }, sessions: { get: async (name: string) => ({ target: { name }, query, close }) }, audit: { record }, runId: 'space-test' } as unknown as ToolContext;
	return { ctx, query, close, record };
}
it('reuses audited SELECTs and closes the report session', async () => {
	const { ctx, query, close, record } = setup();
	expect((await readReportSpace(ctx, 'left')).name).toBe('space');
	expect(close).toHaveBeenCalledOnce(); expect(record).toHaveBeenCalledTimes(query.mock.calls.length);
	expect(query.mock.calls.every(([sql]) => !/STARTUP_TIME|DBA_HIST_|ACTIVE_SESSION_HISTORY/i.test(sql))).toBe(true);
});
it('keeps default report bytes unchanged', async () => {
	const { ctx } = setup(); const r = await generateReport(ctx); r.generatedAt = at(0);
	expect(r.sections.some(s => s.name === 'space' || s.name === 'sessions')).toBe(false);
	expect(JSON.stringify(r) + '\n' + renderMarkdown(r)).toMatchSnapshot();
});
for (const scope of ['parameters', 'schema:SH', 'objects:SH', 'security']) it(`keeps ${scope} drift bytes unchanged`, async () => {
	const { ctx } = setup(); const r = await compareTargets(ctx, { left: 'left', right: 'right', scope }); r.generatedAt = at(0);
	expect(JSON.stringify(r) + '\n' + renderDriftMarkdown(r)).toMatchSnapshot();
});
it('hydrates forecasts from saved observations without a startup counter and keeps raw JSON bytes', async () => {
	const reader = await import('../../src/space/index.js');
	const { ctx } = setup();
	const d = { target: 'left', capturedAt: at(2), status: 'ok', findings: [], sections: {
		tablespaces: { status: 'ok', evidence: { status: 'ok', truncated: false }, supportingEvidence: [], rows: [{ name: 'USERS', usedBytes: 30, maxBytes: 100 }] },
	} } as unknown as reader.SpaceReport;
	const spy = vi.spyOn(reader, 'readSpaceUsage').mockResolvedValue(d);
	try {
		const result = await readReportSpace(ctx, 'left', [report(0, section(10)), report(1, section(20))]);
		expect(result.rows[0]).toEqual(['tablespace', 'USERS', 30, 100, 'ok', 10, 7, 'growing']);
		expect(renderMarkdown(report(2, result))).toContain('10 B/day');
		d.sections.tablespaces.evidence.truncated = true;
		const partial = await readReportSpace(ctx, 'left', [report(0), report(1)]);
		expect(partial.rows[0]?.[4]).toBe('unavailable'); expect(partial.rows[0]?.[5]).toBeNull();
	} finally { spy.mockRestore(); }
});
