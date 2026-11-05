import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
it('triages slow SHOPAPP orders and a SQL_ID discovered by text on p1 without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	const target = 'p1-19c-prod';
	try {
		const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'wp19b-integration' };
		const slow = await triage(ctx, { target, issue: 'orders query slow on SHOPAPP.ORDERS' });
		const sql = slow.issues[0]!.sql;
		expect(sql.candidates?.status).toBe('ok');
		if (!sql.insight?.children.length) { context.skip('No active ORDERS cursor in the requested window'); return; }
		expect(sql.candidates!.rows.length).toBeLessThanOrEqual(3);
		const session = await sessions.get(target);
		let rows;
		try { rows = await session.query("SELECT SQL_ID FROM V$SQL WHERE SQL_TEXT = :text AND SQL_ID = :id", { text: sql.insight.text, id: sql.insight.sqlId }); }
		finally { await session.close(); }
		if (!rows.rows.length) { context.skip('Discovered statement aged out of cursor cache'); return; }
		const direct = await triage(ctx, { target, issue: `Why is SQL_ID ${rows.rows[0]![0]} slow?` });
		expect(direct.issues[0]!.sql.insight?.sqlId).toBe(sql.insight.sqlId);
		expect(direct.issues[0]!.sql.insight?.children.length).toBeGreaterThan(0);
		expect(direct.issues[0]!.sql.checks.every(c => c.sql.length > 0)).toBe(true);
		expect(renderTriageMarkdown(direct)).toContain('### SQL Performance');
		const legacy = structuredClone(direct);
		delete (legacy.issues[0] as { sql?: unknown }).sql;
		expect(() => renderTriageMarkdown(legacy)).not.toThrow();
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip('Approved p1 database unavailable'); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 120000);
