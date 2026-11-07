import { expect, it } from 'vitest';
import { markdownTable, markdownNumber } from '../../src/backup/markdown.js';
import { formatDuration } from '../../src/jobs/duration.js';
import { sampleTop, renderTop } from '../../src/top/index.js';
import type { OracleSession } from '../../src/contracts.js';

it('renders contiguous escaped tables with byte units, empty sets and explicit omitted counts', () => {
	expect(markdownTable([])).toBe('None.');
	const table = markdownTable(Array.from({ length: 102 }, () => ({ 'name|': '<x>&|\nnext', OUTPUT_BYTES: 1024 })));
	expect(table).toContain('name&#124;');
	expect(table).toContain('&lt;x&gt;&amp;&#124;<br>next');
	expect(table).toContain('1 KiB');
	expect(table).toContain('2 more rows; use --json');
	expect(table).not.toMatch(/\|\n\n\|/);
});
it.each([
	[{ days: 0, hours: 0, minutes: 0, seconds: 0, fseconds: 123000000 }, '0:00:00.123'],
	[{ days: 1, hours: 2, minutes: 3, seconds: 4, fseconds: 0 }, '1d 02:03:04'],
	[{ days: 0, hours: 0, minutes: 0, seconds: -1, fseconds: -1 }, '-0:00:01.000000001'],
	['0:00:00', '0:00:00'],
	[null, null],
])('formats interval display while preserving input: %j', (input, expected) => {
	const before = JSON.stringify(input);
	expect(formatDuration(input)).toBe(expected);
	expect(JSON.stringify(input)).toBe(before);
});
it('labels non-CDB scope for all consumers and renders empty rankings and host bytes', async () => {
	const session = { target: { name: 'lab' }, identity: { isCdb: false }, query: async (sql: string) => ({ rows: sql.includes('OSSTAT') ? [['PHYSICAL_MEMORY_BYTES', 1024, 'NO']] : [], truncated: false }) } as unknown as OracleSession;
	let time = 0;
	const result = await sampleTop(session, 5, { now: () => time, sleep: async ms => { time += ms; } });
	expect(result.scope.load).toBe('Database-wide (non-CDB)');
	expect(result.scope.host).toBe(result.scope.load);
	const md = renderTop(result);
	expect(md).toContain('# Top');
	expect(md).toContain('### physicalReads\n\nnone in this interval');
	expect(md).toContain('1 KiB');
	expect(md).toContain('piagent sql --target lab --sql-id <SQL_ID>');
	expect(md).not.toMatch(/\|\n\n\|/);
});

it('formats numbers to at most three decimal places and makes null cells explicit', () => {
	expect(markdownNumber(24503.25445870932)).toBe('24503.254');
	expect(markdownNumber(0.06000001)).toBe('0.06');
	expect(markdownTable([{ value: null, perSecond: 0.123456 }])).toContain('| none | 0.123 |');
});
it('renders SQL_ID ranking headers and rounded rates without mutating JSON evidence', async () => {
	let time = 0;
	const session = { target: { name: 'lab' }, identity: { isCdb: false }, query: async (sql: string) => ({ rows: sql.includes('SQLSTATS') ? [['abc', time ? 1 : 0, 0, 0, 0, 0]] : [], truncated: false }) } as unknown as OracleSession;
	const result = await sampleTop(session, 5, { now: () => time, sleep: async ms => { time += ms + 123; } });
	const before = JSON.stringify(result);
	const md = renderTop(result);
	expect(md).toContain('| SQL_ID | delta | perSecond | state | command |');
	expect(md).toContain('| abc | 1 | 0.195 |');
	expect(JSON.stringify(result)).toBe(before);
});
