import { describe, it, expect, vi } from 'vitest';
import { compareTargets, compareEntries, entries, normalize, parseScope, renderDriftMarkdown } from '../../src/drift/index.js';
import { parameterQuery, schemaQueries, objectQueries } from '../../src/drift/queries.js';
import { UnsupportedVersionError, type ToolContext } from '../../src/contracts.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function setup() {
	const query = vi.fn().mockResolvedValue({ columns: [], rows: [], truncated: false, elapsedMs: 1 });
	const close = vi.fn(), record = vi.fn().mockResolvedValue(undefined), get = vi.fn().mockResolvedValue({ query, close });
	const ctx = { config: { targets: [{ name: 'left' }, { name: 'right' }], limits: { maxRows: 100, statementTimeoutSeconds: 15 } }, sessions: { get }, audit: { record }, runId: 'drift-test' } as unknown as ToolContext;
	return { ctx, query, close, get, record };
}
const options = { left: 'left', right: 'right', scope: 'parameters' };
it('validates scope and both targets before any access', async () => {
	const { ctx, get } = setup();
	for (const scope of ['schema:', 'schema:X;DELETE', 'schema:SH@remote', 'objects:A/B', 'other', 'parameters:x']) await expect(compareTargets(ctx, { ...options, scope })).rejects.toThrow();
	await expect(compareTargets(ctx, { ...options, right: 'unknown' })).rejects.toThrow();
	ctx.pinnedTarget = 'left'; await expect(compareTargets(ctx, options)).rejects.toThrow();
	expect(get).not.toHaveBeenCalled(); expect(parseScope('schema:sh')).toEqual({ kind: 'schema', owner: 'SH' });
});
it('normalizes whitespace without erasing quoted values or identifier case', () => {
	expect(normalize(" A  =  'x  y' \n AND \"Mixed  Name\"=1 ")).toBe("A = 'x  y' AND \"Mixed  Name\"=1");
	expect(normalize(null)).toBeNull(); expect(normalize(1)).toBe(1);
	expect(normalize("'a''  b'")).toBe("'a''  b'");
});
it('groups only-left, only-right and different with stable normalized entries', () => {
	const l = entries(parameterQuery, [['same', 'a  b'], ['left', 1], ['changed', 2]]);
	const r = entries(parameterQuery, [['changed', 3], ['right', 1], ['same', 'a b']]);
	expect(compareEntries(l, r)).toEqual({ onlyLeft: [{ key: '["left"]', values: [1] }], onlyRight: [{ key: '["right"]', values: [1] }], different: [{ key: '["changed"]', left: [2], right: [3] }] });
});
for (const name of ['constraints', 'indexes']) describe(name, () => {
	const definition = schemaQueries.find(d => d.name === name)!;
	it('ignores generated names but preserves structural changes and multiplicity', () => {
		const row = ['T', 'SYS_C001', 'GENERATED NAME', 'TYPE', 1, 'C'];
		const left = entries(definition, [row]);
		expect(compareEntries(left, entries(definition, [[...row.slice(0, 1), 'SYS_C002', ...row.slice(2)]]))).toEqual({ onlyLeft: [], onlyRight: [], different: [] });
		expect(compareEntries(left, entries(definition, [['T', 'SYS_C002', 'GENERATED NAME', 'TYPE', 1, 'D']])).onlyLeft).toHaveLength(1);
		expect(entries(definition, [row, ['T', 'SYS_C002', ...row.slice(2)]])).toHaveLength(2);
	});
	it('retains named identities and ordered component columns', () => {
		const l = entries(definition, [['T', 'NAMED', 'USER NAME', 1, 'A'], ['T', 'NAMED', 'USER NAME', 2, 'B']]);
		const r = entries(definition, [['T', 'NAMED', 'USER NAME', 1, 'B'], ['T', 'NAMED', 'USER NAME', 2, 'A']]);
		expect(compareEntries(l, r).different).toHaveLength(1);
	});
});
for (const definition of [parameterQuery, ...schemaQueries, ...objectQueries]) it(`${definition.name} uses policy-approved static SQL`, () => {
	expect(classifySql(definition.sql)).toBeTruthy(); expect(definition.sql).not.toMatch(/DBA_HIST|ACTIVE_SESSION_HISTORY|DBMS_/i);
});
for (const scope of ['parameters', 'schema:HR', 'objects:HR']) it(`collects ${scope} sequentially with caps, audit and cleanup`, async () => {
	const { ctx, query, close, record } = setup();
	const result = await compareTargets(ctx, { ...options, scope });
	expect(result.complete).toBe(true); expect(result.hasDrift).toBe(false);
	expect(query).toHaveBeenCalledTimes(result.sections.length * 2); expect(close).toHaveBeenCalledTimes(query.mock.calls.length);
	for (const [, binds, limits] of query.mock.calls) { expect(binds).toEqual(scope === 'parameters' ? {} : { owner: 'HR' }); expect(limits).toEqual({ maxRows: 100, timeoutSeconds: 15 }); }
	expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tool_call', sqlSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
});
for (const error of ['ORA-00942 private', 'ORA-01031 private', 'NJS-560 private', 'unknown private']) it(`sanitizes ${error.split(' ')[0]} and withholds incomplete comparison`, async () => {
	const { ctx, query, record } = setup(); query.mockRejectedValueOnce(new Error(error));
	const result = await compareTargets(ctx, options);
	expect(result).toMatchObject({ complete: false, hasDrift: false });
	expect(result.sections[0]).toMatchObject({ status: 'unavailable', onlyLeft: [], onlyRight: [], different: [] });
	expect(JSON.stringify(result)).not.toContain('private'); expect(JSON.stringify(record.mock.calls)).not.toContain('private');
	if (/ORA/.test(error)) expect(result.sections[0]!.notes[0]).toContain('needs SELECT on SYS.V_$PARAMETER');
});
it('does not compare capped prefixes, including partially collected compound objects', async () => {
	const { ctx, query } = setup(); query.mockResolvedValueOnce({ rows: [['x', 1]], truncated: true, elapsedMs: 1 });
	const result = await compareTargets(ctx, options); expect(result.complete).toBe(false); expect(result.hasDrift).toBe(false); expect(result.sections[0]!.notes[0]).toContain('row cap');
});
it('preserves the mandatory 19c refusal', async () => {
	const { ctx, get } = setup(); get.mockRejectedValue(new UnsupportedVersionError('left', '26'));
	await expect(compareTargets(ctx, options)).rejects.toBeInstanceOf(UnsupportedVersionError);
});
it('renders escaped output and exposes observed drift', async () => {
	const { ctx, query } = setup(); query.mockResolvedValueOnce({ rows: [['<script>|\n', 1]], truncated: false, elapsedMs: 1 });
	const result = await compareTargets(ctx, options); expect(result.hasDrift).toBe(true);
	const md = renderDriftMarkdown(result); expect(md).toContain('&lt;script&gt;&#124;'); expect(md).not.toContain('<script>'); expect(md).toContain('onlyLeft');
});
for (const definition of schemaQueries.filter(d => !d.grouped)) it(`detects ${definition.name} membership and value changes`, () => {
	const keys = Array.from({ length: definition.keys }, (_, i) => `K${i}`);
	const left = entries(definition, [[...keys, 'old']]), right = entries(definition, [[...keys, 'new']]);
	expect(compareEntries(left, right).different).toHaveLength(1);
	expect(compareEntries(left, []).onlyLeft).toEqual(left); expect(compareEntries([], right).onlyRight).toEqual(right);
});
it('withholds possibly truncated check expressions', async () => {
	const { ctx, query } = setup();
	query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM all_constraints c') ? [['T', 'CK', 'USER NAME', 'C', 'ENABLED', 'VALIDATED', 'NOT DEFERRABLE', 'IMMEDIATE', null, null, null, null, 'X'.repeat(4000), 1, 'C']] : [], truncated: false, elapsedMs: 1 }));
	const result = await compareTargets(ctx, { ...options, scope: 'schema:HR' });
	expect(result.sections.find(s => s.name === 'constraints')).toMatchObject({ status: 'unavailable', onlyLeft: [], different: [] });
	expect(result.complete).toBe(false);
});
