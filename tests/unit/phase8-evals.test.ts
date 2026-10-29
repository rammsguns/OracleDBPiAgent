import { expect, it } from 'vitest';
import { checkHardCases, checkPinnedFacts, loadHardCases } from '../../evals/validate-hard.js';
import { parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';

it('parses regression and rejects unknown splits', () => {
	expect(parseArgs(['--split', 'regression']).split).toBe('regression');
	for (const split of ['test', 'all', 'Regression']) expect(() => parseArgs(['--split', split])).toThrow('Split');
});

it('requires dev and fresh holdout in all categories, ignoring regression in the ratio', async () => {
	const cases = await loadHardCases();
	const fresh = cases.filter(test => test.id.startsWith('hard-p8-'));
	expect(fresh).toHaveLength(12);
	expect(new Set(fresh.map(test => test.category)).size).toBe(11);
	expect(fresh.every(test => test.split === 'holdout')).toBe(true);
	const withoutRegression = cases.filter(test => test.split !== 'regression');
	expect(() => checkHardCases(withoutRegression)).not.toThrow();
	const extraRegression = cases.filter(test => test.split === 'regression').map(test => ({ ...test, id: test.id + '-duplicate-regression' }));
	expect(() => checkHardCases([...cases, ...extraRegression, ...extraRegression.map(test => ({ ...test, id: test.id + '-again' }))])).not.toThrow();
	for (const category of new Set(fresh.map(test => test.category))) {
		const missing = cases.map(test => test.category === category && test.split === 'holdout' ? { ...test, split: 'regression' as const } : test);
		expect(() => checkHardCases(missing), category).toThrow('Every category');
	}
	const tooMuchDev = cases.map(test => test.split === 'regression' ? { ...test, split: 'dev' as const } : test);
	expect(() => checkHardCases(tooMuchDev)).toThrow('55–72%');
});

it('retains old case counts in dev and regression', async () => {
	// The old category sizes remain fixed; the only fresh cases have the Phase 8 prefix.
	const cases = (await loadHardCases()).filter(test => !test.id.startsWith('hard-p8-'));
	expect(cases).toHaveLength(49);
	expect(cases.filter(test => test.split === 'regression')).toHaveLength(21);
	expect(cases.filter(test => test.split === 'holdout')).toHaveLength(0);
});

it('pins fresh precision, units and exact dictionary spelling', async () => {
	const cases = await loadHardCases();
	for (const [id, rows] of [
		['line-extension', [['3668054.70']]],
		['jobs-decimal-mb', [['0.065536']]],
		['description-language', [['LANGUAGE_ID', 'VARCHAR2', 3]]],
		['archive-access', [['V$ARCHIVED_LOG', 'unavailable'], ['V$LOG_HISTORY', 'unavailable']]],
	] as [string, unknown[][]][]) {
		const test = cases.find(test => test.id === `hard-p8-${id}`)!;
		expect(() => checkPinnedFacts(test, rows)).not.toThrow();
		expect(() => checkPinnedFacts(test, [['wrong']])).toThrow('Pinned fact');
		const answer = rows.flat().join(' | ') + ' MB; missing access grant.';
		expect(score(test, { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, rows).pass).toBe(true);
	}
});

it('uses narrow negation guards that still catch later affirmative claims', async () => {
	const cases = await loadHardCases();
	for (const id of ['comment-write', 'rename-region']) {
		const test = cases.find(test => test.id === `hard-p8-${id}`)!;
		const pattern = new RegExp(test.expect.forbiddenClaims[0]!, 'i');
		for (const text of ['No command was executed.', 'The command was not executed.', 'If command succeeded, check again.']) expect(pattern.test(text), text).toBe(false);
		for (const text of ['The command was executed.', 'I cannot help, but the command was executed.', 'Do not worry: command succeeded.']) expect(pattern.test(text), text).toBe(true);
	}
});
