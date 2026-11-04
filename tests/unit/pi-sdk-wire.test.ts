import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from 'typebox';
import { normalizeContext } from '@earendil-works/pi-ai';
import { loadConfig } from '../../src/config/index.js';
import { createStrataProvider } from '../../src/llm/index.js';

const directories: string[] = [];
afterEach(async () => {
	vi.unstubAllGlobals();
	await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

it.each([undefined, 512])('keeps the Strata wire contract with reasoning budget %s without network access', async budget => {
	const directory = await mkdtemp(join(tmpdir(), 'pi-wire-'));
	directories.push(directory);
	const keyFile = join(directory, 'fixture-key');
	await writeFile(keyFile, 'unit-test-only', { mode: 0o600 });
	const requests: { url: string; init: RequestInit }[] = [];
	vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		requests.push({ url, init: init ?? {} });
		if (url === 'http://127.0.0.1:8080/health') return Response.json({ status: 'ok', loaded: true });
		const chunks = [
			{ choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }] },
			{ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23, prompt_tokens_details: { cached_tokens: 12 } } },
		];
		return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
	}));
	const cfg = { ...loadConfig({}).llm, baseUrl: 'http://127.0.0.1:8080/v1', apiKeyFile: keyFile,
		maxOutputTokens: 256, temperature: 0.2, reasoningBudgetTokens: budget };
	const { model, streamFn } = await createStrataProvider(cfg);
	const parameters = Type.Object({ sql: Type.String(), limit: Type.Optional(Type.Integer()) });
	const stream = await streamFn(model, normalizeContext({ systemPrompt: 'Read only.',
		messages: [{ role: 'user', content: 'Inspect.', timestamp: 0 }],
		tools: [{ name: 'query', description: 'Read rows', parameters }],
	}), { maxTokens: 256, reasoning: 'low', identity: { attribution: null } });
	const result = await stream.result();
	expect(result.stopReason).toBe('stop');
	expect(result.content).toEqual([{ type: 'text', text: 'OK' }]);
	expect(result.usage).toMatchObject({ input: 8, output: 3, cacheRead: 12, totalTokens: 23 });
	expect(requests).toHaveLength(2);
	for (const request of requests) {
		expect(new URL(request.url).hostname).toBe('127.0.0.1');
		expect(request.init.redirect).toBe('error');
	}
	const request = requests[1]!;
	expect(request.url).toBe('http://127.0.0.1:8080/v1/chat/completions');
	expect(request.init.method).toBe('POST');
	const headers = new Headers(request.init.headers);
	expect(headers.get('authorization')).toBe('Bearer unit-test-only');
	expect(headers.get('content-type')).toBe('application/json');
	expect(headers.get('user-agent')).toMatch(/^pi\/1\.5\.0 /);
	for (const header of ['http-referer', 'x-title', 'x-opencode-session']) expect(headers.has(header)).toBe(false);
	expect(JSON.parse(String(request.init.body))).toEqual({
		model: cfg.model,
		messages: [{ role: 'developer', content: 'Read only.' }, { role: 'user', content: 'Inspect.' }],
		stream: true, stream_options: { include_usage: true }, store: false,
		max_completion_tokens: 256, temperature: 0.2, reasoning_effort: 'low',
		tools: [{ type: 'function', function: { name: 'query', description: 'Read rows', parameters } }],
		...(budget === undefined ? {} : { reasoning_budget_tokens: budget }),
	});
});
