import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { findSqlCandidates, readSqlInsight } from '../../src/sqlperf/index.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`reads live single-SQL evidence on ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved credentials unavailable'); return; }
	const sessions = createSessionProvider(loadConfig());
	try {
		const session = await sessions.get(target);
		const candidates = await findSqlCandidates(session, target.startsWith('d1') ? 'SALES' : 'ORDERS');
		const row = candidates.rows[0];
		expect(row).toBeDefined();
		const result = await readSqlInsight(session, { sqlId: String(row![0]) });
		expect(result.status).toBe('ok');
		expect(result.children.length).toBeGreaterThan(0);
		expect(result.plans.length).toBeGreaterThan(0);
		expect(result.sections.plans?.status).toBe('ok');
		expect(result.sections.binds?.status).toBe('ok');
		for (const c of result.children) { expect(c.firstLoad).toMatch(/Z$/); expect(c.lastActive).toMatch(/Z$/); }
		expect(JSON.stringify(result.binds)).not.toContain('VALUE_STRING');
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved database ${target} unavailable`); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
