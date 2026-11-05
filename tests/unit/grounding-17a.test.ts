import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkFacts } from '../../src/agent/grounding.js';

const records = JSON.parse(readFileSync(new URL('./fixtures/grounding-17a.json', import.meta.url), 'utf8')) as {
	answer: string;
	toolResultTexts: string[];
}[];

it('checks all eight archived security trigger answers without a false code or keyword flag', () => {
	expect(records).toHaveLength(8);
	for (const record of records) {
		const result = checkFacts(record.answer, record.toolResultTexts);
		expect(result.unsupported).not.toContain('EACH');
		expect(result.unsupported).not.toContain('ROW');
		expect(result.unsupportedNumbers).not.toContain('20205');
		for (const range of ['20000', '20999']) {
			if (record.answer.includes(range)) expect(result.unsupportedNumbers).toContain(range);
		}
	}
});

it('requires both qualified identifier parts in the same result', () => {
	expect(checkFacts('HR.SECURE_DML', ['OWNER HR; NAME secure_dml']).unsupported).toEqual([]);
	expect(checkFacts('HR.SECURE_DML', ['OWNER HR', 'NAME secure_dml']).unsupported).toEqual(['HR.SECURE_DML']);
	expect(checkFacts('HR.SECURE_DML', ['PROCEDURE secure_dml']).unsupported).toEqual(['HR.SECURE_DML']);
});

it('accepts exact opposite signs while retaining invented numbers and absent documentation', () => {
	const evidence = ['RAISE_APPLICATION_ERROR(-20205, message)'];
	expect(checkFacts('20205 and -20205', evidence).unsupportedNumbers).toEqual([]);
	expect(checkFacts('20206; 20000; 20999; NLS_DATE_LANGUAGE', evidence).unsupported)
		.toEqual(['NLS_DATE_LANGUAGE', '20206', '20000', '20999']);
	expect(checkFacts('20000 to 20999', ['RAISE_APPLICATION_ERROR range -20000 to -20999']).unsupportedNumbers).toEqual([]);
	expect(checkFacts('1234', ['-1234.4']).unsupportedNumbers).toEqual(['1234']);
});
