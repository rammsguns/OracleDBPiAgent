import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readSpaceUsage, renderSpaceMarkdown, SECTION_IDS } from '../../src/space/index.js';
for (const target of ['d1-19c-lab','p1-19c-prod']) it('reads every space section on ' + target, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved credentials unavailable'); return; }
	const provider = createSessionProvider(loadConfig());
	try {
		const session = await provider.get(target);
		const a = await readSpaceUsage(session);
		expect(a.target).toBe(target); expect(a.status).toBe('ok');
		for (const id of SECTION_IDS) { expect(a.sections[id].status, id).toBe('ok'); expect(a.sections[id].evidence.columns.length).toBeGreaterThan(0); }
		expect(renderSpaceMarkdown(a)).toContain('Binary units');
		expect(a.sections.tablespaces.rows.every(t => t.maxBytes >= t.allocatedBytes && t.headroomBytes >= 0)).toBe(true);
		expect(a.sections.segments.rows.length).toBeLessThanOrEqual(20);
		const owner = target === 'd1-19c-lab' ? 'SH' : 'SHOPAPP';
		const filtered = await readSpaceUsage(session, { sections: ['segments'], owner, top: 2 });
		expect(filtered.sections.segments.rows.length).toBeGreaterThan(0);
		expect(filtered.sections.segments.rows.every(r => r.owner === owner)).toBe(true);
		expect(filtered.sections.segments.rows.length).toBeLessThanOrEqual(2);
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(e))) { context.skip('Approved database unavailable: ' + target); return; }
		throw e;
	} finally { await provider.closeAll(); }
},60000);
