import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
import stored from './phase29e-round2-stored.json';
const cases: EvalCase[] = ['phase21-holdout', 'phase25-backup', 'phase26-jobs'].flatMap(name => JSON.parse(readFileSync(`evals/cases-hard/${name}.json`, 'utf8')));
const result = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
const testCase = (id: string) => cases.find(test => test.id === id)!;
it('replays the exact four B-side misses and retains the not-verifiable failure', () => {
	expect(stored).toHaveLength(5);
	for (const record of stored) {
		const truth = record.checks.filter(check => check.check.startsWith('fresh ground truth row: ')).map(check => JSON.parse(check.check.slice(24)));
		const expected = !record.answer.includes('**not verifiable from this database**');
		expect(score(testCase(record.id), { ...record, usage: { input: 0, output: 0 } }, truth).pass, record.id + record.answer).toBe(expected);
	}
});
it('matches complete numeric cells with descriptive annotations, including slashes', () => {
	const test = testCase('hard-p21-alert-levels-d1');
	const good = '| MESSAGE_LEVEL | Count |\n|---|---|\n| 1 (Critical) | 6 |\n| 16 (Informational / normal) | 6,376 |';
	const truth = [[1,6],[16,6376]];
	expect(score(test, result(good), truth).pass).toBe(true);
	for (const bad of [good.replace('1 (Critical)', '2 (Critical)'), good.replace('16 (Informational', '116 (Informational'), good.replace('6,376', '6,377'), good.replace('16 (Informational / normal)', '15 (was 16)'), good.replace('| 6 |', '| 7 (6) |')]) expect(score(test, result(bad), truth).pass, bad).toBe(false);
});
it('does not split parenthetical assignments into records or accept contradicted flags', () => {
	const test = testCase('hard-p21-products-stats');
	for (const dash of ['—','–',' - ']) {
		const answer = `| Attribute | Value |\n|---|---|\n| Statistics present? | Yes (NUM_ROWS = 5,000; LAST_ANALYZED = 2026-11-07 22:02:23) |\n| **Stale?** | **YES** ${dash} STALE_STATS = YES in ALL_TAB_STATISTICS |\n| **Global statistics?** | **YES** ${dash} GLOBAL_STATS = YES (table level, not aggregated from partitions) |`;
		expect(score(test, result(answer), [['YES','YES']]).pass, answer).toBe(true);
		for (const bad of [answer.replace('STALE_STATS = YES','STALE_STATS = NO'), answer.replace('GLOBAL_STATS = YES','GLOBAL_STATS = NO'), answer.replace('STALE_STATS = YES','not YES'), answer.replace('STALE_STATS = YES','YES is incorrect'), answer.replace('STALE_STATS = YES','actually NO'), answer.replace('**YES** '+dash+' STALE_STATS','**NO** '+dash+' STALE_STATS')]) expect(score(test, result(bad), [['YES','YES']]).pass, bad).toBe(false);
	}
});
it('requires each ordered backup source count without borrowing ordinals or other tables', () => {
	const test = testCase('hard-p25-d1-no-backups-recorded');
	const table = '| # | Source (view) | Rows |\n|---|---|---|\n| 1 | RMAN job history - V$RMAN_BACKUP_JOB_DETAILS | 0 |\n| 2 | Datafile backups - V$BACKUP_DATAFILE | 0 |\n| 3 | Backup sets - V$BACKUP_SET | 0 |\n| 4 | Backup pieces - V$BACKUP_PIECE | 0 |';
	const answer = (body: string) => `NO BACKUPS RECORDED. Control-file history cannot establish media availability.\n${body}`;
	expect(score(test, result(answer(table)), [[0,0,0,0]]).pass).toBe(true);
	for (const bad of [table.replace('| 3 | Backup sets - V$BACKUP_SET | 0 |', ''), table.replace('V$BACKUP_PIECE | 0', 'V$BACKUP_PIECE | 1'), table.replace('V$BACKUP_PIECE | 0','V$BACKUP_PIECE | not verifiable (ORA-00942)'), table.replaceAll(' | 0 |',' | unavailable |'), table.replace('RMAN job history','Backup pieces'), table.replace('| 3 | Backup sets', '\n| 3 | Backup sets')]) expect(score(test, result(answer(bad)), [[0,0,0,0]]).pass, bad).toBe(false);
	const distinct = table.replace('V$BACKUP_DATAFILE | 0', 'V$BACKUP_DATAFILE | 2').replace('V$BACKUP_SET | 0', 'V$BACKUP_SET | 3').replace('V$BACKUP_PIECE | 0', 'V$BACKUP_PIECE | 4');
	expect(score(test, result(answer(distinct)), [[0,2,3,4]]).pass).toBe(true);
	expect(score(test, result(answer(distinct)), [[0,3,2,4]]).pass).toBe(false);
});
it('accepts only bounded singular, plural or hyphenated referential explanations', () => {
	const original = testCase('hard-p26-p1-last-failed-job');
	const test = { ...original, groundTruth: undefined, expect: { ...original.expect, requiredTools: [] } };
	for (const phrase of ['child record','child records','child row','child rows','foreign key','foreign-key constraint','foreign-keys','referential integrity']) expect(score(test, result(phrase)).pass, phrase).toBe(true);
	for (const phrase of ['childish records','foreign keyboard','foreign_key','unreferential','child only','foreign constraint']) expect(score(test, result(phrase)).pass, phrase).toBe(false);
});
