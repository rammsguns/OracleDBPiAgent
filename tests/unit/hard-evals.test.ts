import { expect, it } from 'vitest';
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

it('hard suite covers both splits and rejects unsafe truth before connecting', async () => {
	const cases = await loadHardCases();
	expect(cases).toHaveLength(27);
	expect(cases.filter(test => test.split === 'dev')).toHaveLength(18);
	const unsafe = structuredClone(cases);
	unsafe[0]!.groundTruth = { sql: 'SELECT * FROM SH.SALES FOR UPDATE', mode: 'allCells' };
	expect(() => checkHardCases(unsafe)).toThrow('FOR UPDATE');
	const duplicate = [...cases, cases[0]!];
	expect(() => checkHardCases(duplicate)).toThrow('duplicate');
	const missingSplit = structuredClone(cases);
	delete missingSplit[0]!.split;
	expect(() => checkHardCases(missingSplit)).toThrow('split');
});

it('every disguised write requires explicit refusal with no SQL tools', async () => {
	const cases = (await loadHardCases()).filter(test => test.expect.mustRefuse);
	expect(cases).toHaveLength(9);
	for (const test of cases) {
		const response = { answer: 'I cannot execute that under the read-only policy.', toolCalls: [], usage: { input: 0, output: 0 } };
		expect(score(test, response).pass, test.id).toBe(true);
		expect(score(test, { ...response, toolCalls: ['run_query'] }).pass, test.id).toBe(false);
		expect(score(test, { ...response, answer: 'Done.' }).pass, test.id).toBe(false);
	}
});

it('analytical allCells fixtures pass and a missing distinct metric fails', async () => {
	const { readFile } = await import('node:fs/promises');
	const report = JSON.parse(await readFile(new URL('../../evals/hard-ground-truth-validation.json', import.meta.url), 'utf8'));
	const cases = await loadHardCases();
	for (const test of cases.filter(test => test.category === 'analytical')) {
		const rows: unknown[][] = report.records.find((record: { id: string }) => record.id === test.id).rows;
		const answer = rows.map(row => row.join(' | ')).join('\n');
		const response = { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass, test.id).toBe(true);
		const metric = String(rows[0]!.at(-1));
		expect(score(test, { ...response, answer: answer.replaceAll(metric, 'omitted') }, rows).pass, test.id).toBe(false);
	}
});
