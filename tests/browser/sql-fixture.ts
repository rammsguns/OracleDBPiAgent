import type { SqlInsight } from '../../src/sqlperf/index.js';
export const sqlFixture: SqlInsight = {
	status: 'ok', sqlId: '0123456789abc', target: 'd1-19c-lab', text: '<script>alert(1)</script> SELECT * FROM SH.SALES',
	children: [], plans: [{ planHashValue: 11, source: 'display_cursor', text: ['Plan text ' + '-'.repeat(220)], lines: [
		{ id: 0, parentId: null, operation: 'SELECT STATEMENT', options: '', owner: '', name: '', objectType: '' },
		{ id: 7, parentId: 0, operation: 'NESTED LOOPS', options: '', owner: '', name: '', objectType: '' },
		{ id: 9, parentId: 7, operation: 'TABLE ACCESS', options: 'FULL', owner: 'SH', name: 'SALES', objectType: 'TABLE' },
	] }], planChanges: [11, 22].map((planHashValue, i) => ({ planHashValue, firstLoad: '2026-11-05T00:00:00Z', lastActive: '2026-11-05T01:00:00Z', execs: 10, elapsedPerExec: (i + 1) * 100 })),
	tables: [{ owner: 'SH', name: 'SALES', stale: true, lastAnalyzed: '2026-01-01T00:00:00Z', numRows: 918000, status: 'ok', view: 'DBA_TAB_STATISTICS' }], indexes: [{ owner: 'SH', name: 'SALES_IDX', stale: null, lastAnalyzed: '', numRows: null, status: 'ok', view: 'DBA_IND_STATISTICS' }],
	baselines: [], profiles: [], binds: [], mismatches: [], findings: [], sections: { children: { status: 'ok', view: 'V$SQL', truncated: false, attempts: [] }, binds: { status: 'unavailable', view: 'V$SQL_BIND_CAPTURE', truncated: false, attempts: [] } },
};
