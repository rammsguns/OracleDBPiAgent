import { spawnSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../src/config/index.js';
import { evalLlmConfig, SECONDARY_BASE_URL } from '../../src/config/eval.js';
import { evalHealth, createEvalStrataProvider } from '../../src/llm/eval.js';
import { createStrataProvider, strataFetch, checkStrataHealth } from '../../src/llm/index.js';
import { acquireEndpointLock } from '../../evals/endpoint-lock.js';
import { endpointWarnings, compare, comparePerCase, type Report } from '../../evals/compare.js';
import { parseArgs, runEvals } from '../../evals/run.js';

const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'eval-secondary-')); dirs.push(dir); return dir; }
const env = { PIAGENT_EVAL_SECONDARY_BASE_URL: SECONDARY_BASE_URL, PIAGENT_EVAL_SECONDARY_API_KEY_FILE: '/nonexistent-eval-key', PIAGENT_EVAL_SECONDARY_CONTEXT_WINDOW: '32768' };

it('keeps product config independent of all eval environment values', () => {
	expect(loadConfig(env)).toEqual(loadConfig({}));
	expect(() => loadConfig({ ...env, PIAGENT_LLM_BASE_URL: SECONDARY_BASE_URL })).toThrow();
	expect(evalLlmConfig(loadConfig({}).llm, 'primary', env)).toEqual(loadConfig({}).llm);
});
it('validates the exact secondary URL and context without exposing values', () => {
	const primary = loadConfig({}).llm;
	expect(evalLlmConfig(primary, 'secondary', env)).toMatchObject({ baseUrl: SECONDARY_BASE_URL, contextWindow: 32768 });
	for (const url of [undefined, SECONDARY_BASE_URL + '/', 'http://localhost:18080/v1', 'http://127.0.0.1:8080/v1', 'http://192.168.3.254:8080/v1', 'http://user:secret@127.0.0.1:18080/v1']) {
		expect(() => evalLlmConfig(primary, 'secondary', { ...env, PIAGENT_EVAL_SECONDARY_BASE_URL: url })).toThrow();
	}
	for (const value of ['0', '1.5', '8000', 'NaN']) expect(() => evalLlmConfig(primary, 'secondary', { ...env, PIAGENT_EVAL_SECONDARY_CONTEXT_WINDOW: value })).toThrow();
	expect(() => evalLlmConfig(primary, 'secondary', { ...env, PIAGENT_EVAL_SECONDARY_API_KEY_FILE: '' })).toThrow();
});
it('rejects secondary product provider, health and inference before any fetch', async () => {
	const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
	const cfg = evalLlmConfig(loadConfig({}).llm, 'secondary', env);
	await expect(createStrataProvider(cfg)).rejects.toThrow();
	await expect(checkStrataHealth(cfg)).rejects.toThrow();
	await expect(strataFetch(SECONDARY_BASE_URL + '/chat/completions')).rejects.toThrow();
	expect(fetch).not.toHaveBeenCalled();
});
it('requires explicit loaded and matching model, follows no redirects and records only safe fields', async () => {
	const cfg = loadConfig({}).llm;
	for (const body of [{ loaded: false, model: cfg.model }, { model: cfg.model }, { loaded: true, model: 'other' }, { loaded: true, model: cfg.model, model_loaded: false }]) {
		await expect(evalHealth(cfg, vi.fn(async () => Response.json(body)))).rejects.toThrow();
	}
	const request = vi.fn(async () => Response.json({ loaded: true, model: cfg.model, api_key: 'fake-private-value' }));
	expect(await evalHealth(cfg, request)).toEqual({ loaded: true, model: cfg.model });
	expect(request).toHaveBeenCalledWith(new URL('http://127.0.0.1:8080/health'), expect.objectContaining({ redirect: 'error' }));
	await expect(evalHealth(cfg, vi.fn(async () => { throw Error('fake-private-value'); }))).rejects.toThrow(/^Eval Strata/);
});
it('requires a private secondary key file before reading or connecting', async () => {
	const key = join(await temp(), 'key');
	await writeFile(key, 'fake-unit-test-key', { mode: 0o644 });
	const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
	await expect(createEvalStrataProvider({ ...loadConfig({}).llm, baseUrl: SECONDARY_BASE_URL, apiKeyFile: key })).rejects.toThrow('0600');
	expect(fetch).not.toHaveBeenCalled();
});
it('locks endpoints independently, refuses active or malformed locks and recovers dead PIDs', async () => {
	const dir = await temp();
	const a = acquireEndpointLock('primary', dir), b = acquireEndpointLock('secondary', dir);
	try { expect(() => acquireEndpointLock('primary', dir)).toThrow('locked'); } finally { a(); b(); }
	const release = acquireEndpointLock('primary', dir); release(); release();
	await writeFile(join(dir, 'piagent-eval-primary.lock'), '2147483647');
	acquireEndpointLock('primary', dir)();
	await writeFile(join(dir, 'piagent-eval-primary.lock'), '');
	expect(() => acquireEndpointLock('primary', dir)).toThrow('malformed');
});
it('parses endpoint selection and rejects typos', () => {
	expect(parseArgs([]).endpoint ?? 'primary').toBe('primary');
	expect(parseArgs(['--endpoint', 'secondary']).endpoint).toBe('secondary');
	expect(() => parseArgs(['--endpoint', 'other'])).toThrow('Endpoint');
});
it('warns about unequal endpoint observations in both comparison modes', () => {
	const make = (endpoint?: 'primary' | 'secondary'): Report => ({ endpoint, casesSha256: 'same', records: [{ id: 'a', target: 'lab', iteration: 1, pass: true, usage: { input: 2, output: 1 } }] });
	expect(endpointWarnings([make(), make('secondary')], [make('secondary'), make('primary')])).toEqual([]);
	expect(compare([make()], [make('secondary')]).warnings).toContainEqual(expect.stringContaining('Unequal endpoint'));
	expect(comparePerCase([make()], [make('secondary')], { samples: 100 }).warnings).toContainEqual(expect.stringContaining('Unequal endpoint'));
});
it('prechecks before runtime and releases the run lock on health failure', async () => {
	const suite = await temp();
	await writeFile(join(suite, 'case.json'), JSON.stringify([{ id: 'x', target: 'lab', question: 'x', expect: {} }]));
	const runtime = vi.fn();
	const deps = { requireStrata: vi.fn(async () => { throw Error('not loaded'); }), runtime } as any;
	await expect(runEvals({ suite, repeat: 1, ids: [], endpoint: 'secondary' }, deps)).rejects.toThrow('not loaded');
	expect(runtime).not.toHaveBeenCalled();
	const release = acquireEndpointLock('secondary'); release();
});
it('persists endpoint and a safe health snapshot from the eval precheck', async () => {
	const suite = await temp();
	await writeFile(join(suite, 'case.json'), JSON.stringify([{ id: 'x', target: 'lab', question: 'x', expect: {} }]));
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const result = await runEvals({ suite, repeat: 1, ids: [], endpoint: 'secondary' }, {
		requireStrata: async () => ({ loaded: true, model: 'test-model' }),
		targets: async () => [{ name: 'lab' }],
		runtime: async (endpoint: string) => { expect(endpoint).toBe('secondary'); return { sessions: { closeAll: async () => {} }, ask: async () => ({ answer: 'ok', toolCalls: [], toolDetails: [], requests: [], usage: { input: 1, output: 1 } }) }; },
		score: () => ({ pass: true })
	} as any);
	try {
		const saved = JSON.parse(await readFile(result.resultsFile, 'utf8'));
		expect(saved).toMatchObject({ endpoint: 'secondary', health: { loaded: true, model: 'test-model' } });
	} finally { await rm(result.resultsFile); await rm(result.resultsFile.replace(/json$/, 'md')); }
});

it('enforces the lock across OS processes and cleans it on process exit', async () => {
	const dir = await temp();
	const code = `import { acquireEndpointLock } from './evals/endpoint-lock.ts'; acquireEndpointLock('primary', ${JSON.stringify(dir)});`;
	const child = () => spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
	const release = acquireEndpointLock('primary', dir);
	try { expect(child().status).not.toBe(0); } finally { release(); }
	expect(child().status).toBe(0);
	// The child's exit handler removed its lock.
	acquireEndpointLock('primary', dir)();
});
