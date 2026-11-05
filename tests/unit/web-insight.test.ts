import { alertResult, alertRow, incidentRow } from '../browser/alertlog-fixture.js';
import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer, type WebServerOptions } from '../../src/web/server.js';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function fixture(overrides: Partial<WebServerOptions> = {}) {
	const closeAll = vi.fn(async () => {});
	const list = vi.fn(async () => ({ target: 'd1-19c-lab', status: 'ok', rows: [] } as any));
	const triage = vi.fn(async () => ({ target: 'd1-19c-lab', issues: [], scan: null }));
	const web = createWebServer({ port: 0, token: 'test', config: loadConfig({}), plsqlList: list, triage,
		sessionFactory: async () => ({ get: vi.fn(async () => ({ target: {}, identity: {}, close: async () => {}, query: vi.fn() } as any)), closeAll }), ...overrides });
	const url = new URL(await web.listen()); cleanups.push(web.close);
	const call = (path = '/api/plsql/list?owner=HR', data?: unknown, headers = {}, method = data === undefined ? 'GET' : 'POST') =>
		new Promise<{ status: number; text: string }>((resolve, reject) => {
			const req = request({ hostname: '127.0.0.1', port: url.port, path, method, headers: { Authorization: 'Bearer test', ...headers } }, res => {
				let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode!, text }));
			}); req.on('error', reject); req.end(data === undefined ? undefined : JSON.stringify(data));
		});
	return { call, list, triage, closeAll };
}
it('requires token, approved Host/Origin, method, target and identifiers before opening sessions', async () => {
	const f = await fixture();
	for (const path of ['/api/plsql/list', '/api/plsql/doc', '/api/triage', '/api/alertlog', '/api/sql']) {
		expect((await f.call(path, undefined, { Authorization: '' })).status).toBe(401);
		expect((await f.call(path, undefined, { Host: 'evil.test' })).status).toBe(403);
		expect((await f.call(path, undefined, { Origin: 'null' })).status).toBe(403);
		expect((await f.call(path, undefined, {}, 'DELETE')).status).toBe(405);
	}
	for (const path of ['/api/alertlog?target=FREEPDB1', '/api/alertlog?since=31d', '/api/alertlog?codes=ORA-600', '/api/alertlog?text=' + 'x'.repeat(2049), '/api/plsql/list?target=FREEPDB1', '/api/plsql/list?owner=HR;DROP', '/api/plsql/doc?object=HR.X;DROP', '/api/plsql/doc?object=HR', '/api/plsql/list?owner=' + 'X'.repeat(129)]) expect((await f.call(path)).status).toBe(400);
	for (const issue of [{ issue: 'x', since: '31d' }, { issue: 1 }, { issue: '' }, { issue: 'x', target: 'FREEPDB1' }]) expect((await f.call('/api/triage', issue)).status).toBe(400);
	expect(f.list).not.toHaveBeenCalled(); expect(f.triage).not.toHaveBeenCalled(); expect(f.closeAll).not.toHaveBeenCalled();
});
it('forwards owner/target and returns deterministic Markdown without LLM', async () => {
	const f = await fixture(); expect((await f.call()).status).toBe(200);
	expect(f.list.mock.calls[0]).toEqual([expect.objectContaining({ pinnedTarget: 'd1-19c-lab' }), 'd1-19c-lab', 'HR']);
	const response = await f.call('/api/triage', { issue: 'ORA-02292', since: '24h' }); expect(response.status).toBe(200); expect(JSON.parse(response.text).markdown).toContain('Issue triage'); expect(f.closeAll).toHaveBeenCalledTimes(2);
});
it('caps issue bytes, body and output with 413', async () => {
	const f = await fixture({ plsqlList: async () => ({ rows: ['x'.repeat(1048576)] } as any) });
	expect((await f.call('/api/triage', { issue: 'é'.repeat(32769) })).status).toBe(413);
	expect((await f.call('/api/triage', { issue: 'x'.repeat(420000) })).status).toBe(413);
	expect((await f.call()).status).toBe(413); expect((await f.call()).status).toBe(413);
});
it('shares lock across insight routes and releases after failures', async () => {
	let release!: () => void, started!: () => void;
	const pending = new Promise<void>(r => { release = r; }), start = new Promise<void>(r => { started = r; });
	const f = await fixture({ plsqlList: async () => { started(); await pending; throw new Error('private DSN'); } });
	const first = f.call(); await start;
	try { expect((await f.call('/api/triage', { issue: 'ORA-02292' })).status).toBe(429); expect((await f.call('/api/alertlog')).status).toBe(429); expect((await f.call('/api/sql?sqlId=0123456789abc')).status).toBe(429); } finally { release(); }
	const failed = await first; expect(failed.status).toBe(500); expect(failed.text).not.toContain('DSN'); expect((await f.call()).status).toBe(500);
});
it('accepts dollar and hash identifiers and forwards doc selection', async () => {
	const doc = vi.fn(async () => ({ graph: { nodes: [], edges: [] } } as any));
	const f = await fixture({ plsqlDoc: doc });
	expect((await f.call('/api/plsql/doc?object=HR.P%24%23')).status).toBe(200);
	expect(doc.mock.calls[0]).toEqual([expect.objectContaining({ pinnedTarget: 'd1-19c-lab' }), 'd1-19c-lab', 'HR.P$#']);
});

it('reads both alert APIs sequentially with a common window and closes sessions', async () => {
	const order: string[] = [];
	const readAlerts = vi.fn<NonNullable<WebServerOptions["readAlertLog"]>>(async (_ctx, target) => { order.push('alerts'); return alertResult(target, [alertRow]); });
	const readIncidentRows = vi.fn<NonNullable<WebServerOptions["readIncidents"]>>(async (_ctx, target) => { order.push('incidents'); return { ...alertResult(target, [incidentRow]), view: 'V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM' }; });
	const f = await fixture({ readAlertLog: readAlerts, readIncidents: readIncidentRows });
	const response = await f.call('/api/alertlog?target=p1-19c-prod&since=7d&codes=ora-00600,TNS-12541&text=needle');
	expect(response.status).toBe(200);
	expect(order).toEqual(['alerts', 'incidents']);
	expect(readAlerts.mock.calls[0]).toEqual([expect.objectContaining({ pinnedTarget: 'p1-19c-prod' }), 'p1-19c-prod', { since: '7d', codes: ['ORA-00600', 'TNS-12541'], text: 'needle' }]);
	expect(readIncidentRows.mock.calls[0]?.[2]).toEqual(alertResult('', []).window);
	expect(JSON.parse(response.text).markdown).toContain('ADR incidents');
	expect(f.closeAll).toHaveBeenCalledOnce();
});
it('alert failures are private and release the shared lock and sessions', async () => {
	const f = await fixture({ readAlertLog: async () => { throw new Error('private database address'); } });
	for (let i = 0; i < 2; i++) {
		const response = await f.call('/api/alertlog');
		expect(response.status).toBe(500); expect(response.text).not.toContain('private');
	}
	expect(f.closeAll).toHaveBeenCalledTimes(2);
});

it('validates SQL requests before sessions and returns candidate picks or insight', async () => {
	const { sqlFixture } = await import('../browser/sql-fixture.js');
	const read = vi.fn(async () => sqlFixture);
	const f = await fixture({ readSqlInsight: read, findSqlCandidates: async () => ({ columns: [], rows: [['0123456789abc', 'SELECT x'], ['123456789abcd', 'SELECT y']], elapsedMs: 0, truncated: false }) });
	for (const query of ['', '?sqlId=bad', '?sqlId=0123456789abc&text=x', '?text=', '?text=' + 'x'.repeat(2049), '?sqlId=0123456789abc&target=FREEPDB1']) expect((await f.call('/api/sql' + query)).status).toBe(400);
	expect(f.closeAll).not.toHaveBeenCalled();
	const candidates = await f.call('/api/sql?text=SELECT');
	expect(JSON.parse(candidates.text).candidates).toHaveLength(2); expect(read).not.toHaveBeenCalled();
	const result = await f.call('/api/sql?sqlId=0123456789abc');
	expect(result.status).toBe(200); expect(JSON.parse(result.text).markdown).toContain('# SQL Insight');
	expect(f.closeAll).toHaveBeenCalledTimes(2);
});
it('SQL errors stay private, output is bounded and sessions and lock recover', async () => {
	const { sqlFixture } = await import('../browser/sql-fixture.js');
	let mode = 'fail';
	const f = await fixture({ readSqlInsight: async () => { if (mode === 'fail') throw new Error('private database address'); return { ...sqlFixture, text: 'x'.repeat(1048576) }; } });
	for (let i = 0; i < 2; i++) { const response = await f.call('/api/sql?sqlId=0123456789abc'); expect(response.status).toBe(500); expect(response.text).not.toContain('private'); }
	mode = 'cap'; expect((await f.call('/api/sql?sqlId=0123456789abc')).status).toBe(413); expect(f.closeAll).toHaveBeenCalledTimes(3);
});
