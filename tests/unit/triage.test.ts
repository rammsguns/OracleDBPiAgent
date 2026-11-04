import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { validateLogTables } from '../../src/config/logTables.js';
import { triage, parseIssue, sinceHours, renderTriageMarkdown, statementAt } from '../../src/triage/index.js';
import { TriageReader, displaySql } from '../../src/triage/read.js';
import { errorGuide } from '../../src/triage/guide.js';
import { saveTriage, summarizeTriage } from '../../src/triage/cli.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';
function context(query: OracleSession['query']): ToolContext {
	return { config: loadConfig(), runId: 'triage-test', audit: { record: vi.fn(async () => {}) }, sessions: { get: async () => ({ query, close: vi.fn(async () => {}) } as unknown as OracleSession), closeAll: async () => {} } };
}
const source = ['PACKAGE BODY workload IS', 'PROCEDURE nightly_purge IS', 'BEGIN', 'DELETE FROM order_lines WHERE order_id IN (SELECT order_id FROM orders);', 'DELETE FROM orders;', 'END;', 'END workload;'];
function fixture(anonymous = false) {
	return context(async (sql, binds, options) => {
		classifySql(sql); expect(options?.maxRows).toBeLessThanOrEqual(200);
		let rows: unknown[][] = [];
		if (sql.includes('_SCHEDULER_JOBS')) rows = [['SHOPAPP', 'NIGHTLY_PURGE_JOB', 'PLSQL_BLOCK', anonymous ? "BEGIN raise_application_error(-20001, 'hidden'); END;" : 'BEGIN shopapp.workload.nightly_purge; END;']];
		else if (sql.includes('_SCHEDULER_JOB_RUN_DETAILS')) rows = [['SHOPAPP', 'NIGHTLY_PURGE_JOB', 'FAILED', anonymous ? 20001 : 2292, '2026-11-04T04:30:00Z', anonymous ? 'ORA-20001: application failure\nORA-06512: at line 1' : 'ORA-02292: integrity constraint (SHOPAPP.FK_OTHER) violated\nORA-06512: at "SHOPAPP.WORKLOAD", line 5\nORA-06512: at line 1']];
		else if (sql.includes('_SOURCE')) rows = source.map((text, i) => ['PACKAGE BODY', i + 1, text]);
		else if (sql.includes('_CONS_COLUMNS')) rows = [['SHOPAPP', binds?.name, binds?.name === 'PK_ORDERS' ? 'ORDERS' : 'OTHER_CHILD', 'ORDER_ID', 1]];
		else if (sql.includes('_CONSTRAINTS')) {
			if (sql.includes("CONSTRAINT_TYPE = 'R'")) rows = [['SHOPAPP', 'FK_OTHER', 'OTHER_CHILD', 'SHOPAPP', 'PK_ORDERS', 'NO ACTION', 'ENABLED'], ['SHOPAPP', 'FK_LINES', 'ORDER_LINES', 'SHOPAPP', 'PK_ORDERS', 'NO ACTION', 'ENABLED']];
			else if (sql.includes('CONSTRAINT_TYPE, TABLE_NAME')) rows = [['SHOPAPP', 'FK_OTHER', 'R', 'OTHER_CHILD', 'SHOPAPP', 'PK_ORDERS', 'NO ACTION', 'ENABLED']];
			else rows = [['SHOPAPP', 'PK_ORDERS', 'ORDERS', 'P']];
		}
		return { rows, columns: rows[0]?.map((_, i) => 'C' + i) ?? [], truncated: false, elapsedMs: 0 };
	});
}
describe('issue triage', () => {
	it('parses codes, both stack forms, qualified objects, jobs and times', () => {
		const p = parseIssue('2026-11-04T04:30:00Z NIGHTLY_PURGE_JOB ORA-02292 PLS-00302\nORA-06512: at "SHOPAPP.WORKLOAD", line 27\nORA-06512: at line 1');
		expect(p.frames).toEqual([{ owner: 'SHOPAPP', name: 'WORKLOAD', line: 27 }, { line: 1 }]);
		expect(p.jobs).toEqual(['NIGHTLY_PURGE_JOB']); expect(p.codes).toContain('PLS-00302'); expect(p.times).toContain('2026-11-04T04:30:00Z');
		expect(sinceHours('30m')).toBe(.5); for (const value of ['0h', '31d', '24', '-1h', '1h;delete']) expect(() => sinceHours(value)).toThrow();
	});
	it('strictly validates log table identifiers, fields and column caps', () => {
		const valid = { table: 'APP.EVENT_LOG', timestampColumn: 'CREATED_AT', columns: ['MESSAGE'] };
		expect(() => validateLogTables([valid])).not.toThrow();
		for (const bad of [null, {}, [{ ...valid, table: 'app.LOG' }], [{ ...valid, table: 'APP.LOG@LINK' }], [{ ...valid, table: 'APP."LOG"' }], [{ ...valid, columns: ['X;DELETE'] }], [{ ...valid, columns: Array.from({ length: 9 }, (_, i) => 'C' + i) }], [{ ...valid, columns: ['A', 'A'] }], [{ ...valid, extra: true }], [{ ...valid, timestampColumn: 'TS DESC' }]]) expect(() => validateLogTables(bad)).toThrow();
	});
	it('resolves frame ranges, statements, parent/child columns, hypotheses and a compatible graph', async () => {
		const result = await triage(fixture(), { target: 'p1-19c-prod', issue: 'NIGHTLY_PURGE_JOB' });
		const issue = result.issues[0]!;
		expect(issue.excerpts[0]).toMatchObject({ subprogram: 'NIGHTLY_PURGE', line: 5, statement: 'DELETE FROM orders;' });
		expect(issue.checks.find(c => c.label.startsWith('All visible child'))?.rows).toHaveLength(2);
		expect(issue.checks.some(c => c.label === 'Columns for SHOPAPP.PK_ORDERS')).toBe(true);
		expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('OTHER_CHILD');
		expect(issue.hypotheses.some(h => h.title.includes('other than ORDER_LINES'))).toBe(false);
		expect(issue.graph.nodes.some(n => n.kind === 'job')).toBe(true);
		for (const e of issue.graph.edges) expect(issue.graph.nodes.some(n => n.id === e.to)).toBe(true);
		const markdown = renderTriageMarkdown(result); expect(markdown).toContain('```mermaid'); expect(markdown).toContain("OWNER = 'SHOPAPP'"); expect(markdown).toContain('Numbered debug checklist');
	});
	it('attributes an anonymous stack frame to the job_action and preserves ordinary error messages', async () => {
		const issue = (await triage(fixture(true), { target: 'p1-19c-prod', issue: 'NIGHTLY_PURGE_JOB' })).issues[0]!;
		expect(issue.codes).toContain('ORA-20001'); expect(issue.excerpts[0]?.subprogram).toContain('anonymous block');
		expect(issue.excerpts[0]?.statement).toContain('raise_application_error(-20001'); expect(issue.excerpts[0]?.statement).toContain("'hidden'");
		expect(issue.hypotheses[0]?.title).toContain('explicitly raises');
	});
	it('falls back only for view/privilege errors and audits hashes without SQL or binds', async () => {
		const ctx = context(async sql => { if (sql.includes('DBA_')) throw new Error('ORA-00942'); return { columns: [], rows: [], truncated: true, elapsedMs: 0 }; });
		const reader = new TriageReader(ctx, 'p1-19c-prod'); const c = await reader.read('test', 'OBJECTS', 'OWNER', 'WHERE OWNER = :owner', { owner: 'SHOPAPP' });
		expect(c.view).toBe('ALL_OBJECTS'); expect(c.truncated).toBe(true); expect(c.attempts).toEqual([{ view: 'DBA_OBJECTS', code: 'ORA-00942' }]);
		for (const [event] of vi.mocked(ctx.audit.record).mock.calls) { expect(event.sqlSha256).toMatch(/^[a-f0-9]{64}$/); expect(event).not.toHaveProperty('binds'); expect(event).not.toHaveProperty('sqlText'); }
		const unavailable = await new TriageReader(context(async () => { throw new Error('ORA-01031'); }), 'p1-19c-prod').read('test', 'OBJECTS', 'OWNER', '');
		expect(unavailable.status).toBe('unavailable'); expect(unavailable.attempts).toHaveLength(2);
		expect(displaySql({ ...c, binds: { owner: "unsafe'value" } })).toContain(':owner');
	});
	it('only reads configured log rows and lists candidate table names', async () => {
		const seen: string[] = [];
		const ctx = context(async sql => { classifySql(sql); seen.push(sql); return { rows: [], columns: [], truncated: false, elapsedMs: 0 }; });
		ctx.config.targets.find(t => t.name === 'p1-19c-prod')!.logTables = [{ table: 'SHOPAPP.APP_LOG', timestampColumn: 'TS', columns: ['MESSAGE'] }];
		await triage(ctx, { target: 'p1-19c-prod', issue: 'SHOPAPP.WORKLOAD ORA-06502' });
		expect(seen.some(s => s.includes('FROM SHOPAPP.APP_LOG'))).toBe(true); expect(seen.some(s => /FROM .*_TABLES/.test(s))).toBe(true);
		expect(seen.filter(s => s.includes('FROM SHOPAPP.'))).toHaveLength(1);
	});
	it('scans failures with a cap and no model, including empty windows', async () => {
		const result = await triage(context(async sql => { classifySql(sql); return { rows: [], columns: [], truncated: false, elapsedMs: 0 }; }), { target: 'd1-19c-lab' });
		expect(result.issues).toEqual([]); expect(result.scan?.checks).toHaveLength(3); expect(result.scan?.cap).toBe(10);
	});
	it('has a guide for every requested code family', () => {
		for (const code of ['00001','00054','00060','00904','00942','01031','01403','01422','01476','01555','01722','02291','02292','04031','04068','04091','06502','06508','06511','06550','20000','20999']) expect(errorGuide('ORA-' + code)?.checks).toBeTruthy();
		expect(errorGuide('PLS-00302')).toBeDefined();
	});
	it('publishes private Markdown and JSON exports together and checks a single fake summary', async () => {
		const result = await triage(fixture(), { target: 'p1-19c-prod', issue: 'NIGHTLY_PURGE_JOB' });
		const markdown = renderTriageMarkdown(result), dir = await mkdtemp(join(tmpdir(), 'triage-'));
		try {
			const files = await saveTriage(dir, result, markdown); expect(await readdir(dir)).toHaveLength(2);
			expect(await readFile(files[0]!, 'utf8')).toBe(markdown); expect(JSON.parse(await readFile(files[1]!, 'utf8'))).toEqual(result);
			expect((await stat(files[0]!)).mode & 0o777).toBe(0o600);
		} finally { await rm(dir, { recursive: true, force: true }); }
		const summarize = vi.fn(async () => 'ORA-02292 failed at line 999999.');
		const summary = await summarizeTriage(markdown, loadConfig().llm, summarize);
		expect(summarize).toHaveBeenCalledTimes(1); expect(summary.unverified.join(' ')).toContain('999999');
	});
	it('extracts a bounded multiline statement', () => {
		expect(statementAt([{ type: 'PROCEDURE', line: 1, text: 'BEGIN' }, { type: 'PROCEDURE', line: 2, text: 'SELECT X' }, { type: 'PROCEDURE', line: 3, text: 'INTO Y FROM T;' }], 3)).toBe('SELECT X INTO Y FROM T;');
	});
});
