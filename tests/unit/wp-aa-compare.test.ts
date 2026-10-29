import { describe, expect, it } from 'vitest';
import { compare, interval, parseFiles, type Report } from '../../evals/compare.js';
import { score } from '../../evals/scoring.js';
import { readFileSync } from 'node:fs';
const report = (n: number, pass = true, errors = false): Report => ({ casesSha256: 'fixed', records: [{ id: 'x', target: 'd1', iteration: 1, pass, usage: { input: n, output: 10 }, toolDetails: [{ isError: errors }] }] });
describe('paired comparison', () => {
	it('uses B minus A for tokens, passes and errors', () => {
		const r = compare([report(100), report(200)], [report(90, false, true), report(190)]);
		expect(r.suite.tokens).toEqual({ mean: -10, ci95: [-10, -10] });
		expect(r.suite.passRate?.mean).toBe(-.5);
		expect(r.suite.toolErrors?.mean).toBe(.5);
	});
	it('does not invent certainty from one observation', () => expect(interval([2])).toBeNull());
	it('is reproducible and preserves run covariance', () => {
		const a = [report(10), report(20), report(30), report(40)];
		const b = [report(15), report(15), report(35), report(35)];
		expect(compare(a, b)).toEqual(compare(a, b));
		expect(compare(a, b).suite.tokens?.ci95).toEqual([-5, 5]);
	});
	it('rejects mismatched definitions, cases and replicate counts', () => {
		expect(() => compare([report(1)], [{ ...report(2), casesSha256: 'other' }])).toThrow(/hashes/);
		expect(() => compare([report(1)], [report(2), report(3)])).toThrow(/equal/);
		const b = report(2); b.records[0]!.target = 'p1';
		expect(() => compare([report(1)], [b])).toThrow(/sets differ/);
	});
	it('matches cases by identity and retains iteration pairs', () => {
		const a = report(10); const b = report(15);
		a.records.push({ ...a.records[0]!, iteration: 2, usage: { input: 100, output: 10 } });
		b.records.unshift({ ...b.records[0]!, iteration: 2, usage: { input: 105, output: 10 } });
		expect(compare([a], [b]).suite.tokens).toEqual({ mean: 5, ci95: [5, 5] });
	});
	it('rejects duplicate and invalid observations and flags execution failures', () => {
		const a = report(1); a.records.push(a.records[0]!);
		expect(() => compare([a], [report(2)])).toThrow(/Duplicate/);
		const b = report(NaN);
		expect(() => compare([report(1)], [b])).toThrow(/Invalid/);
		const failed = report(0, false); failed.records[0]!.error = 'Case failed';
		expect(compare([report(1)], [failed]).warnings.join(' ')).toMatch(/not a saving/);
	});
	it('reports missing diagnostics as unknown', () => {
		const b = report(2); delete b.records[0]!.toolDetails;
		expect(compare([report(1)], [b]).suite.toolErrors).toBeNull();
	});
	it('parses file lists and rejects reuse', () => {
		expect(parseFiles(['--a', 'a', 'b', '--b', 'c'])).toEqual({ a: ['a', 'b'], b: ['c'] });
		expect(() => parseFiles(['--a', 'a', '--b', './a'])).toThrow(/distinct/);
	});
});
describe('disputed hard holdout checks remain strict', () => {
	it('accepts grouped correct money and rejects the archived digit transposition', () => {
		const c = JSON.parse(readFileSync('evals/cases-hard/analytical.json', 'utf8')).find((x: any) => x.id === 'hard-quarter-winners');
		const result = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
		expect(score(c, result('3,313,394.74'), [['3313394.74']]).pass).toBe(true);
		expect(score(c, result('3,331,394.74'), [['3313394.74']]).pass).toBe(false);
	});
	it('rejects an invented PROMO parent table', () => {
		const c = JSON.parse(readFileSync('evals/cases-hard/relationships.json', 'utf8')).find((x: any) => x.id === 'hard-sh-fks');
		const result = (name: string) => ({ answer: `CUSTOMERS COUNTRIES COUNTRY_ID SH.${name}`, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
		expect(score(c, result('PROMOTIONS'), [['PROMOTIONS']]).pass).toBe(true);
		expect(score(c, result('PROMO'), [['PROMOTIONS']]).pass).toBe(false);
	});
});
