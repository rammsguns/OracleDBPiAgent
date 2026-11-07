import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
const mocks = vi.hoisted(() => ({ question: vi.fn(), close: vi.fn(), closeAll: vi.fn(), createAgent: vi.fn() }));
vi.mock('node:readline/promises', () => ({ createInterface: () => ({ question: mocks.question, close: mocks.close, on: vi.fn() }) }));
vi.mock('../../src/llm/index.js', () => ({ checkStrataHealth: vi.fn(async () => {}) }));
vi.mock('../../src/agent/index.js', () => ({ createOracleAgent: mocks.createAgent }));
vi.mock('../../src/agent/dbToolsAdapter.js', () => ({ createSessions: vi.fn(async () => ({ closeAll: mocks.closeAll })) }));
import { main } from '../../src/cli/index.js';

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

function fakeAgent(correction: boolean) {
	const subscribers: ((event: AgentEvent) => void)[] = [];
	const messages: any[] = [];
	const revision = { role: 'user', content: 'PRIVATE CORRECTION', timestamp: 0 };
	const emit = (event: any) => subscribers.forEach(subscriber => subscriber(event));
	const text = (value: string) => {
		emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: value } });
		messages.push({ role: 'assistant', content: [{ type: 'text', text: value }], usage: {} });
	};
	return {
		state: { messages }, unverified: [],
		isCorrectionMessage: (message: unknown) => message === revision,
		subscribe: (fn: (event: AgentEvent) => void) => { subscribers.push(fn); },
		prompt: async () => {
			emit({ type: 'message_start', message: { role: 'user', content: 'ordinary question' } });
			text('First answer.');
			if (correction) {
				emit({ type: 'message_start', message: revision });
				text('Final answer.');
			}
		},
	};
}

it.each(['ask', 'chat'])('separates a correction in non-JSON %s output without printing its message', async command => {
	mocks.createAgent.mockResolvedValue(fakeAgent(true));
	mocks.question.mockResolvedValueOnce('question').mockResolvedValueOnce('/exit');
	const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	await main(['node', 'piagent', command, ...(command === 'ask' ? ['question'] : [])]);
	expect(output.mock.calls.map(([value]) => value).join('')).toBe('First answer.\n\n--- Revised answer ---\nFinal answer.\n');
	expect(mocks.closeAll).toHaveBeenCalledOnce();
});
it('keeps JSON output final-only without a separator or streamed text', async () => {
	mocks.createAgent.mockResolvedValue(fakeAgent(true));
	const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	const json = vi.spyOn(console, 'log').mockImplementation(() => {});
	await main(['node', 'piagent', 'ask', 'question', '--json']);
	expect(output).not.toHaveBeenCalled();
	expect(json).toHaveBeenCalledOnce();
	expect(JSON.parse(json.mock.calls[0]![0]).answer).toBe('Final answer.');
});
it('leaves an ordinary answer unchanged', async () => {
	mocks.createAgent.mockResolvedValue(fakeAgent(false));
	const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	await main(['node', 'piagent', 'ask', 'question']);
	expect(output.mock.calls.map(([value]) => value).join('')).toBe('First answer.\n');
});
