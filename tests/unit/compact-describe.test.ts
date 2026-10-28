import { expect, it, vi } from 'vitest';
import { boundedResult, createDbTools, renderDescribe } from '../../src/tools/index.js';
import type { QueryResult, ToolContext } from '../../src/contracts.js';
const result: QueryResult = {
	columns: ['KIND', 'NAME', 'INFO', 'VALUE', 'POSITION'], elapsedMs: 1, truncated: false,
	rows: [
		['COLUMN', 'ID', 'NUMBER', '22', 1], ['COLUMN', 'NAME', 'VARCHAR2', '80', 2],
		['CONSTRAINT', 'PK_T', 'P', 'ENABLED', null], ['CONSTRAINT', 'FK_T', 'R', 'DISABLED', null],
		['CONSTRAINT_COLUMN', 'PK_T', 'NAME', null, 2], ['CONSTRAINT_COLUMN', 'PK_T', 'ID', null, 1],
		['CONSTRAINT_COLUMN', 'FK_T', 'ID', null, 1],
		['INDEX', 'IX_T', 'UNIQUE', 'VALID', null], ['INDEX_COLUMN', 'IX_T', 'NAME', null, 2], ['INDEX_COLUMN', 'IX_T', 'ID', null, 1],
		['STATS', 'T', '42', '2026-10-27 12:34:56', null],
	],
};
it('folds ordered lists while retaining column positions, types, lengths, statuses and stats', () => {
	const text = renderDescribe(result);
	for (const line of ['1|ID|NUMBER|22', '2|NAME|VARCHAR2|80', 'PK_T|P|ENABLED|1:ID,2:NAME', 'FK_T|R|DISABLED|1:ID', 'IX_T|UNIQUE|VALID|1:ID,2:NAME', 'T|42|2026-10-27 12:34:56']) expect(text).toContain(line);
	expect(Buffer.byteLength(text)).toBeLessThan(Buffer.byteLength(boundedResult(result, 100000).content[0]!.text));
});
it('handles lists longer than SQL VARCHAR2 without aggregation or silent loss', () => {
	const rows = [['INDEX', 'IX', 'NONUNIQUE', 'VALID', null], ...Array.from({ length: 100 }, (_, i) => ['INDEX_COLUMN', 'IX', 'X'.repeat(100) + i, null, i + 1])];
	const text = renderDescribe({ ...result, rows });
	expect(text.length).toBeGreaterThan(4000);
	expect(text).toContain(`100:${'X'.repeat(100)}99`);
});
it('keeps NULL stats, orphan metadata, raw details and byte truncation disclosure', () => {
	const input = { ...result, rows: [...result.rows, ['INDEX_COLUMN', 'ORPHAN', 'C', null, 3], ['STATS', 'EMPTY', null, null, null]] };
	expect(renderDescribe(input)).toContain('INDEX_COLUMN|ORPHAN|3:C');
	expect(renderDescribe(input)).toContain('EMPTY|NULL|NULL');
	const full = boundedResult(input, 100000, renderDescribe);
	expect(full.details).toEqual(input);
	const bounded = boundedResult(input, 900, renderDescribe);
	expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(900);
	expect(bounded.content[0]!.text).toContain('[truncated]');
	expect(input.rows).toHaveLength(13);
});
it('uses compact rendering only for describe and keeps binds, audit and the FK note', async () => {
	const query = vi.fn().mockResolvedValue(result); const record = vi.fn(); const close = vi.fn();
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 200, maxToolResultBytes: 16000 } }, sessions: { get: async () => ({ query, close }) }, audit: { record }, runId: 'compact' } as unknown as ToolContext;
	const tool = createDbTools(ctx).find(tool => tool.name === 'describe_object')!;
	const output = await tool.execute('1', { name: 'sales' });
	expect(output.content[0]).toMatchObject({ text: renderDescribe(result) });
	expect(query.mock.calls[0]![1]).toEqual({ owner: 'SH', name: 'SALES' });
	expect(query.mock.calls[0]![0]).not.toMatch(/LISTAGG/i);
	expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tool_call', rows: 11 }));
	expect(close).toHaveBeenCalledOnce();
	expect(tool.description).toContain('never infer');
});

const headers = [
	'Columns: position|name|type|length',
	'Constraints: name|type|status|child_columns(position:name)',
	'Indexes: name|uniqueness|status|columns(position:name)',
];
for (const [label, text, retained] of [
	['Stats', `${headers[0]}\n1|ID|NUMBER|22\n2|NAME|VARCHAR2|80\n${headers[1]}\nPK_T|P|ENABLED|1:ID,2:NAME\nFK_T|R|DISABLED|1:ID\n${headers[2]}\nIX_T|UNIQUE|VALID|1:ID,2:NAME\nStats: 1 more not shown [truncated]\n[truncated]`, [0,1,2,3,4,5,6,7,8,9]],
	['Indexes', `${headers[0]}\n1|ID|NUMBER|22\n2|NAME|VARCHAR2|80\n${headers[1]}\nPK_T|P|ENABLED|1:ID,2:NAME\nFK_T|R|DISABLED|1:ID\nIndexes: 1 more not shown [truncated]\nStats: 1 more not shown [truncated]\n[truncated]`, [0,1,2,3,4,5,6]],
	['Constraints partly', `${headers[0]}\n1|ID|NUMBER|22\n2|NAME|VARCHAR2|80\n${headers[1]}\nPK_T|P|ENABLED|1:ID,2:NAME\nConstraints: 1 more not shown [truncated]\nIndexes: 1 more not shown [truncated]\nStats: 1 more not shown [truncated]\n[truncated]`, [0,1,2,4,5]],
	['Constraints', `${headers[0]}\n1|ID|NUMBER|22\n2|NAME|VARCHAR2|80\nConstraints: 2 more not shown [truncated]\nIndexes: 1 more not shown [truncated]\nStats: 1 more not shown [truncated]\n[truncated]`, [0,1]],
	['Columns partly', `${headers[0]}\n1|ID|NUMBER|22\nColumns: 1 more not shown [truncated]\nConstraints: 2 more not shown [truncated]\nIndexes: 1 more not shown [truncated]\nStats: 1 more not shown [truncated]\n[truncated]`, [0]],
	['Columns', 'Columns: 2 more not shown [truncated]\nConstraints: 2 more not shown [truncated]\nIndexes: 1 more not shown [truncated]\nStats: 1 more not shown [truncated]\n[truncated]', []],
] as const) {
	it(`discloses ${label} omissions with exact text and whole composite entities`, () => {
		const expected = { content: [{ type: 'text', text }], details: { ...result, rows: retained.map(i => result.rows[i]), truncated: true } };
		const cap = Buffer.byteLength(JSON.stringify(expected));
		const output = boundedResult(result, cap, renderDescribe);
		expect(output).toEqual(expected);
		expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(cap);
		expect(output.details.truncated).toBe(true);
	});
}
it('refuses a cap too small to retain section disclosures', () => {
	expect(() => boundedResult(result, 100, renderDescribe)).toThrow('disclose omitted describe sections');
});
it('does not claim complete keys when the database row limit truncated metadata', () => {
	const output = boundedResult({ ...result, truncated: true }, 10000, renderDescribe);
	expect(output.content[0]!.text).toBe(`${headers[0]}\n1|ID|NUMBER|22\n2|NAME|VARCHAR2|80\nConstraints: 2 more not shown [truncated]\nIndexes: 1 more not shown [truncated]\nStats: table|NUM_ROWS|LAST_ANALYZED\nT|42|2026-10-27 12:34:56\n[truncated]`);
	expect(output.details.rows.some((row: unknown[]) => row[0] === 'CONSTRAINT')).toBe(false);
});
it('preserves generic tools exact text including byte truncation', () => {
	const input = { columns: ['A', 'B'], rows: [[1, null], [2, 'a  b']], elapsedMs: 1, truncated: false };
	expect(boundedResult(input, 10000).content[0]!.text).toBe('A | B\n1 | NULL\n2 | a b');
	const expected = { content: [{ type: 'text', text: 'A | B\n1 | NULL\n[truncated]' }], details: { ...input, rows: [[1, null]], truncated: true } };
	expect(boundedResult(input, Buffer.byteLength(JSON.stringify(expected)))).toEqual(expected);
});
