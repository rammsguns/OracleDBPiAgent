import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import { loadHardCases } from '../../evals/validate-hard.js';
import type { EvalCase } from '../../evals/types.js';
const test: EvalCase = { id: 'row', target: 'd1-19c-lab', category: 'test', question: 'q', groundTruth: { sql: 'SELECT 1 FROM dual', mode: 'rowCells' }, expect: { requiredFacts: [], requiredTools: [], forbiddenClaims: [], mustRefuse: false } };
const result = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
const truth = [['Alpha', 55500, 1.2], ['Beta', 100, 2]];
it.each([
	'| Alpha | 55,500 | 1.200 |\n| Beta | 100.0 | 2.00 |',
	'- NAME=Alpha / N=55,500 / RATE=1.2\n- NAME=Beta / N=100 / RATE=2',
	'NAME=Alpha; N=55500; RATE=1.20\nNAME=Beta; N=100; RATE=2',
	'Alpha has 55,500 and 1.2.\nBeta has 100 and 2.',
])('accepts a correct layout: %s', answer => expect(score(test, result(answer), truth).pass).toBe(true));
it.each([
	'Alpha | 100 | 1.2\nBeta | 55500 | 2',
	'Alpha | 55500 | 1.2',
	'Alpha\n55500\n1.2\nBeta\n100\n2',
	'Alphas | 55500 | 1.2\nBeta | 100 | 2',
	'Alpha | 555000 | 1.2\nBeta | 100 | 2',
])('rejects missing or mismatched values: %s', answer => expect(score(test, result(answer), truth).pass).toBe(false));
it('rejects empty and null truth and preserves duplicate-value multiplicity', () => {
	expect(score(test, result('anything'), []).pass).toBe(false);
	expect(score(test, result('null'), [[null]]).pass).toBe(false);
	expect(score(test, result('| A | 1 |'), [['A', 1, 1]]).pass).toBe(false);
});
it('leaves allCells loose matching unchanged and scalar range scoring unchanged', () => {
	const allCells: EvalCase = { ...test, groundTruth: { ...test.groundTruth!, mode: 'allCells' } };
	expect(score(allCells, result('Alpha\n55500\n1.2\nBeta\n100\n2'), truth).pass).toBe(true);
	const scalar: EvalCase = { ...test, groundTruth: { ...test.groundTruth!, mode: 'scalar' } };
	expect(score(scalar, result('105 rows'), [[100]], [[110]]).pass).toBe(true);
	expect(score(scalar, result('111 rows'), [[100]], [[110]]).pass).toBe(false);
});
it('scores the actual baseline answers: correct answers pass, merged plan operation fails', async () => {
	const cases = await loadHardCases();
	const answers: { id: string; iteration: number; answer: string; toolCalls: string[] }[] = JSON.parse(readFileSync('tests/fixtures/phase11-baseline-answers.json', 'utf8'));
	const truths: { id: string; rows: unknown[][] }[] = JSON.parse(readFileSync('tests/fixtures/phase11-truth.json', 'utf8'));
	for (const answer of answers) {
		const item = cases.find(item => item.id === answer.id)!;
		const rows = truths.find(item => item.id === answer.id)!.rows;
		const scored = score(item, { ...answer, usage: { input: 0, output: 0 } }, rows);
		expect(scored.pass, `${answer.id} iteration ${answer.iteration}: ${JSON.stringify(scored.checks.filter(check => !check.pass))}`).toBe(!(answer.id === 'hard-p11-plan-line-tree' && answer.iteration === 2));
	}
});
it('keeps different records on one physical line separate', () => {
	const rows = [['Alpha', 100], ['Beta', 200]];
	for (const answer of ['NAME=Alpha / N=200; NAME=Beta / N=100', '| Alpha | 200 | | Beta | 100 |', 'NAME=Alpha / N=200 / NAME=Beta / N=100']) {
		expect(score(test, result(answer), rows).pass).toBe(false);
	}
});
it('handles negative numbers and numeric text without accepting a longer value', () => {
	expect(score(test, result('| A | −1,234.500 |'), [['A', '-1234.5']]).pass).toBe(true);
	expect(score(test, result('| A | -1234.5001 |'), [['A', '-1234.5']]).pass).toBe(false);
});
it('normalizes numeric text in prose without losing precision', () => {
	expect(score(test, result('Alpha has 1.2000 and −55,500.00.'), [['Alpha', '1.2', -55500]]).pass).toBe(true);
	expect(score(test, result('| A | 9007199254740993 |'), [['A', '9007199254740992']]).pass).toBe(false);
});
