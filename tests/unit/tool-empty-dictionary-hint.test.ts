import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { Type } from 'typebox';
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
it('snapshots tool definitions JSON remain byte-identical with the empty dictionary hint', () => {
	const master = execFileSync('git', ['show', 'master:src/tools/index.ts'], { encoding: 'utf8' });
	const block = master.slice(master.indexOf('const str ='), master.indexOf('export function createDbTools'));
	const js = stripTypeScriptTypes(block) + "\nreturn definitions;";
	const definitions = new Function('Type', js)(Type) as [string, string, Record<string, unknown>][];
	const baseline = definitions.map(([name, description, properties]) => ({ name, label: name, description, parameters: Type.Object({ target: Type.Optional(Type.String()), ...properties }, { additionalProperties: false }) }));
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
