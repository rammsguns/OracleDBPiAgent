import { describe, expect, it } from 'vitest';
import { checkFacts } from '../../src/agent/grounding.js';
import { collectResult } from '../../evals/runtime.js';

describe('hard fact grounding', () => {
	it('catches both real misses without substring or approximate digit matching', () => {
		expect(checkFacts('`PROMO` totals 3,331,394.74.', ['PROMOTIONS 3313394.74']).unsupported).toEqual(['PROMO', '3,331,394.74']);
	});
	it.each([
		['`SH.PROMOTIONS` totals 3,313,394.74.', 'owner SH table promotions total 3313394.74'],
		['"promo_id" references PROMOTIONS.', 'PROMO_ID\tpromotions'],
		["'Europe' totals 1,234,567", 'EUROPE 1234567'],
		['Sales total 3,313,395.', '3313394.74'],
		['Sales total 3313.39.', '3313.39474'],
		['Sales total 3313.4.', '3313.39474'],
		['Value 0.001234.', '0.0012341'],
		['Value -1,234.50.', '-1234.499'],
		['Size 1234 KB.', '1263616'],
		['Size 1234 KB.', '1234000'],
		['Size 1.234 MB.', '1293942.784'],
		['Size 1.234 GB.', '1234000000'],
		['Size 1.234 TB.', '1356797348675.584'],
		['Size 1.234 KiB.', '1263.616'],
		['Size 1.234 MB.', '1234 KB'],
		['Ratio 12.34%.', '617 5000'],
		['Ratio 12.34%.', '12.3401%'],
		['SQL_ID `9abcdfgh12345` returned.', '9abcdfgh12345'],
		['SQL_ID 9abcdfgh12345 returned.', '9abcdfgh12345'],
		['SQL_ID abcdfghjkmnpq returned.', 'ABCDFGHJKMNPQ'],
		['Oracle 19c in 2026; version 19.9.1.0.0.', '19.9.1.0.0'],
		['SELECT COUNT(*) FROM HR.EMPLOYEES', 'HR EMPLOYEES 107'],
	])('accepts supported answer %s', (answer, result) => {
		expect(checkFacts(answer, [result]).unsupported).toEqual([]);
	});
	it.each([
		['Value 1234.57', '1234.561'],
		['Value 0.001235', '0.0012341'],
		['Size 1234 KiB', '1234000'],
		['Size 1.234 GB', '1.234 MB'],
		['Ratio 12.34%', '600 5000'],
		['SQL_ID 9abcdfgh12345', '9abcdfgh12346'],
		['SH.PROMO', 'SH PROMOTIONS'],
		['`PROMO`', 'PROMOTIONS'],
	])('rejects unsupported answer %s', (answer, result) => {
		expect(checkFacts(answer, [result]).unsupported.length).toBeGreaterThan(0);
	});
	it('exempts only question-supplied facts and deduplicates', () => {
		expect(checkFacts('`PROMO` 12345 and `NEW_TABLE` 98765; NEW_TABLE.', [], 'Does promo have 12,345 rows?').unsupported).toEqual(['NEW_TABLE', '98765']);
	});
	it('does not flag ordinary prose, small numbers, SQL syntax or years', () => {
		expect(checkFacts('The table has 107 rows; 19c supports SELECT, not DDL, in 2026.', []).unsupported).toEqual([]);
	});
	it('does not mutate inputs and returns extracted supported facts too', () => {
		const texts = Object.freeze(['PROMOTIONS 12345']);
		expect(checkFacts('PROMOTIONS 12,345', texts)).toEqual({ facts: ['PROMOTIONS', '12,345'], unsupported: [] });
	});
});

it('captures text only and caps each eval tool result at 4096 UTF-8 bytes', () => {
	const result = collectResult([
		{ role: 'toolResult', content: [{ type: 'text', text: 'é'.repeat(3000) }, { type: 'image', data: 'not-captured' }], details: { binds: 'not-captured' } },
		{ role: 'toolResult', content: [{ type: 'text', text: 'second' }] },
	]);
	expect(result.toolResultTexts).toEqual(['é'.repeat(2048), 'second']);
	expect(JSON.stringify(result.toolResultTexts)).not.toContain('not-captured');
});

it('validates the grounding tunable and leaves the default enabled in the agent', async () => {
	const { loadConfig } = await import('../../src/config/index.js');
	expect(loadConfig({}).llm.groundingCheck).toBeUndefined();
	expect(loadConfig({ PIAGENT_GROUNDING_CHECK: '0' }).llm.groundingCheck).toBe(false);
	expect(loadConfig({ PIAGENT_GROUNDING_CHECK: '1' }).llm.groundingCheck).toBe(true);
	expect(() => loadConfig({ PIAGENT_GROUNDING_CHECK: 'false' })).toThrow(/GROUNDING_CHECK/);
});

it.each([
	['1234.5', '1234.549'], ['1234.5', '1234.451'],
	['1.234e6', '1234000'], ['Size 1.234 MiB', '1293942.784 bytes'],
	['Size 1234 bytes', '1.234 KB'], ['100.0%', '1 1'],
])('accepts precision boundary and unit forms %s', (answer, evidence) => {
	expect(checkFacts(answer, [evidence]).unsupported).toEqual([]);
});
it.each([
	['1234.5', '1234.551'], ['1234.5', '1234.449'],
	['12.34%', '0 0'], ['12345', 'x12345y'],
])('rejects mismatching boundary or embedded numbers %s', (answer, evidence) => {
	expect(checkFacts(answer, [evidence]).unsupported.length).toBeGreaterThan(0);
});
it('accepts numeric percentages returned without a unit and tool-name citations', () => {
	expect(checkFacts('`run_query` returned 12.34%.', ['PERCENT_SHARE 12.34']).unsupported).toEqual([]);
});
it('exempts a version present in evidence and flags a different version', () => {
	expect(checkFacts('Oracle 19.9.1.0.0', ['Oracle 19.9.1.0.0']).unsupported).toEqual([]);
	expect(checkFacts('Oracle 19.9.2.0.0', ['Oracle 19.9.1.0.0']).unsupported).toEqual(['19.9.2.0.0']);
});

it.each([
	['Rows approximately 282,000', 'PLAN\nRows 282K'],
	['Elapsed 1,303 seconds', 'EVENT | TIME_WAITED_MICRO\ndb file async I/O submit | 1302832724'],
	['Gets per execution 1,767', 'BUFFER_GETS | EXECUTIONS\n213839 | 121'],
	['Percentages sum to 100.00', '13.13 17.02 34.95 17.48 17.42'],
	['ROW_NUMBER() OVER (ORDER BY total) and TO_CHAR(total, \'FM999990.00\')', ''],
	['Source: `V$SQL.BUFFER_GETS`, `ALL_CONSTRAINTS`, `r_constraint_name`; OLTP, DBWR, TX.', ''],
])('normalizes generic Oracle vocabulary and derived displays: %s', (answer, evidence) => {
	expect(checkFacts(answer, [evidence]).unsupported).toEqual([]);
});
it('does not treat arbitrary dictionary views, grants or fabricated column names as constants', () => {
	expect(checkFacts('V$MADE_UP and ALL_NOT_REAL; HARNESS_LAB can read HR and IX.', []).unsupported).toEqual(['V$MADE_UP', 'ALL_NOT_REAL', 'HARNESS_LAB', 'HR', 'IX']);
});
it('keeps ratios within displayed precision and converts only labelled microsecond columns', () => {
	expect(checkFacts('Value 1,303', ['OTHER_VALUE\n1302832724']).unsupported).toEqual(['1,303']);
	expect(checkFacts('Gets 1,768', ['213839 121']).unsupported).toEqual(['1,768']);
});
it('persists only the residual count in the allowlisted audit event', async () => {
	const { JsonlAuditSink } = await import('../../src/audit/index.js');
	const { mkdtemp, readFile, rm } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(tmpdir() + '/grounding-audit-');
	try {
		const sink = new JsonlAuditSink(dir + '/audit.jsonl');
		await sink.record({ at: 'now', runId: 'test', kind: 'run_end', unverifiedCount: 2, detail: 'PROMO private value' });
		const text = await readFile(dir + '/audit.jsonl', 'utf8');
		expect(JSON.parse(text)).toEqual({ at: 'now', runId: 'test', kind: 'run_end', unverifiedCount: 2 });
	} finally { await rm(dir, { recursive: true }); }
});
