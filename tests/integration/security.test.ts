import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readSecurityPosture } from '../../src/security/index.js';
import { SQL } from '../../src/security/sql.js';
for (const [target, whoCan] of [['d1-19c-lab', 'HR.EMPLOYEES'], ['p1-19c-prod', 'SHOPAPP.ORDERS']] as const) it(`verifies every security SELECT and object paths on ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved credentials unavailable'); return; }
	const sessions = createSessionProvider(loadConfig());
	try {
		const session = await sessions.get(target);
		// Runs every registry SELECT on both targets, even when it returns no findings.
		for (const sql of Object.values(SQL)) {
			const [owner, name] = whoCan.split('.');
			const data = await session.query(sql, sql.includes(':owner') ? { owner, name } : {});
			expect(data.columns.length, sql).toBeGreaterThan(0);
		}
		const result = await readSecurityPosture(session, { whoCan });
		expect(result.status).toBe('ok');
		expect(result.checks.every(c => c.status === 'ok')).toBe(true);
		const profileCheck = result.checks.find(c => c.id === 'profiles')!;
		const verify = profileCheck.findings.filter(f => f.subject === 'Profile DEFAULT' && f.detail.startsWith('PASSWORD_VERIFY_FUNCTION=NULL;'));
		expect(verify).toHaveLength(1);
		expect(verify[0]!.detail).toContain('Affected Open Users (' + (target === 'd1-19c-lab' ? '10' : '2') + ')');
		expect(profileCheck.evidence.find(e => e.view === 'DBA_USERS')!.rows.length).toBeGreaterThan(2);
		const defaults = result.checks.find(c => c.id === 'default-passwords');
		expect(defaults).toBeDefined();
		const defaultUsers = new Set(defaults!.findings.map(f => f.subject));
		if (target === 'd1-19c-lab') {
			expect(defaultUsers.size).toBeGreaterThan(0);
			expect(defaultUsers.has('HR')).toBe(true);
		} else {
			expect(defaultUsers.size).toBe(0);
			expect(result.whoCan).toEqual(expect.arrayContaining([expect.objectContaining({
				subject: 'SHOPAPP', privilege: 'OWNER', source: 'owner', object: 'SHOPAPP.ORDERS', path: ['SHOPAPP', 'SHOPAPP.ORDERS'],
			})]));
		}
		expect(result.whoCan?.some(p => p.source === 'owner')).toBe(true);
		expect(result.whoCan?.some(p => p.privilege === 'SELECT')).toBe(true);
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved database ${target} unavailable`); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
