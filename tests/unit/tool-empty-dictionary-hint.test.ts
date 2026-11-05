import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';

const empty = { columns: ['N'], rows: [], truncated: false, elapsedMs: 1 };
function setup(statementTimeoutSeconds = 15) {
	const query = vi.fn().mockResolvedValue(empty);
	const close = vi.fn();
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'HR' }], limits: { statementTimeoutSeconds, maxRows: 100, maxToolResultBytes: 16000 } }, sessions: { get: async () => ({ query, close }) }, audit: { record: async () => {} }, runId: 'fallback' } as unknown as ToolContext;
	return { query, close, tools: createDbTools(ctx) };
}
it('keeps tool definitions byte-identical to the committed chat fixture', () => {
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/chat-master.json', import.meta.url), 'utf8')).tools;
	const actual = setup().tools.map(({ name, label, description, parameters }) => ({ name, label, description, parameters }));
	expect(JSON.stringify(actual)).toBe(JSON.stringify(baseline));
});

const sql = "SELECT argument_name FROM all_arguments WHERE owner='HR' AND object_name='ADD_JOB_HISTORY'";
it('adds one note, preserving empty rows and probing SELECT with identical binds and maxRows 1', async () => {
	const { tools, query, close } = setup();
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [['SECRET_PROBE_ROW']] });
	const result = await tools.find(t => t.name === 'run_query')!.execute('1', { sql, maxRows: 50 });
	expect(result.details.rows).toEqual([]);
	expect(JSON.stringify(result)).not.toContain('SECRET_PROBE_ROW');
	expect(result.content[0]).toMatchObject({ text: expect.stringContaining('Re-run with DBA_ARGUMENTS.') });
	expect(query.mock.calls[1]).toEqual([sql.replace('all_arguments', 'DBA_arguments'), query.mock.calls[0]![1], { maxRows: 1, timeoutSeconds: 5 }]);
	expect(close).toHaveBeenCalledOnce();
});
for (const mode of ['empty', 'nonempty', '00942', '01031'] as const) it(`omits note for ${mode}`, async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(mode === 'nonempty' ? { ...empty, rows: [[1]] } : empty);
	if (mode === '00942' || mode === '01031') query.mockRejectedValueOnce(new Error(`ORA-${mode}: denied`));
	const result = await tools.find(t => t.name === 'run_query')!.execute('1', { sql });
	expect(result.details.sourceNote).toBeUndefined();
	expect(query).toHaveBeenCalledTimes(mode === 'nonempty' ? 1 : 2);
});
it('preserves literals, escaped quotes, and comments while replacing multiple dictionary references', async () => {
	const { tools, query } = setup();
	const statement = "SELECT 'all_source it''s all_arguments' FROM all_source s /* all_objects */ JOIN SYS.ALL_OBJECTS o ON s.name=o.object_name WHERE 1=0 -- all_arguments";
	await tools.find(t => t.name === 'run_query')!.execute('1', { sql: statement });
	expect(query.mock.calls[1]?.[0]).toBe(statement.replace('FROM all_source', 'FROM DBA_source').replace('SYS.ALL_OBJECTS', 'SYS.DBA_OBJECTS'));
});
for (const statement of [
	"SELECT 'all_arguments' FROM dual WHERE 1=0 /* all_source */",
	'SELECT * FROM all_custom WHERE 1=0',
	'SELECT * FROM "ALL_ARGUMENTS" WHERE 1=0',
	"SELECT q'[all_source]' FROM all_arguments WHERE 1=0",
	'WITH all_arguments AS (SELECT 1 FROM dual) SELECT * FROM all_arguments WHERE 1=0',
	'SELECT * FROM other.all_arguments WHERE 1=0',
]) it(`skips uncertain or non-dictionary references: ${statement}`, async () => {
	const { tools, query } = setup();
	await tools.find(t => t.name === 'run_query')!.execute('1', { sql: statement });
	expect(query).toHaveBeenCalledOnce();
});

for (const message of ['ORA-03113: disconnected', 'ORA-01476: divisor is equal to zero', 'ORA-01722: invalid number', 'Statement timed out']) it(`preserves the primary result when the probe fails: ${message}`, async () => {
	const { tools, query, close } = setup();
	query.mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error(message));
	const result = await tools.find(t => t.name === 'run_query')!.execute('1', { sql });
	expect(result.details).toEqual(empty);
	expect(result.content[0]).toEqual({ type: 'text', text: 'N' });
	expect(query).toHaveBeenCalledTimes(2);
	expect(close).toHaveBeenCalledOnce();
});
it('respects a configured timeout shorter than five seconds', async () => {
	const { tools, query } = setup(2);
	await tools.find(t => t.name === 'run_query')!.execute('1', { sql });
	expect(query.mock.calls[1]?.[2]).toEqual({ maxRows: 1, timeoutSeconds: 2 });
});
for (const reject of [false, true]) it(`honors abort during the probe when rejection is ${reject}`, async () => {
	const { tools, query, close } = setup();
	const controller = new AbortController();
	query.mockResolvedValueOnce(empty).mockImplementationOnce(async () => {
		controller.abort();
		if (reject) throw new Error('Statement timed out');
		return { ...empty, rows: [[1]] };
	});
	await expect(tools.find(t => t.name === 'run_query')!.execute('1', { sql }, controller.signal)).rejects.toThrow('Tool aborted');
	expect(close).toHaveBeenCalledOnce();
});
it('honors abort after the primary query without starting a probe', async () => {
	const { tools, query, close } = setup();
	const controller = new AbortController();
	query.mockImplementationOnce(async () => { controller.abort(); return empty; });
	await expect(tools.find(t => t.name === 'run_query')!.execute('1', { sql }, controller.signal)).rejects.toThrow('Tool aborted');
	expect(query).toHaveBeenCalledOnce();
	expect(close).toHaveBeenCalledOnce();
});
it('accepts leading comments without rewriting them', async () => {
	const { tools, query } = setup();
	const statement = '-- all_objects\n/* all_source */ ' + sql;
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [[1]] });
	const result = await tools.find(t => t.name === 'run_query')!.execute('1', { sql: statement });
	expect(query.mock.calls[1]?.[0]).toBe(statement.replace('FROM all_arguments', 'FROM DBA_arguments'));
	expect(result.details.sourceNote).toContain('Re-run with DBA_ARGUMENTS.');
});

for (const statement of [
	'SELECT o.object_name FROM all_objects o, all_tables t WHERE o.object_name=t.table_name',
	'SELECT o.object_name FROM sys.all_objects o, SYS.ALL_TABLES t WHERE o.object_name=t.table_name',
	'SELECT * FROM all_objects o, all_tables t JOIN all_tab_columns c ON c.table_name=t.table_name',
	'SELECT * FROM all_objects o JOIN all_tables t ON o.object_name=t.table_name, all_tab_columns c',
	'SELECT * FROM (SELECT * FROM all_objects o, sys.all_tables t) v, all_source s',
	'SELECT * FROM all_objects o, (SELECT * FROM all_tables t, all_tab_columns c) v, all_source s',
	'SELECT object_name, owner, substr(object_name, 1, 2) FROM all_objects o, all_tables t',
	'SELECT * FROM all_objects o WHERE EXISTS (SELECT 1 FROM all_tables t, all_tab_columns c)',
]) it(`probes dictionary views in FROM lists: ${statement}`, async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [[1]] });
	const result = await tools.find(t => t.name === 'run_query')!.execute('1', { sql: statement });
	expect(query.mock.calls[1]?.[0]).toBe(statement.replace(/all_/gi, 'DBA_'));
	expect(result.details.sourceNote).toContain('Re-run with DBA_');
});

for (const statement of [
	'SELECT owner, all_tables FROM all_objects',
	'SELECT * FROM all_objects o, other.all_tables t',
	'SELECT * FROM all_objects o, all_custom t',
	'SELECT * FROM all_objects o, "ALL_TABLES" t',
	"SELECT q'[comma, all_tables]' FROM all_objects o, all_tables t",
	'WITH x AS (SELECT * FROM all_objects o, all_tables t) SELECT * FROM x',
	'SELECT * FROM all_objects o JOIN dual d ON coalesce(1, all_tables)=1',
	'SELECT * FROM all_objects o, (SELECT 1, all_tables FROM dual) t',
	'SELECT * FROM (SELECT * FROM all_objects o), all_tables WHERE all_source=1',
	'SELECT * FROM (SELECT * FROM all_objects o) v ORDER BY owner, all_tables',
	'SELECT (SELECT object_name FROM all_objects), all_tables FROM dual',
	...['WHERE', 'GROUP BY', 'ORDER BY', 'CONNECT BY', 'START WITH', 'HAVING', 'UNION SELECT', 'MINUS SELECT', 'INTERSECT SELECT', 'FETCH FIRST'].map(clause =>
		`SELECT * FROM all_objects o ${clause} owner, all_tables`),
]) it(`does not treat unrelated commas as view positions: ${statement}`, async () => {
	const { tools, query } = setup();
	await tools.find(t => t.name === 'run_query')!.execute('1', { sql: statement });
	expect(query).toHaveBeenCalledOnce();
});
