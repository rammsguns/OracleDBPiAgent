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
		sessionFactory: async () => ({ get: vi.fn(), closeAll }), ...overrides });
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
	for (const path of ['/api/plsql/list', '/api/plsql/doc', '/api/triage']) {
		expect((await f.call(path, undefined, { Authorization: '' })).status).toBe(401);
		expect((await f.call(path, undefined, { Host: 'evil.test' })).status).toBe(403);
		expect((await f.call(path, undefined, { Origin: 'null' })).status).toBe(403);
		expect((await f.call(path, undefined, {}, 'DELETE')).status).toBe(405);
	}
	for (const path of ['/api/plsql/list?target=FREEPDB1', '/api/plsql/list?owner=HR;DROP', '/api/plsql/doc?object=HR.X;DROP', '/api/plsql/doc?object=HR', '/api/plsql/list?owner=' + 'X'.repeat(129)]) expect((await f.call(path)).status).toBe(400);
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
	try { expect((await f.call('/api/triage', { issue: 'ORA-02292' })).status).toBe(429); } finally { release(); }
	const failed = await first; expect(failed.status).toBe(500); expect(failed.text).not.toContain('DSN'); expect((await f.call()).status).toBe(500);
});
it('accepts dollar and hash identifiers and forwards doc selection', async () => {
	const doc = vi.fn(async () => ({ graph: { nodes: [], edges: [] } } as any));
	const f = await fixture({ plsqlDoc: doc });
	expect((await f.call('/api/plsql/doc?object=HR.P%24%23')).status).toBe(200);
	expect(doc.mock.calls[0]).toEqual([expect.objectContaining({ pinnedTarget: 'd1-19c-lab' }), 'd1-19c-lab', 'HR.P$#']);
});
