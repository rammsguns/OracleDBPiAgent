import { expect, it } from 'vitest';
import { webReportDiff } from '../../src/web/reportDiff.js';
import type { DatabaseReport } from '../../src/report/index.js';
const report = (rows: unknown[][]): DatabaseReport => ({ target: 'd1-19c-lab', generatedAt: '2026-10-29T00:00:00.000Z', sections: [{ name: 'tablespaces', status: 'ok', source: 'fake', columns: ['TABLESPACE_NAME', 'USED_PERCENT'], rows, note: '' }] });
it('adds matching before and after values without changing deterministic rules', () => {
	const result = webReportDiff(report([['DATA', 81], ['OTHER', 10]]), report([['OTHER', 11], ['DATA', 86]]));
	expect(result.changes).toEqual([expect.objectContaining({ rule: 'tablespace_usage', key: 'DATA', before: 'TABLESPACE_NAME: DATA, USED_PERCENT: 81', after: 'TABLESPACE_NAME: DATA, USED_PERCENT: 86' })]);
});
it('preserves no baseline and availability states', () => {
	const current = report([]); expect(webReportDiff(null, current).previousGeneratedAt).toBeNull();
	const previous = report([]); previous.sections[0]!.status = 'unavailable';
	expect(webReportDiff(previous, current).changes[0]).toMatchObject({ rule: 'availability', before: 'unavailable', after: 'ok' });
});
