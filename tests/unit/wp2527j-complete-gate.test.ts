import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import { loadHardCases } from '../../evals/validate-hard.js';
import type { AskResult } from '../../evals/types.js';

const records = JSON.parse(readFileSync('tests/fixtures/wp2527j/all-gate-answers.json', 'utf8')) as (AskResult & { id: string; source: string; checks: { check: string; pass: boolean }[] })[];
const labels = ['RMAN job history', 'Datafile backups', 'Backup sets', 'Backup pieces'];
export function projectedTruth(record: typeof records[number]): unknown[][] {
	const rows = record.checks.filter(c => c.check.startsWith('fresh ground truth row: ')).map(c => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
	if (record.id.endsWith('no-backups-recorded')) return rows.map(row => row.slice(1));
	if (record.id.endsWith('retention-setting')) return rows.flatMap(row => [[row[1]], [row[2]]]);
	if (record.id.endsWith('last-failed-job')) return rows.flatMap(row => [[row[0]], [row[1]]]);
	if (record.id.endsWith('invalid-objects')) return rows.map(row => [row[1]]);
	if (record.id.endsWith('stats-autotask')) return rows.map(row => [row[1]]);
	if (record.id.endsWith('next-run-semantics')) return rows.map(row => row.slice(2));
	return rows;
}

it('replays every p25–p27 answer in every completed gate file without hiding genuine failures', async () => {
	const cases = await loadHardCases();
	for (const record of records) {
		const test = cases.find(test => test.id === record.id)!;
		const expected = test.category === 'grant-limited-p1' ? record.checks.every(c => c.pass) : !record.id.startsWith('hard-p27-refuse-') && !(record.id.endsWith('retention-setting') && record.answer.includes('RECOVERY WINDOW OF 7 DAYS'));
		expect(score(test, record, projectedTruth(record)).pass, `${record.source}: ${record.id}`).toBe(expected);
	}
});

it('rejects wrong discovered values in every stored answer for the calibrated cases', async () => {
	const cases = await loadHardCases();
	for (const record of records) {
		const test = cases.find(test => test.id === record.id)!;
		let wrong: string | undefined;
		if (record.id.endsWith('retention-setting')) wrong = record.answer.replace(/REDUNDANCY\s+1\b/gi, 'RECOVERY WINDOW OF 7 DAYS');
		if (record.id.endsWith('last-failed-job')) wrong = record.answer.replace(/ORA-02292|\b2292\b/g, 'ORA-01403');
		if (record.id.endsWith('invalid-objects')) wrong = record.answer.replace(/\b0\b/g, '99');
		if (record.id.endsWith('stats-autotask')) wrong = record.answer.replace(/\bENABLED\b/gi, 'DISABLED');
		if (record.id.endsWith('next-run-semantics')) wrong = record.answer.replace(/\bPRESENT\b/g, 'NOT RECORDED');
		if (record.id.endsWith('no-backups-recorded')) {
			const dataLines = record.answer.split('\n').filter(line => line.trim().startsWith('|') && /(?:\b0\b)/.test(line));
			expect(dataLines).toHaveLength(4);
			for (const line of dataLines) {
				for (const answer of [record.answer.replace(line, line.replace(/\b0\b/, '99')), record.answer.replace(line, '')]) {
					expect(score(test, { ...record, answer }, projectedTruth(record)).pass, record.source).toBe(false);
				}
			}
		}
		if (wrong !== undefined) expect(score(test, { ...record, answer: wrong }, projectedTruth(record)).pass, `${record.source}: ${record.id}`).toBe(false);
	}
});

it('accepts ordinary negation of historical coverage and rejects affirmative coverage for all p27 refusals', async () => {
	for (const test of (await loadHardCases()).filter(test => test.id.startsWith('hard-p27-refuse-'))) {
		const prefix = 'I cannot execute that request. Use piagent top for a live interval.\n';
		for (const coverage of [
			"| **What you don't get** | Historical ASH samples from the past hour |",
			'You do not get historical samples.',
			'You don’t get historical samples.',
			'The live command runs without historical samples.',
			'Historical coverage isn’t available.',
			'Historical coverage is not available.',
		]) expect(score(test, { answer: prefix + coverage, toolCalls: [], usage: { input: 0, output: 0 } }).pass, coverage).toBe(true);
		for (const coverage of [
			'Historical samples ARE available.',
			'Historical coverage IS available for the past hour.',
			'You get historical ASH samples from the past hour.',
			'You get historical samples now.',
		]) expect(score(test, { answer: prefix + coverage, toolCalls: [], usage: { input: 0, output: 0 } }).pass, coverage).toBe(false);
	}
});
