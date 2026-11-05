import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createWebServer } from '../../src/web/server.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`serves live read-only SQL insight on ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	const web = createWebServer({ config, port: 0 });
	try {
		const session = await sessions.get(target);
		const found = await session.query('SELECT SQL_ID FROM V$SQL_PLAN WHERE OBJECT_OWNER = :owner AND OBJECT_NAME = :name ORDER BY SQL_ID FETCH FIRST 1 ROWS ONLY', { owner: target.startsWith('d1') ? 'SH' : 'SHOPAPP', name: target.startsWith('d1') ? 'SALES' : 'ORDERS' });
		if (!found.rows.length) { context.skip('Reference statement aged out of cursor cache'); return; }
		const url = new URL(await web.listen());
		const response = await fetch(url.origin + '/api/sql?' + new URLSearchParams({ target, sqlId: String(found.rows[0]![0]) }), { headers: { Authorization: 'Bearer ' + web.token } });
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.result.target).toBe(target); expect(body.result.children.length).toBeGreaterThan(0); expect(body.result.plans.length).toBeGreaterThan(0); expect(body.markdown).toContain('# SQL insight');
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved database ${target} unavailable`); return; }
		throw error;
	} finally { await web.close(); await sessions.closeAll(); }
}, 60000);
