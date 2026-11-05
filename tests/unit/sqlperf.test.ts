import { expect, it } from 'vitest';
import type { OracleSession, QueryResult } from '../../src/contracts.js';
import { findSqlCandidates, readSqlInsight, renderSqlInsightMarkdown, validateSqlOptions } from '../../src/sqlperf/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
const data = (rows: unknown[][], columns: string[] = []): QueryResult => ({ rows, columns, truncated: false, elapsedMs: 1 });
function fixture(fail: string[] = []) {
	const queries: string[] = [];
	const session = {
		target: { name: 'fixture' },
		query: async (sql: string) => {
			queries.push(sql); classifySql(sql);
			expect(sql).not.toMatch(/VALUE_STRING|\bPASSWORD\b|SPARE4/);
			if (fail.some(s => sql.includes(s))) throw new Error('ORA-00942');
			if (sql.includes('FROM V$SQL WHERE')) return data([
				[0, 100, 10, 1000, 200, 20, 5, 10, '2026-11-05T01:02:03Z', '2026-11-05T02:00:00Z', '<select>', '123'],
				[1, 200, 10, 3000, 400, 60, 10, 20, '2026-11-05T01:02:03Z', '2026-11-05T03:00:00Z', '<select>', '123'],
			]);
			if (sql.includes('FROM V$SQL_PLAN ')) return data([[0, null, 'SELECT STATEMENT', '', '', '', ''], [1, 0, 'NESTED LOOPS', '', '', '', ''], [2, 1, 'INDEX', 'UNIQUE SCAN', 'APP', 'IDX', 'INDEX'], [3, 1, 'TABLE ACCESS', 'FULL', 'APP', 'BIG', 'TABLE']]);
			if (sql.includes('DISPLAY_CURSOR')) return data([]);
			if (sql.includes('_STATISTICS')) return data([['YES', '2026-11-01T00:00:00Z', 200001]]);
			if (sql.includes('SQL_PLAN_BASELINES')) return data([['handle', 'plan', 'YES', 'YES']], ['SQL_HANDLE', 'PLAN_NAME', 'ENABLED', 'ACCEPTED']);
			return data([]);
		},
	} as unknown as OracleSession;
	return { session, queries };
}
it('reads plans, aggregates execution-weighted metrics, flags evidence and escapes markdown', async () => {
	const { session } = fixture();
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	expect(r.planChanges.map(p => p.elapsedPerExec)).toEqual([100, 300]);
	expect(r.children[0]?.firstLoad).toBe('2026-11-05T01:02:03Z');
	expect(r.children[0]?.rowsPerExec).toBe(1);
	expect(r.plans.every(p => p.source === 'v$sql_plan')).toBe(true);
	expect(r.findings.some(f => f.label.includes('instability'))).toBe(true);
	expect(r.findings.some(f => f.label.includes('inner side'))).toBe(true);
	expect(r.findings.every(f => f.rows.length)).toBe(true);
	expect(renderSqlInsightMarkdown(r)).toContain('&lt;select&gt;');
	expect(r.baselines[0]?.SQL_HANDLE).toBe('handle');
});
it('falls back to ALL statistics and names unavailable views independently', async () => {
	const { session } = fixture(['DBA_TAB_STATISTICS', 'DBA_IND_STATISTICS', 'V$SQL_BIND_CAPTURE']);
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq', maxPlans: 1 });
	expect(r.tables[0]?.view).toBe('ALL_TAB_STATISTICS');
	expect(r.sections.binds?.status).toBe('unavailable');
	expect(r.sections.binds?.view).toBe('V$SQL_BIND_CAPTURE');
	expect(r.sections.plans?.truncated).toBe(true);
	expect(r.sections.mismatches?.status).toBe('skipped');
});
it('returns unavailable children without inventing evidence', async () => {
	const { session } = fixture(['FROM V$SQL WHERE']);
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	expect(r.status).toBe('unavailable'); expect(r.findings).toEqual([]);
});
it('propagates unexpected query failure', async () => {
	const session = { query: async () => { throw Error('ORA-03113'); }, target: { name: 'fixture' } } as unknown as OracleSession;
	await expect(readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' })).rejects.toThrow('ORA-03113');
});
it.each(['', 'abcdefghijklm', 'abcdfghjkmnpq;delete', 'ABCDFGHJKMNPQ'])('rejects bad SQL ID %s', sqlId => expect(() => validateSqlOptions({ sqlId })).toThrow());
it('validates numeric bounds', () => {
	for (const child of [-1, NaN, 1.5]) expect(() => validateSqlOptions({ sqlId: 'abcdfghjkmnpq', child })).toThrow();
	for (const maxPlans of [0, 21, NaN]) expect(() => validateSqlOptions({ sqlId: 'abcdfghjkmnpq', maxPlans })).toThrow();
});
it('escapes LIKE wildcard fragments and bounds candidates', async () => {
	let seen: unknown;
	const session = { query: async (sql: string, binds: unknown) => { classifySql(sql); seen = binds; expect(sql).toContain('FIRST 11'); return data([]); } } as unknown as OracleSession;
	await findSqlCandidates(session, 'x%_'); expect(seen).toEqual({ fragment: '%x\\%\\_%' });
	await expect(findSqlCandidates(session, '')).rejects.toThrow();
});
it('captures only Y mismatch flags for high child counts, with evidence', async () => {
	const base = fixture();
	const query = base.session.query.bind(base.session);
	base.session.query = async (sql, binds, options) => {
		if (sql.includes('FROM V$SQL WHERE')) {
			const d = await query(sql, binds, options);
			d.rows.push(...d.rows.map((r, i) => [i + 2, ...r.slice(1)]));
			return d;
		}
		if (sql.includes('ALL_TAB_COLUMNS')) return data([['BIND_MISMATCH'], ['OPTIMIZER_MISMATCH'], ['PASSWORD_HASH']]);
		if (sql.includes('FROM V$SQL_SHARED_CURSOR')) {
			expect(sql).not.toContain('PASSWORD_HASH');
			return data([[0, 'Y', 'N']], ['CHILD_NUMBER', 'BIND_MISMATCH', 'OPTIMIZER_MISMATCH']);
		}
		return query(sql, binds, options);
	};
	const r = await readSqlInsight(base.session, { sqlId: 'abcdfghjkmnpq' });
	expect(r.mismatches).toEqual([{ CHILD_NUMBER: 0, BIND_MISMATCH: 'Y' }]);
	expect(r.findings.find(f => f.label === 'High child-cursor count')?.rows).toHaveLength(4);
});
it('uses display text when present and falls back when the function throws', async () => {
	for (const fail of [false, true]) {
		const { session } = fixture();
		const query = session.query.bind(session);
		session.query = async (sql, binds, options) => {
			if (sql.includes('DISPLAY_CURSOR')) {
				if (fail) throw Error('ORA-06512');
				return data([['Plan hash value: 100'], ['TABLE ACCESS FULL']]);
			}
			return query(sql, binds, options);
		};
		const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
		expect(r.plans[0]?.source).toBe(fail ? 'v$sql_plan' : 'display_cursor');
	}
});
it('never divides by zero or diagnoses the outer nested-loop input', async () => {
	const { session } = fixture();
	const query = session.query.bind(session);
	session.query = async (sql, binds, options) => {
		const d = await query(sql, binds, options);
		if (sql.includes('FROM V$SQL WHERE')) for (const row of d.rows) row[2] = 0;
		if (sql.includes('FROM V$SQL_PLAN ')) d.rows = [[1, null, 'NESTED LOOPS', '', '', '', ''], [2, 1, 'TABLE ACCESS', 'FULL', 'APP', 'BIG', 'TABLE'], [3, 1, 'INDEX', 'UNIQUE SCAN', 'APP', 'IDX', 'INDEX']];
		return d;
	};
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	expect(r.children.every(c => c.elapsedPerExec === null)).toBe(true);
	expect(r.findings.some(f => /instability|inner side/.test(f.label))).toBe(false);
});
it('fences display and fallback plans verbatim with a fence longer than embedded backticks', async () => {
	const { session } = fixture();
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	r.plans[0]!.text = ['| Id | Operation       |', '|  1 | <FULL> & SCAN   |', '```', '`````'];
	r.plans[0]!.source = 'display_cursor';
	r.plans[1]!.lines[0]!.name = 'a|b<>&```';
	const markdown = renderSqlInsightMarkdown(r);
	expect(markdown).toContain('\n``````\n| Id | Operation       |\n|  1 | <FULL> & SCAN   |\n```\n`````\n``````\n');
	const fallback = r.plans[1]!.lines.map(l => JSON.stringify(l)).join('\n');
	expect(markdown).toContain('\n````\n' + fallback + '\n````\n');
});
it('requests server-offset UTC conversion for first load and preserves SQL nulls', async () => {
	const { session, queries } = fixture();
	const query = session.query.bind(session);
	session.query = async (sql, binds, options) => {
		const d = await query(sql, binds, options);
		if (sql.includes('FROM V$SQL WHERE')) { d.rows[0]![8] = '2026-11-05T07:02:03Z'; d.rows[1]![8] = null; }
		return d;
	};
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	expect(queries[0]).toContain("TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(TO_TIMESTAMP(TRIM(FIRST_LOAD_TIME), 'YYYY-MM-DD/HH24:MI:SS'), TO_CHAR(SYSTIMESTAMP, 'TZH:TZM'))), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')");
	expect(r.children.map(c => c.firstLoad)).toEqual(['2026-11-05T07:02:03Z', '']);
});
it('renders the union of mismatch keys in first-seen order', async () => {
	const { session } = fixture();
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	r.mismatches = [{ CHILD_NUMBER: 0, OPTIMIZER_MISMATCH: 'Y' }, { CHILD_NUMBER: 1, BIND_MISMATCH: 'Y' }];
	expect(renderSqlInsightMarkdown(r)).toContain('| CHILD_NUMBER | OPTIMIZER_MISMATCH | BIND_MISMATCH |\n| --- | --- | --- |\n| 0 | Y |  |\n| 1 |  | Y |');
});
it('deduplicates statistics summary view names while preserving object sections', async () => {
	const { session } = fixture();
	const query = session.query.bind(session);
	session.query = async (sql, binds, options) => {
		const d = await query(sql, binds, options);
		if (sql.includes('FROM V$SQL_PLAN ')) d.rows.push([4, 1, 'TABLE ACCESS', 'FULL', 'APP', 'OTHER', 'TABLE'], [5, 1, 'INDEX', 'FULL SCAN', 'APP', 'OTHER_IDX', 'INDEX']);
		return d;
	};
	const r = await readSqlInsight(session, { sqlId: 'abcdfghjkmnpq' });
	expect(r.sections.tables?.view).toBe('DBA_TAB_STATISTICS');
	expect(r.sections.indexes?.view).toBe('DBA_IND_STATISTICS');
	expect(Object.keys(r.sections).filter(k => k.startsWith('tables:'))).toHaveLength(2);
	expect(renderSqlInsightMarkdown(r)).toContain('- tables: ok; DBA_TAB_STATISTICS\n');
});
