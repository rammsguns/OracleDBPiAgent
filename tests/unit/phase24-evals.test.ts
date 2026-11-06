import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase24-space.json' with { type: 'json' };
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { checkP24Stability } from '../../evals/validate-p24.js';
import { parseArgs, loadSelectedCases } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

it('selects only p24 and intersects split and explicit IDs without an LLM', async () => {
	const options = parseArgs(['--suite', 'p24', '--split', 'challenge']);
	expect((await loadSelectedCases(options)).map(test => test.id)).toEqual(cases.map(test => test.id));
	await expect(loadSelectedCases({ ...options, ids: ['hard-p23-d1-commit-events'] })).rejects.toThrow('No eval cases selected');
	expect(await loadSelectedCases({ ...options, ids: [cases[0]!.id] })).toHaveLength(1);
	await expect(loadSelectedCases({ ...options, split: 'dev' })).rejects.toThrow('No eval cases selected');
});

it('keeps full-suite invariants and rejects missing membership and forbidden views', async () => {
	const all = await loadHardCases();
	expect(cases).toHaveLength(6);
	expect(() => checkHardCases(all.filter(test => test.id !== cases[0]!.id))).toThrow('six cases');
	for (const sql of ['SELECT bytes FROM dba_extents', 'SELECT snap_id FROM dba_hist_snapshot', 'SELECT sample_id FROM v$active_session_history']) {
		const unsafe = structuredClone(all);
		unsafe.find(test => test.id === cases[0]!.id)!.groundTruth!.sql = sql;
		expect(() => checkHardCases(unsafe)).toThrow(/Forbidden Phase 24|Diagnostics Pack/);
	}
	const hinted = structuredClone(all);
	hinted.find(test => test.id === cases[0]!.id)!.question = 'Use run_query';
	expect(() => checkHardCases(hinted)).toThrow('must not name');
});

it('fails closed on changed, missing or duplicate stability samples', () => {
	const first = cases.map(test => ({ id: test.id, rows: [['value']] }));
	expect(() => checkP24Stability(first, structuredClone(first))).not.toThrow();
	const changed = structuredClone(first);
	changed[0]!.rows = [['changed']];
	expect(() => checkP24Stability(first, changed)).toThrow('Unstable p24 truth');
	expect(() => checkP24Stability(first, first.slice(1))).toThrow('six');
	expect(() => checkP24Stability(first, [...first.slice(1), first[1]!])).toThrow('six');
});

it('records two stable live samples at least 60 seconds apart and scores every row', async () => {
	const report = JSON.parse(await readFile(new URL('../../docs/wp-24d-p24-truth-stability.json', import.meta.url), 'utf8'));
	expect(Date.parse(report.second.startedAt) - Date.parse(report.first.completedAt)).toBeGreaterThanOrEqual(60_000);
	checkP24Stability(report.first.records, report.second.records);
	for (const test of cases) {
		const rows: unknown[][] = report.first.records.find((record: { id: string }) => record.id === test.id).rows;
		const result = { answer: rows.map(row => row.join(' | ')).join('\n') + (test.id === 'hard-p24-d1-redo-layout' ? '\nTotal groups: 3' : ''), toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test as EvalCase, result, rows).pass, test.id).toBe(true);
		expect(score(test as EvalCase, { ...result, answer: rows.slice(1).map(row => row.join(' | ')).join('\n') }, rows).pass, test.id).toBe(false);
	}
});
