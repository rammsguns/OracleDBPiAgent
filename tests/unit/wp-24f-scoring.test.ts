import { expect, it } from 'vitest';
import { checkChallengeRows } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
import cases from '../../evals/cases-hard/phase24-space.json' with { type: 'json' };
import type { EvalCase } from '../../evals/types.js';

const test: EvalCase = { id: 'slash-regression', target: 'd1-19c-lab', category: 'test', question: 'test', groundTruth: { sql: 'SELECT name AS name, value AS value FROM example', mode: 'rowCells' }, expect: { requiredFacts: [], requiredTools: [], forbiddenClaims: [], mustRefuse: false } };
const result = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });

it.each(['System I/O', 'User I/O', '/var/oracle/data', 'A/B'])('preserves the exact slash value %s in named table and inline fields', value => {
	for (const answer of [`| name | value |\n| --- | --- |\n| example | ${value} |`, `name=example / value=${value}`, `name=example; value=${value}`]) {
		expect(score(test, result(answer), [['example', value]]).pass, answer).toBe(true);
	}
});

it('rejects partial, wrong and swapped slash values', () => {
	for (const value of ['I/O', 'User I', 'User I/O extra', 'System I/O']) {
		expect(score(test, result(`| name | value |\n| example | ${value} |`), [['example', 'User I/O']]).pass).toBe(false);
	}
	expect(score(test, result('| name | value |\n| User I/O | example |'), [['example', 'User I/O']]).pass).toBe(false);
});

it('retains non-slash named field matching and contradiction rejection', () => {
	expect(score(test, result('name=example / value=Idle'), [['example', 'Idle']]).pass).toBe(true);
	expect(score(test, result('name=Idle / value=example'), [['example', 'Idle']]).pass).toBe(false);
});

it('scores redo rows separately from the scoped explicit total', () => {
	const redo = cases.find(c => c.id === 'hard-p24-d1-redo-layout')! as EvalCase;
	const truth = [[1, 1, 209715200, 1], [1, 2, 209715200, 1], [1, 3, 209715200, 1]];
	const table = '| thread_number | group_number | size_bytes | member_count |\n' + truth.map(row => `| ${row.join(' | ')} |`).join('\n');
	for (const total of ['Total groups: 3', 'Total group count: 3', '3 redo groups in total']) expect(score(redo, result(`${table}\n${total}`), truth).pass, total).toBe(true);
	for (const total of ['', 'Total groups: 4', 'Total groups: 30', 'Group 3 has 1 member']) expect(score(redo, result(`${table}\n${total}`), truth).pass, total).toBe(false);
	expect(redo.groundTruth!.sql).not.toContain('COUNT(*)');
	expect(cases.filter(c => c.expect.requiredFacts.length)).toEqual([redo]);
});

it('validates the pinned redo total against live row cardinality and shape', () => {
	const redo = cases.find(c => c.id === 'hard-p24-d1-redo-layout')! as EvalCase;
	const rows = [[1, 1, 209715200, 1], [1, 2, 209715200, 1], [1, 3, 209715200, 1]];
	expect(() => checkChallengeRows(redo, rows)).not.toThrow();
	expect(() => checkChallengeRows(redo, rows.slice(1))).toThrow('three groups');
	expect(() => checkChallengeRows(redo, rows.map(row => [...row, 3]))).toThrow('four per-group');
});
