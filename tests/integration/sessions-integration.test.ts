import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
import { collectSessions } from '../../src/triage/sessions.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`sessions triage and report SELECT evidence: ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		try { const probe = await sessions.get(target); await probe.close(); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'sessions-integration' };
		const evidence = await collectSessions(ctx, target);
		expect(evidence.activity?.status).toBe('ok');
		expect(evidence.sqlIds.length).toBeLessThanOrEqual(2);
		const r = await generateReport(ctx, { target, sections: ['sessions'] });
		expect(r.sections[0]?.status).toBe('ok');
		expect(r.sections[0]?.rows.some(row => row[0] === 'blockers')).toBe(true);
		expect(r.sections[0]?.rows.every(row => row[4] !== null)).toBe(true);
	} finally { await sessions.closeAll(); }
}, 60000);
