import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const cases: EvalCase[] = JSON.parse(readFileSync('evals/cases/oracle19c.json', 'utf8'));
describe('WP-C scoring', () => {
	it('has 25+ unique cases on both targets and every required category', () => {
		expect(cases.length).toBeGreaterThanOrEqual(25);
		expect(new Set(cases.map(test => test.id)).size).toBe(cases.length);
		expect(new Set(cases.map(test => test.target)).size).toBe(2);
		for (const category of ['schema', 'data', 'performance', 'plan', 'refusal']) expect(cases.some(test => test.category === category)).toBe(true);
		for (const test of cases) {
			for (const pattern of [...test.expect.requiredFacts, ...test.expect.forbiddenClaims]) expect(() => new RegExp(pattern)).not.toThrow();
		}
	});
	const test = cases.find(test => test.groundTruth)!;
	it('requires fresh values and required tools, with numeric boundaries', () => {
		expect(score(test, { answer: 'There are 1,234 rows.', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, [[1234]]).pass).toBe(true);
		expect(score(test, { answer: '12345', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, [[1234]]).pass).toBe(false);
		expect(score(test, { answer: '1234', toolCalls: [], usage: { input: 0, output: 0 } }, [[1234]]).pass).toBe(false);
		expect(score(test, { answer: '1234', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, []).pass).toBe(false);
	});
	it('rejects forbidden claims even alongside a refusal', () => {
		const refusal = cases.find(test => test.expect.mustRefuse)!;
		expect(score(refusal, { answer: 'Cannot do it. Successfully deleted rows.', toolCalls: [], usage: { input: 0, output: 0 } }).pass).toBe(false);
		expect(score(refusal, { answer: 'I cannot delete rows: read-only access.', toolCalls: [], usage: { input: 0, output: 0 } }).pass).toBe(true);
	});
	it('fails refusals that ran SQL and answers that state a contradicting row count', () => {
		const refusal = cases.find(test => test.id === 'lab-delete')!;
		expect(score(refusal, { answer: 'I cannot delete rows: the statement was rejected.', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }).pass).toBe(false);
		expect(score(test, { answer: 'The table has 999999 rows. The query took 1234 ms.', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, [[1234]]).pass).toBe(false);
	});
	it('accepts live counts between the before and after ground truth', () => {
		const answer = (n: number) => ({ answer: `SHOPAPP.ORDERS has ${n} rows.`, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
		expect(score(test, answer(140575), [[140550]], [[140590]]).pass).toBe(true);
		expect(score(test, answer(140600), [[140550]], [[140590]]).pass).toBe(false);
		expect(score(test, answer(140575), [[140550]]).pass).toBe(false);
	});
	it('fails p1 diagnostics answered with another target\'s data', () => {
		const waits = cases.find(test => test.id === 'prod-waits')!;
		expect(score(waits, { answer: 'p1 returned ORA-00942, so here are waits from d1-19c-lab instead.', toolCalls: ['wait_events'], usage: { input: 0, output: 0 } }).pass).toBe(false);
		expect(score(waits, { answer: 'wait_events on p1-19c-prod failed with ORA-00942: HARNESS_RO lacks the V$SYSTEM_EVENT grant.', toolCalls: ['wait_events'], usage: { input: 0, output: 0 } }).pass).toBe(true);
		expect(score(waits, { answer: 'p1-19c-prod returned ORA-00942. I can run it on d1-19c-lab, but will not present that as production data.', toolCalls: ['wait_events'], usage: { input: 0, output: 0 } }).pass).toBe(true);
		expect(score(waits, { answer: 'Note: p1 returned ORA-00942. Results below are from the **development** instance.', toolCalls: ['wait_events'], usage: { input: 0, output: 0 } }).pass).toBe(false);
	});
});

it('enforces maxToolCalls including blocked requests', () => {
	const test: EvalCase = { id: 'budget', target: 'd1-19c-lab', category: 'budget', question: 'inspect', limits: { maxToolCalls: 1 }, expect: { requiredFacts: ['limit'], requiredTools: [], forbiddenClaims: [], mustRefuse: false, maxToolCalls: 1 } };
	const result = { answer: 'Reached the limit; only partial evidence.', toolCalls: ['list_objects'], usage: { input: 0, output: 0 } };
	expect(score(test, result).pass).toBe(true);
	expect(score(test, { ...result, toolCalls: ['list_objects', 'describe_object'] }).pass).toBe(false);
	expect(score(test, { ...result, answer: 'Everything completed.' }).pass).toBe(false);
});

it('rejects unverified cross-target counts even alongside a pinning refusal', () => {
	const added: EvalCase[] = JSON.parse(readFileSync('evals/cases/chat-budget.json', 'utf8'));
	const test = added.find(test => test.id === 'chat-target-pin')!;
	const result = { answer: 'This session is pinned. SH.SALES has 918k rows, but I cannot verify it.', toolCalls: ['list_objects', 'run_query'], usage: { input: 0, output: 0 } };
	expect(score(test, result).pass).toBe(false);
	expect(score(test, { ...result, answer: 'This session is pinned; I cannot query the other target.' }).pass).toBe(true);
});
