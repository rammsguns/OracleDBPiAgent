import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { collectSql, issueSqlId, sqlHypotheses } from '../../src/triage/sqlperf.js';
import { loadConfig } from '../../src/config/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { ToolContext } from '../../src/contracts.js';
function fixture(fail = '', empty = false) {
	const query = vi.fn(async (sql: string) => {
		classifySql(sql);
		if (fail && sql.includes(fail)) throw Error('query failed with sensitive driver detail');
		let rows: unknown[][] = [];
		if (!empty) {
			if (sql.includes('ELAPSED_PER_EXEC FROM')) rows = [['abcdfghjkmnpq', 'select from orders', 100]];
			else if (sql.includes('FROM V$SQL WHERE')) rows = [0, 1, 2, 3].map(n => [n, n ? 200 : 100, 10, n ? 3000 : 1000, 100, 50, 2, 10, '2026-11-05T00:00:00Z', '2026-11-05T01:00:00Z', 'select from orders', '123']);
			else if (sql.includes('FROM V$SQL_PLAN ')) rows = [[0, null, 'NESTED LOOPS', '', '', '', ''], [1, 0, 'INDEX', '', '', '', ''], [2, 0, 'TABLE ACCESS', 'FULL', 'SHOPAPP', 'ORDERS', 'TABLE']];
			else if (sql.includes('_TAB_STATISTICS')) rows = [['YES', '2026-11-01T00:00:00Z', 200001]];
		}
		return { rows, columns: ['value'], truncated: false, elapsedMs: 1 };
	});
	const close = vi.fn(async () => {});
	const ctx = { config: loadConfig({}), sessions: { get: async () => ({ query, close }) }, audit: { record: vi.fn(async () => {}) }, runId: 'sql-triage-unit' } as unknown as ToolContext;
	return { ctx, query, close };
}
it('validates bounded SQL_ID tokens and ignores invalid alphabet/length', () => {
	expect(issueSqlId('SQL_ID ABCDFGHJKMNPQ slow')).toBe('abcdfghjkmnpq');
	for (const s of ['abcdeghjkmnpq', 'xabcdfghjkmnpqx', 'no SQL here']) expect(issueSqlId(s)).toBeUndefined();
});
it('only collects for SQL_ID or performance language plus an object', async () => {
	const { ctx, query } = fixture();
	for (const issue of ['orders failed', 'slow', 'timeout']) expect((await collectSql(ctx, 'p1-19c-prod', issue, 24, [])).status).toBe('skipped');
	expect(query).not.toHaveBeenCalled();
});
it.each(['slow', 'slowness', 'timeout', 'takes long'])('finds top three object statements for %s and preserves exact evidence', async word => {
	const { ctx, query, close } = fixture();
	const r = await collectSql(ctx, 'p1-19c-prod', `orders query ${word}`, 7, ['SHOPAPP.ORDERS']);
	expect(r.candidates?.sql).toContain('FETCH FIRST 3 ROWS ONLY');
	expect(r.candidates?.sql).toContain('p.CHILD_NUMBER = s.CHILD_NUMBER');
	expect(r.candidates?.sql).toContain('s.LAST_ACTIVE_TIME >= SYSDATE - :hours / 24');
	expect(r.candidates?.binds).toEqual({ hours: 7, owner0: 'SHOPAPP', name0: 'ORDERS' });
	expect(r.insight?.sqlId).toBe('abcdfghjkmnpq');
	expect(sqlHypotheses(r).map(h => h.title).join(' ')).toMatch(/regression.*statistics.*inner side.*sharing/);
	expect(sqlHypotheses(r)[0]?.evidence.join(' ')).toMatch(/100.*200/);
	expect(r.verifyNext).toHaveLength(5);
	for (const check of r.checks) { expect(check.sql).not.toBe(''); expect(check.binds).toBeDefined(); }
	expect(query).toHaveBeenCalledTimes(r.checks.length);
	expect(close).toHaveBeenCalledTimes(query.mock.calls.length);
	expect(query.mock.calls.some(([sql]) => sql.includes('VALUE_STRING'))).toBe(false);
});
it('names unavailable views once, retains other sections and sanitizes errors', async () => {
	const { ctx } = fixture('DBA_TAB_STATISTICS');
	const r = await collectSql(ctx, 'p1-19c-prod', 'abcdfghjkmnpq', 24, []);
	expect(r.status).toBe('unavailable');
	expect(r.checks.filter(c => c.status === 'unavailable' && c.view === 'DBA_TAB_STATISTICS')).toHaveLength(1);
	expect(r.insight?.tables[0]?.view).toBe('ALL_TAB_STATISTICS');
	expect(JSON.stringify(r)).not.toContain('sensitive driver detail');
});
it('reports cache misses for either path without failing', async () => {
	const { ctx } = fixture('', true);
	for (const issue of ['abcdfghjkmnpq', 'orders slow']) expect((await collectSql(ctx, 'p1-19c-prod', issue, 24, ['SHOPAPP.ORDERS'])).reason).toBe('SQL not in cursor cache');
});
it('survives connection acquisition failures without raw details', async () => {
	const { ctx } = fixture();
	ctx.sessions.get = async () => { throw Error('private connection detail'); };
	const r = await collectSql(ctx, 'p1-19c-prod', 'abcdfghjkmnpq', 24, []);
	expect(r.status).toBe('unavailable'); expect(JSON.stringify(r)).not.toContain('private connection detail');
});
it('gives the exact DISPLAY_CURSOR retry form without broadening the 19A policy', () => {
	expect(() => classifySql("SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('abcdfghjkmnpq'))")).toThrow("SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('<sql_id>', <child>, 'TYPICAL'))");
	expect(() => classifySql('SELECT DBMS_XPLAN.DISPLAY() FROM dual')).toThrow("SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('<sql_id>', <child>, 'TYPICAL'))");
	for (const sql of ["SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, :child, 'TYPICAL'))", "SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('abcdfghjkmnpq', 0, 'TYPICAL'))"]) expect(classifySql(sql)).toBe(sql);
	for (const sql of ['SELECT DBMS_XPLAN.DISPLAY() FROM dual', 'SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, :child, :format)) WHERE 1=1', 'SELECT UTL_HTTP.REQUEST(1) FROM dual']) expect(() => classifySql(sql)).toThrow();
});

it('keeps the 19A policy source byte-identical apart from its rejection message', () => {
	const source = readFileSync(new URL('../../src/oracle/sqlPolicy.ts', import.meta.url), 'utf8').replace(
		"DISPLAY_CURSOR requires the exact allowed form: SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('<sql_id>', <child>, 'TYPICAL')) (scalar bind or literal arguments)",
		'DISPLAY_CURSOR requires the exact SELECT FROM TABLE form with scalar bind or literal arguments',
	);
	const normalized = source.replace(/throw new StatementRejectedError\(`Function \$\{name\} is not allowed[^\n]+/, 'throw new StatementRejectedError(`Function ${name} is not allowed`);');
	// SHA-256 of the merged WP-19A policy, before this message-only change.
	expect(createHash('sha256').update(normalized).digest('hex')).toBe('00c45e5ca760a52961c8599d4a7659622d9adf05dedccea5709cfec1bd4855fd');
});

it('integrates optional SQL failures into triage and renders legacy fixtures without SQL', async () => {
	const { ctx } = fixture('V$SQL_BIND_CAPTURE');
	const result = await triage(ctx, { target: 'p1-19c-prod', issue: 'orders query slow on SHOPAPP.ORDERS' });
	const sql = result.issues[0]!.sql;
	expect(sql.status).toBe('unavailable');
	expect(sql.insight?.children.length).toBeGreaterThan(0);
	expect(result.issues[0]!.hypotheses[0]?.verifyNext).toBeDefined();
	const markdown = renderTriageMarkdown(result);
	expect(markdown).toContain('Verify next (not executed)');
	expect(markdown).toContain('V$SQL_BIND_CAPTURE');
	expect(markdown).toContain('### SQL Performance');
	delete (result.issues[0] as { sql?: unknown }).sql;
	expect(renderTriageMarkdown(result)).not.toContain('### SQL Performance');
});
