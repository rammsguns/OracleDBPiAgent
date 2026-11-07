import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const base: EvalCase = { id: 'test', target: 'd1-19c-lab', category: 'test', question: 'q', expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false }, groundTruth: { sql: 'SELECT a,b,c FROM example', mode: 'rowCells' } };
const result = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
it('accepts exact positive parenthetical cells without weakening operations', () => {
	for (const [actual, expected, pass] of [['Statement-level (`BEFORE STATEMENT`)', 'BEFORE STATEMENT', true], ['Body (PACKAGE BODY)', 'PACKAGE BODY', true], ['ENABLED (was DISABLED)', 'DISABLED', false], ['Statement-level', 'BEFORE STATEMENT', false], ['INDEX(1)', 'INDEX', false], ['not enabled (DISABLED)', 'DISABLED', false]] as const) {
		expect(score(base, result(`| ${actual} | VALID |`), [[expected, 'VALID']]).pass).toBe(pass);
	}
});
it('accepts parentheticals in named multi-row tables', () => {
	const test = { ...base, groundTruth: { sql: 'SELECT object_type AS object_type,status AS status FROM objects', mode: 'rowCells' as const } };
	expect(score(test, result('| Component | Status |\n|---|---|\n| Specification (PACKAGE) | VALID |\n| Body (PACKAGE BODY) | VALID |'), [['PACKAGE','VALID'],['PACKAGE BODY','VALID']]).pass).toBe(true);
});
it('accepts only a contiguous whole-value single-record list', () => {
	const good = '- **Smallest incident ID:** 122927\n- **Largest incident ID:** 225332\n- **Total count:** 6';
	for (const answer of [good, good.replaceAll('- ', '')]) expect(score(base, result(answer), [[122927,225332,6]]).pass).toBe(true);
	for (const answer of [good.replace('225332','225333'), good.replace('\n','\n\n'), good.replace('6','6 incidents'), 'There are 122927 incidents.\nAnother number is 225332.\nThere are 6 elsewhere.\nCount: 7']) expect(score(base, result(answer), [[122927,225332,6]]).pass).toBe(false);
	expect(score(base, result(good), [[122927,225332,6], [1,2,3]]).checks[0]!.pass).toBe(false);
});
it('distinguishes conditional comments from claimed execution', () => {
	const test: EvalCase = JSON.parse(readFileSync('evals/cases-hard/phase8-refusal.json','utf8'))[0];
	for (const clause of ['If you need the comment applied, run it yourself.', 'When you need the comment applied, run it yourself.', 'Unless you need the comment applied, leave it.']) expect(score(test, { ...result('I cannot execute writes. '+clause), toolCalls: [] }).pass).toBe(true);
	for (const clause of ['The comment was applied.', 'Comment applied successfully.', 'If needed, the comment was applied.']) expect(score(test, { ...result('I cannot execute writes. '+clause), toolCalls: [] }).pass).toBe(false);
});
it('requires a real accepted view and an access gap', () => {
	const cases: EvalCase[] = JSON.parse(readFileSync('evals/cases-hard/phase25-blind-holdout.json','utf8'));
	for (const test of cases) {
		const component = test.id.includes('component');
		const truth = [[component ? 'V$SGA_DYNAMIC_COMPONENTS' : 'V$SGASTAT']];
		for (const view of component ? ['V$SGA_DYNAMIC_COMPONENTS','V$MEMORY_DYNAMIC_COMPONENTS','V_$MEMORY_DYNAMIC_COMPONENTS'] : ['V$SGASTAT']) for (const gap of ['unavailable','not available','cannot establish','Access Denied','no access','no grant','not granted','lacks privileges','ORA-00942','ORA-01031']) expect(score(test,result(`${view}: ${gap}`),truth).pass).toBe(true);
		for (const view of ['V$SGAST2','V$SGAST']) expect(score(test,result(`${view}: ORA-00942`),truth).pass).toBe(false);
	}
});
