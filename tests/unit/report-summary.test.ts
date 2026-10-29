import { it, expect, vi, beforeEach } from 'vitest';
const fake = vi.hoisted(() => ({ provider: vi.fn(), streamFn: vi.fn(), result: vi.fn() }));
vi.mock('../../src/llm/index.js', () => ({ createStrataProvider: fake.provider }));
import { summarizeReport } from '../../src/report/summarize.js';
import type { LlmConfig } from '../../src/contracts.js';
const config = { maxOutputTokens: 1000, thinking: 'off', requestTimeoutSeconds: 10 } as LlmConfig;
beforeEach(() => { vi.clearAllMocks(); fake.provider.mockResolvedValue({ model: { id: 'local' }, streamFn: fake.streamFn }); fake.streamFn.mockResolvedValue({ result: fake.result }); fake.result.mockResolvedValue({ stopReason: 'stop', content: [{ type: 'text', text: 'See identity.' }] }); });
it('sends one Markdown input with no tools and a bounded local provider call', async () => {
	expect(await summarizeReport('# report', config)).toBe('See identity.');
	expect(fake.provider).toHaveBeenCalledExactlyOnceWith(config); expect(fake.streamFn).toHaveBeenCalledTimes(1);
	const call = fake.streamFn.mock.calls[0];
	expect(call?.[1]).toMatchObject({
		messages: [
			expect.objectContaining({
				role: 'system',
				content: expect.stringContaining('read-only diagnostic next steps only (what to query or check, and what to ask a DBA to review)'),
			}),
			expect.objectContaining({ role: 'user', content: '# report' }),
		],
	});
	const systemPrompt = call?.[1]?.messages?.find((m: { role: string }) => m.role === 'system')?.content;
	expect(systemPrompt).toContain('Do not recommend parameter changes, ALTER/DDL/DML, PL/SQL, restarts or any other change to the database');
	expect(call?.[2]).toMatchObject({ maxTokens: 1000, signal: expect.any(AbortSignal) });
});
for (const reason of ['error', 'aborted']) it(`sanitizes summary ${reason} and never retries`, async () => {
	fake.result.mockResolvedValue({ stopReason: reason, content: [], errorMessage: 'secret driver data' });
	await expect(summarizeReport('# report', config)).rejects.toThrow('Local report summary failed'); expect(fake.streamFn).toHaveBeenCalledTimes(1);
});
