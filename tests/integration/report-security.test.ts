import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
import { readSecurityPosture } from '../../src/security/index.js';
import { compareTargets } from '../../src/drift/index.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`security report reuses posture evidence: ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		let session;
		try { session = await sessions.get(target); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		const posture = await readSecurityPosture(session, { checks: ['powerful-privileges', 'public-grants'] });
		await session.close();
		const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'report-security-integration' };
		const report = await generateReport(ctx, { target, sections: ['security'] });
		expect(report.sections).toHaveLength(1);
		for (const check of posture.checks) expect(report.sections[0]!.rows.filter(r => r[0] === check.id && r[3] !== null).length).toBe(check.findings.length);
		if (target === 'd1-19c-lab') {
			const drift = await compareTargets(ctx, { left: target, right: 'p1-19c-prod', scope: 'security' });
			expect(drift.sections.map(s => s.name)).toEqual(['powerful-privileges', 'public-grants']);
			expect(drift.complete).toBe(true);
		}
	} finally { await sessions.closeAll(); }
}, 60000);
