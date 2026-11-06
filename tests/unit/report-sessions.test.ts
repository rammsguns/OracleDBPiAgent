import { expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { generateReport, type DatabaseReport, type ReportSection } from '../../src/report/index.js';
import { sessionMetrics } from '../../src/report/sessions.js';
import { buildReportTrends } from '../../src/report/trends.js';
import { diff } from '../../src/report/diff.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
const section = (io = 100, concurrency = 20, startup: string | null = '2026-11-01 00:00:00'): ReportSection => ({ name: 'sessions', status: 'ok', source: 'readSessionActivity', columns: ['METRIC', 'WAIT_CLASS', 'VALUE', 'STATUS', 'STARTUP_TIME'], rows: [['wait_seconds', 'User I/O', io, 'ok', startup], ['wait_seconds', 'Concurrency', concurrency, 'ok', startup], ['blockers', null, 0, 'ok', startup], ['long_transactions', null, 0, 'ok', startup]], note: '' });
const report = (day: number, s = section()): DatabaseReport => ({ target: 'lab', generatedAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`, sections: [s] });
it('collects only the opt-in sessions section with audited SELECTs and startup identity', async () => {
	const query = vi.fn(async (sql: string) => {
		classifySql(sql);
		return { columns: ['N'], rows: sql.includes('STARTUP_TIME') ? [['2026-11-01 00:00:00']] : [], truncated: false, elapsedMs: 0 };
	});
	const close = vi.fn(async () => {}), record = vi.fn(async () => {});
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 100, statementTimeoutSeconds: 15 } }, sessions: { get: async () => ({ target: { name: 'lab' }, query, close }) }, audit: { record }, runId: 'sessions-report' } as unknown as ToolContext;
	const r = await generateReport(ctx, { sections: ['sessions'] });
	expect(r.sections.map(s => s.name)).toEqual(['sessions']);
	expect(sessionMetrics(r.sections[0]).filter(r => r.METRIC !== 'wait_seconds').map(r => r.VALUE)).toEqual([0, 0]);
	expect(close).toHaveBeenCalledOnce(); expect(record).toHaveBeenCalledTimes(query.mock.calls.length);
	expect(query.mock.calls.some(([sql]) => /ASH|AWR|DBA_HIST_|VALUE_STRING/.test(sql))).toBe(false);
});
it('computes adjacent wait deltas, with gaps on restarts, decreases, missing startup or reports', () => {
	const reports = [report(1), report(2, section(130)), report(3, section(150, 20, 'restart')), report(4, section(140, 20, 'restart')), report(5, section(160, 20, null)), { ...report(6), sections: [] }, report(7, section(200))];
	const trends = buildReportTrends({ target: 'lab', reports, scanned: reports.length, skipped: 0, notes: [] });
	expect(trends.series.find(s => s.id === 'sessions:wait:User I/O')?.points.map(p => p.value)).toEqual([null, 30, null, null, null, null, null]);
	expect(trends.series.find(s => s.id === 'sessions:blockers')?.points.map(p => p.value)).toEqual([0, 0, 0, 0, 0, null, 0]);
});
it('marks wait-class shifts and snapshot count changes', () => {
	const next = section(110, 200); next.rows[2]![2] = 2;
	expect(diff(report(1), report(2, next)).changes).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'wait_class_shift', message: expect.stringContaining('User I/O → Concurrency') }), expect.objectContaining({ rule: 'session_count', key: 'blockers' })]));
	expect(diff(report(1), report(2, section(110, 200, 'restart'))).changes.some(c => c.rule === 'wait_class_shift')).toBe(false);
});
it('treats unavailable and row-limited snapshots as gaps', () => {
	const partial = section(); partial.note = 'row limit reached';
	expect(sessionMetrics(partial)).toEqual([]);
	const unavailable = section(); unavailable.rows.forEach(r => { r[3] = 'unavailable'; });
	expect(sessionMetrics(unavailable)).toEqual([]);
});
it('withholds wait shifts across incomplete or decreasing counters', () => {
	expect(diff(report(1), report(2, section(90, 200))).changes.some(c => c.rule === 'wait_class_shift')).toBe(false);
	const incomplete = section(110, 200); incomplete.rows.splice(0, 1);
	expect(diff(report(1), report(2, incomplete)).changes.some(c => c.rule === 'wait_class_shift')).toBe(false);
});
