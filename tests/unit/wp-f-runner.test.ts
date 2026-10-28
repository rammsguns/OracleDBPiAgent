import { expect, it } from 'vitest';
import { promptTurns } from '../../evals/runtime.js';

it('awaits turns sequentially on one stateful agent', async () => {
	const history: string[] = [];
	let active = false;
	const agent = { async prompt(question: string) {
		expect(active).toBe(false);
		active = true;
		await Promise.resolve();
		history.push(question);
		active = false;
	} };
	await promptTurns(agent, ['list tables', 'count those']);
	expect(history).toEqual(['list tables', 'count those']);
	await promptTurns(agent, 'another question');
	expect(history).toHaveLength(3);
});
it('rejects empty conversations before calling the agent', async () => {
	const agent = { async prompt() { throw new Error('must not run'); } };
	await expect(promptTurns(agent, [])).rejects.toThrow('nonempty');
	await expect(promptTurns(agent, ['valid', ' '])).rejects.toThrow('nonempty');
});

import { collectResult } from '../../evals/runtime.js';
it('scores the final reply but retains all turns, blocked calls and usage', () => {
	const result = collectResult([
		{ role: 'assistant', content: [{ type: 'text', text: 'earlier answer' }, { type: 'toolCall', name: 'list_objects' }], usage: { input: 10, output: 2 } },
		{ role: 'toolResult', content: [{ type: 'text', text: 'untrusted' }] },
		{ role: 'assistant', content: [{ type: 'toolCall', name: 'describe_object' }], usage: { input: 20, output: 3 } },
		{ role: 'assistant', content: [{ type: 'text', text: 'Limit reached.' }], usage: { input: 30, output: 4 } },
	], ['list_objects']);
	expect(result).toEqual({ answer: 'Limit reached.', toolCalls: ['list_objects', 'describe_object'], executedToolCalls: ['list_objects'], toolDetails: [
		{ tool: 'list_objects', args: '{}', isError: null, resultBytes: null },
		{ tool: 'describe_object', args: '{}', isError: null, resultBytes: null },
	], usage: { input: 60, output: 9, cached: 0 } });
});
it('surfaces final model errors instead of scoring earlier replies', () => {
	expect(() => collectResult([{ role: 'assistant', errorMessage: 'failed' }])).toThrow('failed');
});

import { caseLimits } from '../../evals/runtime.js';
it('isolates partial limit overrides from subsequent cases', () => {
	const defaults = { maxRows: 100, statementTimeoutSeconds: 30, maxToolResultBytes: 4000, maxToolCalls: 10, maxWallSeconds: 60 };
	expect(caseLimits(defaults, { maxToolCalls: 1 })).toEqual({ ...defaults, maxToolCalls: 1 });
	expect(caseLimits(defaults)).toEqual(defaults);
	expect(defaults.maxToolCalls).toBe(10);
});

it('sums cache reads across all assistant turns only, defaulting absent usage to zero', () => {
	const result = collectResult([
		{ role: 'user', usage: { cacheRead: 999 } },
		{ role: 'assistant', usage: { input: 10, output: 2, cacheRead: 100 } },
		{ role: 'toolResult', usage: { cacheRead: 999 } },
		{ role: 'assistant', usage: { input: 20, output: 3, cacheRead: 200 } },
		{ role: 'assistant', usage: { input: 5, output: 1 } },
		{ role: 'assistant', content: [{ type: 'text', text: 'done' }] },
	]);
	expect(result.usage).toEqual({ input: 35, output: 6, cached: 300 });
	expect(collectResult([]).usage).toEqual({ input: 0, output: 0, cached: 0 });
});
