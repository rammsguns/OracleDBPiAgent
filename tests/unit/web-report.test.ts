import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer, type WebServerOptions } from '../../src/web/server.js';
import { acquireLlm } from '../../src/web/sessions.js';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(overrides: Partial<WebServerOptions> = {}) {
	const dir = await mkdtemp(join(tmpdir(), 'web-report-')); cleanups.push(() => rm(dir, { recursive: true, force: true }));
	const closeAll = vi.fn(async () => {});
	const report = vi.fn(async () => ({ target: 'd1-19c-lab', generatedAt: '2026-10-29T12:00:00.000Z', sections: [] }));
	const summarize = vi.fn(async () => 'summary');
	const web = createWebServer({ port: 0, token: 'test', config: loadConfig({}), reportDirectory: dir, report, summarize,
		sessionFactory: async () => ({ get: vi.fn(), closeAll }), ...overrides });
	const url = new URL(await web.listen()); cleanups.push(web.close);
	const call = (query = '', headers: Record<string, string> = {}, method = 'GET') => new Promise<{ status: number; text: string }>((resolve, reject) => {
		const req = request({ hostname: '127.0.0.1', port: url.port, path: '/api/report' + query, method, headers: { Authorization: 'Bearer test', ...headers } }, res => {
			let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode!, text }));
		}); req.on('error', reject); req.end();
	});
	return { call, report, summarize, closeAll, dir };
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
	expect(response.status).toBe(200); expect(JSON.parse(response.text)).toMatchObject({ report: { sections: [] }, summary: 'summary', unverified: [] });
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

it('returns unsupported summary numbers using the rendered report as evidence', async () => {
	const f = await fixture({ summarize: async markdown => {
		expect(markdown).toContain('# Oracle 19c report');
		return 'Invented 98,765 rows in PROMO.';
	} });
	expect(JSON.parse((await f.call('?summarize=1')).text)).toMatchObject({ summary: 'Invented 98,765 rows in PROMO.', unverified: ['98,765'] });
});
it('omits summary and unverified when no summary was requested', async () => {
	const f = await fixture(); const data = JSON.parse((await f.call()).text);
	expect(data).not.toHaveProperty('summary'); expect(data).not.toHaveProperty('unverified');
});

it('returns an empty unverified list when the env grounding switch is disabled', async () => {
	const f = await fixture({ config: loadConfig({ PIAGENT_GROUNDING_CHECK: '0' }), summarize: async () => 'Invented 98,765 rows.' });
	expect(JSON.parse((await f.call('?summarize=1')).text)).toMatchObject({ summary: 'Invented 98,765 rows.', unverified: [] });
});

it('GET never creates history and POST saves private files then GET compares the saved run', async () => {
	const f = await fixture();
	expect(JSON.parse((await f.call()).text).diff).toMatchObject({ previousGeneratedAt: null, notes: ['No saved run yet.'] });
	expect(await readdir(f.dir)).toEqual([]);
	const saved = await f.call('/save?target=d1-19c-lab', {}, 'POST');
	expect(saved.status).toBe(200); expect(JSON.parse(saved.text).savedAt).toBe('2026-10-29T12:00:00.000Z');
	expect(JSON.parse(saved.text).diff.notes).toEqual(['No previous saved run; baseline established.']);
	const files = await readdir(join(f.dir, 'd1-19c-lab')); expect(files).toHaveLength(2);
	for (const file of files) expect((await stat(join(f.dir, 'd1-19c-lab', file))).mode & 0o777).toBe(0o600);
	const data = JSON.parse((await f.call()).text); expect(data.diff.previousGeneratedAt).toBe('2026-10-29T12:00:00.000Z'); expect(data.diff.changes).toEqual([]);
	expect(await readdir(join(f.dir, 'd1-19c-lab'))).toEqual(files);
});
it('protects save with bearer, Host and Origin checks and validates targets before writing', async () => {
	const f = await fixture();
	for (const [headers, status] of [[{ Authorization: '' }, 401], [{ Host: 'evil.test' }, 403], [{ Origin: 'null' }, 403], [{ Origin: 'http://evil.test' }, 403]] as const) expect((await f.call('/save', headers, 'POST')).status).toBe(status);
	for (const target of ['unknown', '', '../etc']) expect((await f.call('/save?target=' + encodeURIComponent(target), {}, 'POST')).status).toBe(400);
	expect(f.report).not.toHaveBeenCalled(); expect(await readdir(f.dir)).toEqual([]);
});
it.each(['read', 'write'])('scrubs history %s errors', async operation => {
	const fail = async (): Promise<never> => { throw new Error('secret DSN ORA-123'); };
	const f = await fixture(operation === 'read' ? { loadReport: fail } : { saveReport: fail });
	expect(await f.call(operation === 'read' ? '' : '/save', {}, operation === 'read' ? 'GET' : 'POST')).toEqual({ status: 500, text: JSON.stringify({ message: 'Report failed' }) });
});

it('returns the pre-save comparison and reads existing history without changing files', async () => {
	const f = await fixture(); await f.call('/save', {}, 'POST');
	const directory = join(f.dir, 'd1-19c-lab');
	const files = await readdir(directory); const times = await Promise.all(files.map(async file => (await stat(join(directory, file))).mtimeMs));
	await f.call();
	expect(await Promise.all(files.map(async file => (await stat(join(directory, file))).mtimeMs))).toEqual(times);
	const saved = JSON.parse((await f.call('/save', {}, 'POST')).text);
	expect(saved.diff.previousGeneratedAt).toBe('2026-10-29T12:00:00.000Z'); expect(saved.diff.changes).toEqual([]);
});
