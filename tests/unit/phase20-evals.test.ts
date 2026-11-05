import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase20-security.json' with { type: 'json' };
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';

it('keeps p20 truth read-only and excludes credential and audit activity sources', () => {
	expect(cases).toHaveLength(6);
	for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
		expect(cases.filter(test => test.target === target)).toHaveLength(3);
	}
	for (const test of cases) {
		expect(test.id).toMatch(/^hard-p20-/);
		expect(test.split).toBe('challenge');
		expect(test.groundTruth.mode).toBe('rowCells');
		expect(test.question).not.toMatch(/\b(?:DBA_\w+|V\$\w+|AUDIT_UNIFIED_\w+|run_query|security_posture)\b/i);
		const sql = test.groundTruth.sql;
		expect(() => classifySql(sql)).not.toThrow();
		expect(sql).toMatch(/^SELECT /);
		expect(sql.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(?:PASSWORD|SPARE4|AUTHENTICATION_TYPE|SYS\.USER\$|UNIFIED_AUDIT_TRAIL)\b|SELECT\s+\*/i);
		if (!/COUNT\(\*\)/.test(sql)) expect(test.skipWhenTruthEmpty).toBe(true);
	}
});

it('requires named security evidence rather than incidental numbered-list digits', () => {
	const examples: { id: string; rows: string[][]; answer: string }[] = [
		{
			id: 'hard-p20-d1-public-file-execute',
			rows: [['PUBLIC', 'SYS', 'UTL_FILE', 'EXECUTE']],
			answer: '| grantee | owner | object_name | privilege |\n| --- | --- | --- | --- |\n| PUBLIC | SYS | UTL_FILE | EXECUTE |',
		},
		{
			id: 'hard-p20-d1-open-default-count',
			rows: [['HR'], ['IX'], ['OE'], ['PM'], ['SH']],
			answer: '| username |\n| --- |\n| HR |\n| IX |\n| OE |\n| PM |\n| SH |',
		},
	];
	for (const example of examples) {
		const test = cases.find(test => test.id === example.id)! as EvalCase;
		const response = { answer: example.answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, example.rows).pass, example.id).toBe(true);
		for (const answer of ['1. I found 0 grants', '5. I found 0 open accounts', '1 grant; 5 accounts']) {
			expect(score(test, { ...response, answer }, example.rows).pass, example.id).toBe(false);
		}
		const missing = example.rows.at(-1)!.at(-1)!;
		expect(score(test, { ...response, answer: example.answer.replace(missing, 'OMITTED') }, example.rows).pass, example.id).toBe(false);
	}
});
