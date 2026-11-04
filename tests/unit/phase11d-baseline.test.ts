import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
import type { AskResult, EvalCase } from '../../evals/types.js';
const records: (AskResult & { id: string; iteration: number; baselinePass: boolean; truth: unknown[][] })[] = JSON.parse(readFileSync('tests/fixtures/phase11c-baseline-answers.json', 'utf8'));
it('replays all 66 real 11C answers against stored truth: nine fixes, three genuine failures, no regressions', async () => {
	const cases = await loadHardCases();
	expect(records).toHaveLength(66);
	expect(records.filter(record => record.baselinePass)).toHaveLength(54);
	let repaired = 0;
	for (const record of records) {
		const test = cases.find(test => test.id === record.id)!;
		const truth = record.id.includes('partial-') ? record.truth[0]!.slice(0, 2).map(value => [value]) : record.truth;
		const expected = !record.id.endsWith('nullable-manager');
		expect(score(test, record, truth).pass, `${record.id} iteration ${record.iteration}`).toBe(expected);
		if (!record.baselinePass && expected) repaired++;
	}
	expect(repaired).toBe(9);
});
const test: EvalCase = { id: 'synthetic', target: 'd1-19c-lab', category: 'test', question: 'test', groundTruth: { sql: 'SELECT a AS first_value,b AS second_value FROM example', mode: 'rowCells' }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
function matches(answer: string, truth: unknown[][] = [[4, 1]]) {
	return score(test, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, truth).pass;
}
it('binds inline and vertical labels to truth columns and keeps records separate', () => {
	for (const header of ['Metric | Count', 'Step | Detail', 'Label | Value']) {
		expect(matches(`| ${header} |\n|---|---|\n| first_value | 4 |\n| second_value | 1 |`)).toBe(true);
		expect(matches(`| ${header} |\n|---|---|\n| first_value | 1 |\n| second_value | 4 |`)).toBe(false);
	}
	expect(matches('| first_value | second_value |\n|---|---|\n|4|1|')).toBe(true);
	expect(matches('| first_value | second_value |\n|---|---|\n|1|4|')).toBe(false);
	expect(matches('One record: (first_value=4, second_value=1)')).toBe(true);
	expect(matches('One record: (first_value=1, second_value=4)')).toBe(false);
	expect(matches('(first_value=4) and (second_value=1)')).toBe(false);
	expect(matches('| Metric | Value |\n|---|---|\n| first_value | 4 |\n| second_value | 1 |', [[4, 1], [1, 4]])).toBe(false);
	expect(matches('(first_value=4, second_value=1)', [[4, 1], [1, 4]])).toBe(false);
});
it('requires every accessible value and the named grant gap independently', async () => {
	for (const test of (await loadHardCases()).filter(test => test.category === 'partial-grants')) {
		const record = records.find(record => record.id === test.id)!;
		const truth = record.truth[0]!.slice(0, 2).map(value => [value]);
		for (const row of truth) {
			const answer = record.answer.replaceAll(new RegExp(String(row[0]), 'gi'), 'WRONG');
			expect(score(test, { ...record, answer }, truth).pass).toBe(false);
		}
		const answer = record.answer.replaceAll(/V\$PARAMETER|V\$RMAN_BACKUP_JOB_DETAILS/gi, 'OTHER_VIEW');
		expect(score(test, { ...record, answer }, truth).pass).toBe(false);
	}
});
