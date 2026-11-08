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
it.each([
	'The database is healthy.', 'Overall: healthy.', '**Healthy**.',
	'The backup is not verified. The database is fully healthy.',
	'No restore was tested; c1 is healthy.', 'Verdict: completely healthy.',
	'The database is not unhealthy; the database is healthy.',
])('rejects unqualified health verdict: %s', verdict => expect(grade(verdict)).toBe(false));
it.each([
	'The database is not healthy.', 'Not fully healthy.', 'Overall: WARN.',
	'It cannot be called healthy.', 'The database is healthy except for these maintenance problems.',
	'The backup is healthy. The database requires attention.',
	'Is the database healthy? No.', 'Healthy would be an incorrect verdict.',
])('accepts negation and qualified/component verdicts: %s', verdict => expect(grade(verdict)).toBe(true));
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
