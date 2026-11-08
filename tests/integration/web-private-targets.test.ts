import { expect, it } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createWebServer } from '../../src/web/server.js';

it('serves every diagnostic API with private-home lab aliases without LLM', async test => {
	if (!process.env.PIAGENT_SECRET_DIR) { test.skip('PIAGENT_SECRET_DIR unset; lab credentials unavailable'); return; }
	const home = await mkdtemp(join(tmpdir(), 'piagent-private-web-'));
	await chmod(home, 0o700);
	let web: ReturnType<typeof createWebServer> | undefined;
	try {
		const packaged = JSON.parse(await readFile(new URL('../../config/targets.json', import.meta.url), 'utf8'));
		const names = ['lab-d1', 'lab-p1', 'lab-c1'];
		const targets = packaged.targets.map((t: object, i: number) => ({ ...t, name: names[i] }));
		await writeFile(join(home, 'targets.json'), JSON.stringify({ version: 1, targets }), { mode: 0o600 });
		const config = loadConfig({ PIAGENT_HOME: home, PIAGENT_SECRET_DIR: process.env.PIAGENT_SECRET_DIR });
		const sessions = createSessionProvider(config);
		try {
			for (const target of names) {
				try { await sessions.get(target); }
				catch (error) {
					if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { test.skip('Lab behind ' + target + ' unavailable'); return; }
					throw error;
				}
			}
		} finally { await sessions.closeAll(); }
		web = createWebServer({ config, port: 0, reportDirectory: join(home, 'reports') });
		const url = new URL(await web.listen());
		const call = (path: string, data?: object) => fetch(url.origin + path, { headers: { Authorization: 'Bearer ' + web!.token }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
		expect((await (await call('/api/targets')).json() as { name: string }[]).map(t => t.name)).toEqual(names);
		for (const target of names) {
			for (const route of ['check', 'backup', 'jobs', 'top', 'plsql/list', 'plsql/doc', 'alertlog', 'sql', 'security', 'db-sessions', 'space', 'report', 'report/save', 'report/history', 'triage']) {
				const params = new URLSearchParams({ target });
				if (route === 'top') params.set('seconds', '5');
				if (route === 'sql') params.set('text', 'SELECT');
				if (route === 'plsql/list') params.set('owner', target === 'lab-d1' ? 'HR' : 'SHOPAPP');
				if (route === 'plsql/doc') params.set('object', target === 'lab-d1' ? 'HR.ADD_JOB_HISTORY' : 'SHOPAPP.WORKLOAD');
				if (route === 'report' || route === 'report/save') params.set('sections', 'identity');
				const response = await call('/api/' + route + '?' + params, route === 'triage' ? { target, issue: 'ORA-02292', since: '1h' } : route === 'report/save' ? {} : undefined);
				// Never echo diagnostic payloads, which can contain application text.
				expect(response.status, target + ' /api/' + route).toBe(200);
				expect(await response.json()).toBeTruthy();
			}
			const response = await call('/api/drift', { left: target, right: target, scope: 'parameters' });
			expect(response.status, target + ' drift').toBe(200);
			expect(await response.json()).toMatchObject({ left: target, right: target, hasDrift: false });
		}
	} finally { await web?.close(); await rm(home, { recursive: true, force: true }); }
}, 240000);
