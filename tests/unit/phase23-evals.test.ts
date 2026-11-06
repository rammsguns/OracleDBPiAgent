import { expect, it } from 'vitest';
import cases from '../../evals/cases-hard/phase23-sessions.json' with { type: 'json' };
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import { checkHardCases, loadHardCases } from '../../evals/validate-hard.js';
import { checkP23Stability } from '../../evals/validate-p23.js';
import { parseArgs, loadSelectedCases } from '../../evals/run.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

it('keeps six stable SELECT-only challenges balanced across the approved targets', () => {
	expect(cases).toHaveLength(6);
	for (const target of ['d1-19c-lab', 'p1-19c-prod']) expect(cases.filter(test => test.target === target)).toHaveLength(3);
	for (const test of cases) {
		expect(test.id).toMatch(/^hard-p23-/);
		expect(test.split).toBe('challenge');
		expect(test.groundTruth.mode).toBe('rowCells');
		expect(test.question).not.toMatch(/\b(?:V\$\w+|DBA_\w+|run_query|session_activity)\b/i);
		expect(() => classifySql(test.groundTruth.sql)).not.toThrow();
		expect(test.groundTruth.sql).toMatch(/^SELECT /);
		expect(test.groundTruth.sql).not.toMatch(/SELECT\s+\*|\b(?:MODULE|ACTION|CLIENT_INFO|CLIENT_IDENTIFIER|P1TEXT|SQL_TEXT|VALUE_STRING|DBA_HIST_\w*|V\$ACTIVE_SESSION_HISTORY|V\$SESSION|V\$TRANSACTION)\b/i);
	}
});

it('rejects unstable or missing samples instead of silently refreshing truth', () => {
	const first = cases.map(test => ({ id: test.id, rows: [['Application']] }));
	expect(() => checkP23Stability(first, structuredClone(first))).not.toThrow();
	const changed = structuredClone(first);
	changed[0]!.rows = [['Concurrency']];
	expect(() => checkP23Stability(first, changed)).toThrow('Unstable p23 truth');
	expect(() => checkP23Stability(first, first.slice(1))).toThrow('six');
});

it('selects p23 and intersects explicit IDs before any Strata preflight', async () => {
	const options = parseArgs(['--suite', 'p23', '--split', 'challenge']);
	expect((await loadSelectedCases(options)).map(test => test.id)).toEqual(cases.map(test => test.id));
	await expect(loadSelectedCases({ ...options, ids: ['hard-p20-d1-open-default-count'] })).rejects.toThrow('No eval cases selected');
	expect(await loadSelectedCases({ ...options, ids: [cases[0]!.id] })).toHaveLength(1);
	await expect(loadSelectedCases({ ...options, split: 'dev' })).rejects.toThrow('No eval cases selected');
});

it('requires each event to stay associated with its defined wait class', () => {
	const test = cases.find(test => test.id === 'hard-p23-d1-commit-events')! as EvalCase;
	const truth = [['log file parallel write', 'System I/O'], ['log file sync', 'Commit']];
	const result = { answer: truth.map(row => row.join(' | ')).join('\n'), toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
	expect(score(test, result, truth).pass).toBe(true);
	expect(score(test, { ...result, answer: 'log file parallel write | Commit\nlog file sync | System I/O' }, truth).pass).toBe(false);
	expect(score(test, { ...result, answer: '1. Commit\n2. System I/O' }, truth).pass).toBe(false);
});

it('enforces p23 membership and column restrictions in validate-hard', async () => {
	const all = await loadHardCases();
	expect(() => checkHardCases(all.filter(test => test.id !== cases[0]!.id))).toThrow('six cases');
	const unsafe = structuredClone(all);
	unsafe.find(test => test.id === cases[0]!.id)!.groundTruth!.sql = 'SELECT module AS module FROM v$session';
	expect(() => checkHardCases(unsafe)).toThrow('Forbidden Phase 23');
});

it('scores every recorded live truth and rejects a missing row', async () => {
	const { readFile } = await import('node:fs/promises');
	const report = JSON.parse(await readFile(new URL('../../docs/wp-23d-p23-truth-stability.json', import.meta.url), 'utf8'));
	for (const test of cases) {
		const rows: unknown[][] = report.first.records.find((record: { id: string }) => record.id === test.id).rows;
		const result = { answer: rows.map(row => row.join(' | ')).join('\n'), toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test as EvalCase, result, rows).pass, test.id).toBe(true);
		expect(score(test as EvalCase, { ...result, answer: rows.slice(1).map(row => row.join(' | ')).join('\n') }, rows).pass, test.id).toBe(false);
	}
});

it('preserves literal SQL*Net only in p23 without accepting a misspelled event', () => {
	const test = cases.find(test => test.id === 'hard-p23-p1-lock-idle-events')! as EvalCase;
	const rows = [['SQL*Net message from client', 'Idle']];
	const result = { answer: '| **SQL*Net message from client** | `Idle` |', toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
	expect(score(test, result, rows).pass).toBe(true);
	expect(score(test, { ...result, answer: '| SQLNet message from client | Idle |' }, rows).pass).toBe(false);
	expect(score({ ...test, id: 'hard-historical-event' }, result, rows).pass).toBe(false);
});
