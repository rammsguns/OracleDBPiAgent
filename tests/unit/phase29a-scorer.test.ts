import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
import stored from './phase29a-stored.json';
const base: EvalCase = { id: 'numeric', target: 'd1-19c-lab', category: 'test', question: 'q', expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
const result = (answer: string) => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });
it.each(['scalar', 'allCells', 'rowCells'] as const)('compares numeric values exactly in %s', mode => {
	const test = { ...base, groundTruth: { sql: 'SELECT value FROM example', mode } };
	for (const [value, good, bad] of [[0.125, '0.125000', '0.125001'], [1082, '1,082', '11,082'], [1, '1 (Critical)', '-1 (Critical)']] as const) {
		expect(score(test, result(good), [[value]]).pass).toBe(true);
		expect(score(test, result(bad), [[value]]).pass).toBe(false);
	}
});
it('replays the stored p25 and p26 misses with archived truth', () => {
	const cases: EvalCase[] = ['phase25-backup', 'phase26-jobs'].flatMap(name => JSON.parse(readFileSync(`evals/cases-hard/${name}.json`, 'utf8')));
	for (const record of stored) {
		const test = cases.find(test => test.id === record.id)!;
		const truth = record.checks.filter(check => check.check.startsWith('fresh ground truth row: ')).map(check => JSON.parse(check.check.slice(24)));
		expect(score(test, { ...record, usage: { input: 0, output: 0 } }, truth).pass).toBe(true);
	}
});
it.each(['not REDUNDANCY 1', 'X is not REDUNDANCY 1', 'not configured as REDUNDANCY 1', 'REDUNDANCY 2, not REDUNDANCY 1'])('rejects adjacent denial: %s', answer => {
	expect(score({ ...base, groundTruth: { sql: 'SELECT value FROM example', mode: 'rowCells' } }, result(answer), [['REDUNDANCY 1']]).pass).toBe(false);
});
it('requires No to answer the guarantee question directly', () => {
	const cases: EvalCase[] = JSON.parse(readFileSync('evals/cases-hard/phase26-jobs.json', 'utf8'));
	const test = { ...cases.find(test => test.id === 'hard-p26-p1-stats-autotask')!, groundTruth: undefined, expect: { ...base.expect, requiredFacts: cases.find(test => test.id === 'hard-p26-p1-stats-autotask')!.expect.requiredFacts } };
	for (const answer of ['## Does ENABLED guarantee success?\n\n**No.** Configuration only.', 'Can it prove success?\nNo.', '## Guarantee of success\n\n**No.**']) expect(score(test, result(answer)).pass).toBe(true);
	for (const answer of ['## Does ENABLED guarantee success?\n\n**Yes.**', '## Is it disabled?\n\n**No.**', '## Does ENABLED guarantee success?\nOther discussion.\nNo.']) expect(score(test, result(answer)).pass).toBe(false);
});

it('accepts positive single-value prose with unrelated negation, but rejects wrong values', () => {
	const test = { ...base, groundTruth: { sql: 'SELECT value FROM example', mode: 'rowCells' as const } };
	for (const answer of ['RETENTION POLICY TO REDUNDANCY 1 is the default, not a setting.', 'REDUNDANCY 1 is not a setting; it is the implied default.', 'REDUNDANCY 1 retains a datafile copy / image copy; it is not an explicit setting.']) expect(score(test, result(answer), [['REDUNDANCY 1']]).pass).toBe(true);
	expect(score(test, result('RETENTION POLICY TO REDUNDANCY 2 is the default, not a setting.'), [['REDUNDANCY 1']]).pass).toBe(false);
});
