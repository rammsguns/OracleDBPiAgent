import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkChallengeRows, checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';

it('adds a separately selectable split while preserving every prior case', async () => {
	const cases = await loadHardCases();
	const prior = cases.filter(test => test.split !== 'challenge' && !test.id.startsWith('hard-p21-') && test.id !== 'hard-p25-grant-component-inventory');
	expect(prior).toHaveLength(61);
	// WP-20E deliberately re-premises the parameter case after new grants.
	expect(prior.find(test => test.id === 'hard-grant-p1-parameters')!.category).toBe('diagnosis');
	const premises = JSON.parse(readFileSync('tests/fixtures/wp25d-previous-premises.json', 'utf8'));
	const historical = JSON.parse(readFileSync('tests/fixtures/wp20e-previous-parameters.json', 'utf8'));
	expect(createHash('sha256').update(JSON.stringify(prior.map(test => premises.find((old: { id: string }) => old.id === test.id) ?? (test.id === historical.id ? historical : test.id === 'hard-p8-description-language' ? { ...test, expect: { ...test.expect, requiredTools: ['run_query'] } } : test)))).digest('hex')).toBe('46c4d7b26393b6d14e12b3a0dfeb3c275d2810a4bd14d00e6062b20a85cdb2f3');
	expect(() => checkHardCases(prior.map(test => premises.find((old: { id: string }) => old.id === test.id) ?? test))).not.toThrow();
	for (const split of ['dev', 'holdout', 'regression', 'challenge']) {
		expect(parseArgs(['--split', split]).split).toBe(split);
	}
	expect(parseArgs([]).split).toBeUndefined();
	expect(() => parseArgs(['--split', 'unknown'])).toThrow('Split');
});

it('requires two factual cases per challenge category and real follow-up turns', async () => {
	const cases = await loadHardCases();
	const challenge = cases.filter(test => test.id.startsWith('hard-p11-'));
	expect(challenge).toHaveLength(12);
	expect(new Set(challenge.map(test => test.category)).size).toBe(6);
	const missing = structuredClone(cases);
	delete missing.find(test => test.split === 'challenge')!.groundTruth;
	expect(() => checkHardCases(missing)).toThrow('rowCells');
	expect(() => checkHardCases(cases.filter(test => test.id !== challenge[0]!.id))).toThrow('two cases');
});

it('wide exact records fail for every omitted or misassociated row without changing scoring', async () => {
	const wide = (await loadHardCases()).filter(test => test.category === 'wide-exact');
	for (const test of wide) {
		// Synthetic cells test scoring mechanics only, not Oracle sample-data values.
		const rows = Array.from({ length: 12 }, (_, i) => [`Record ${i}`,100 + i]);
		const response = { answer: rows.map(row => row.join(' | ')).join('\n'), toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass).toBe(true);
		for (let i = 0; i < rows.length; i++) {
			expect(score(test, { ...response, answer: rows.filter((_, n) => n !== i).map(row => row.join(' | ')).join('\n') }, rows).pass).toBe(false);
		}
		const swapped = structuredClone(rows);
		swapped[0] = ['Record 0',101];
		swapped[1] = ['Record 1',100];
		expect(score(test, { ...response, answer: swapped.map(row => row.join(' | ')).join('\n') }, rows).pass).toBe(false);
		expect(() => checkChallengeRows(test, rows)).not.toThrow();
		expect(() => checkChallengeRows(test, rows.slice(0, 7))).toThrow('eight');
		expect(() => checkChallengeRows(test, Array(8).fill(rows[0]))).toThrow('distinct');
	}
});

it('fails validation when a false-premise prerequisite changes', async () => {
	const cases = await loadHardCases();
	const pk = cases.find(test => test.id === 'hard-p11-sales-primary-key')!;
	const commission = cases.find(test => test.id === 'hard-p11-commission-zero')!;
	expect(() => checkChallengeRows(pk, [[0],[5]])).not.toThrow();
	expect(() => checkChallengeRows(pk, [[1],[5]])).toThrow('premise');
	expect(() => checkChallengeRows(commission, [[72,0,35]])).not.toThrow();
	expect(() => checkChallengeRows(commission, [[0,72,35]])).toThrow('premise');
});
