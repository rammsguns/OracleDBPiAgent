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
});
