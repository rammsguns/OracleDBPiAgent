import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase18-alertlog.json' with { type: 'json' };
import { score } from '../../evals/scoring.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { EvalCase } from '../../evals/types.js';

for (const test of cases as EvalCase[]) {
	const code = test.id.endsWith('latest-code'), count = test.id.endsWith('incident-count');
	const rows = code ? [['ORA-00609']] : count ? [[6]] : [[225332, 'ORA 800']];
	const values = rows[0]!;
	const response = (answer: string, toolCalls = ['run_query']) => ({ answer, toolCalls, usage: { input: 0, output: 0 } });
	it(`${test.id}: accepts grounded table and prose sample answers`, () => {
		const header = code ? 'Code' : count ? 'Incident count' : 'incident_id | problem_key';
		const table = `| ${header} |\n| ${values.map(() => '---').join(' | ')} |\n| ${values.join(' | ')} |`;
		expect(score(test, response(table), rows).pass).toBe(true);
		const prose = code ? 'The newest code is ORA‑00609.' : count ? 'The incident count is 6.' : 'Incident 225332 has problem key ORA 800.';
		expect(score(test, response(prose), rows).pass).toBe(true);
	});
	it(`${test.id}: rejects wrong facts, missing evidence and incorrect associations`, () => {
		const bad = code ? 'ORA-00600' : count ? '16 incidents' : '| incident_id | problem_key |\n|---|---|\n| 225332 | ORA 600 |\n| 999999 | ORA 800 |';
		expect(score(test, response(bad), rows).pass).toBe(false);
		expect(score(test, response('No evidence available.'), rows).pass).toBe(false);
		expect(score(test, response(values.join(' | '), []), rows).pass).toBe(false);
		if (!code && !count) expect(score(test, response('Incident 225332.'), rows).pass).toBe(false);
	});
}

it('keeps all p18 cases bounded, read-only and isolated to the challenge split', () => {
	expect(cases).toHaveLength(6);
	for (const test of cases) {
		expect(test.split).toBe('challenge');
		expect(test.groundTruth.mode).toBe('rowCells');
		expect(() => classifySql(test.groundTruth.sql)).not.toThrow();
		expect(test.groundTruth.sql).toContain('2026-10-06 00:00:00 +00:00');
		expect(test.groundTruth.sql).toContain('2026-11-04 00:00:00 +00:00');
		expect(test.groundTruth.sql).not.toMatch(/SYSDATE|SYSTIMESTAMP/);
	}
});
