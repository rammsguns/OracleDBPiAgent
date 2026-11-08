import { expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer } from '../../src/web/server.js';

// Stop at the session boundary: accepted routes must reach it; rejected targets
// must never acquire a connection, regardless of the diagnostic implementation.
for (const privateNames of [false, true]) it('validates every route against loaded targets (private=' + privateNames + ')', async () => {
	const config = loadConfig({});
	if (privateNames) config.targets = config.targets.map((t, i) => ({ ...t, name: ['lab-d1', 'lab-p1', 'lab-c1', 'lab-c1s'][i]! }));
	config.defaultTarget = config.targets[0]!.name;
	const factory = vi.fn(async () => { throw new Error('session boundary'); });
	const web = createWebServer({ config, port: 0, sessionFactory: factory, checkHealth: async () => {} });
	try {
		const url = new URL(await web.listen());
		const call = (path: string, data?: object) => fetch(url.origin + path, { headers: { Authorization: 'Bearer ' + web.token }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
		for (const target of [...config.targets.map(t => t.name), 'unknown', ...(privateNames ? ['d1-19c-lab'] : [])]) {
			const accepted = config.targets.some(t => t.name === target);
			const requests: [string, object?][] = [
				...['check', 'backup', 'jobs', 'top', 'plsql/list', 'plsql/doc', 'alertlog', 'sql', 'security', 'db-sessions', 'space', 'report', 'report/history'].map(route => ['/api/' + route + '?' + new URLSearchParams({ target, object: 'SH.P', sqlId: '0123456789abc' })] as [string]),
				['/api/triage', { target, issue: 'ORA-02292' }],
				['/api/drift', { left: target, right: config.defaultTarget, scope: 'parameters' }],
				['/api/sessions', { target }],
				['/api/report/save?target=' + target, {}],
			];
			for (let [path, data] of requests) {
				// Only PL/SQL doc and SQL require those route-specific fields.
				if (!path.startsWith('/api/plsql/doc?')) path = path.replace('&object=SH.P', '');
				if (!path.startsWith('/api/sql?')) path = path.replace('&sqlId=0123456789abc', '');
				factory.mockClear();
				const response = await call(path, data);
				if (!accepted) {
					expect(response.status, path).toBe(400);
					expect(await response.json()).toEqual({ message: 'Invalid target' });
					expect(factory).not.toHaveBeenCalled();
				} else if (path.startsWith('/api/report/history')) {
					expect(response.status).toBe(200);
				} else {
					expect(response.status, path).toBe(500);
					expect(factory, path).toHaveBeenCalledOnce();
				}
			}
		}
	} finally { await web.close(); }
});
