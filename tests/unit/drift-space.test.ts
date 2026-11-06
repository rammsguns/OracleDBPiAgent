import { expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import * as reader from '../../src/space/index.js';
import { compareTargets } from '../../src/drift/index.js';
import { spaceConfiguration } from '../../src/drift/space.js';
function data() {
	const evidence = { status: 'ok', truncated: false };
	return { status: 'ok', sections: {
		tablespaces: { status: 'ok', rows: [{ name: 'USERS', contents: 'PERMANENT', bigfile: false, maxBytes: 100, usedBytes: 10 }], evidence, supportingEvidence: [] },
		redo: { status: 'ok', rows: [{ kind: 'Group', group: 1, bytes: 50 }, { kind: 'Group', group: 2, bytes: 50 }], evidence, supportingEvidence: [] },
		recovery: { status: 'ok', rows: [{ kind: 'Area', limitBytes: 100, usedBytes: 10 }], evidence, supportingEvidence: [] },
	} } as unknown as reader.SpaceReport;
}
function setup(left = data(), right = data()) {
	const read = vi.spyOn(reader, 'readSpaceUsage').mockResolvedValueOnce(left).mockResolvedValueOnce(right);
	const close = vi.fn(async () => {});
	const ctx = { config: { targets: [{ name: 'left' }, { name: 'right' }] }, sessions: { get: async (name: string) => ({ target: { name }, query: vi.fn(), close }) } } as unknown as ToolContext;
	return { read, close, ctx };
}
const options = { left: 'left', right: 'right', scope: 'space' };
it('ignores usage, paths and redo ordering while retaining configuration multiplicity', async () => {
	const left = data(), right = data(); right.sections.tablespaces.rows[0]!.usedBytes = 99;
	right.sections.recovery.rows[0]!.usedBytes = 99; right.sections.redo.rows.reverse();
	const { ctx, close, read } = setup(left, right);
	try { expect(await compareTargets(ctx, options)).toMatchObject({ complete: true, hasDrift: false }); expect(close).toHaveBeenCalledTimes(2); } finally { read.mockRestore(); }
});
for (const kind of ['membership', 'contents', 'bigfile', 'maximum', 'redo-count', 'redo-size', 'fra-configured', 'fra-limit']) it(`detects ${kind}`, async () => {
	const left = data(), right = data(), t = right.sections.tablespaces.rows[0]!;
	if (kind === 'membership') t.name = 'OTHER';
	if (kind === 'contents') t.contents = 'UNDO';
	if (kind === 'bigfile') t.bigfile = true;
	if (kind === 'maximum') t.maxBytes = 200;
	if (kind === 'redo-count') right.sections.redo.rows.pop();
	if (kind === 'redo-size') right.sections.redo.rows[0]!.bytes = 100;
	if (kind === 'fra-configured') right.sections.recovery.rows = [];
	if (kind === 'fra-limit') right.sections.recovery.rows[0]!.limitBytes = 200;
	const { ctx, read } = setup(left, right);
	try { expect(await compareTargets(ctx, options)).toMatchObject({ complete: true, hasDrift: true }); } finally { read.mockRestore(); }
});
it('withholds unavailable and truncated configuration evidence', async () => {
	const right = data(); right.sections.tablespaces.status = 'unavailable'; right.sections.redo.evidence.truncated = true;
	const { ctx, read } = setup(data(), right);
	try {
		const result = await compareTargets(ctx, options);
		expect(result).toMatchObject({ complete: false, hasDrift: false });
		expect(result.sections.slice(0, 2).every(s => s.status === 'unavailable' && !s.different.length)).toBe(true);
	} finally { read.mockRestore(); }
});
it('represents no configured FRA explicitly', () => {
	const r = data(); r.sections.recovery.rows = [];
	expect(spaceConfiguration(r, 'recovery')).toEqual([{ key: 'FRA', values: [false, 0] }]);
});
