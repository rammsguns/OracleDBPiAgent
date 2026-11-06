import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { loadSelectedCases, parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

const cases: EvalCase[] = JSON.parse(readFileSync('evals/cases-hard/phase27-top.json', 'utf8'));
const response = (answer: string, toolCalls: string[] = []) => ({ answer, toolCalls, usage: { input: 0, output: 0 } });
it('selects the p27 suite without running an agent', async () => {
	expect(await loadSelectedCases(parseArgs(['--suite', 'p27']))).toEqual(cases);
	const all = await loadHardCases();
	expect(() => checkHardCases(all.filter(test => test.id !== cases[0]!.id))).toThrow('ten distinct');
	const volatile = structuredClone(all);
	volatile.find(test => test.id === cases[0]!.id)!.groundTruth!.sql = 'SELECT value FROM v$sysstat';
	expect(() => checkHardCases(volatile)).toThrow('only statistic names and classes');
	const noAlternative = structuredClone(all);
	noAlternative.find(test => test.id === 'hard-p27-refuse-ash')!.expect.requiredFacts = [];
	expect(() => checkHardCases(noAlternative)).toThrow('offer piagent top');
});
it.each(cases.filter(test => test.expect.mustRefuse))('$id requires refusal, top alternative, and an honest time scope', test => {
	const good = 'I cannot provide that source. Use piagent top for a live interval sample; it cannot reconstruct the last hour.';
	expect(score(test, response(good)).pass).toBe(true);
	for (const answer of ['I cannot provide that source.', 'Use piagent top for a live interval sample.', 'I cannot provide that source. Use piagent top for live data.']) {
		expect(score(test, response(answer)).pass).toBe(false);
	}
	for (const tool of ['run_query', 'explain_plan']) expect(score(test, response(good, [tool])).pass).toBe(false);
});
it('scores supplied examples without database truth and rejects wrong interpretations', () => {
	const examples = [
		['delta', 'The delta is 60; 4 commits per second. Subtract the cumulative counters.', '1060 commits per second.'],
		['reset', 'A negative delta indicates a reset; this sample is invalid for a reliable rate.', 'The database performed -880 buffer gets.'],
		['new-cursor', 'The baseline is unknown; we cannot assume all executions occurred in this interval.', 'All 80 executions occurred in this interval.'],
		['aged-out', 'Aging out means the interval delta is unavailable; absence cannot prove no work.', 'Absence proves zero executions.'],
	];
	for (const [id, good, bad] of examples) {
		const test = cases.find(test => test.id === `hard-p27-${id}`)!;
		expect(score(test, response(good!)).pass, id).toBe(true);
		expect(score(test, response(bad!)).pass, id).toBe(false);
	}
});
it('keeps each statistic paired with its class and never scores volatile values', () => {
	const rows = [['parse count (hard)', 64], ['parse count (total)', 64], ['physical reads', 8], ['redo size', 2]];
	for (const test of cases.filter(test => test.groundTruth)) {
		const answer = 'CLASS is a bitmask. CDB-wide.\n| name | class |\n|---|---|\n' + rows.map(row => `| ${row.join(' | ')} |`).join('\n');
		expect(score(test, response(answer, ['run_query']), rows).pass).toBe(true);
		expect(score(test, response(answer.replace('| physical reads | 8 |', '| physical reads | 64 |'), ['run_query']), rows).pass).toBe(false);
		expect(score(test, response(answer.replace('parse count (hard)', 'parse count'), ['run_query']), rows).pass).toBe(false);
		expect(score(test, response(answer.replace('parse count (total)', 'parse count (hard)'), ['run_query']), rows).pass).toBe(false);
	}
});
