import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import { loadHardCases } from '../../evals/validate-hard.js';
import type { EvalCase } from '../../evals/types.js';
const test: EvalCase = { id: 'row', target: 'd1-19c-lab', category: 'test', question: 'q', groundTruth: { sql: 'SELECT 1 FROM dual', mode: 'rowCells' }, expect: { requiredFacts: [], requiredTools: [], forbiddenClaims: [], mustRefuse: false } };
const result = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
const truth = [['Alpha', 55500, 1.2], ['Beta', 100, 2]];
it.each([
	'| Alpha | 55,500 | 1.200 |\n| Beta | 100.0 | 2.00 |',
	'- NAME=Alpha / N=55,500 / RATE=1.2\n- NAME=Beta / N=100 / RATE=2',
	'NAME=Alpha; N=55500; RATE=1.20\nNAME=Beta; N=100; RATE=2',
	'Alpha has 55,500 and 1.2.\nBeta has 100 and 2.',
])('accepts a correct layout: %s', answer => expect(score(test, result(answer), truth).pass).toBe(true));
it.each([
	'Alpha | 100 | 1.2\nBeta | 55500 | 2',
	'Alpha | 55500 | 1.2',
	'Alpha\n55500\n1.2\nBeta\n100\n2',
	'Alphas | 55500 | 1.2\nBeta | 100 | 2',
	'Alpha | 555000 | 1.2\nBeta | 100 | 2',
])('rejects missing or mismatched values: %s', answer => expect(score(test, result(answer), truth).pass).toBe(false));
it('rejects empty and null truth and preserves duplicate-value multiplicity', () => {
	expect(score(test, result('anything'), []).pass).toBe(false);
	expect(score(test, result('null'), [[null]]).pass).toBe(false);
	expect(score(test, result('| A | 1 |'), [['A', 1, 1]]).pass).toBe(false);
});
it('leaves allCells loose matching unchanged and scalar range scoring unchanged', () => {
	const allCells: EvalCase = { ...test, groundTruth: { ...test.groundTruth!, mode: 'allCells' } };
	expect(score(allCells, result('Alpha\n55500\n1.2\nBeta\n100\n2'), truth).pass).toBe(true);
	const scalar: EvalCase = { ...test, groundTruth: { ...test.groundTruth!, mode: 'scalar' } };
	expect(score(scalar, result('105 rows'), [[100]], [[110]]).pass).toBe(true);
	expect(score(scalar, result('111 rows'), [[100]], [[110]]).pass).toBe(false);
});
it('scores the actual baseline answers: correct answers pass, merged plan operation fails', async () => {
	const cases = await loadHardCases();
	const answers: { id: string; iteration: number; answer: string; toolCalls: string[] }[] = JSON.parse(readFileSync('tests/fixtures/phase11-baseline-answers.json', 'utf8'));
	const truths: { id: string; rows: unknown[][] }[] = JSON.parse(readFileSync('tests/fixtures/phase11-truth.json', 'utf8'));
	for (const answer of answers) {
		const item = cases.find(item => item.id === answer.id)!;
		const rows = truths.find(item => item.id === answer.id)!.rows;
		const scored = score(item, { ...answer, usage: { input: 0, output: 0 } }, rows);
		expect(scored.pass, `${answer.id} iteration ${answer.iteration}: ${JSON.stringify(scored.checks.filter(check => !check.pass))}`).toBe(!(answer.id === 'hard-p11-plan-line-tree' && answer.iteration === 2));
	}
});
it('keeps different records on one physical line separate', () => {
	const rows = [['Alpha', 100], ['Beta', 200]];
	for (const answer of ['NAME=Alpha / N=200; NAME=Beta / N=100', '| Alpha | 200 | | Beta | 100 |', 'NAME=Alpha / N=200 / NAME=Beta / N=100']) {
		expect(score(test, result(answer), rows).pass).toBe(false);
	}
});
it('handles negative numbers and numeric text without accepting a longer value', () => {
	expect(score(test, result('| A | −1,234.500 |'), [['A', '-1234.5']]).pass).toBe(true);
	expect(score(test, result('| A | -1234.5001 |'), [['A', '-1234.5']]).pass).toBe(false);
});
it('matches generic transposed Attribute/Value row labels through the real p26 case', async () => {
	const cases = await loadHardCases();
	const nextRun = cases.find(item => item.id === 'hard-p26-p1-next-run-semantics')!;
	const truth = [['TRUE', 'PRESENT']];
	const scored = (answer: string) => score(nextRun, { ...result(answer), toolCalls: ['run_query'] }, truth).pass;
	const correct = `## SHOPAPP.NIGHTLY_PURGE_JOB on p1-19c-prod

| Attribute | Value |
|-----------|-------|
| **Enabled** | Yes (\`TRUE\`) |
| **Next Run Time** | PRESENT |

### Interpretation of the Recorded Next Run Time

The \`NEXT_RUN_DATE\` value in \`DBA_SCHEDULER_JOBS\` is a **scheduler estimate**, not a guarantee of actual execution or success. Specifically:

- **What it means:** It is the next time the Oracle Scheduler *intends* to fire the job, computed from the job's schedule (frequency, calendar, or interval). It is derived purely from the schedule definition and does not account for runtime conditions.
- **What it does NOT guarantee:**
  - The job will actually start at that time (the scheduler job slave process may be unavailable, the job queue may be full, or the job coordinator may be delayed).
  - The job will succeed (it may fail due to errors in its PL/SQL body, dependency failures, resource constraints, etc.).
  - The value won't change before execution (if the schedule is modified, the job is disabled/re-enabled, or a calendar expression shifts, the next-run date is recalculated).

In short, a recorded \`NEXT_RUN_DATE\` confirms the scheduler has a future firing time planned; it is a **planned estimate**, not a commitment that the job will execute at that moment or complete successfully.`;
	expect(scored(correct)).toBe(true);
	const explanation = 'This is an estimate, not a guarantee of success or execution.\n';
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled | TRUE |\n| Next Run Time | NOT RECORDED |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled | TRUE |\n| Owner | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Owner | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Owner (ENABLED) | TRUE |\n| Next Run Time | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled | Not TRUE |\n| Next Run Time | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled | TRUE — not TRUE |\n| Next Run Time | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled status owner | TRUE |\n| Next Run Time | PRESENT |')).toBe(false);
	expect(scored(explanation + '| Attribute | Value |\n|---|---|\n| Enabled | TRUE |\n| Next Runaway Time | PRESENT |')).toBe(false);
	for (const label of ['Not Enabled', 'No Enabled', 'Non Enabled', 'Never Enabled', 'Un-enabled', 'Enabled was', 'Formerly Enabled', 'Previous Enabled', 'Previously Enabled', 'Last Enabled', 'Prior Enabled', 'Old Enabled', 'Former Enabled']) {
		expect(scored(explanation + `| Attribute | Value |\n|---|---|\n| ${label} | TRUE |\n| Next Run Time | PRESENT |`), label).toBe(false);
	}
	for (const table of [
		'| Attribute | Value |\n|---|---|\n| Enabled | TRUE |\n| Enabled | FALSE |\n| Next Run Time | PRESENT |',
		'| Attribute | Value |\n|---|---|\n| Enabled | FALSE |\n| Enabled | TRUE |\n| Next Run Time | PRESENT |',
	]) expect(scored(explanation + table), table).toBe(false);
});
it('assigns swapped RUN and NEXT_RUN rows by exact label before subset matches', () => {
	const runCase: EvalCase = { ...test, groundTruth: { sql: 'SELECT run AS run, next_run AS next_run FROM dual', mode: 'rowCells' } };
	const rows = [['RUN_VALUE', 'NEXT_RUN_VALUE']];
	const answer = '| Attribute | Value |\n|---|---|\n| Next Run Time | NEXT_RUN_VALUE |\n| Run | RUN_VALUE |';
	expect(score(runCase, result(answer), rows).pass).toBe(true);
});
it('accepts an asserted NO with a positive repeated dash annotation', () => {
	const noCase: EvalCase = { ...test, groundTruth: { sql: 'SELECT stale_stats, global_stats FROM dual', mode: 'rowCells' } };
	expect(score(noCase, result('| Attribute | Value |\n|---|---|\n| Stale Stats | NO — STALE_STATS = NO |\n| Global Stats | NO — GLOBAL_STATS = NO |'), [['NO', 'NO']]).pass).toBe(true);
});
it('normalizes numeric text in prose without losing precision', () => {
	expect(score(test, result('Alpha has 1.2000 and −55,500.00.'), [['Alpha', '1.2', -55500]]).pass).toBe(true);
	expect(score(test, result('| A | 9007199254740993 |'), [['A', '9007199254740992']]).pass).toBe(false);
});
