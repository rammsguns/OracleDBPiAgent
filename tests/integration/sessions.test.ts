import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readSessionActivity, renderSessionsMarkdown, SECTION_IDS } from '../../src/sessions/index.js';
for (const target of ['d1-19c-lab','p1-19c-prod']) it('reads every sessions section on ' + target, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved credentials unavailable'); return; }
	const provider = createSessionProvider(loadConfig());
	try {
		const session = await provider.get(target);
		const a = await readSessionActivity(session);
		expect(a.target).toBe(target); expect(a.self.sid).toBeGreaterThan(0); expect(a.status).toBe('ok');
		for (const id of SECTION_IDS) { expect(a.sections[id].status, id).toBe('ok'); expect(a.sections[id].evidence.columns.length).toBeGreaterThan(0); }
		expect(a.sections.active.rows.every(r => r.sid !== a.self.sid && r.type === 'USER')).toBe(true);
		expect(a.sections.waits.rows.every(r => r.waitClass !== 'Idle')).toBe(true);
		expect(a.sections.timeModel.rows.some(r => r.name === 'DB time')).toBe(true);
		expect(renderSessionsMarkdown(a)).toContain('since instance startup');
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(e))) { context.skip('Approved database unavailable: ' + target); return; }
		throw e;
	} finally { await provider.closeAll(); }
},60000);
