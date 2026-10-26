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
