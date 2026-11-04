import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases, checkHardCases, checkChallengeRows } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
const fixtures: { id: string; rows: (string | number)[][] }[] = JSON.parse(readFileSync('tests/fixtures/phase11b-truth.json', 'utf8'));
const explanation: Record<string, string> = {
	'header-fanout': 'Aggregate once per order to avoid join duplication.',
	'nullable-manager': 'COUNT ignores NULL manager values; empty departments have zero employees.',
	'commission-denominators': 'NULL values are excluded from the first denominator and included as zero in the second.',
	'timestamp-boundary': 'Use an exclusive upper bound at next midnight; the inclusive upper bound omits most of the second day.',
	'stats-grain': 'NUM_ROWS is a statistic about rows; live COUNT DISTINCT counts different employees.',
	'partial-memory': 'SGA_TARGET is unavailable because the source is inaccessible.',
	'partial-backup': 'RMAN backup history is unavailable; an open database does not establish backup health.',
};
it('adds ten blind cases without changing any existing gate split', async () => {
	const cases = await loadHardCases();
	const added = cases.filter(test => test.id.startsWith('hard-p11b-'));
	expect(added).toHaveLength(10);
	expect(added.every(test => test.split === 'challenge' && test.groundTruth?.mode === 'rowCells')).toBe(true);
	expect(new Set(added.map(test => test.target)).size).toBe(2);
	expect(() => checkHardCases(cases)).not.toThrow();
	const invalid = structuredClone(cases);
	invalid.find(test => test.id === added[0]!.id)!.groundTruth!.mode = 'bogus' as 'rowCells';
	expect(() => checkHardCases(invalid)).toThrow('mode');
});
it('accepts each new truth snapshot in tables, records and prose, and rejects missing or incorrect records', async () => {
	const cases = await loadHardCases();
	for (const fixture of fixtures) {
		const test = cases.find(test => test.id === fixture.id)!;
		const note = explanation[fixture.id.replace('hard-p11b-', '')] ?? '';
		const renderers = [
			(row: (string | number)[]) => '| ' + row.join(' | ') + ' |',
			(row: (string | number)[]) => row.map((value, i) => `FIELD_${i}=${value}`).join(' / '),
			(row: (string | number)[]) => 'Values are ' + row.join(', then ') + '.',
		];
		for (const render of renderers) {
			const answer = { answer: fixture.rows.map(render).join('\n') + '\n' + note, toolCalls: [], usage: { input: 0, output: 0 } };
			expect(score(test, answer, fixture.rows).pass, fixture.id + ': ' + answer.answer).toBe(true);
			const changed = structuredClone(fixture.rows);
			changed[0]![0] = typeof changed[0]![0] === 'number' ? 987654321 : 'WRONG_VALUE';
			expect(score(test, { ...answer, answer: changed.map(render).join('\n') + '\n' + note }, fixture.rows).pass, fixture.id).toBe(false);
			expect(score(test, { ...answer, answer: fixture.rows.slice(1).map(render).join('\n') + '\n' + note }, fixture.rows).pass, fixture.id).toBe(false);
		}
		expect(() => checkChallengeRows(test, fixture.rows)).not.toThrow();
	}
});
it('fails closed if a blind case loses its intended trap', async () => {
	const cases = await loadHardCases();
	for (const id of ['salary-ties', 'timestamp-boundary', 'commission-denominators', 'nullable-manager', 'stats-grain']) {
		const test = cases.find(test => test.id === `hard-p11b-${id}`)!;
		expect(() => checkChallengeRows(test, [[0, 0, 0, 0, 0]])).toThrow('prerequisite');
	}
});
