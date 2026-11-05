import { expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvals } from '../../evals/run.js';
import { compare, comparePerCase, type Report } from '../../evals/compare.js';
vi.mock('../../evals/endpoint-lock.js', () => ({ acquireEndpointLock: () => () => {} }));

it.each(['before', 'after', 'disabled', 'all', 'error'] as const)('handles %s empty truth without live dependencies', async mode => {
	const suite = await mkdtemp(join(tmpdir(), 'p19-skip-'));
	const result = { answer: 'ok', toolCalls: [], toolDetails: [], toolResultTexts: [], requests: [], usage: { input: 3, output: 2, cached: 0 } };
	const ask = vi.fn(async () => result), score = vi.fn(() => ({ pass: mode !== 'disabled', checks: [] }));
	const truth = vi.fn(async (_target, sql: string) => sql === 'skip' ? [] : [[1]]);
	if (mode === 'after') truth.mockResolvedValueOnce([[1]]).mockResolvedValueOnce([]);
	if (mode === 'error') truth.mockRejectedValueOnce(new Error('driver details must not be persisted'));
	const config = { target: 'lab', question: 'test', category: 'test', expect: { mustRefuse: false }, groundTruth: { sql: 'skip', mode: 'rowCells' }, skipWhenTruthEmpty: mode !== 'disabled' };
	const cases = [{ ...config, id: 'skip' }, ...(mode === 'all' ? [] : [{ ...config, id: 'pass', groundTruth: { sql: 'pass', mode: 'rowCells' } }])];
	let report;
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await writeFile(join(suite, 'cases.json'), JSON.stringify(cases));
		report = await runEvals({ suite, repeat: 1, ids: [] }, { requireStrata: async () => ({ loaded: true, model: 'mock' }), targets: async () => [{ name: 'lab' }],
			runtime: async () => ({ ask, sessions: { closeAll: async () => {} } }), groundTruth: truth, score } as any);
		const skipping = mode !== 'disabled' && mode !== 'error';
		expect(report.skipped).toBe(skipping ? 1 : 0);
		expect(report.evaluated).toBe(mode === 'all' ? 0 : skipping ? 1 : 2);
		expect(report.passRate).toBe(mode === 'all' || mode === 'disabled' ? 0 : mode === 'error' ? .5 : 1);
		expect(ask).toHaveBeenCalledTimes(mode === 'all' ? 0 : mode === 'before' || mode === 'error' ? 1 : 2);
		expect(score).toHaveBeenCalledTimes(mode === 'all' ? 0 : skipping || mode === 'error' ? 1 : 2);
		if (mode === 'error') expect(report.records[0]).toMatchObject({ pass: false, error: 'Case failed during ground truth or agent execution' });
		if (skipping) {
			expect(report.records[0]).toMatchObject({ skipped: true, skipReason: `Empty ground truth ${mode === 'after' ? 'after' : 'before'} ask` });
			expect(report.records[0]!.usage.input).toBe(mode === 'after' ? 3 : 0);
		}
		const md = await readFile(report.resultsFile.replace(/json$/, 'md'), 'utf8');
		expect(md).toContain(`${report.skipped} skipped`);
	} finally {
		log.mockRestore(); await rm(suite, { recursive: true, force: true });
		if (report) { await rm(report.resultsFile); await rm(report.resultsFile.replace(/json$/, 'md')); }
	}
});
const make = (skip = false): Report => ({ casesSha256: 'same', records: [
	{ id: 'ok', target: 'lab', iteration: 1, pass: true, usage: { input: 20, output: 2 }, toolDetails: [] },
	{ id: 'skip', target: 'lab', iteration: 1, pass: false, skipped: skip, skipReason: skip ? 'empty truth' : undefined, usage: { input: 1000, output: 10 }, toolDetails: [] }
] });
it('excludes either-side skips from paired metrics, including tokens, and counts them separately', () => {
	const r = compare([make(true)], [make()]);
	expect(r.cases.map(c => c.case)).toEqual(['lab/ok']);
	expect(r.skipped).toEqual({ a: 1, b: 0 });
	expect(r.suite.tokens?.mean).toBe(0);
	expect(r.suite.passRate?.mean).toBe(0);
	const all = make(true); all.records[0]!.skipped = true;
	expect(compare([all], [all]).suite).toEqual({ tokens: null, passRate: null, toolErrors: null });
});
it('per-case comparison excludes skipped observations before calculating token means', () => {
	const a = make(true), b = make(true);
	a.records.push({ ...a.records[0]!, iteration: 2, skipped: true, usage: { input: 999, output: 999 } });
	const r = comparePerCase([a], [b], { samples: 100 });
	expect(r.cases).toHaveLength(1);
	expect(r.cases[0]).toMatchObject({ id: 'ok', aRuns: 1, aTokens: 22 });
	expect(r.skippedObservations).toEqual({ a: 2, b: 1 });
});
