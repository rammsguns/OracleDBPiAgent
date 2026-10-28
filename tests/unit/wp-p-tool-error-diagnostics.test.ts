import { expect, it } from 'vitest';
import { collectResult } from '../../evals/runtime.js';
import { summarizeToolErrors, toolErrorsMarkdown } from '../../evals/run.js';

const call = (id: string, name = 'run_query', args: object = { sql: 'SELECT 1 FROM dual' }) =>
	({ type: 'toolCall', id, name, arguments: args });
const result = (id: string, text: string, isError = false) =>
	({ role: 'toolResult', toolCallId: id, isError, content: [{ type: 'text', text }] });

it('matches results by ID, preserving call order, UTF-8 byte counts and short SQL', () => {
	const collected = collectResult([
		{ role: 'assistant', content: [call('a'), call('b'), call('c', 'list_objects'), call('d')] },
		result('c', 'StatementRejectedError: refused 12 statements\nprivate second line', true),
		result('b', 'ORA-00904: invalid identifier\nsecond line', true),
		result('a', 'é'),
		{ role: 'assistant', content: [{ type: 'text', text: 'done' }] },
	], ['run_query']);
	expect(collected.toolDetails).toEqual([
		{ tool: 'run_query', args: '{"sql":"SELECT 1 FROM dual"}', isError: false, resultBytes: 2 },
		{ tool: 'run_query', args: '{"sql":"SELECT 1 FROM dual"}', isError: true, error: 'ORA-00904: invalid identifier', resultBytes: 41 },
		{ tool: 'list_objects', args: '{"sql":"SELECT 1 FROM dual"}', isError: true, error: 'StatementRejectedError: refused 12 statements', resultBytes: 65 },
		{ tool: 'run_query', args: '{"sql":"SELECT 1 FROM dual"}', isError: null, resultBytes: null },
	]);
	expect(collected.toolCalls).toEqual(['run_query', 'run_query', 'list_objects', 'run_query']);
	expect(collected.executedToolCalls).toEqual(['run_query']);
});

it('caps the entire serialized arguments and first error line, omitting sensitive fields recursively', () => {
	const details = collectResult([
		{ role: 'assistant', content: [call('a', 'run_query', {
			binds: { value: 'private-bind' }, password: 'private-password', apiKey: 'private-key',
			options: { credentials: 'private-credentials', limit: 5 }, sql: 'SELECT ' + 'x'.repeat(400),
		})] },
		result('a', 'x'.repeat(250) + '\nignored', true),
	]).toolDetails[0]!;
	expect(details.args).toHaveLength(300);
	expect(details.args).toContain('"sql":"SELECT ');
	expect(details.args).toContain('"limit":5');
	expect(details.args).not.toContain('private');
	expect(details.error).toBe('x'.repeat(200));
	expect(details.resultBytes).toBe(258);
});

it('groups Oracle codes and normalized policy errors per tool and across tools', () => {
	const toolDetails = collectResult([
		{ role: 'assistant', content: [call('a'), call('b'), call('c'), call('d', 'describe_object'), call('e'), call('f')] },
		result('a', 'ORA-00904: invalid a', true),
		result('b', 'ORA-00904: invalid b', true),
		result('c', 'Policy: limit 12 reached', true),
		result('d', 'Policy: limit 34 reached', true),
		result('e', 'ok'),
	]).toolDetails;
	const summary = summarizeToolErrors([{ toolDetails }]);
	expect(summary).toEqual({
		totalCalls: 6, totalErrors: 4,
		byTool: {
			run_query: { calls: 5, errors: 3, byCode: { 'ORA-00904': 2, 'Policy: limit NN reached': 1 } },
			describe_object: { calls: 1, errors: 1, byCode: { 'Policy: limit NN reached': 1 } },
		},
		byCode: { 'ORA-00904': 2, 'Policy: limit NN reached': 2 },
	});
	expect(toolErrorsMarkdown(summary)).toContain('| run_query | ORA-00904 | 2 |');
	expect(summarizeToolErrors([])).toMatchObject({ totalCalls: 0, totalErrors: 0 });
});

it('caps normalized keys and escapes markdown cells', () => {
	const summary = summarizeToolErrors([{ toolDetails: [{
		tool: 'run_query', args: '{}', isError: true, error: 'Policy | ' + '1'.repeat(100), resultBytes: 109,
	}] }]);
	expect(Object.keys(summary.byCode)[0]).toHaveLength(80);
	expect(toolErrorsMarkdown(summary)).toContain('Policy &#124; ');
});
