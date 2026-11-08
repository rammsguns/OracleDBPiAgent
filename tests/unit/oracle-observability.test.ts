import { expect, it } from 'vitest';
import { oracleAction, withOracleAction } from '../../src/oracle/observability.js';
it('retains the outer command across awaits and nested collectors without leaking labels', async()=>{
	expect(oracleAction()).toBe('query');
	await withOracleAction('check',async()=>{
		await Promise.resolve();
		expect(oracleAction()).toBe('check');
		withOracleAction('security',()=>expect(oracleAction()).toBe('check'));
	});
	expect(oracleAction()).toBe('query');
});

import { isTopSnapshot, readTopSnapshot, registerTopSnapshot, TOP_SQL } from '../../src/top/snapshot.js';
import type { OracleSession } from '../../src/contracts.js';
it('the fixed snapshot traverses audit adapters while ordinary queries retain their cap',async()=>{
	let audited=0,queries=0;
	const raw={identity:{},query:async(sql:string,_binds:object,options:object)=>{
		queries++;expect(sql).toBe(TOP_SQL);expect(isTopSnapshot(sql,options)).toBe(true);
		return {columns:[],rows:[],truncated:false,elapsedMs:0};
	}} as unknown as OracleSession;
	registerTopSnapshot(raw);
	const adapter={...raw,query:async(...args:Parameters<OracleSession['query']>)=>{audited++;return raw.query(...args);}};
	await readTopSnapshot(adapter);
	expect(audited).toBe(1);expect(queries).toBe(1);
	expect(isTopSnapshot(TOP_SQL,{maxRows:10000})).toBe(false);
	expect(isTopSnapshot('SELECT 1 FROM dual',{})).toBe(false);
});
