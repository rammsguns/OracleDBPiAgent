import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';

const fixtures = JSON.parse(readFileSync('tests/fixtures/wp2527m/refusal-answers.json', 'utf8')) as { positive: string[]; negative: string[] };

it('accepts refusal synonyms in both orders while preserving word and sentence boundaries', async () => {
	const cases = (await loadHardCases()).filter(test => test.id.startsWith('hard-p27-refuse-'));
	expect(cases).toHaveLength(4);
	const alternatives = ['none', 'never', 'neither', 'nor', 'unable', 'blocked', 'out of scope', 'unsupported', 'not supported', 'not available'];
	for (const test of cases) {
		const pattern = new RegExp(test.expect.requiredFacts![2]!, 'i');
		for (const answer of fixtures.positive) expect(pattern.test(answer), `${test.id}: ${answer}`).toBe(true);
		for (const negation of alternatives) {
			for (const answer of [`${negation}: last hour history`, `Last hour history: ${negation}`]) {
				expect(pattern.test(answer), `${test.id}: ${answer}`).toBe(true);
			}
			for (const separator of ['.', '\n']) {
				for (const answer of [`${negation}${separator}History is available`, `History is available${separator}${negation}`]) {
					expect(pattern.test(answer), `${test.id}: ${answer}`).toBe(false);
				}
			}
		}
		for (const answer of fixtures.negative) expect(pattern.test(answer), `${test.id}: ${answer}`).toBe(false);
	}
});

it('accepts bounded backup limitations and the B-side single-record table headers', async () => {
	const { score } = await import('../../evals/scoring.js');
	const fixtures = JSON.parse(readFileSync('tests/fixtures/wp2527m/backup-answers.json', 'utf8')) as Record<string, string>;
	const cases = await loadHardCases();
	const level0 = cases.find(test => test.id === 'hard-p25-d1-last-level0')!;
	const pattern = new RegExp(level0.expect.requiredFacts[0]!, 'i');
	expect(pattern.test(fixtures.limitation!)).toBe(true);
	for (const key of ['affirmative', 'affirmativeNow', 'affirmativeKnow']) {
		expect(pattern.test(fixtures[key]!), fixtures[key]).toBe(false);
	}
	expect(pattern.test(fixtures.negativeProof!)).toBe(true);
	for (const negation of ['nothing', 'no', 'never', 'without', '≠', 'only proves']) {
		expect(pattern.test(`${negation} proof of a usable backup`)).toBe(true);
		expect(pattern.test(`${negation}.${' proof of a usable backup'}`)).toBe(false);
		expect(pattern.test(`${negation}\nproof of a usable backup`)).toBe(false);
		expect(pattern.test(`${negation} ${'x'.repeat(91)} usable backup`)).toBe(false);
	}
	const test = cases.find(test => test.id === 'hard-p25-d1-no-backups-recorded')!;
	const archived = JSON.parse(readFileSync('tests/fixtures/wp2527j/gate-answers.json', 'utf8'))[0];
	for (const header of ['Count', 'Result', 'Value']) {
		const table = fixtures.table!.replace('Count', header);
		const answer = `${table}\nNO BACKUPS RECORDED. Control-file history cannot establish external media availability.`;
		expect(score(test, { ...archived, answer }, [[0, 0, 0, 0]]).pass, header).toBe(true);
		expect(score(test, { ...archived, answer: answer.replace('| 0 |', '| 1 |') }, [[0, 0, 0, 0]]).pass).toBe(false);
		expect(score(test, { ...archived, answer: answer.replace(/\n\| V\$BACKUP_PIECE[^\n]*/, '') }, [[0, 0, 0, 0]]).pass).toBe(false);
	}
});
