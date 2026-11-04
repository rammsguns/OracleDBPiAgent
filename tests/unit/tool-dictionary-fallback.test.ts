import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { Type } from 'typebox';
import { expect, it, vi } from 'vitest';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';

const empty = { columns: ['N'], rows: [], truncated: false, elapsedMs: 1 };
function setup() {
	const query = vi.fn().mockResolvedValue(empty);
	const close = vi.fn();
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'HR' }], limits: { maxRows: 100, maxToolResultBytes: 16000 } }, sessions: { get: async () => ({ query, close }) }, audit: { record: async () => {} }, runId: 'fallback' } as unknown as ToolContext;
	return { query, close, tools: createDbTools(ctx) };
}
it('snapshots tool definitions JSON against master without changing session tokens', () => {
	const master = execFileSync('git', ['show', 'master:src/tools/index.ts'], { encoding: 'utf8' });
	const block = master.slice(master.indexOf('const str ='), master.indexOf('export function createDbTools'));
	const js = stripTypeScriptTypes(block) + "\nreturn definitions;";
	const definitions = new Function('Type', js)(Type) as [string, string, Record<string, unknown>][];
	const baseline = definitions.map(([name, description, properties]) => ({ name, label: name, description, parameters: Type.Object({ target: Type.Optional(Type.String()), ...properties }, { additionalProperties: false }) }));
	const actual = setup().tools.map(({ name, label, description, parameters }) => ({ name, label, description, parameters }));
	expect(JSON.stringify(actual)).toBe(JSON.stringify(baseline));
});
for (const [name, params, view] of [
	['get_source', { name: 'WORKLOAD', type: 'PACKAGE BODY', startLine: 24, lines: 6 }, 'SOURCE'],
	['list_objects', { pattern: 'WORK%', page: 2, pageSize: 5 }, 'OBJECTS'],
	['describe_object', { name: 'EMPLOYEES' }, 'TAB_COLUMNS'],
] as const) {
	it(`${name} retries only empty ALL results with identical binds and caps`, async () => {
		const { tools, query, close } = setup();
		query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [[1]] });
		const result = await tools.find(t => t.name === name)!.execute('1', params);
		expect(query).toHaveBeenCalledTimes(2);
		const [sql, binds, options] = query.mock.calls[0]!;
		expect(query.mock.calls[1]).toEqual([sql.replace(/\ball_([a-z_]+)\b/gi, 'dba_$1'), binds, options]);
		expect(result.details.view).toBe(`DBA_${view}`);
		expect(close).toHaveBeenCalledOnce();
	});
	for (const code of ['00942', '01031', '03113']) it(`${name} handles DBA ORA-${code}`, async () => {
		const { tools, query, close } = setup();
		query.mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error(`ORA-${code}: failure`));
		const result = tools.find(t => t.name === name)!.execute('1', params);
		if (code === '03113') await expect(result).rejects.toThrow(code);
		else expect((await result).details).toMatchObject({ rows: [], view: `ALL_${view}` });
		expect(close).toHaveBeenCalledOnce();
	});
	it(`${name} keeps nonempty ALL results without querying DBA`, async () => {
		const { tools, query } = setup();
		query.mockResolvedValueOnce({ ...empty, rows: [[1]] });
		await tools.find(t => t.name === name)!.execute('1', params);
		expect(query).toHaveBeenCalledOnce();
	});
}
it('uses DBA_VIEWS for both the size probe and bounded LONG fetch', async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [[3]] }).mockResolvedValueOnce({ ...empty, rows: [[3, 'abc', 'AL32UTF8']] });
	const result = await tools.find(t => t.name === 'get_source')!.execute('1', { name: 'V', type: 'VIEW' });
	expect(query.mock.calls[2]?.[0]).toContain('FROM dba_views');
	expect(query.mock.calls[2]?.[0]).toContain('text_length<=:max_source_bytes');
	expect(result.details).toMatchObject({ rows: [[1, 'abc']], view: 'DBA_VIEWS' });
});
it('rejects oversized DBA view text before fetching LONG', async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: [[1048577]] });
	await expect(tools.find(t => t.name === 'get_source')!.execute('1', { name: 'V', type: 'VIEW' })).rejects.toThrow('1 MiB');
	expect(query).toHaveBeenCalledTimes(2);
});
for (const code of ['00942', '01031']) it(`keeps empty ALL view source when DBA_VIEWS is denied with ORA-${code}`, async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error(`ORA-${code}: denied`)).mockResolvedValueOnce(empty);
	const result = await tools.find(t => t.name === 'get_source')!.execute('1', { name: 'V', type: 'VIEW' });
	expect(result.details).toMatchObject({ rows: [], totalLines: 0, view: 'ALL_VIEWS' });
	expect(query.mock.calls[2]?.[0]).toContain('FROM all_views');
});
it('preserves the source line range, row cap and byte cap through fallback', async () => {
	const { tools, query } = setup();
	query.mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, rows: Array.from({ length: 100 }, (_, i) => ['PACKAGE BODY', i + 24, 'x'.repeat(300)]) });
	const result = await tools.find(t => t.name === 'get_source')!.execute('1', { schema: 'SHOPAPP', name: 'WORKLOAD', type: 'PACKAGE BODY', startLine: 24, lines: 200 });
	expect(query.mock.calls[1]?.[1]).toEqual({ owner: 'SHOPAPP', name: 'WORKLOAD', source_type: 'PACKAGE BODY', start_line: 24, end_line: 224 });
	expect(query.mock.calls[1]?.[2]).toEqual({ maxRows: 100 });
	expect(result.details.truncated).toBe(true);
	expect(result.details.view).toBe('DBA_SOURCE');
	expect(result.content[0]).toMatchObject({ text: expect.stringContaining('DBA_SOURCE') });
	expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(16000);
});
it('does not mask an ALL dictionary failure or retry it on DBA', async () => {
	const { tools, query, close } = setup();
	query.mockRejectedValueOnce(new Error('ORA-00942: ALL source missing'));
	await expect(tools.find(t => t.name === 'get_source')!.execute('1', { name: 'P' })).rejects.toThrow('ALL source missing');
	expect(query).toHaveBeenCalledOnce();
	expect(close).toHaveBeenCalledOnce();
});
