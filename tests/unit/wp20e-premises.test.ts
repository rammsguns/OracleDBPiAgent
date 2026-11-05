import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

it('requires both configured parameter values and rejects the obsolete missing-access answer', async () => {
	const test = (await loadHardCases()).find(test => test.id === 'hard-grant-p1-parameters')!;
	const truth = [['PGA_AGGREGATE_TARGET', '1073741824'], ['SGA_TARGET', '3221225472']];
	const result = { answer: 'PGA_AGGREGATE_TARGET = 1073741824 bytes\nSGA_TARGET = 3221225472 bytes', toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
	expect(test.category).not.toBe('grant-limited-p1');
	expect(score(test, result, truth).pass).toBe(true);
	for (const answer of ['V$PARAMETER unavailable: missing grant.', result.answer.replace('3221225472', '999'), result.answer.split('\n')[0]!]) {
		expect(score(test, { ...result, answer }, truth).pass).toBe(false);
	}
});

it('accepts Markdown and quoted no-default conclusions, and rejects positive or contradictory defaults', async () => {
	const test = (await loadHardCases()).find(test => test.id === 'hard-p16-history-arguments')!;
	// Isolate the conclusion; existing phase16 fixtures cover the complete argument rows.
	const isolated = { ...test, groundTruth: undefined };
	const response = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
	for (const answer of ['**Defaults:** None', "`DEFAULTED = 'N'`", 'All arguments have DEFAULTED = N.', 'No arguments are defaulted.']) {
		expect(score(isolated, response(answer)).pass, answer).toBe(true);
	}
	for (const answer of ['Defaults: Yes', "DEFAULTED = 'Y'", 'One argument has a default.', "**Defaults:** None. But one argument has a default.", "DEFAULTED = 'N' for some; DEFAULTED = 'Y' for others."]) {
		expect(score(isolated, response(answer)).pass, answer).toBe(false);
	}
});

it('keeps the partial-memory challenge tied to the probed inaccessible source', async () => {
	const test = (await loadHardCases()).find(test => test.id === 'hard-p11b-partial-memory')!;
	const result = { answer: 'Instance PRODCDB; major version 19. The shared pool allocation from V$SGASTAT is unavailable due to missing access.', toolCalls: [], usage: { input: 0, output: 0 } };
	const truth = [['PRODCDB'], ['19']];
	expect(score(test, result, truth).pass).toBe(true);
	for (const answer of [result.answer.replace('PRODCDB', 'OTHER'), result.answer.replace('V$SGASTAT', 'V$PARAMETER'), result.answer.replace('unavailable due to missing access', '3221225472 bytes')]) {
		expect(score(test, { ...result, answer }, truth).pass).toBe(false);
	}
});
