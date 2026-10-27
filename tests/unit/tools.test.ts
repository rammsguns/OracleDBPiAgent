import { it, expect, vi } from 'vitest';
import { boundedResult, createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';
function setup() {
	const query = vi.fn().mockResolvedValue({columns:['N'],rows:[[1]],truncated:false,elapsedMs:1});
	const close = vi.fn();const get = vi.fn().mockResolvedValue({query,close});const record=vi.fn();
	const ctx = {config:{defaultTarget:'lab',targets:[{name:'lab',defaultSchema:'HR',environment:'development',description:'Lab'}],limits:{maxRows:10,maxToolResultBytes:1000}},sessions:{get},audit:{record},runId:'test'} as unknown as ToolContext;
	return {tools:createDbTools(ctx),get,query,close,record};
}
it('registers every MVP tool and lists targets without database access',async()=>{
	const {tools,get,record}=setup();expect(tools).toHaveLength(12);expect(new Set(tools.map(t=>t.name)).size).toBe(12);
	const r=await tools.find(t=>t.name==='list_targets')!.execute('1',{});expect(r.content[0]).toMatchObject({type:'text'});expect(get).not.toHaveBeenCalled();expect(record).toHaveBeenCalledWith(expect.objectContaining({kind:'tool_call',tool:'list_targets'}));
});
it('binds object filters instead of interpolating them',async()=>{
	const {tools,query,close}=setup();await tools.find(t=>t.name==='list_objects')!.execute('1',{schema:"HR' OR 1=1",pattern:"%' OR 1=1 --",page:2,pageSize:5});
	const [sql,binds]=query.mock.calls[0]!;expect(sql).not.toContain("HR' OR");expect(binds).toMatchObject({owner:"HR' OR 1=1",offset_rows:5,page_size:5});expect(close).toHaveBeenCalledOnce();
});
it('throws query failures, closes sessions and audits without error messages',async()=>{
	const {tools,query,close,record}=setup();query.mockRejectedValue(new Error('sensitive bind value'));
	await expect(tools.find(t=>t.name==='run_query')!.execute('1',{sql:'SELECT :x FROM dual'})).rejects.toThrow();expect(close).toHaveBeenCalledOnce();expect(JSON.stringify(record.mock.calls)).not.toContain('sensitive');expect(record).toHaveBeenCalledWith(expect.objectContaining({kind:'tool_error'}));
});
it('rejects write SQL before opening a session',async()=>{
	const {tools,get,record}=setup();await expect(tools.find(t=>t.name==='run_query')!.execute('1',{sql:'DELETE FROM t'})).rejects.toThrow('Statement rejected');expect(get).not.toHaveBeenCalled();expect(record).toHaveBeenCalledWith(expect.objectContaining({kind:'tool_error'}));
});
it('falls back to cached plan rows when DISPLAY_CURSOR returns diagnostics',async()=>{
	const {tools,query,close}=setup();
	query.mockResolvedValueOnce({columns:['PLAN_TABLE_OUTPUT'],rows:[['Error: cannot fetch plan']],truncated:false,elapsedMs:1});
	query.mockResolvedValueOnce({columns:['ID','OPERATION'],rows:[[0,'SELECT STATEMENT']],truncated:false,elapsedMs:1});
	const r=await tools.find(t=>t.name==='explain_plan')!.execute('1',{sql_id:'123456789abcd'});
	expect(query.mock.calls[1]?.[0]).toContain('FROM v$sql_plan');expect(r.details.columns).toEqual(['ID','OPERATION']);expect(close).toHaveBeenCalledOnce();
});

const fallbacks = [
	['db_overview', 'product_component_version', 'startup time'],
	['list_schemas', 'FROM all_users', 'only objects visible'],
	['tablespace_usage', 'dba_tablespace_usage_metrics', 'Capacity includes possible autoextension'],
	['top_sql', 'FROM v$sql GROUP BY sql_id', 'currently cached cursors'],
] as const;
for (const [name, source, limitation] of fallbacks) {
	it(`${name} retries ORA-00942 with bounded, disclosed fallback evidence`, async () => {
		const { tools, query, close, record } = setup();
		query.mockRejectedValueOnce(new Error('ORA-00942: table or view does not exist'));
		const r = await tools.find(t => t.name === name)!.execute('1', {});
		expect(query).toHaveBeenCalledTimes(2);
		expect(query.mock.calls[1]?.[0]).toContain(source);
		expect(query.mock.calls[1]?.[2]).toEqual({ maxRows: 10 });
		expect(r.content[0]).toMatchObject({ text: expect.stringContaining(limitation) });
		expect(r.details.sourceNote).toMatch(/^Source:/);
		expect(close).toHaveBeenCalledOnce();
		expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tool_call' }));
	});
	it(`${name} does not retry other database failures`, async () => {
		const { tools, query, close } = setup();
		query.mockRejectedValueOnce(new Error('ORA-01031: insufficient privileges'));
		await expect(tools.find(t => t.name === name)!.execute('1', {})).rejects.toThrow('ORA-01031');
		expect(query).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	});
	it(`${name} propagates fallback failures and closes the session`, async () => {
		const { tools, query, close } = setup();
		query.mockRejectedValueOnce(new Error('ORA-00942')).mockRejectedValueOnce(new Error('fallback failed'));
		await expect(tools.find(t => t.name === name)!.execute('1', {})).rejects.toThrow('fallback failed');
		expect(query).toHaveBeenCalledTimes(2);
		expect(close).toHaveBeenCalledOnce();
	});
}
it('names the missing system wait grant without retrying', async () => {
	const { tools, query, close } = setup();
	query.mockRejectedValueOnce(new Error('ORA-00942'));
	await expect(tools.find(t => t.name === 'wait_events')!.execute('1', {})).rejects.toThrow('SELECT on SYS.V_$SYSTEM_EVENT');
	expect(query).toHaveBeenCalledOnce();
	expect(close).toHaveBeenCalledOnce();
});
it('preserves fallback source and limitations when result rows are truncated', async () => {
	const { tools, query } = setup();
	query.mockRejectedValueOnce(new Error('ORA-00942')).mockResolvedValueOnce({columns:['N'],rows:Array.from({length:10},()=>['x'.repeat(100)]),truncated:false,elapsedMs:1});
	const r = await tools.find(t => t.name === 'tablespace_usage')!.execute('1', {});
	expect(r.details.truncated).toBe(true);
	expect(r.content[0]).toMatchObject({text:expect.stringContaining('Source: DBA_TABLESPACE_USAGE_METRICS')});
	expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(1000);
});

it('throws when a byte cap cannot retain the fallback disclosure', () => {
	expect(() => boundedResult({columns:['N'],rows:[],sourceNote:'Source: fallback; missing full coverage',truncated:false}, 80)).toThrow('retain fallback source');
});

function viewSetup(text: string) {
	const state = setup();
	state.query.mockResolvedValueOnce({ columns: ['TEXT_LENGTH'], rows: [[Buffer.byteLength(text)]], truncated: false, elapsedMs: 1 });
	state.query.mockResolvedValueOnce({ columns: ['TEXT_LENGTH', 'TEXT', 'CHARSET'], rows: [[Buffer.byteLength(text), text, 'AL32UTF8']], truncated: false, elapsedMs: 1 });
	return { ...state, tool: state.tools.find(t => t.name === 'get_source')! };
}
it('pages full LONG view text beyond 4000 bytes with line and continuation metadata', async () => {
	const text = Array.from({ length: 300 }, (_, i) => `line ${i + 1} ${'x'.repeat(30)}`).join('\r\n');
	const { tool, query, close } = viewSetup(text);
	const r = await tool.execute('1', { name: 'v', type: 'view', startLine: 201, lines: 2 });
	expect(r.details).toMatchObject({ columns: ['LINE', 'TEXT'], rows: [[201, `line 201 ${'x'.repeat(30)}`], [202, `line 202 ${'x'.repeat(30)}`]], totalLines: 300, hasMore: true, nextStartLine: 203 });
	expect(query.mock.calls[1]?.[0]).toContain('text_length<=:max_source_bytes');
	expect(query.mock.calls[1]?.[1]).toMatchObject({ owner: 'HR', name: 'V', max_source_bytes: 1048576 });
	expect(close).toHaveBeenCalledOnce();
});
it('returns the last page and an empty page past EOF', async () => {
	for (const startLine of [2, 4]) {
		const { tool } = viewSetup('a\rb');
		const r = await tool.execute('1', { name: 'V', type: 'VIEW', startLine });
		expect(r.details).toMatchObject({ totalLines: 2, hasMore: false, nextStartLine: null, rows: startLine === 2 ? [[2, 'b']] : [] });
	}
});
it('returns missing view as an empty source', async () => {
	const { tools, query } = setup();
	query.mockResolvedValue({ columns: [], rows: [], truncated: false, elapsedMs: 1 });
	const r = await tools.find(t => t.name === 'get_source')!.execute('1', { name: 'MISSING', type: 'VIEW' });
	expect(r.details).toMatchObject({ rows: [], totalLines: 0, hasMore: false });
});
it('refuses oversized source before fetching LONG and closes the session', async () => {
	const { tools, query, close } = setup();
	query.mockResolvedValueOnce({ columns: ['TEXT_LENGTH'], rows: [[1048577]], truncated: false, elapsedMs: 1 });
	await expect(tools.find(t => t.name === 'get_source')!.execute('1', { name: 'V', type: 'VIEW' })).rejects.toThrow('1 MiB');
	expect(query).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('rejects incomplete LONG data', async () => {
	const { tool, query } = viewSetup('abc');
	query.mockReset().mockResolvedValueOnce({ rows: [[10]] }).mockResolvedValueOnce({ rows: [[10, 'abc', 'AL32UTF8']] });
	await expect(tool.execute('1', { name: 'V', type: 'VIEW' })).rejects.toThrow('incomplete');
});
it('checks view source length in the database character set', async () => {
	const fetch = async (bytes: number, charset: string) => {
		const { tool, query } = viewSetup('café');
		query.mockReset().mockResolvedValueOnce({ rows: [[bytes]] }).mockResolvedValueOnce({ columns: ['TEXT_LENGTH', 'TEXT', 'CHARSET'], rows: [[bytes, 'café', charset]], truncated: false, elapsedMs: 1 });
		return tool.execute('1', { name: 'V', type: 'VIEW' });
	};
	// é is one byte in a single-byte character set, two in UTF-8.
	await expect(fetch(4, 'WE8MSWIN1252')).resolves.toMatchObject({ details: { totalLines: 1 } });
	await expect(fetch(5, 'WE8MSWIN1252')).rejects.toThrow('incomplete');
	await expect(fetch(5, 'UTF8')).resolves.toMatchObject({ details: { totalLines: 1 } });
	await expect(fetch(4, 'AL32UTF8')).rejects.toThrow('incomplete');
	await expect(fetch(4, 'JA16SJIS')).rejects.toThrow('character set JA16SJIS');
});
it('updates the continuation after the result byte cap removes lines', () => {
	const r = boundedResult({ columns: ['LINE','TEXT'], rows: Array.from({length:10}, (_, i) => [i + 1, 'x'.repeat(80)]), startLine: 1, totalLines: 10, hasMore: false, nextStartLine: null, truncated: false }, 1000);
	expect(r.details.rows.length).toBeGreaterThan(0); expect(r.details.rows.length).toBeLessThan(10);
	expect(r.details.nextStartLine).toBe(r.details.rows.length + 1); expect(r.details.hasMore).toBe(true);
	expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(1000);
});
it('throws if a single source line cannot fit the output budget', () => {
	expect(() => boundedResult({ columns: ['LINE','TEXT'], rows: [[1, 'x'.repeat(2000)]], startLine: 1, totalLines: 1, hasMore: false }, 1000)).toThrow('cannot fit one source line');
});
it('rejects invalid source ranges before opening sessions', async () => {
	for (const params of [{lines:201}, {lines:0}, {startLine:0}, {startLine:1.5}]) {
		const { tools, get } = setup();
		await expect(tools.find(t => t.name === 'get_source')!.execute('1', {name:'V', type:'VIEW', ...params})).rejects.toThrow('Invalid source range');
		expect(get).not.toHaveBeenCalled();
	}
});
