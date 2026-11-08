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
