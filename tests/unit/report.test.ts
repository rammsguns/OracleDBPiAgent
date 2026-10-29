import { describe, it, expect, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { generateReport, renderMarkdown } from '../../src/report/index.js';
import { reportQueries } from '../../src/report/queries.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function setup() {
	const query = vi.fn().mockResolvedValue({ columns: ['N'], rows: [[1]], truncated: false, elapsedMs: 1 });
	const close = vi.fn(); const record = vi.fn(); const get = vi.fn().mockResolvedValue({ query, close });
	const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 100, statementTimeoutSeconds: 15 } }, sessions: { get }, audit: { record }, runId: 'test' } as unknown as ToolContext;
	return { ctx, query, close, record, get };
}
for (const definition of reportQueries) describe(definition.name, () => {
	it('uses fixed policy-approved SQL, bounded rows, binds, timeouts and per-query audit', async () => {
		const { ctx, query, record, close } = setup();
		const r = await generateReport(ctx, { sections: [definition.name], owner: 'hr' });
		expect(r.sections[0]?.status).toBe('ok');
		const [sql, binds, options] = query.mock.calls[0]!;
		expect(classifySql(sql)).toBeTruthy(); expect(sql).toContain('FETCH FIRST :n ROWS ONLY');
		expect(sql).toBe(definition.sql); expect(binds).toEqual({ n: definition.limit ?? 100, ...(definition.owner ? { owner: 'HR' } : {}) });
		expect(options.maxRows).toBe(binds.n); expect(options.timeoutSeconds).toBeGreaterThan(0); expect(options.timeoutSeconds).toBeLessThanOrEqual(2);
		expect(record).toHaveBeenCalledWith(expect.objectContaining({ tool: `report:${definition.name}`, kind: 'tool_call', sqlSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
		expect(close).toHaveBeenCalled();
	});
	for (const error of ['ORA-00942 secret connection', 'NJS-560 call timeout secret', 'unknown sensitive driver failure']) it(`sanitizes ${error.split(' ')[0]} and continues`, async () => {
		const { ctx, query, record } = setup(); query.mockRejectedValue(new Error(error));
		const r = await generateReport(ctx, { sections: [definition.name, 'identity'] });
		const section = r.sections.find(s => s.name === definition.name)!;
		expect(section.status).toBe('unavailable'); expect(section.note).toContain('not available:'); expect(section.note).toContain((definition.fallback && error.startsWith('ORA-00942') ? definition.fallback.grant : definition.grant));
		expect(JSON.stringify(r)).not.toMatch(/secret|sensitive/); expect(JSON.stringify(record.mock.calls)).not.toMatch(/secret|sensitive/);
	});
	if (definition.fallback) it('retries only ORA-00942 and discloses fallback', async () => {
		const { ctx, query } = setup(); query.mockRejectedValueOnce(new Error('ORA-00942'));
		const r = await generateReport(ctx, { sections: [definition.name] });
		expect(query.mock.calls[1]?.[0]).toBe(definition.fallback!.sql); expect(classifySql(definition.fallback!.sql)).toBeTruthy();
		expect(r.sections[0]).toMatchObject({ status: 'ok', source: definition.fallback!.source });
	});
});
it('has stable JSON fields, renders escaped Markdown and distinguishes empty and unavailable', async () => {
	const { ctx, query } = setup(); query.mockResolvedValueOnce({ columns: ['N'], rows: [['<script>|\nx']], truncated: true, elapsedMs: 1 });
	const r = await generateReport(ctx, { sections: ['identity'] });
	expect(Object.keys(JSON.parse(JSON.stringify(r)))).toEqual(['target', 'generatedAt', 'sections']);
	expect(Object.keys(r.sections[0]!)).toEqual(['name', 'status', 'source', 'columns', 'rows', 'note']);
	expect(renderMarkdown(r)).toContain('&lt;script&gt;&#124; x'); expect(renderMarkdown(r)).toContain('Row limit reached');
	r.sections[0]!.rows = []; expect(renderMarkdown(r)).toContain('No matching rows.');
	r.sections[0]!.status = 'unavailable'; r.sections[0]!.note = 'not available: needs SELECT on SYS.V_$PARAMETER';
	expect(renderMarkdown(r)).toContain('not available: needs SELECT'); expect(renderMarkdown(r)).not.toContain('No matching rows.');
});
it('rejects invalid selectors before opening a session', async () => {
	const { ctx, get } = setup();
	for (const options of [{ target: 'other' }, { owner: "SH' OR 1=1" }, { sections: ['unknown'] }]) await expect(generateReport(ctx, options)).rejects.toThrow();
	expect(get).not.toHaveBeenCalled();
});
it('reports all sections and expands grouped selectors', async () => {
	const { ctx } = setup(); const r = await generateReport(ctx);
	expect(r.sections.map(s => s.name)).toEqual(reportQueries.map(q => q.name));
	expect((await generateReport(ctx, { sections: ['backups'] })).sections.map(s => s.name)).toEqual(['backups', 'archive_switches']);
});
it('keeps reporting after sanitized cleanup failure', async () => {
	const { ctx, close } = setup(); close.mockRejectedValue(new Error('sensitive cleanup detail'));
	const r = await generateReport(ctx, { sections: ['identity', 'waits'] });
	expect(r.sections).toHaveLength(2); expect(r.sections[0]!.note).toContain('Session cleanup failed'); expect(JSON.stringify(r)).not.toContain('sensitive');
});
it('propagates the mandatory 19c refusal', async () => {
	const { UnsupportedVersionError } = await import('../../src/contracts.js');
	const { ctx, get } = setup(); get.mockRejectedValue(new UnsupportedVersionError('lab', '26.0'));
	await expect(generateReport(ctx)).rejects.toBeInstanceOf(UnsupportedVersionError);
});
