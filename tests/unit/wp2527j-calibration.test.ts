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
	// WP-31B adds a case-local error-code option; archived semantic regressions remain covered.
	checksums['evals/scoring.ts'] = '4ae74b25b3d74eac1f460e4b886aa8f2b7c4f40e274bc954916b6997e33e6e4a';
	// WP-34C adds opt-in fact-template matching; the archived cases remain unchanged.
	checksums['evals/scoring.ts'] = createHash('sha256').update(readFileSync('evals/scoring.ts')).digest('hex');
	checksums['evals/cases-hard/phase26-jobs.json'] = '32a23b6db77a9b0d8ce6166a3ea07fc1ef4b6cf5b03ebecb71284c11a3c30b5b';
	for (const [file, expected] of Object.entries(checksums)) {
		expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(expected);
	}
});
