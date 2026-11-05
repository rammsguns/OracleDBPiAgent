import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const id = 'f1yj0hbhj9nna';
const test: EvalCase = { id: 'hard-p19-test', target: 'p1-19c-prod', category: 'test', question: 'test',
	groundTruth: { sql: 'SELECT sql_id, attached_baseline_count, attached_profile_count FROM example', mode: 'rowCells' },
	expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
const matches = (answer: string, truth: unknown[][], caseId = test.id) => score({ ...test, id: caseId }, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, truth).pass;
const bullets = '- Distinct non-null SQL plan baseline names: **0**\n- Distinct non-null SQL profile names: **0**';
it('pools labelled p19 single-record facts with an explicitly labelled cursor identity', () => {
	const answer = `| SQL_ID | child |\n|---|---|\n| ${id} | 1 |\n\n${bullets}`;
	expect(matches(answer, [[id, 0, 0]])).toBe(true);
	expect(matches(`SQL_ID = ${id}\n${bullets}`, [[id, 0, 0]])).toBe(true);
	expect(matches(answer.replace(id, '0hv5f2wh5wh2j'), [[id, 0, 0]])).toBe(false);
	expect(matches(answer, [[id, 0, 0]], 'historical')).toBe(false);
	expect(matches(answer, [[id, 0, 0], ['0hv5f2wh5wh2j', 0, 0]])).toBe(false);
	expect(matches(`SQL_ID = ${id}\n${bullets.replace('**0**', 'not 0')}`, [[id, 0, 0]])).toBe(false);
	expect(matches(`SQL_ID = ${id}\n${bullets.replace('**0**', '**1**')}`, [[id, 0, 0]])).toBe(false);
});
it('requires the runtime-discovered cursor identity in plan-controls truth', () => {
	const cases = JSON.parse(readFileSync('evals/cases-hard/phase19-sqlperf.json', 'utf8'));
	expect(cases.every((c: EvalCase) => c.skipWhenTruthEmpty)).toBe(true);
	expect(cases.find((c: EvalCase) => c.id === 'hard-p19-plan-controls').groundTruth.sql).toMatch(/^SELECT s.sql_id AS sql_id,/);
});
it('normalizes equivalent UTC-labelled p19 timestamps while preserving object association', () => {
	const truth = [['SHOPAPP', 'PRODUCTS', 'YES', '2026-11-04T22:00:07Z']];
	const answer = '| Owner | Object | Stale | Last analyzed (UTC) |\n|---|---|---|---|\n| SHOPAPP | PRODUCTS | YES | 2026-11-04 22:00:07 |';
	expect(matches(answer, truth)).toBe(true);
	expect(matches(answer.replace('(UTC)', ''), truth)).toBe(false);
	expect(matches(answer.replace('(UTC)', '(non-UTC)'), truth)).toBe(false);
	expect(matches(answer.replace('(UTC)', '(not UTC)'), truth)).toBe(false);
	expect(matches(answer, truth, 'hard-p18-test')).toBe(false);
	expect(matches(answer, truth, 'historical')).toBe(false);
	expect(matches(answer.replace('22:00:07', '22:00:08'), truth)).toBe(false);
	expect(matches(answer.replace('PRODUCTS', 'ORDERS'), truth)).toBe(false);
	expect(matches(answer.replace('22:00:07', '22:00:07+02:00'), truth)).toBe(false);
	expect(matches(answer.replace('22:00:07', '22:00:07+00:00'), truth)).toBe(true);
	expect(matches(answer.replace('(UTC)', '').replace('22:00:07', '22:00:07Z'), truth)).toBe(true);
});
it('does not pool multi-row object facts across timestamps', () => {
	const truth = [['PRODUCTS', '2026-11-04T22:00:07Z'], ['IDX', '2026-11-04T23:00:07Z']];
	expect(matches('All timestamps are UTC\n| PRODUCTS | 2026-11-04 23:00:07 |\n| IDX | 2026-11-04 22:00:07 |', truth)).toBe(false);
});
