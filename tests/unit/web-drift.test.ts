import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer, type WebServerOptions } from '../../src/web/server.js';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function fixture(overrides: Partial<WebServerOptions> = {}) {
	const closeAll = vi.fn(async () => {});
	const drift = vi.fn(async (_ctx, options) => ({ ...options, complete: true, hasDrift: false, generatedAt: '', sections: [] }));
	const web = createWebServer({ port: 0, token: 'test', config: loadConfig({}), drift,
		sessionFactory: async () => ({ get: vi.fn(), closeAll }), ...overrides });
	const url = new URL(await web.listen()); cleanups.push(web.close);
	const call = (data: unknown = { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'parameters' }, headers = {}, method = 'POST') =>
		new Promise<{ status: number; text: string }>((resolve, reject) => {
			const req = request({ hostname: '127.0.0.1', port: url.port, path: '/api/drift', method, headers: { Authorization: 'Bearer test', ...headers } }, res => {
				let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode!, text }));
			}); req.on('error', reject); req.end(method === 'POST' ? JSON.stringify(data) : undefined);
		});
	return { call, drift, closeAll };
}
it('requires POST, token and approved Host/Origin before DB work', async () => {
	const f = await fixture();
	for (const [headers, code] of [[{ Authorization: '' }, 401], [{ Host: 'evil.test' }, 403], [{ Origin: 'null' }, 403], [{ Origin: 'http://evil.test' }, 403]] as const)
		expect((await f.call(undefined, headers)).status).toBe(code);
	expect((await f.call(undefined, {}, 'GET')).status).toBe(405);
	expect(f.drift).not.toHaveBeenCalled();
});
it.each([
	{ left: 'unknown', right: 'p1-19c-prod', scope: 'parameters' },
	{ left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'schema:HR;DROP' },
	{ left: 'd1-19c-lab', right: 123, scope: 'parameters' }, {},
])('validates selection before engine execution: %j', async data => {
	const f = await fixture(); expect((await f.call(data)).status).toBe(400); expect(f.drift).not.toHaveBeenCalled();
});
it('forwards selection without pinning and closes sessions', async () => {
	const f = await fixture(); expect((await f.call()).status).toBe(200);
	expect(f.drift.mock.calls[0]![0]).not.toHaveProperty('pinnedTarget');
	expect(f.drift.mock.calls[0]![1]).toEqual({ left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'parameters' });
	expect(f.closeAll).toHaveBeenCalledOnce();
});
it('holds a per-server lock through cleanup and releases it', async () => {
	let finish!: () => void, started!: () => void;
	const pending = new Promise<void>(r => { finish = r; }), start = new Promise<void>(r => { started = r; });
	const f = await fixture({ sessionFactory: async () => ({ get: vi.fn(), closeAll: async () => { started(); await pending; } }) });
	const first = f.call(); await start;
	try { expect((await f.call()).status).toBe(429); } finally { finish(); }
	expect((await first).status).toBe(200); expect((await f.call()).status).toBe(200);
});
it('bounds output and releases lock on oversized output', async () => {
	const f = await fixture({ drift: async (_ctx, options) => ({ ...options, generatedAt: 'x'.repeat(1024 * 1024), complete: true, hasDrift: false, sections: [] }) });
	expect((await f.call()).status).toBe(413); expect((await f.call()).status).toBe(413);
	expect(f.closeAll).toHaveBeenCalledTimes(2);
});
it('scrubs engine errors and releases lock', async () => {
	const f = await fixture({ drift: async () => { throw new Error('secret DSN'); } });
	expect(await f.call()).toEqual({ status: 500, text: '{"message":"Drift failed"}' });
	expect((await f.call()).status).toBe(500); expect(f.closeAll).toHaveBeenCalledTimes(2);
});
