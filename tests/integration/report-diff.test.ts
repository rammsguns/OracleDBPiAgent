import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
import { diff } from '../../src/report/diff.js';
import { loadLatestReport, saveReport } from '../../src/report/history.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`back-to-back saved report diff: ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config), dir = await mkdtemp(join(tmpdir(), 'report-diff-live-'));
	try {
		try { const session = await sessions.get(target); await session.close(); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'report-diff-integration' };
		const first = await generateReport(ctx, { target }); await saveReport(dir, first, config.targets);
		const previous = await loadLatestReport(dir, target, config.targets);
		const current = await generateReport(ctx, { target }); const changes = diff(previous, current);
		await saveReport(dir, current, config.targets);
		expect(first.sections.find(s => s.name === 'identity')?.status).toBe('ok');
		expect(current.sections.find(s => s.name === 'identity')?.status).toBe('ok');
		expect(changes.changes.filter(c => !['top_sql', 'waits'].includes(c.section))).toEqual([]);
		console.log(`${target} back-to-back diff: ${JSON.stringify(changes)}`);
	} finally { await sessions.closeAll(); await rm(dir, { recursive: true, force: true }); }
}, 60000);
