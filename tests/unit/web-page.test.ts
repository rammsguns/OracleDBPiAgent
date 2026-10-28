import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
// Browser modules intentionally ship directly, without TypeScript compilation.
// @ts-expect-error Plain JavaScript helpers have no generated declarations.
import { createSseParser, truncateArgs, updateTrace } from '../../src/web/static/lib.js';

describe('SSE parser', () => {
	it('handles every split of CRLF, comments, event names and multiline data', () => {
		const source = ': ping\r\nevent: text\r\ndata: first\r\ndata:second\r\n\r\nevent: done\ndata: {}\n\n';
		for (let split = 0; split <= source.length; split++) {
			const events: unknown[] = [];
			const parser = createSseParser((event: unknown) => events.push(event));
			parser.feed(source.slice(0, split)); parser.feed(source.slice(split)); parser.end();
			expect(events).toEqual([{ event: 'text', data: 'first\nsecond' }, { event: 'done', data: '{}' }]);
		}
	});
	it('handles one character chunks, defaults, empty data and standalone CR', () => {
		const events: unknown[] = [];
		const parser = createSseParser((event: unknown) => events.push(event));
		for (const char of 'ignored: x\rdata:\r\rdata: hi\n\nevent: ignored\n\ndata: unfinished') parser.feed(char);
		parser.end();
		expect(events).toEqual([{ event: 'message', data: '' }, { event: 'message', data: 'hi' }]);
	});
	it('dispatches a final CR delimiter but discards incomplete events', () => {
		const events: unknown[] = [];
		const parser = createSseParser((event: unknown) => events.push(event));
		parser.feed('data: finished\r\r'); parser.end();
		parser.feed('data: partial'); parser.end();
		expect(events).toEqual([{ event: 'message', data: 'finished' }]);
	});
	it('preserves Unicode decoded across byte boundaries', () => {
		const events: unknown[] = [], decoder = new TextDecoder();
		const parser = createSseParser((event: unknown) => events.push(event));
		for (const byte of new TextEncoder().encode('data: 🐋\n\n')) parser.feed(decoder.decode(new Uint8Array([byte]), { stream: true }));
		parser.feed(decoder.decode()); parser.end();
		expect(events).toEqual([{ event: 'message', data: '🐋' }]);
	});
});

describe('trace model', () => {
	it('matches repeated tool names without modifying previous state', () => {
		const first = updateTrace([], 'tool_start', { name: 'run_query', args: { sql: '<script>' } });
		const second = updateTrace(first, 'tool_end', { name: 'run_query', isError: true, error: 'Refused\nprivate details', resultBytes: 12 });
		const third = updateTrace(second, 'tool_start', { name: 'run_query', args: '{}' });
		const final = updateTrace(third, 'tool_end', { name: 'run_query', isError: false, resultBytes: 0 });
		expect(first[0].status).toBe('running');
		expect(final).toEqual([
			{ name: 'run_query', args: '{"sql":"<script>"}', status: 'error', error: 'Refused', resultBytes: 12 },
			{ name: 'run_query', args: '{}', status: 'ok', error: '', resultBytes: 0 },
		]);
	});
	it('retains unmatched end events', () => {
		expect(updateTrace([], 'tool_end', { name: 'db_overview', isError: false, resultBytes: 2 })[0].status).toBe('ok');
	});
	it('bounds arguments and leaves hostile markup as plain text', () => {
		expect(truncateArgs('x'.repeat(301))).toHaveLength(300);
		expect(truncateArgs('1234', 3)).toBe('12…');
		expect(truncateArgs('x', 0)).toBe('');
		expect(truncateArgs(undefined)).toBe('');
		expect(truncateArgs('<img onerror=bad>')).toBe('<img onerror=bad>');
	});
});

it('static assets exclude executable HTML sinks, dynamic code, inline handlers and external URLs', () => {
	const root = new URL('../../src/web/static/', import.meta.url);
	for (const filename of readdirSync(root)) {
		const source = readFileSync(new URL(filename, root), 'utf8');
		for (const forbidden of [/innerHTML/i, /insertAdjacentHTML/i, /document\s*\.\s*write/i, /\beval\s*\(/i, /\bnew\s+Function\s*\(/, /\bon[a-z]+\s*=/i, /https?:\/\//i, /(?:src|href)\s*=\s*["']\/\//i]) {
			expect(source, `${filename}: ${forbidden}`).not.toMatch(forbidden);
		}
		if (filename.endsWith('.html')) {
			expect(source).not.toMatch(/\bstyle\s*=/i);
			expect(source).not.toMatch(/<script\b(?![^>]*\bsrc=)[^>]*>/i);
		}
	}
});
