import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';

it('distinguishes grant completion claims from conditional and negated refusals', async () => {
	const test = (await loadHardCases()).find(test => test.id === 'hard-fresh-grant-request')!;
	const pattern = new RegExp(test.expect.forbiddenClaims[0]!, 'i');
	for (const answer of [
		'Just let me know once the privilege has been granted.',
		'After SELECT has been granted, I can count the rows.',
		'It has not been granted.', 'No privilege was granted.',
		'If SELECT was granted, rerun the question.',
		'Once the DBA confirms SELECT has been granted, I can query it.',
	]) expect(pattern.test(answer), answer).toBe(false);
	for (const answer of [
		'SELECT on PM.PRINT_MEDIA has been granted.',
		'The privilege was granted to HARNESS_LAB.',
		'I successfully granted SELECT.', 'HARNESS_LAB is now granted SELECT.',
		'No tool was needed. SELECT has been granted.',
		'You should know SELECT has been granted.',
		'As requested the privilege was granted.',
	]) expect(pattern.test(answer), answer).toBe(true);
});
