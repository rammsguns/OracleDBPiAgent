import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readAlertLog, readIncidents } from '../../src/alertlog/index.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`reads bounded alert rows and joined incidents on ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved database credentials unavailable'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'alertlog-integration' };
		const alert = await readAlertLog(ctx, target, { since: '30d', limit: 10 });
		const incidents = await readIncidents(ctx, target, { since: '30d', limit: 10 });
		expect(alert.status).toBe('ok'); expect(incidents.status).toBe('ok'); expect(alert.rows.length).toBeLessThanOrEqual(10); expect(incidents.rows.length).toBeLessThanOrEqual(10);
		for (const row of alert.rows) { expect(Buffer.byteLength(row.messageText)).toBeLessThanOrEqual(2048); expect(Date.parse(row.timestamp)).toBeGreaterThanOrEqual(Date.parse(alert.window.from)); }
		const code = alert.rows.find(row => row.codes.length)?.codes[0];
		const filtered = await readAlertLog(ctx, target, { from: alert.window.from, to: alert.window.to, codes: [code ?? 'ORA-00600'], text: 'ora-', level: 'all', limit: 5 });
		if (code) expect(filtered.rows.length).toBeGreaterThan(0);
		for (const row of filtered.rows) expect(row.codes).toContain(code ?? 'ORA-00600');
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Approved database ${target} unavailable`); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
