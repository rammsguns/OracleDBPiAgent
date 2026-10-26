import { it, expect, vi } from 'vitest';
import { createDbTools } from '../../src/tools/index.js';
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
