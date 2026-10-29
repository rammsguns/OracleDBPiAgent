import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer, type WebServerOptions } from '../../src/web/server.js';
import { acquireLlm } from '../../src/web/sessions.js';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(overrides: Partial<WebServerOptions> = {}) {
	const closeAll = vi.fn(async () => {});
	const report = vi.fn(async () => ({ target: 'd1-19c-lab', generatedAt: 'now', sections: [] }));
	const summarize = vi.fn(async () => 'summary');
	const web = createWebServer({ port: 0, token: 'test', config: loadConfig({}), report, summarize,
		sessionFactory: async () => ({ get: vi.fn(), closeAll }), ...overrides });
	const url = new URL(await web.listen()); cleanups.push(web.close);
	const call = (query = '', headers: Record<string, string> = {}) => new Promise<{ status: number; text: string }>((resolve, reject) => {
		const req = request({ hostname: '127.0.0.1', port: url.port, path: '/api/report' + query, headers: { Authorization: 'Bearer test', ...headers } }, res => {
			let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, text }));
		}); req.on('error', reject); req.end();
	});
	return { call, report, summarize, closeAll };
}
it('authenticates report and checks Host and Origin before generating', async () => {
	const f = await fixture();
	expect((await f.call('', { Authorization: '' })).status).toBe(401);
	for (const headers of [{ Host: 'evil.test' }, { Origin: 'http://evil.test' }, { Origin: 'null' }]) expect((await f.call('', headers)).status).toBe(403);
	expect(f.report).not.toHaveBeenCalled();
});
it.each(['?target=unknown', '?target=', '?sections=bad', '?sections=', '?sections=identity,bad', '?summarize=0'])('rejects invalid selection %s', async query => {
	const f = await fixture(); expect((await f.call(query)).status).toBe(400); expect(f.report).not.toHaveBeenCalled();
});
it('returns report and optional summary, forwards selection and closes provider', async () => {
	const f = await fixture(); const response = await f.call('?target=p1-19c-prod&sections=identity,tablespaces&summarize=1');
	expect(response.status).toBe(200); expect(JSON.parse(response.text)).toMatchObject({ report: { sections: [] }, summary: 'summary' });
	expect(f.report.mock.calls[0]).toMatchObject([{ pinnedTarget: 'p1-19c-prod' }, { target: 'p1-19c-prod', sections: ['identity', 'tablespaces'] }]);
	expect(f.summarize).toHaveBeenCalledOnce(); expect(f.closeAll).toHaveBeenCalledOnce();
});
it('allows deterministic report while busy but refuses summary before DB work', async () => {
	const f = await fixture(); const release = acquireLlm();
	try {
		expect((await f.call('?summarize=1')).status).toBe(409); expect(f.report).not.toHaveBeenCalled();
		expect((await f.call()).status).toBe(200); expect(f.summarize).not.toHaveBeenCalled();
	} finally { release(); }
});
it('holds summary lock until summary settles', async () => {
	let finish!: () => void; let started!: () => void;
	const pending = new Promise<void>(resolve => { finish = resolve; }); const start = new Promise<void>(resolve => { started = resolve; });
	const f = await fixture({ summarize: async () => { started(); await pending; return 'ok'; } });
	const first = f.call('?summarize=1'); await start;
	try { expect((await f.call('?summarize=1')).status).toBe(409); } finally { finish(); }
	expect((await first).status).toBe(200);
});
it.each(['report', 'summary', 'provider', 'cleanup'])('scrubs %s failure and releases the lock', async failure => {
	const fail = async (): Promise<never> => { throw new Error('ORA-12345 DSN localhost:1522 secret HARNESS_LAB'); };
	const f = await fixture(failure === 'report' ? { report: fail } : failure === 'summary' ? { summarize: fail } : { sessionFactory: failure === 'provider' ? fail : async () => ({ get: vi.fn(), closeAll: fail }) });
	const response = await f.call('?summarize=1');
	expect(response).toEqual({ status: 500, text: JSON.stringify({ message: 'Report failed' }) });
	const release = acquireLlm(); release();
});
