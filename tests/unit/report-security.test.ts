import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { generateReport, renderMarkdown } from '../../src/report/index.js';
import { buildReportTrends } from '../../src/report/trends.js';
import { securitySection } from '../../src/report/security.js';
import { compareTargets, parseScope } from '../../src/drift/index.js';
import type { SecurityPosture } from '../../src/security/index.js';
function setup() {
	const query = vi.fn().mockResolvedValue({ columns: ['N'], rows: [[1]], truncated: false, elapsedMs: 1 });
	const close = vi.fn(); const record = vi.fn();
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }, { name: 'prod', defaultSchema: 'APP' }], limits: { maxRows: 100, statementTimeoutSeconds: 15 } }, sessions: { get: vi.fn(async (target: string) => ({ target: { name: target }, query, close })) }, audit: { record }, runId: 'test' } as unknown as ToolContext;
	return { ctx, query, close, record };
}
it('keeps default JSON and Markdown byte-identical to master fixture', async () => {
	const { ctx } = setup();
	const report = await generateReport(ctx); report.generatedAt = '2026-11-05T00:00:00.000Z';
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/report-master.json', import.meta.url), 'utf8'));
	expect(JSON.stringify(report)).toBe(JSON.stringify(baseline.report));
	expect(renderMarkdown(report)).toBe(baseline.markdown);
});
it('uses only security SQL on opt-in; audits and closes; missing grants remain unavailable', async () => {
	const { ctx, query, close, record } = setup(); query.mockRejectedValue(new Error('ORA-00942 private driver text'));
	const report = await generateReport(ctx, { sections: ['security'] });
	expect(report.sections).toHaveLength(1);
	expect(report.sections[0]).toMatchObject({ name: 'security', status: 'unavailable' });
	expect(renderMarkdown(report)).toContain('unavailable');
	expect(JSON.stringify(report)).not.toContain('private');
	expect(record).toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
});
const posture = (count: number): SecurityPosture => ({ target: 'lab', status: 'ok', checks: ['high', 'medium', 'low', 'info'].map(severity => ({ id: severity, severity, title: severity, status: 'ok', advice: 'Review', evidence: [], notes: [], findings: Array.from({ length: count }, () => ({ subject: 'USER', detail: 'Finding', evidence: {} })) })) } as SecurityPosture);
it('trends count findings by severity, preserving zeros and missing/unavailable gaps', () => {
	const reports = [0, 1, 2, 3].map(n => ({ target: 'lab', generatedAt: `2026-11-0${n + 1}T00:00:00.000Z`, sections: n === 0 ? [] : [securitySection(posture(n - 1))] }));
	reports[3]!.sections[0]!.status = 'unavailable';
	const trends = buildReportTrends({ target: 'lab', reports, scanned: 4, skipped: 0, notes: [] });
	for (const series of trends.series.filter(s => s.id.startsWith('security:'))) expect(series.points.map(p => p.value)).toEqual([null, 0, 1, null]);
});
it('accepts security scope and withholds drift on missing evidence', async () => {
	const { ctx, query } = setup(); query.mockRejectedValue(new Error('ORA-01031'));
	expect(parseScope('security')).toEqual({ kind: 'security' });
	const result = await compareTargets(ctx, { left: 'lab', right: 'prod', scope: 'security' });
	expect(result).toMatchObject({ complete: false, hasDrift: false });
	expect(result.sections.every(s => s.status === 'unavailable' && !s.onlyLeft.length && !s.onlyRight.length)).toBe(true);
});
it('compares powerful users, nested roles and PUBLIC grants, including counts', async () => {
	const { SQL } = await import('../../src/security/sql.js');
	const { ctx } = setup();
	ctx.sessions.get = vi.fn(async (target: string) => ({ target: { name: target }, close: async () => {}, query: async (sql: string) => {
		const data: Record<string, unknown[][]> = { [SQL.users]: [['ALICE', 'N']], [SQL.roles]: [['CUSTOM', 'N']], [SQL.roleGrants]: [['ALICE', 'CUSTOM'], ['CUSTOM', 'DBA']], [SQL.public]: target === 'lab' ? [['SYS', 'UTL_FILE', 'EXECUTE', 'PACKAGE']] : [], [SQL.systemGrants]: [], [SQL.pwfile]: [] };
		return { columns: [], rows: data[sql] ?? [], truncated: false, elapsedMs: 1 };
	} })) as unknown as ToolContext['sessions']['get'];
	const result = await compareTargets(ctx, { left: 'lab', right: 'prod', scope: 'security' });
	expect(result).toMatchObject({ complete: true, hasDrift: true });
	expect(result.sections[0]!.onlyLeft).toEqual([]);
	expect(result.sections[0]!.notes.join(' ')).toContain('2 distinct subjects');
	expect(result.sections[1]!.onlyLeft[0]!.key).toContain('UTL_FILE');
	expect(result.sections[1]!.different).toContainEqual({ key: 'finding-count', left: [1], right: [0] });
});
