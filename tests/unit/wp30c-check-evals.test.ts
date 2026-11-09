import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { EvalCase } from '../../evals/types.js';
import { checkP30Cases, loadHardCases } from '../../evals/validate-hard.js';
const cases = JSON.parse(readFileSync(new URL('../../evals/cases-hard/phase30-check.json', import.meta.url), 'utf8')) as EvalCase[];
it('loads health cases into the complete suite', async () => {
	expect((await loadHardCases()).filter(test => test.id.startsWith('hard-p30-'))).toEqual(cases);
});
it('fails closed when live applicability premises change', () => {
	for (const [id, value] of [['hard-p30-p1-archive-gap', 'ARCHIVELOG'], ['hard-p30-p1-recovery-config', 'CONFIGURED']]) {
		expect(() => checkP30Cases(cases, { id: id!, rows: [[value]] })).toThrow('premise changed');
	}
	expect(() => checkP30Cases(cases, { id: 'hard-p30-d1-default-password-drivers', rows: [] })).toThrow('disappeared');
});
it('rejects tool hints, writes, secret columns, silent skips and executable refusals', () => {
	for (const mutate of [
		(c: EvalCase[]) => { c[0]!.question += ' Use health_check.'; },
		(c: EvalCase[]) => { c[0]!.groundTruth!.sql = 'DELETE FROM dba_users'; },
		(c: EvalCase[]) => { c[0]!.groundTruth!.sql = 'SELECT password FROM dba_users'; },
		(c: EvalCase[]) => { c[0]!.skipWhenTruthEmpty = true; },
		(c: EvalCase[]) => { c[7]!.expect.maxToolCalls = 1; },
	]) {
		const copy = structuredClone(cases); mutate(copy);
		expect(() => checkP30Cases(copy)).toThrow();
	}
});
it('uses bounded expiry/space ranges and a complete UTC failure window', () => {
	expect(cases[2]!.groundTruth!.sql).toContain("account_status NOT LIKE '%LOCKED%'");
	expect(cases[3]!.groundTruth!.sql).toContain("log_date<FROM_TZ");
	expect(cases[4]!.groundTruth!.sql).toContain('GREATEST(f.bytes,f.maxbytes)');
});
it('grades bounded truth and rejects a wrong range or omitted default account', async () => {
	const { score } = await import('../../evals/scoring.js');
	const response = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
	expect(score(cases[2]!, response('OVER 14 DAYS'), [['OVER 14 DAYS']]).pass).toBe(true);
	expect(score(cases[2]!, response('WITHIN 3 DAYS'), [['OVER 14 DAYS']]).pass).toBe(false);
	expect(score(cases[4]!, response('SYSAUX is the fullest permanent tablespace. Classification: LOW (below 50%)'), [['SYSAUX', 'LOW']]).pass).toBe(true);
	expect(score(cases[4]!, response('| SYSAUX | HIGH |'), [['SYSAUX', 'LOW']]).pass).toBe(false);
	expect(score(cases[0]!, response('Critical: HR, SH'), [['HR'], ['SH']]).pass).toBe(true);
	expect(score(cases[0]!, response('Critical: HR'), [['HR'], ['SH']]).pass).toBe(false);
});
