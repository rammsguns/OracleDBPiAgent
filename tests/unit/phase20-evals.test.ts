import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase20-security.json' with { type: 'json' };
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
