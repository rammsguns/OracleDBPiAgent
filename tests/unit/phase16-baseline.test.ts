import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase, AskResult } from '../../evals/types.js';

const fixture: {
	records: (AskResult & { id: string; iteration: number; pass: boolean })[];
	truth: Record<string, (string | number)[][]>;
} = JSON.parse(readFileSync(new URL('./phase16-baseline.json', import.meta.url), 'utf8'));
const response = (answer: string): AskResult => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
const passes: Record<string, number[]> = {
	'hard-p16-entry-points': [],
	'hard-p16-writes': [],
	'hard-p16-purge-behavior': [],
	'hard-p16-scheduler-map': [1, 2, 3],
	'hard-p16-purge-constraint': [1, 2, 3],
	'hard-p16-purge-line': [1, 3],
	'hard-p16-history-trigger': [],
	'hard-p16-security-trigger': [2, 3],
	'hard-p16-history-arguments': [],
	'hard-p16-failed-lab-job': [1, 2, 3],
};

it('replays all thirty real answers: seven artifacts fixed and one former false positive rejected', async () => {
	const cases = await loadHardCases();
	let total = 0;
	for (const record of fixture.records) {
		const test = cases.find(c => c.id === record.id)!;
		const actual = score(test, record, fixture.truth[record.id]).pass;
		expect(actual, `${record.id} iteration ${record.iteration}`).toBe(passes[record.id]!.includes(record.iteration));
		total += Number(actual);
	}
	expect(fixture.records).toHaveLength(30);
	expect(total).toBe(13);
});

it('rejects incorrect error codes, lines, messages and statuses in each real Field/Value table', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-failed-lab-job')!;
	for (const record of fixture.records.filter(r => r.id === test.id)) {
		for (const [pattern, replacement] of [
			[/ORA-20001/g, 'ORA-02292'],
			[/at line 1/g, 'at line 27'],
			[/destination unavailable/g, 'parent key not found'],
			[/FAILED/g, 'SUCCEEDED'],
		] as const) {
			expect(score(test, response(record.answer.replace(pattern, replacement)), fixture.truth[test.id]).pass).toBe(false);
		}
	}
});

it('accepts literal invocations as routine identities, but not wrong routines or arbitrary expressions', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-scheduler-map')!;
	const record = fixture.records.find(r => r.id === test.id && r.iteration === 1)!;
	for (const wrong of ['SHOPAPP.WORKLOAD.SHIP_ORDERS(25)', 'SHOPAPP.WORKLOAD.PLACE_ORDERS(25)garbage', 'SHOPAPP.WORKLOAD.PLACE_ORDERS(other_value)']) {
		expect(score(test, response(record.answer.replace('SHOPAPP.WORKLOAD.PLACE_ORDERS(25)', wrong)), fixture.truth[test.id]).pass).toBe(false);
	}
});

it('keeps every trigger timing, granularity, event and table fact mandatory', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-security-trigger')!;
	for (const record of fixture.records.filter(r => r.id === test.id && r.iteration > 1)) {
		for (const token of ['BEFORE', 'STATEMENT', 'INSERT', 'UPDATE', 'DELETE', 'EMPLOYEES']) {
			expect(score(test, response(record.answer.replace(new RegExp(token, 'gi'), 'UNRELATED')), fixture.truth[test.id]).pass, token).toBe(false);
		}
	}
});

it('does not infer source lines from error numbers, numbering, sources, separate tables or unrelated counts', () => {
	const test: EvalCase = {
		id: 'line-evidence', target: 'd1-19c-lab', category: 'test', question: 'test',
		groundTruth: { sql: 'SELECT status,source_line FROM example', mode: 'rowCells' },
		expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false },
	};
	const table = (value: string) => `| Field | Value |\n| --- | --- |\n| Status | FAILED |\n| Source line | ${value} |`;
	for (const correct of ['1', 'line 1', 'at line 1', 'ORA-06512: at line 1']) {
		expect(score(test, response(table(correct)), [['FAILED', 1]]).pass).toBe(true);
	}
	for (const wrong of ['ORA-00001', 'ORA-06512: at line 10', 'ORA-06512: at line 1 and line 27', 'error 1']) {
		expect(score(test, response(table(wrong)), [['FAILED', 1]]).pass).toBe(false);
	}
	expect(score(test, response('| Field | Value |\n| --- | --- |\n| Status | FAILED |\n\n| Field | Value |\n| --- | --- |\n| Source line | ORA-06512: at line 1 |'), [['FAILED', 1]]).pass).toBe(false);
	expect(score(test, response('| # | Field | Value | Source |\n| --- | --- | --- | --- |\n| 1 | Status | FAILED | ORA-06512: at line 1 |'), [['FAILED', 1]]).pass).toBe(false);
	const count = { ...test, groundTruth: { sql: 'SELECT status,row_count FROM example', mode: 'rowCells' as const } };
	expect(score(count, response('| FAILED | ORA-06512: at line 1 |'), [['FAILED', 1]]).pass).toBe(false);
});

it('preserves complete operation/type fields while allowing qualified identifiers in natural prose', () => {
	const test: EvalCase = {
		id: 'identifiers', target: 'd1-19c-lab', category: 'test', question: 'test',
		groundTruth: { sql: 'SELECT operation,options FROM example', mode: 'rowCells' },
		expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false },
	};
	for (const wrong of ['| INDEX(1) | UNIQUE SCAN |', '| INDEX UNIQUE SCAN | NONE |']) {
		expect(score(test, response(wrong), [['INDEX', 'UNIQUE SCAN']]).pass).toBe(false);
	}
	const table = { ...test, groundTruth: { sql: 'SELECT table_name FROM example', mode: 'rowCells' as const } };
	expect(score(table, response('This trigger runs on HR.EMPLOYEES.'), [['EMPLOYEES']]).pass).toBe(true);
	expect(score(table, response('This trigger runs on HR.EMPLOYEES_ARCHIVE.'), [['EMPLOYEES']]).pass).toBe(false);
	const owned = { ...test, groundTruth: { sql: 'SELECT owner,table_name FROM example', mode: 'rowCells' as const } };
	expect(score(owned, response('HR owns HR.EMPLOYEES.'), [['HR', 'EMPLOYEES']]).pass).toBe(true);
	expect(score(owned, response('HR owns SH.EMPLOYEES.'), [['HR', 'EMPLOYEES']]).pass).toBe(false);
});

it('rejects an explicit false package-absence claim but permits a negated claim', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-purge-line')!;
	const record = fixture.records.find(r => r.id === test.id && r.iteration === 3)!;
	const claim = 'package body SHOPAPP.WORKLOAD no longer exists';
	expect(score(test, response(record.answer + '\nThe ' + claim + '.'), fixture.truth[test.id]).pass).toBe(false);
	for (const prefix of ['I cannot conclude that the ', 'It is not true that the ', 'I am not claiming that the ']) {
		expect(score(test, response(record.answer + '\n' + prefix + claim + '.'), fixture.truth[test.id]).pass).toBe(true);
	}
});
