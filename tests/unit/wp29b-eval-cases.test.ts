import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkRepairedCases, loadHardCases, verifyUnavailable } from '../../evals/validate-hard.js';

it('validates repaired cases and preserves blind replacement splits', async () => {
	checkRepairedCases(await loadHardCases());
});

it('rejects diagnostic cursor seeding and schema-only cursor filters', async () => {
	const original = (await loadHardCases()).find(test => test.id === 'hard-price-plan')!;
	const test = structuredClone(original);
	test.groundTruth!.setupSql = 'SELECT COUNT(*) FROM SHOPAPP.ORDERS';
	expect(() => checkRepairedCases([test])).toThrow(/without seeding/);
	delete test.groundTruth!.setupSql;
	test.groundTruth!.sql = test.groundTruth!.sql.replaceAll(" AND s.parsing_user_id=(SELECT user_id FROM all_users WHERE username='SHOPAPP')", '').replaceAll(" AND parsing_user_id=(SELECT user_id FROM all_users WHERE username='SHOPAPP')", '');
	expect(() => checkRepairedCases([test])).toThrow(/parsing login/);
});

it('rejects volatile statistics timestamp grading', async () => {
	const test = structuredClone((await loadHardCases()).find(test => test.id === 'hard-p19-object-statistics')!);
	test.groundTruth!.sql += ' ORDER BY last_analyzed_utc';
	expect(() => checkRepairedCases([test])).toThrow(/nightly/);
});

it('rejects silent empty skips and exposed holdouts', async () => {
	const test = structuredClone((await loadHardCases()).find(test => test.id === 'hard-p21-public-directory')!);
	test.skipWhenTruthEmpty = true;
	expect(() => checkRepairedCases([test])).toThrow(/fail closed/);
	delete test.skipWhenTruthEmpty;
	test.split = 'holdout';
	expect(() => checkRepairedCases([test])).toThrow(/Exposed/);
});

it('requires real grant denial rather than treating other failures as absence', async () => {
	await expect(verifyUnavailable(async () => { throw { code: 'ORA-00942' }; })).resolves.toBeUndefined();
	await expect(verifyUnavailable(async () => [])).rejects.toThrow(/now readable/);
	await expect(verifyUnavailable(async () => { throw new Error('down'); })).rejects.toThrow('down');
});

it('rejects a broad ORDERS match that could select CHILD_ROWS triage SQL', async () => {
	const test = structuredClone((await loadHardCases()).find(test => test.id === 'hard-orders-plan')!);
	const seed = test.groundTruth!.setupSql!;
	test.groundTruth!.sql = test.groundTruth!.sql.replace(`sql_text='${seed}'`, "UPPER(sql_text) LIKE 'SELECT COUNT(%FROM SHOPAPP.ORDERS%'");
	expect(() => checkRepairedCases([test])).toThrow(/exact isolated/);
});

it('freezes exposed premises for coordinator replay', () => {
	expect(createHash('sha256').update(readFileSync('tests/fixtures/wp29b-previous-cases.json')).digest('hex')).toBe('e89cb998d3eb35dcddf0619b2479d72265e09d4d4327c28192ccc61ca9823350');
});
