import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
import { loadReportHistory, saveReport } from '../../src/report/history.js';
import { buildReportTrends } from '../../src/report/trends.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`three saved history runs: ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config), dir = await mkdtemp(join(tmpdir(), 'report-trends-live-'));
	try {
		try { const session = await sessions.get(target); await session.close(); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		for (let i = 0; i < 3; i++) {
			const report = await generateReport({ config, sessions, audit: { record: async () => {} }, runId: 'report-history-live' }, { target });
			expect(report.sections.find(s => s.name === 'tablespaces')?.status).toBe('ok');
			await saveReport(dir, report, config.targets);
		}
		await sessions.closeAll();
		const history = await loadReportHistory(dir, target, config.targets);
		const result = buildReportTrends(history);
		expect(history.skipped).toBe(0); expect(result.runs).toBe(3);
		expect(result.series.filter(s => s.id.startsWith('tablespace:')).length).toBeGreaterThan(0);
		expect(result.series.find(s => s.id.startsWith('tablespace:'))?.points.every(p => p.value !== null)).toBe(true);
		console.log(`${target}: ${result.runs} saved runs, ${result.series.length} series, ${history.skipped} skipped`);
	} finally { await sessions.closeAll(); await rm(dir, { recursive: true, force: true }); }
}, 60000);
