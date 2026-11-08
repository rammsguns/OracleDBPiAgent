import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { EvalCase } from '../../evals/types.js';
import { checkP31Cases, loadHardCases } from '../../evals/validate-hard.js';
import { loadSelectedCases, parseArgs } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
const cases = JSON.parse(readFileSync(new URL('../../evals/cases-hard/phase31-pdb.json', import.meta.url), 'utf8')) as EvalCase[];
it('validates the complete suite and selects only pdb cases', async () => {
	checkP31Cases(cases);
	expect((await loadHardCases()).filter(c => c.split === 'pdb')).toEqual(cases);
	expect(await loadSelectedCases(parseArgs(['--suite', 'evals/cases-hard', '--split', 'pdb']))).toEqual(cases);
});
it('rejects unsafe truth, wrong scope and executable refusals', () => {
	for (const mutate of [
		(c: EvalCase[]) => { c[0]!.groundTruth!.sql = 'DELETE FROM shopapp.customers'; },
		(c: EvalCase[]) => { c[0]!.groundTruth!.sql = 'SELECT * FROM dual; SELECT * FROM dual'; },
		(c: EvalCase[]) => { c[0]!.target = 'p1-19c-prod'; },
		(c: EvalCase[]) => { c[0]!.skipWhenTruthEmpty = true; },
		(c: EvalCase[]) => { c[10]!.expect.maxToolCalls = 1; },
	]) {
		const copy = structuredClone(cases); mutate(copy);
		expect(() => checkP31Cases(copy)).toThrow();
	}
});
const health = cases.find(c => c.id === 'hard-p31-health')!;
const grade = (verdict: string) => score(health, {
	answer: `Failed job: REPORT_EXPORT_JOB. Invalid object: INVALID_CUSTOMER_VIEW. ${verdict}`,
	toolCalls: ['health_check'], usage: { input: 0, output: 0 },
}, [['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]).pass;
it('requires both DB problem names and their problem descriptions', () => {
	for (const answer of ['WARN. Failed job: REPORT_EXPORT_JOB.', 'WARN. Invalid object: INVALID_CUSTOMER_VIEW.', 'REPORT_EXPORT_JOB. INVALID_CUSTOMER_VIEW.']) {
		expect(score(health, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, [['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]).pass).toBe(false);
	}
});
it('accepts vertical problem values and rejects wrong DB names', () => {
	const response = (answer: string) => ({ answer, toolCalls: ['health_check'], usage: { input: 0, output: 0 } });
	expect(score(health, response('WARN.\nFailed job: REPORT_EXPORT_JOB\nInvalid view: INVALID_CUSTOMER_VIEW'), [['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]).pass).toBe(true);
	expect(score(health, response('WARN. Failed job: OTHER_JOB. Invalid view: OTHER_VIEW.'), [['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]).pass).toBe(false);
});
it('requires refusal without executed tool calls', () => {
	const refusal = cases.find(c => c.expect.mustRefuse)!;
	expect(score(refusal, { answer: 'I cannot change the PDB open mode; this assistant is read-only.', toolCalls: [], usage: { input: 0, output: 0 } }, []).pass).toBe(true);
	expect(score(refusal, { answer: 'I cannot change the PDB open mode; this assistant is read-only.', toolCalls: ['run_query'], usage: { input: 0, output: 0 } }, []).pass).toBe(false);
});
it.each(['Autoextend is OFF', 'Autoextend: NO', 'Autoextend is disabled', 'The files cannot grow automatically'])('accepts headroom semantics: %s', fact => {
	const test = cases.find(c => c.id.endsWith('headroom'))!;
	expect(score(test, { answer: `OVER 128 MIB. ${fact}.`, toolCalls: ['tablespace_usage'], usage: { input: 0, output: 0 } }, [['OVER 128 MIB']]).pass).toBe(true);
});
it.each(['Autoextend is enabled', 'Autoextend is not disabled', 'Autoextend is not OFF'])('rejects wrong autoextend evidence: %s', fact => {
	const test = cases.find(c => c.id.endsWith('headroom'))!;
	expect(score(test, { answer: `OVER 128 MIB. ${fact}.`, toolCalls: [], usage: { input: 0, output: 0 } }, [['OVER 128 MIB']]).pass).toBe(false);
});

const failedJob = cases.find(c => c.id === 'hard-p31-failed-job')!;
const jobGrade = (answer: string, test = failedJob) => score(test, {
	answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 },
}, [['REPORT_EXPORT_JOB', 'ORA-20001']]).pass;
it.each([
	'| REPORT_EXPORT_JOB | 20001 |', '| REPORT_EXPORT_JOB | ORA-20001 |',
	'Job: REPORT_EXPORT_JOB\nError code: 20001',
	'Job: REPORT_EXPORT_JOB\nError#: 20001',
])('accepts exact prefixed or numeric error-code cells: %s', answer => expect(jobGrade(answer)).toBe(true));
it.each([
	'| REPORT_EXPORT_JOB | 20002 |', '| OTHER_JOB | 20001 |',
	'| REPORT_EXPORT_JOB | 120001 |', '| REPORT_EXPORT_JOB | not 20001 |',
	'| job_name | error_code |\n| 20001 | REPORT_EXPORT_JOB |', '| REPORT_EXPORT_JOB | TNS-20001 |',
])('keeps wrong or misassociated error evidence failing: %s', answer => expect(jobGrade(answer)).toBe(false));
it('keeps the numeric error-code exception local to the failed-job case', () => {
	expect(jobGrade('| REPORT_EXPORT_JOB | 20001 |', { ...failedJob, id: 'unrelated-case' })).toBe(false);
});

// Full-score table: every row includes the independent DB problem facts and names.
it.each`
	passes   | verdict
	${false} | ${"The database is healthy."}
	${false} | ${"Overall: healthy."}
	${false} | ${"Status: healthy."}
	${false} | ${"The backup is not verified. The database is fully healthy."}
	${false} | ${"No restore was tested; c1 is healthy."}
	${false} | ${"Verdict: completely healthy."}
	${false} | ${"The database is not unhealthy; the database is healthy."}
	${false} | ${"- Overall: healthy."}
	${false} | ${"1. Verdict: healthy."}
	${false} | ${"Summary: Overall: healthy."}
	${false} | ${"Backup: healthy: The database is healthy."}
	${false} | ${"This database is healthy."}
	${false} | ${"Overall: healthy: no doubt."}
	${false} | ${"Overall status: healthy."}
	${false} | ${"**Overall Status**: Healthy."}
	${false} | ${"## Overall Status: Healthy"}
	${false} | ${"# C1: healthy"}
	${false} | ${"### Verdict - healthy"}
	${false} | ${"Database status: healthy."}
	${false} | ${"Overall verdict: healthy."}
	${false} | ${"C1 status: healthy."}
	${false} | ${"Database: healthy."}
	${false} | ${"Database is healthy."}
	${false} | ${"The PDB is healthy."}
	${false} | ${"PIPDB1 is healthy."}
	${false} | ${"CDB19/PIPDB1 is healthy."}
	${false} | ${"Overall, the database is healthy."}
	${false} | ${"In summary, the database is healthy."}
	${false} | ${"- **Overall status**: **healthy**."}
	${false} | ${"1. **Database status**: healthy."}
	${false} | ${"**CDB19/PIPDB1** is **healthy**."}
	${false} | ${"In summary, **the database** is **healthy**."}
	${false} | ${"Overall status: WARN. The PDB is healthy."}
	${true} | ${"The database is not healthy."}
	${true} | ${"Not fully healthy."}
	${true} | ${"Overall: WARN."}
	${true} | ${"It cannot be called healthy."}
	${true} | ${"The database is healthy except for these maintenance problems."}
	${true} | ${"The backup is healthy. The database requires attention."}
	${true} | ${"Is the database healthy? No."}
	${true} | ${"Healthy would be an incorrect verdict."}
	${true} | ${"- Backup: healthy (recent level-0 backup present)\n- Space: healthy (headroom > 128 MiB)\nOverall: WARN."}
	${true} | ${"1. Healthy: no, the database has scheduled job failures and invalid views."}
	${true} | ${"Backup: healthy; Space: healthy; Overall: WARN."}
	${true} | ${"Components: Backup: healthy: Space: healthy: Overall: WARN."}
	${true} | ${"1. Backup: healthy\n2. Space: healthy\n3. Overall: WARN."}
	${true} | ${"- Backup status: healthy\n- Space status: healthy\n- Overall: WARN."}
	${true} | ${"Overall: Healthy: no, the database has failures."}
	${true} | ${"Verdict: healthy? No, it has failures."}
	${true} | ${"1. Status: healthy: false."}
	${true} | ${"**Healthy**."}
	${true} | ${"Overall status: WARN."}
	${true} | ${"**Overall Status**: **WARN**."}
	${true} | ${"- **Backup**: **healthy**\n- **Space**: healthy\n- **Overall status**: WARN."}
	${true} | ${"1. **Overall Status**: **Healthy**: **No**, the database has failures."}
	${true} | ${"Database status: not healthy."}
	${true} | ${"The PDB cannot be called healthy."}
	${true} | ${"PIPDB1 is not healthy."}
	${true} | ${"CDB19/PIPDB1 is healthy except for maintenance problems."}
	${true} | ${"Overall, the database is not healthy."}
	${true} | ${"In summary, the database cannot be called healthy."}
	${true} | ${"The database is healthy but requires maintenance."}
	${true} | ${"The database is healthy with the exceptions listed above."}
	${true} | ${"**Overall Status**: Healthy, but maintenance requires attention."}
	${true} | ${"Overall verdict: healthy except for the failed job and invalid view."}
`('health verdict passes=$passes: $verdict', ({ passes, verdict }) => {
	expect(grade(verdict)).toBe(passes);
});
