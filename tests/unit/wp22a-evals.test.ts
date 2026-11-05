import { expect, it } from 'vitest';
import { loadHardCases, checkHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

const cases = await loadHardCases();
const run = (id: string, answer: string, truth: unknown[][]) => score(cases.find(test => test.id === id)!, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, truth).pass;
it('accepts No and None only for the signature defaulted cell', () => {
	for (const word of ['No', 'None', 'N']) expect(run('hard-p21-history-signature', `| Argument | Defaulted |\n|---|---|\n| P_EMP_ID | ${word} |`, [['P_EMP_ID', 'N']])).toBe(true);
	expect(run('hard-p21-history-signature', '| P_EMP_ID | Yes |', [['P_EMP_ID', 'N']])).toBe(false);
	expect(run('hard-p21-history-signature', '| OTHER | No |', [['P_EMP_ID', 'N']])).toBe(false);
	const test = structuredClone(cases.find(test => test.id === 'hard-p21-history-signature')!);
	test.id = 'unrelated';
	expect(score(test, { answer: '| P_EMP_ID | No |', toolCalls: [], usage: { input: 0, output: 0 } }, [['P_EMP_ID', 'N']]).pass).toBe(false);
});
it('binds vertical statistics flags to their own attributes within one table', () => {
	const table = (stale: string, global: string) => `| Attribute | Value |\n|---|---|\n| **Stale?** | **${stale}** — STALE_STATS = ${stale} |\n| **Missing?** | No |\n| **Global statistics?** | **${global}** — GLOBAL_STATS = ${global} |`;
	expect(run('hard-p21-products-stats', table('YES', 'YES'), [['YES', 'YES']])).toBe(true);
	expect(run('hard-p21-products-stats', table('YES', 'NO'), [['YES', 'NO']])).toBe(true);
	expect(run('hard-p21-products-stats', table('NO', 'YES'), [['YES', 'NO']])).toBe(false);
	expect(run('hard-p21-products-stats', table('YES', 'NO'), [['YES', 'YES']])).toBe(false);
	expect(run('hard-p21-products-stats', '| Attribute | Value |\n|---|---|\n| Stale? | YES |\n\n| Attribute | Value |\n|---|---|\n| Global statistics? | YES |', [['YES', 'YES']])).toBe(false);
});
it('keeps exposed ADR cases in dev and two replacements in holdout', () => {
	for (const id of ['hard-p21-alert-levels', 'hard-p21-problem-identity']) expect(cases.find(test => test.id === id)?.split).toBe('dev');
	for (const id of ['hard-p21-alert-levels-d1', 'hard-p21-problem-last-incident-p1']) {
		const test = cases.find(test => test.id === id)!;
		expect(test.split).toBe('holdout');
		expect(test.skipWhenTruthEmpty).toBe(true);
		expect(test.question).not.toMatch(/v\$|run_query|alertlog/i);
		const invalid = structuredClone(cases); invalid.find(test => test.id === id)!.split = 'dev';
		expect(() => checkHardCases(invalid)).toThrow('holdout truth');
	}
});
it('accepts all six correct archived release answers', async () => {
	const { readFile } = await import('node:fs/promises');
	const records = JSON.parse(await readFile(new URL('../fixtures/wp22a/gate-answers.json', import.meta.url), 'utf8')) as { id: string; answer: string; truth: unknown[][] }[];
	expect(records).toHaveLength(6);
	for (const record of records) expect(run(record.id, record.answer, record.id === 'hard-p21-products-stats' ? record.truth.map(row => row.slice(1)) : record.truth), record.id).toBe(true);
});
