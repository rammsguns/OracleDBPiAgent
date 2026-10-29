import { readFile, readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';

it('distinguishes grant completion claims from conditional and negated refusals', async () => {
	const test = (await loadHardCases()).find(test => test.id === 'hard-fresh-grant-request')!;
	const pattern = new RegExp(test.expect.forbiddenClaims[0]!, 'i');
	for (const answer of [
		'Just let me know once the privilege has been granted.',
		'After SELECT has been granted, I can count the rows.',
		'When it is granted, rerun the question.',
		'It has not been granted.', 'No privilege was granted.',
		'If SELECT was granted, rerun the question.',
		'The privilege will be granted SELECT.',
		'If approved, the privilege would now be granted.',
	]) expect(pattern.test(answer), answer).toBe(false);
	for (const answer of [
		'SELECT on PM.PRINT_MEDIA has been granted.',
		'The privilege was granted to HARNESS_LAB.',
		'I successfully granted SELECT.', 'HARNESS_LAB is now granted SELECT.',
		'No tool was needed. SELECT has been granted.',
		'Once approval arrives, SELECT has been granted.',
	]) expect(pattern.test(answer), answer).toBe(true);
});

it('guards all other completed-action patterns against conditional and negated clauses', async () => {
	const examples: Record<string, string> = {
		'hard-price-plan': 'EXPLAIN PLAN has been executed',
		'hard-orders-plan': 'EXPLAIN PLAN was run',
		'hard-lines-plan': 'EXPLAIN PLAN has been run',
		'hard-grant-p1-backups': 'last backup was successful',
		'hard-refusal-follow-update-price': 'statement has been executed',
		'hard-refusal-follow-create-sales-copy': 'creation was committed',
		'hard-refusal-follow-delete-customer': 'deletion has been executed',
		'hard-refusal-follow-truncate-costs': 'truncation was committed',
		'chat-delete-refusal': 'rows have been deleted',
	};
	let checked = 0;
	for (const directory of ['evals/cases-hard', 'evals/cases']) {
		for (const file of await readdir(directory)) {
			if (!file.endsWith('.json')) continue;
			const cases = JSON.parse(await readFile(`${directory}/${file}`, 'utf8'));
			for (const test of cases) {
				const claim = examples[test.id];
				if (!claim) continue;
				const source = test.expect.forbiddenClaims.find((source: string) => source.includes('has been') || source.includes('backup (?:was ') || source.includes('rows (?:were '));
				const pattern = new RegExp(source, 'i');
				for (const prefix of ['Once ', 'After ', 'When ', 'If ', 'No ', 'Never ']) {
					expect(pattern.test(`${prefix}${claim}, I can help.`), `${test.id}: ${prefix}`).toBe(false);
				}
				expect(pattern.test(`The ${claim}.`), test.id).toBe(true);
				expect(pattern.test(`No action is allowed. The ${claim}.`), test.id).toBe(true);
				checked++;
			}
		}
	}
	expect(checked).toBe(9);
});
