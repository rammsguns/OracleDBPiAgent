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

it('pins the calibrated definitions and the exact archived answer fixture', () => {
	const checksums = JSON.parse(readFileSync('tests/fixtures/wp2527j/checksums.json', 'utf8')) as Record<string, string>;
	// WP-29E replaces the scorer; semantic regressions are covered separately.
	checksums['evals/scoring.ts'] = '43bb27021e10b7ced3d57ec7d9185e5cf2646572a8a76555fb16758a5cf8f55f';
	checksums['evals/cases-hard/phase26-jobs.json'] = '806884593a65ab4d9f7163321b60cc6f35efc1897d45416ce1152ebf249d703a';
	for (const [file, expected] of Object.entries(checksums)) {
		expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(expected);
	}
});
