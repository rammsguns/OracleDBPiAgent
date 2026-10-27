import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { appendToolNotes, loadTunables } from '../../src/config/tunables.js';
import { systemPrompt } from '../../src/agent/index.js';
import { parseArgs, runEvals } from '../../evals/run.js';
import { appendLedger, leaderboard, loadVariant, parseOptimizeArgs, validateVariant, variantEnvironment, type LedgerRecord } from '../../evals/optimize.js';

const dirs: string[] = [];
const results: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
	await Promise.all(results.splice(0).flatMap(file => [rm(file, { force: true }), rm(file.replace(/json$/, 'md'), { force: true })]));
});
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'wp-i-')); dirs.push(dir); return dir; }
it('parses suite/split/repeat and existing id filters with strict errors', () => {
	expect(parseArgs([])).toEqual({ suite: 'evals/cases', repeat: 1, ids: [] });
	expect(parseArgs(['a', '--suite', 'hard', '--split', 'dev', '--repeat', '3', 'b'])).toEqual({ suite: 'hard', split: 'dev', repeat: 3, ids: ['a', 'b'] });
	for (const args of [['--split', 'test'], ['--suite'], ['--unknown'], ['--repeat', '0'], ['--repeat', '1.2'], ['--repeat', 'Infinity']]) expect(() => parseArgs(args)).toThrow();
	expect(parseOptimizeArgs(['--report']).report).toBe(true);
	expect(parseOptimizeArgs(['--variant', 'v.json', '--repeat', '2']).run.repeat).toBe(2);
	for (const args of [[], ['--variant'], ['--report', '--variant', 'v'], ['--variant', 'v', '--variant', 'w']]) expect(() => parseOptimizeArgs(args)).toThrow();
});
it('keeps defaults and validates temperature without contacting Strata', () => {
	expect(loadTunables({})).toEqual({});
	expect(loadConfig({ PIAGENT_LLM_TEMPERATURE: '0' }).llm.temperature).toBe(0);
	for (const value of ['', ' ', '-1', '2.1', 'NaN', 'Infinity']) expect(() => loadTunables({ PIAGENT_LLM_TEMPERATURE: value })).toThrow();
});
it('caps files, preserves fixed prompt first and appends only known tool descriptions', async () => {
	const file = join(await temp(), 'appendix');
	await writeFile(file, 'Concise answer guidance.');
	const config = loadConfig({ PIAGENT_PROMPT_APPENDIX_FILE: file });
	const prompt = systemPrompt({ config } as any);
	expect(prompt.indexOf('Use only read-only tools')).toBeLessThan(prompt.indexOf('Concise answer guidance.'));
	expect(prompt.endsWith('Concise answer guidance.')).toBe(true);
	await writeFile(file, JSON.stringify({ list_targets: 'Extra guidance' }));
	const notes = loadTunables({ PIAGENT_TOOL_NOTES_FILE: file }).toolNotes;
	const tools = [{ name: 'list_targets', description: 'Original' }];
	expect(appendToolNotes(tools, notes)[0]!.description).toBe('Original\n\nExtra guidance');
	expect(tools[0]!.description).toBe('Original');
	expect(() => appendToolNotes(tools, { unknown: 'x' })).toThrow('Unknown tool');
	for (const data of ['[]', 'null', '{"x":1}', 'x'.repeat(8193)]) {
		await writeFile(file, data);
		expect(() => loadTunables({ PIAGENT_TOOL_NOTES_FILE: file })).toThrow();
	}
});
it('restricts variants to tunables and keeps process environment unchanged', () => {
	for (const env of [{ PIAGENT_LLM_API_KEY_FILE: 'secret' }, { PIAGENT_DEFAULT_TARGET: 'other' }, { PIAGENT_LLM_THINKING: null }, { PIAGENT_LLM_TEMPERATURE: true }]) expect(() => validateVariant({ name: 'v', description: '', env })).toThrow();
	for (const raw of [null, [], { name: '../v', description: '', env: {} }, { name: 'v', description: '', env: {}, extra: 'x' }]) expect(() => validateVariant(raw)).toThrow();
	const base = { PIAGENT_LLM_THINKING: 'high', UNRELATED: 'preserved' };
	expect(variantEnvironment(base, {})).toEqual({ UNRELATED: 'preserved' });
	expect(base.PIAGENT_LLM_THINKING).toBe('high');
});
it('hashes variant bytes and referenced bytes and rejects traversal and symlink escapes', async () => {
	const root = await temp();
	const file = join(root, 'v.json'), appendix = join(root, 'a.txt');
	await writeFile(appendix, 'first');
	await writeFile(file, JSON.stringify({ name: 'v', description: '', env: { PIAGENT_PROMPT_APPENDIX_FILE: appendix } }));
	const initial = await loadVariant(file, root);
	expect((await loadVariant(file, root)).sha256).toBe(initial.sha256);
	await writeFile(appendix, 'second');
	expect((await loadVariant(file, root)).sha256).not.toBe(initial.sha256);
	const outside = join(await temp(), 'outside');
	await writeFile(outside, 'outside');
	await symlink(outside, join(root, 'link'));
	for (const path of [outside, join(root, 'link')]) {
		await writeFile(file, JSON.stringify({ name: 'v', description: '', env: { PIAGENT_TOOL_NOTES_FILE: path } }));
		await expect(loadVariant(file, root)).rejects.toThrow('under evals/variants');
	}
});
function record(overrides: Partial<LedgerRecord> = {}): LedgerRecord {
	return { at: 'now', variant: 'baseline', variantSha256: 'hash', gitHead: 'head', suite: 'suite', split: 'dev', repeat: 2, passRate: 1, refusalsPass: true, perCase: { case: 2 }, tokensIn: 10, tokensOut: 5, toolCalls: 2, wallMs: 10, resultsFile: 'results.json', ...overrides };
}
it('appends one ledger line per run and projects out unrelated secret fields', async () => {
	const file = join(await temp(), 'nested/ledger.jsonl');
	await appendLedger({ ...record(), secret: 'never-persist' } as any, file);
	await appendLedger(record({ variant: 'second' }), file);
	const text = await readFile(file, 'utf8');
	expect(text).not.toContain('never-persist');
	expect(text.trim().split('\n').map(line => JSON.parse(line).variant)).toEqual(['baseline', 'second']);
});
it('groups leaderboards by suite/split, disqualifies refusals, and breaks rate ties on tokens', () => {
	const report = leaderboard([record({ variant: 'bad', refusalsPass: false }), record({ variant: 'costly', tokensIn: 100 }), record({ variant: 'cheap' }), record({ variant: 'lower', passRate: 0.9, tokensIn: 1 }), record({ variant: 'holdout', split: 'holdout' })]);
	expect(report).toContain('1. cheap');
	expect(report).toContain('2. costly');
	expect(report).toContain('3. lower');
	expect(report).toContain('Disqualified (refusals): bad');
	expect(report).toContain('suite / holdout / cases unversioned\n1. holdout');
});
it('never ranks runs on different case definitions together', () => {
	const report = leaderboard([record({ variant: 'old', passRate: 1 }), record({ variant: 'new', passRate: 0.5, casesSha256: 'abcdef0123456789' })]);
	expect(report).toContain('suite / dev / cases unversioned\n1. old');
	expect(report).toContain('suite / dev / cases abcdef012345\n1. new');
});
it('runs selected cases and repeats strictly sequentially and aggregates failures and refusals', async () => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const suite = await temp();
	const make = (id: string, split: string, refuse: boolean) => ({ id, split, target: 'd1-19c-lab', question: id, expect: { mustRefuse: refuse } });
	await writeFile(join(suite, 'cases.json'), JSON.stringify([make('a', 'dev', true), make('b', 'dev', false), make('c', 'holdout', false)]));
	let active = false, calls = 0, closed = false;
	const seen: string[] = [];
	const dependencies = {
		requireStrata: async () => {}, targets: async () => [{ name: 'd1-19c-lab' }],
		runtime: async () => ({ sessions: { closeAll: async () => { closed = true; } }, ask: async (question: string) => {
			expect(active).toBe(false); active = true; calls++; seen.push(question);
			await Promise.resolve(); active = false;
			return { answer: calls === 3 ? 'fail' : 'pass', toolCalls: ['requested'], executedToolCalls: ['ran'], usage: { input: 10, output: 2 } };
		} }), groundTruth: async () => [], score: (_test: unknown, result: { answer: string }) => ({ pass: result.answer === 'pass' }),
	};
	const result = await runEvals({ suite, split: 'dev', repeat: 2, ids: ['a', 'b'] }, dependencies as any);
	results.push(result.resultsFile);
	expect(JSON.parse(await readFile(result.resultsFile, 'utf8')).passRate).toBe(0.75);
	expect(await readFile(result.resultsFile.replace(/json$/, 'md'), 'utf8')).toContain('a: 1/2\n');
	expect(seen).toEqual(['a', 'b', 'a', 'b']);
	expect(closed).toBe(true);
	expect(result).toMatchObject({ passRate: 0.75, refusalsPass: false, perCase: [{ id: 'a', passes: 1 }, { id: 'b', passes: 2 }], tokensIn: 40, tokensOut: 8, toolCalls: 4 });
});
