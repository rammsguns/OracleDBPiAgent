import { expect, it } from 'vitest';
import { checkPinnedFacts, loadHardCases, verifyUnavailable } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

const counts = { 'numeric-precision': 2, 'unit-conversion': 2, 'name-fidelity': 1, 'refusal-follow-ups': 2, 'grant-limited-p1': 1 };

it('adds exactly the specified category counts in each split, with truth for factual cases', async () => {
	const cases = (await loadHardCases()).filter(test => test.category in counts);
	expect(cases).toHaveLength(16);
	for (const [category, count] of Object.entries(counts)) {
		for (const split of ['dev', 'holdout']) expect(cases.filter(test => test.category === category && test.split === split)).toHaveLength(count);
	}
	for (const test of cases) {
		expect(test.expect.requiredFacts.length > 0 || test.expect.mustRefuse, test.id).toBe(true);
		if (!test.expect.mustRefuse) expect(test.groundTruth?.mode, test.id).toBe('allCells');
		else {
			expect(test.turns).toHaveLength(2);
			expect(test.expect.requiredTools).toEqual(['describe_object']);
		}
	}
});

it('accepts only the named missing-grant errors, never an outage or a readable view', async () => {
	for (const code of ['ORA-00942', 'ORA-01031']) await expect(verifyUnavailable(async () => { throw { code }; })).resolves.toBeUndefined();
	await expect(verifyUnavailable(async () => [])).rejects.toThrow('now readable');
	const outage = Object.assign(new Error('listener unavailable'), { code: 'NJS-511' });
	await expect(verifyUnavailable(async () => { throw outage; })).rejects.toBe(outage);
});

it('scores exact precision and converted values and rejects transcription errors', async () => {
	const values: Record<string, string> = {
		'hard-precision-revenue-1998': '24083914.95', 'hard-precision-revenue-2000': '23765506.62',
		'hard-precision-revenue-1999': '22219947.66', 'hard-precision-revenue-2001': '28136461.98',
		'hard-units-sales-mb': '128.00', 'hard-units-customers-mb': '13.00',
		'hard-units-costs-gb': '0.125000', 'hard-units-products-mb': '0.0625',
	};
	for (const test of await loadHardCases()) {
		const value = values[test.id];
		if (!value) continue;
		const unit = test.id.endsWith('-gb') ? 'GB' : 'MB';
		const response = { answer: `${value} ${unit}`, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, [[value]]).pass, test.id).toBe(true);
		expect(score(test, { ...response, answer: `999${value} ${unit}` }, [[value]]).pass, test.id).toBe(false);
	}
});

it('requires honest missing-object and grant answers and rejects invented facts', async () => {
	const cases = await loadHardCases();
	for (const [id, answer, rows, invented] of [
		['hard-name-missing-archive', 'SH.SALES_ARCHIVE_2099 does not exist.', [['does not exist']], ' It contains 100 rows.'],
		['hard-grant-p1-parameters', 'V$PARAMETER is unavailable: missing SELECT grant.', [['V$PARAMETER', 'unavailable']], ' SGA_TARGET = 1048576 bytes.'],
		['hard-grant-p1-backups', 'V$RMAN_BACKUP_JOB_DETAILS is unavailable: missing SELECT grant.', [['V$RMAN_BACKUP_JOB_DETAILS', 'unavailable']], ' Last backup was successful on 2026-10-29.'],
	] as const) {
		const test = cases.find(test => test.id === id)!;
		const response = { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		const truth = rows.map(row => [...row]);
		expect(score(test, response, truth).pass, id).toBe(true);
		expect(score(test, { ...response, answer: answer + invented }, truth).pass, id).toBe(false);
	}
});

it('rejects stale fixed facts during validation and distinguishes the near-miss parent', async () => {
	const cases = await loadHardCases();
	const numeric = cases.find(test => test.id === 'hard-precision-revenue-1998')!;
	expect(() => checkPinnedFacts(numeric, [['24083914.95']])).not.toThrow();
	expect(() => checkPinnedFacts(numeric, [['24038914.95']])).toThrow('Pinned fact');
	const name = cases.find(test => test.id === 'hard-name-promo-parent')!;
	const response = { answer: 'The parent table is SH.PROMOTIONS, column PROMO_ID.', toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
	expect(score(name, response, [['PROMOTIONS', 'PROMO_ID']]).pass).toBe(true);
	expect(score(name, { ...response, answer: response.answer + ' SALES also references SH.PROMO.' }, [['PROMOTIONS', 'PROMO_ID']]).pass).toBe(false);
});
