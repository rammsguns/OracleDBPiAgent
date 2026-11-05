import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

const test: EvalCase = {
	id: 'single-column-list', target: 'd1-19c-lab', category: 'test', question: 'test',
	groundTruth: { sql: 'SELECT event FROM example', mode: 'rowCells' },
	expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false },
};
const events = [['INSERT'], ['UPDATE'], ['DELETE']];
function matches(cell: string, rows: unknown[][] = events, evalCase = test) {
	const answer = `| Property | Value |\n|---|---|\n| Events | ${cell} |`;
	return score(evalCase, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, rows).pass;
}

it.each([
	'INSERT OR UPDATE OR DELETE', 'insert oR update Or delete',
	'`INSERT`, `UPDATE`, `DELETE`', 'INSERT,UPDATE,DELETE',
	'INSERT / UPDATE / DELETE', 'INSERT/UPDATE/DELETE',
	'INSERT and UPDATE AND DELETE', '**INSERT** OR `UPDATE` / DELETE',
])('accepts each whole event in a positive cell list: %s', cell => {
	expect(matches(cell)).toBe(true);
	for (const row of events) expect(matches(cell, [row])).toBe(true);
});

it.each([
	'INSERT OR UPDATE OR MERGE', 'INSERT OR UPDATED OR DELETE',
	'INSERTED, UPDATE, DELETE', 'INSERT / UPDATE / DELETED',
	'INSERTORUPDATEORDELETE', 'INSERT OR UPDATE OR DELETE_EXTRA',
	'INSERT OR UPDATE OR preDELETE', 'INSERT OR UPDATE OR DELETE on EMPLOYEES',
])('rejects missing events and partial words: %s', cell => {
	expect(matches(cell)).toBe(false);
});

it.each([
	'not DELETE', 'no DELETE', 'except DELETE', 'NOT DELETE',
	'INSERT OR UPDATE OR not DELETE', 'INSERT, UPDATE, no DELETE',
	'INSERT / UPDATE / except DELETE', 'not INSERT / DELETE',
	'no INSERT, DELETE', 'except INSERT and DELETE',
])('does not borrow positive evidence from a negated cell: %s', cell => {
	expect(matches(cell, [['DELETE']])).toBe(false);
});

it('does not split cells for multi-column truth or change allCells scoring', () => {
	expect(matches('INSERT OR UPDATE OR DELETE', [['INSERT', 'UPDATE']])).toBe(false);
	const allCells = { ...test, groundTruth: { ...test.groundTruth!, mode: 'allCells' as const } };
	expect(matches('not DELETE', [['DELETE']], allCells)).toBe(true);
});

it('expands labeled horizontal tables and keeps truth labels bound', () => {
	const result = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
	expect(score(test, result('| event |\n|---|\n| INSERT OR UPDATE OR DELETE |'), events).pass).toBe(true);
	expect(score(test, result('| event | other |\n|---|---|\n| MERGE OR TRUNCATE | INSERT |'), [['INSERT']]).pass).toBe(false);
});

it('replays all eight gate-16g trigger answers, preserving the substantive misses', async () => {
	const { default: fixtures } = await import('./phase17d-gate.json', { with: { type: 'json' } });
	const { default: cases } = await import('../../evals/cases-hard/phase16-plsql.json', { with: { type: 'json' } });
	const trigger = cases.find(test => test.id === 'hard-p16-security-trigger') as EvalCase;
	const truth = [['BEFORE'], ['STATEMENT'], ['EMPLOYEES'], ...events];
	for (const fixture of fixtures) {
		const result = { ...fixture, usage: { input: 0, output: 0 } };
		expect(score(trigger, result, truth).pass, fixture.file).toBe(fixture.expected);
	}
});
