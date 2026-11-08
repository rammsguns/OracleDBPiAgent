import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import { loadHardCases } from '../../evals/validate-hard.js';
import { checkNoBackupsPremise } from '../../evals/validate-p25.js';
import type { AskResult } from '../../evals/types.js';

const archived = JSON.parse(readFileSync('tests/fixtures/wp2527j/gate-answers.json', 'utf8')) as AskResult[] & { id: string }[];
const counts = [[0, 0, 0, 0]];

it('passes the two exact gate answers and rejects wrong or missing discovered facts', async () => {
	const cases = await loadHardCases();
	for (const record of archived) {
		const test = cases.find(test => test.id === record.id)!;
		const backup = record.id.includes('p25');
		const truth = backup ? counts : [['TRUE', 'PRESENT']];
		expect(score(test, record, truth).pass, record.id).toBe(true);
		const wrong = backup ? [
			...['RMAN job history', 'Datafile backups', 'Backup sets', 'Backup pieces'].flatMap(label => [
				record.answer.replace(new RegExp(`(\\| ${label} \\|[^\\n]*\\| )0( \\|)`), '$11$2'),
				record.answer.split('\n').filter(line => !line.startsWith(`| ${label} |`)).join('\n'),
			]),
			record.answer.replaceAll('NO BACKUPS RECORDED', 'BACKUP RECORDS PRESENT'),
		] : [
			record.answer.replace('`TRUE`', '`FALSE`'),
			record.answer.replace('**PRESENT**', '**NOT RECORDED**'),
			record.answer.split('\n').filter(line => !line.includes('Next run time recorded?')).join('\n'),
		];
		for (const answer of wrong) {
			expect(answer).not.toBe(record.answer);
			expect(score(test, { ...record, answer }, truth).pass, answer).toBe(false);
		}
		if (!backup) {
			const absent = { ...record, answer: record.answer.replace('**PRESENT**', '**NOT RECORDED**') };
			expect(score(test, absent, [['TRUE', 'NOT RECORDED']]).pass).toBe(true);
			expect(score(test, record, [['TRUE', 'NOT RECORDED']]).pass).toBe(false);
		}
	}
});

it('fails closed when the fixed no-backups premise changes or a source is missing', () => {
	expect(() => checkNoBackupsPremise('hard-p25-d1-no-backups-recorded', counts)).not.toThrow();
	for (let i = 0; i < 4; i++) {
		const wrong = structuredClone(counts); wrong[0]![i] = 1;
		expect(() => checkNoBackupsPremise('hard-p25-d1-no-backups-recorded', wrong)).toThrow('fixture changed');
	}
	expect(() => checkNoBackupsPremise('hard-p25-d1-no-backups-recorded', [[0, 0, 0]])).toThrow('fixture changed');
});

it('accepts only the three calibrated Phase 32 layouts and rejects their adversarial variants', async () => {
	const cases = await loadHardCases();
	const get = (id: string) => cases.find(test => test.id === id)!;
	const response = (answer: string) => ({ answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
	const p26 = get('hard-p26-p1-last-failed-job');
	const p26Truth = [['NIGHTLY_PURGE_JOB'], ['ORA-02292']];
	const p26Answer = '**Job:** NIGHTLY_PURGE_JOB\n- **Oracle error code:** `ORA-02292` (ERROR# = 2292)\nMeaning: child records remain because of a foreign key.';
	expect(score(p26, response(p26Answer), p26Truth).pass).toBe(true);
	expect(score(p26, response(p26Answer.replaceAll('ORA-02292', 'ORA-01403').replace('2292', '1403')), p26Truth).pass).toBe(false);
	const p25 = get('hard-p25-d1-last-level0');
	const p25Answer = '**NONE RECORDED** — on d1 there is no timestamp; this does not prove or guarantee a usable backup.';
	expect(score(p25, response(p25Answer), [['NONE RECORDED']]).pass).toBe(true);
	expect(score(p25, response('**NOT NONE RECORDED** — on d1; this does not prove a usable backup.'), [['NONE RECORDED']]).pass).toBe(false);
	const p30 = get('hard-p30-d1-fullest-permanent');
	const p30Answer = '**Fullest permanent tablespace: SYSAUX**\n\nClassification: LOW';
	expect(score(p30, { ...response(p30Answer), toolCalls: ['tablespace_usage'] }, [['SYSAUX', 'LOW']]).pass).toBe(true);
	expect(score(p30, { ...response(p30Answer.replace('SYSAUX', 'SYSTEM')), toolCalls: ['tablespace_usage'] }, [['SYSAUX', 'LOW']]).pass).toBe(false);
	expect(score(p30, { ...response('Fullest permanent tablespace: SYSAUX\nClassification for SYSTEM: LOW'), toolCalls: ['tablespace_usage'] }, [['SYSAUX', 'LOW']]).pass).toBe(false);
});

it('pins the calibrated definitions and the exact archived answer fixture', () => {
	const checksums = JSON.parse(readFileSync('tests/fixtures/wp2527j/checksums.json', 'utf8')) as Record<string, string>;
	// WP-31B and WP-33B add case-scoped row matchers; archived regressions remain pinned.
	checksums['evals/scoring.ts'] = '0e530b3b618841b20fdcf680bd1b1f81a8ebe8e913719bc46b8b0ddab43fc7e3';
	checksums['evals/cases-hard/phase26-jobs.json'] = '32a23b6db77a9b0d8ce6166a3ea07fc1ef4b6cf5b03ebecb71284c11a3c30b5b';
	for (const [file, expected] of Object.entries(checksums)) {
		expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(expected);
	}
});
