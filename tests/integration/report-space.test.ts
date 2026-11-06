import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
import { compareTargets } from '../../src/drift/index.js';
it('reads opt-in space reports and compares space configuration on both approved targets', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'space-report-integration' };
	try {
		for (const target of config.targets) {
			const r = await generateReport(ctx, { target: target.name, sections: ['space'] });
			expect(r.sections.map(s => s.name)).toEqual(['space']); expect(r.sections[0]?.status).toBe('ok');
			expect(r.sections[0]?.rows.some(row => row[0] === 'tablespace')).toBe(true);
			const self = await compareTargets(ctx, { left: target.name, right: target.name, scope: 'space' });
			expect(self).toMatchObject({ complete: true, hasDrift: false });
		}
		const drift = await compareTargets(ctx, { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'space' });
		expect(drift).toMatchObject({ complete: true, hasDrift: true });
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved Oracle listener unavailable'); return; } throw error;
	} finally { await sessions.closeAll(); }
}, 120000);
