import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkFacts } from '../../src/agent/grounding.js';
import { ownersFor } from '../helpers/replay-grounding-17e.js';

const records = JSON.parse(readFileSync(new URL('./fixtures/grounding-17e.json', import.meta.url), 'utf8'));
it('grounds all eight gate-17ac security-trigger answers using their own call arguments', () => {
	expect(records).toHaveLength(8);
	for (const record of records) {
		const before = checkFacts(record.answer, record.toolResultTexts);
		const after = checkFacts(record.answer, record.toolResultTexts, '', ownersFor(record));
		expect(after.unsupported).not.toContain('HR.SECURE_DML');
		expect(after.unsupported).not.toContain('HR.EMPLOYEES');
		expect(after.unsupportedNumbers).toEqual(before.unsupportedNumbers);
	}
});
it('scopes the owner to qualified names in its corresponding result only', () => {
	const result = checkFacts('HR.SECURE_DML FAKE.SECURE_DML HR.EMPLOYEES HR', ['PROCEDURE secure_dml', 'ON employees'], '', ['hr', undefined]);
	expect(result.unsupported).toEqual(['FAKE.SECURE_DML', 'HR.EMPLOYEES', 'HR']);
	expect(checkFacts('HR.SECURE_DML', ['PROCEDURE secure_dml']).unsupported).toEqual(['HR.SECURE_DML']);
	expect(checkFacts('HR.UNKNOWN', ['PROCEDURE secure_dml'], '', ['HR']).unsupported).toEqual(['HR.UNKNOWN']);
});
it('uses schema or owner strings and rejects unaligned or malformed archive arguments', () => {
	expect(ownersFor({ toolResultTexts: ['a', 'b', 'c'], toolDetails: [{ args: '{"schema":"hr"}' }, { args: { owner: 'oe' } }, { args: '{' }] })).toEqual(['HR', 'OE', undefined]);
	expect(ownersFor({ toolResultTexts: ['a'], toolDetails: [] })).toEqual([]);
	expect(ownersFor({ toolResultTexts: ['a'], toolDetails: [{ args: { schema: 1 } }] })).toEqual([undefined]);
});
