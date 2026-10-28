import { expect, it } from 'vitest';
import { collectResult } from '../../evals/runtime.js';
import { requestUsageMarkdown, summarizeRequestUsage } from '../../evals/run.js';

it('attributes new content to each request and carries the previous assistant across user turns', () => {
	const args = { sql: 'select :value from dual', binds: { value: 'private-value' } };
	const result = collectResult([
		{ role: 'user', content: 'first' },
		{ role: 'assistant', content: [
			{ type: 'thinking', thinking: 'reason' }, { type: 'thinking', thinking: 'more' },
			{ type: 'text', text: 'look' },
			{ type: 'toolCall', name: 'run_query', id: 'a', arguments: args },
			{ type: 'toolCall', name: 'list_targets', id: 'b', arguments: {} },
		], usage: { input: 10, cacheRead: 100, output: 20 } },
		{ role: 'toolResult', toolCallId: 'a', content: [{ type: 'text', text: 'rows' }, { type: 'text', text: 'ok' }] },
		{ role: 'toolResult', toolCallId: 'b', content: [{ type: 'text', text: 'lab' }] },
		{ role: 'assistant', content: [{ type: 'thinking', thinking: 'done?' }, { type: 'text', text: 'answer' }], usage: { input: 30, cacheRead: 200, output: 5 } },
		{ role: 'user', content: [{ type: 'text', text: 'next' }, { type: 'image', data: 'ignored', mimeType: 'image/png' }, { type: 'text', text: '!' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'final' }], usage: { input: 40, output: 2 } },
	]);
	expect(result.requests).toEqual([
		{ turn: 1, input: 10, cached: 100, output: 20, newUserChars: 5, newToolResultChars: 0, prevThinkingChars: 0, prevTextChars: 0, prevToolCallArgChars: 0 },
		{ turn: 1, input: 30, cached: 200, output: 5, newUserChars: 0, newToolResultChars: 9, prevThinkingChars: 10, prevTextChars: 4, prevToolCallArgChars: JSON.stringify(args).length + 2 },
		{ turn: 2, input: 40, cached: 0, output: 2, newUserChars: 5, newToolResultChars: 0, prevThinkingChars: 5, prevTextChars: 6, prevToolCallArgChars: 0 },
	]);
	expect(JSON.stringify(result.requests)).not.toMatch(/private-value|select|reason|answer|ignored/);
	expect(summarizeRequestUsage([result])).toEqual({ count: 3, ...result.usage, newUserChars: 10, newToolResultChars: 9,
		prevThinkingChars: 15, prevTextChars: 10, prevToolCallArgChars: JSON.stringify(args).length + 2 });
});

it('keeps requests with missing or partial usage and resets absent thinking and arguments', () => {
	const { requests } = collectResult([
		{ role: 'user', content: 'é😀' },
		{ role: 'assistant', content: [{ type: 'thinking', thinking: 'abc' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { output: 3 } },
		{ role: 'assistant' },
	]);
	expect(requests).toEqual([
		{ turn: 1, input: 0, cached: 0, output: 0, newUserChars: 3, newToolResultChars: 0, prevThinkingChars: 0, prevTextChars: 0, prevToolCallArgChars: 0 },
		{ turn: 1, input: 0, cached: 0, output: 3, newUserChars: 0, newToolResultChars: 0, prevThinkingChars: 3, prevTextChars: 0, prevToolCallArgChars: 0 },
		{ turn: 1, input: 0, cached: 0, output: 0, newUserChars: 0, newToolResultChars: 0, prevThinkingChars: 0, prevTextChars: 2, prevToolCallArgChars: 0 },
	]);
	expect(collectResult([]).requests).toEqual([]);
});

it('summarizes records independently of turn numbers and renders every total', () => {
	const record = collectResult([{ role: 'user', content: 'hi' }, { role: 'assistant', usage: { input: 7, cacheRead: 11, output: 3 } }]);
	const summary = summarizeRequestUsage([record, record, { requests: [] }]);
	expect(summary).toEqual({ count: 2, input: 14, cached: 22, output: 6, newUserChars: 4, newToolResultChars: 0, prevThinkingChars: 0, prevTextChars: 0, prevToolCallArgChars: 0 });
	const markdown = requestUsageMarkdown(summary);
	expect(markdown).toContain('## Request usage');
	for (const [key, value] of Object.entries(summary)) expect(markdown).toContain(`| ${key} | ${value} |`);
	expect(summarizeRequestUsage([]).count).toBe(0);
});
