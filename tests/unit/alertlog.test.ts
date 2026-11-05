import { expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import type { OracleSession, ToolContext } from '../../src/contracts.js';
import { readAlertLog, readIncidents, renderAlertLogMarkdown } from '../../src/alertlog/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function fixture(rows: unknown[][] = [], error?: string) {
	const query = vi.fn<OracleSession['query']>(async sql => { classifySql(sql); if (error) throw new Error(error); return { rows, columns: [], truncated: false, elapsedMs: 1 }; });
	const close = vi.fn(async () => {}), get = vi.fn(async () => ({ query, close }) as unknown as OracleSession);
	const ctx: ToolContext = { config: loadConfig(), sessions: { get, closeAll: async () => {} }, audit: { record: vi.fn(async () => {}) }, runId: 'alert-test' };
	return { ctx, query, get, close };
}
const row = (text: string, time = '2026-11-04T12:00:00Z') => [time, 16, 'key', text];
it('binds filters, window and caps; audits hashes without values; closes sessions', async () => {
	const f = fixture(); f.ctx.config.limits.maxRows = 10;
	const r = await readAlertLog(f.ctx, 'd1-19c-lab', { since: '7d', codes: ['ora-00600', 'TNS-12514'], text: "x%' OR 1=1", limit: 90 });
	expect(r.limit).toBe(10); expect(r.sql).toContain('FETCH FIRST :fetchLimit ROWS ONLY'); expect(r.sql).toContain('ORIGINATING_TIMESTAMP <');
	expect(r.sql).not.toContain("x%'"); expect(r.binds).toMatchObject({ code0: '(^|[^A-Z0-9_])ORA-0*600([^0-9]|$)', code1: '(^|[^A-Z0-9_])TNS-0*12514([^0-9]|$)', text: "x%' OR 1=1", maxLevel: 16, fetchLimit: 10 });
	expect(f.query.mock.calls[0]?.[2]).toEqual({ maxRows: 10, timeoutSeconds: f.ctx.config.limits.statementTimeoutSeconds });
	expect(f.close).toHaveBeenCalledOnce();
	for (const [event] of vi.mocked(f.ctx.audit.record).mock.calls) { expect(event.sqlSha256).toMatch(/^[a-f0-9]{64}$/); expect(event).not.toHaveProperty('binds'); expect(JSON.stringify(event)).not.toContain('1=1'); }
});
it('parses metadata before byte capping, redacts credentials, folds only consecutive full identical messages', async () => {
	const text = 'ORA-00600 TNS-12514 incident=123 /diag/trace/test.trc password=hidden ' + '😀'.repeat(700);
	const f = fixture([row(text, '2026-11-04T12:02:00Z'), row(text), row(text + 'different'), row('other'), row(text)]);
	const r = await readAlertLog(f.ctx, 'd1-19c-lab');
	expect(r.rows).toHaveLength(4); expect(r.rows[0]).toMatchObject({ count: 2, firstTime: '2026-11-04T12:00:00Z', lastTime: '2026-11-04T12:02:00Z', codes: ['ORA-00600', 'TNS-12514'], incidentId: '123', traceFile: '/diag/trace/test.trc', textTruncated: true });
	expect(Buffer.byteLength(r.rows[0]!.messageText)).toBeLessThanOrEqual(2048);
	expect(JSON.stringify(r)).not.toContain('hidden'); expect(JSON.stringify(r)).not.toContain('_identity');
});
it('keeps messages distinct when redaction makes their previews identical', async () => {
	const r = await readAlertLog(fixture([row('password=one'), row('password=two')]).ctx, 'd1-19c-lab');
	expect(r.rows).toHaveLength(2);
});
it('uses explicit zoned windows and numeric/all levels; sentinel is removed before folding', async () => {
	const f = fixture([row('a'), row('b'), row('c')]);
	const r = await readAlertLog(f.ctx, 'd1-19c-lab', { from: '2026-11-01T00:00:00-06:00', to: '2026-11-02T00:00:00Z', limit: 2, level: 'all' });
	expect(r.window.from).toBe('2026-11-01T06:00:00.000Z'); expect(r.rows).toHaveLength(2); expect(r.truncated).toBe(true); expect(r.binds).not.toHaveProperty('maxLevel');
	const numeric = await readAlertLog(f.ctx, 'd1-19c-lab', { level: 8 }); expect(numeric.binds.maxLevel).toBe(8); expect(numeric.sql).not.toContain('oraPrefix');
});
it('rejects invalid inputs and pinned-target violations before session acquisition', async () => {
	const f = fixture();
	for (const options of [{ since: '31d' }, { from: '2026-11-01T00:00:00Z' }, { since: '1h', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }, { from: 'bad', to: 'bad' }, { from: '2026-11-02T00:00:00Z', to: '2026-11-01T00:00:00Z' }, { limit: 0 }, { limit: 1.5 }, { level: 33 }, { codes: ['ORA-00600;DELETE'] }, { text: 'x'.repeat(2049) }]) await expect(readAlertLog(f.ctx, 'd1-19c-lab', options)).rejects.toThrow();
	await expect(readAlertLog(f.ctx, 'unknown')).rejects.toThrow(); f.ctx.pinnedTarget = 'p1-19c-prod'; await expect(readIncidents(f.ctx, 'd1-19c-lab')).rejects.toThrow(); expect(f.get).not.toHaveBeenCalled();
});
for (const code of ['ORA-00942', 'ORA-01031']) it(`reports exact grants on ${code}, including both joined views`, async () => {
	const f = fixture([], code);
	const alert = await readAlertLog(f.ctx, 'd1-19c-lab'); expect(alert.status).toBe('unavailable'); expect(alert.grants).toEqual(['GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_LAB;']);
	const incidents = await readIncidents(f.ctx, 'p1-19c-prod'); expect(incidents.grants).toEqual(['GRANT SELECT ON SYS.V_$DIAG_INCIDENT TO HARNESS_RO;', 'GRANT SELECT ON SYS.V_$DIAG_PROBLEM TO HARNESS_RO;']);
	expect(renderAlertLogMarkdown(incidents)).toContain('GRANT SELECT ON SYS.V_$DIAG_INCIDENT TO HARNESS_RO;');
});
it('throws other errors and still closes the session', async () => {
	const f = fixture([], 'ORA-00904 invalid column'); await expect(readIncidents(f.ctx, 'd1-19c-lab')).rejects.toThrow('ORA-00904'); expect(f.close).toHaveBeenCalledOnce();
});
it('joins incident problems in the same container and escapes Markdown', async () => {
	const f = fixture([[123, '<b>|key', new Date('2026-11-01T00:00:00Z'), 1]]);
	const r = await readIncidents(f.ctx, 'p1-19c-prod'); expect(r.sql).toContain('p.CON_ID = i.CON_ID'); expect(r.sql).toContain('i.CREATE_TIME >='); expect(r.rows[0]).toMatchObject({ incidentId: '123', status: 1 });
	expect(renderAlertLogMarkdown(r)).toContain('&lt;b&gt;&#124;key');
});

it('normalizes abbreviated alert-log codes and matches full code boundaries', async () => {
	const f = fixture([row('opiodr ORA-609; TNS-12514 ORA-00600 ORA-006000')]);
	const r = await readAlertLog(f.ctx, 'd1-19c-lab', { codes: ['ORA-00609'] });
	expect(r.rows[0]?.codes).toEqual(['ORA-00609', 'TNS-12514', 'ORA-00600']);
	const pattern = new RegExp(String(r.binds.code0)); expect(pattern.test('ORA-609')).toBe(true); expect(pattern.test('ORA-00609')).toBe(true); expect(pattern.test('ORA-006090')).toBe(false);
});
