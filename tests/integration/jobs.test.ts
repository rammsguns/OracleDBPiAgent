import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readJobs } from '../../src/jobs/index.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`reads scheduler maintenance evidence on ${target} without LLM`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved lab credentials unavailable'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		const result = await readJobs({ config, sessions, audit: { record: async () => {} }, runId: 'jobs-integration' }, target, { since: '30d' });
		expect(result.sections.jobs!.status).toBe('ok');
		for (const section of Object.values(result.sections)) {
			expect(section.rows.length).toBeLessThanOrEqual(config.limits.maxRows);
			if (target === 'd1-19c-lab') expect(section.status).toBe('ok');
			if (section.status === 'unavailable') expect(section.note).toMatch(/not granted/);
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved lab ${target} unavailable`); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
