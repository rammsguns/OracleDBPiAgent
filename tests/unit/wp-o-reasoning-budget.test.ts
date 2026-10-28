import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { loadTunables } from '../../src/config/tunables.js';
import { createStrataProvider } from '../../src/llm/index.js';
import { loadVariant, variantEnvironment } from '../../evals/optimize.js';

afterEach(() => vi.unstubAllGlobals());

it('validates the optional integer reasoning budget, including boundaries', () => {
	expect(loadTunables({})).not.toHaveProperty('reasoningBudgetTokens');
	for (const value of ['64', '512', '1024', '8192']) {
		expect(loadConfig({ PIAGENT_LLM_REASONING_BUDGET: value }).llm.reasoningBudgetTokens).toBe(Number(value));
	}
	for (const value of ['', ' ', '63', '8193', '512.5', 'NaN', 'Infinity', '-1', 'no']) {
		expect(() => loadTunables({ PIAGENT_LLM_REASONING_BUDGET: value })).toThrow('Invalid PIAGENT_LLM_REASONING_BUDGET');
	}
});

it('accepts both budget variants and clears inherited budgets for baseline runs', async () => {
	for (const budget of [512, 1024]) {
		const variant = await loadVariant(`evals/variants/reasoning-budget-${budget}.json`);
		expect(loadTunables(variant.env).reasoningBudgetTokens).toBe(budget);
	}
	expect(variantEnvironment({ PIAGENT_LLM_REASONING_BUDGET: '512' }, {})).toEqual({});
});

it('adds the budget only when set in actual SDK requests captured by fake fetch', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'wp-o-'));
	try {
		const apiKeyFile = join(dir, 'key');
		await writeFile(apiKeyFile, 'unit-test-placeholder');
		const bodies: string[] = [];
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok', loaded: true }));
			expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
			bodies.push(String(init?.body));
			return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
		}));
		for (const budget of [undefined, '512', '1024']) {
			const cfg = loadConfig(budget === undefined ? {} : { PIAGENT_LLM_REASONING_BUDGET: budget });
			const { model, streamFn } = await createStrataProvider({ ...cfg.llm, apiKeyFile });
			const stream = await streamFn(model, { messages: [{ role: 'user', content: 'test', timestamp: 0 }] });
			expect((await stream.result()).stopReason).toBe('stop');
		}
		const baseline = JSON.parse(bodies[0]!);
		expect(baseline).not.toHaveProperty('reasoning_budget_tokens');
		for (const [index, budget] of [[1, 512], [2, 1024]] as const) {
			const payload = JSON.parse(bodies[index]!);
			expect(payload.reasoning_budget_tokens).toBe(budget);
			delete payload.reasoning_budget_tokens;
			expect(JSON.stringify(payload)).toBe(bodies[0]);
		}
	} finally { await rm(dir, { recursive: true, force: true }); }
});
