import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase18-alertlog.json' with { type: 'json' };
import { score } from '../../evals/scoring.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { EvalCase } from '../../evals/types.js';
const response = (answer: string, toolCalls = ['run_query']) => ({ answer, toolCalls, usage: { input: 0, output: 0 } });

for (const test of cases as EvalCase[]) {
	const frequency = test.id.endsWith('frequent-code'), count = test.id.endsWith('incident-count'), critical = test.id.endsWith('critical-incident');
	const rows = frequency ? [['ORA-00609']] : count ? [['ORA 800', 6]] : critical ? [['ORA-00800', '225332']] : [['SHOPAPP.NIGHTLY_PURGE_JOB', 'SHOPAPP.SYS_C007669']];
	const header = frequency ? 'code' : count ? 'problem_key | incident_count' : critical ? 'code | incident_id' : 'job_name | constraint_name';
	const prose = frequency ? 'The most frequent primary error was ORA‑609.' : count ? 'Problem ORA 800 had 6 incidents.' : critical ? 'The latest critical error was ORA-800, incident 225332.' : 'SHOPAPP.NIGHTLY_PURGE_JOB failed on constraint SHOPAPP.SYS_C007669.';
	const bad = frequency ? 'ORA-600' : count ? 'ORA 800 had 16 incidents.' : critical ? 'ORA-800, incident 999999.' : 'SHOPAPP.OTHER_JOB failed on constraint SHOPAPP.SYS_C007669.';
	it(`${test.id}: accepts table and operator prose including short Oracle codes`, () => {
		const table = `| ${header} |\n| ${rows[0]!.map(() => '---').join(' | ')} |\n| ${rows[0]!.join(' | ')} |`;
		expect(score(test, response(table), rows).pass).toBe(true);
		expect(score(test, response(prose), rows).pass).toBe(true);
	});
	it(`${test.id}: rejects wrong facts, omitted facts and missing tool evidence`, () => {
		expect(score(test, response(bad), rows).pass).toBe(false);
		expect(score(test, response('No evidence available.'), rows).pass).toBe(false);
		expect(score(test, response(prose, []), rows).pass).toBe(false);
		if (!frequency) expect(score(test, response(String(rows[0]![0])), rows).pass).toBe(false);
	});
	if (frequency) it(`${test.id}: requires every tied winner and preserves code boundaries`, () => {
		const tied = [['ORA-00609'], ['ORA-00800']];
		expect(score(test, response('ORA-609 and ORA-800 tied.'), tied).pass).toBe(true);
		expect(score(test, response('ORA-609 alone.'), tied).pass).toBe(false);
		for (const answer of ['ORA-006090', 'ORA-609_extra', 'ORA-600', 'ORA-0']) expect(score(test, response(answer), rows).pass).toBe(false);
	});
}

it('normalizes Oracle codes only for p18, preserving existing split scoring', () => {
	const test = cases.find(test => test.id.endsWith('frequent-code')) as EvalCase;
	expect(score({ ...test, id: 'historical-case' }, response('ORA-609'), [['ORA-00609']]).pass).toBe(false);
});
it('keeps six safe fixed-window cases, three per target, in challenge only', () => {
	expect(cases).toHaveLength(6);
	for (const target of ['d1-19c-lab', 'p1-19c-prod']) expect(cases.filter(test => test.target === target)).toHaveLength(3);
	for (const test of cases) {
		expect(test.split).toBe('challenge');
		expect(test.groundTruth.mode).toBe('rowCells');
		expect(() => classifySql(test.groundTruth.sql)).not.toThrow();
		expect(test.groundTruth.sql).toContain('2026-11-04 00:00:00 +00:00');
		expect(test.groundTruth.sql).not.toMatch(/SYSDATE|SYSTIMESTAMP/);
		expect(test.question).not.toMatch(/RECORD_ID|LPAD|CON_ID|join|padding/i);
	}
});

it('accepts quoted Oracle job names and rejects wrong job owners or constraints', () => {
	const test = cases.find(test => test.id.endsWith('failed-job')) as EvalCase;
	const truth = [['SHOPAPP.NIGHTLY_PURGE_JOB', 'SHOPAPP.SYS_C007669']];
	expect(score(test, response('Job "SHOPAPP"."NIGHTLY_PURGE_JOB" violated "SHOPAPP"."SYS_C007669".'), truth).pass).toBe(true);
	for (const answer of ['OTHER.NIGHTLY_PURGE_JOB violated SHOPAPP.SYS_C007669.', 'SHOPAPP.NIGHTLY_PURGE_JOB violated SHOPAPP.SYS_C007668.']) expect(score(test, response(answer), truth).pass).toBe(false);
});
it('does not cross problem counts or incident mappings in labeled tables', () => {
	const count = cases.find(test => test.id.endsWith('incident-count')) as EvalCase;
	const critical = cases.find(test => test.id.endsWith('critical-incident')) as EvalCase;
	expect(score(count, response('| problem_key | incident_count |\n|---|---|\n| ORA 800 | 7 |\n| ORA 600 | 6 |'), [['ORA 800', 6], ['ORA 600', 7]]).pass).toBe(false);
	expect(score(critical, response('| code | incident_id |\n|---|---|\n| ORA-800 | 999 |\n| ORA-600 | 225332 |'), [['ORA-00800', '225332']]).pass).toBe(false);
});
