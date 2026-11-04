import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { documentPlsql, listPlsql } from '../../src/plsql/index.js';
it('documents WORKLOAD and an HR procedure using read-only dictionary evidence', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'plsql-integration' };
	try {
		for (const target of config.targets) {
			try { const session = await sessions.get(target.name); await session.close(); }
			catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved Oracle listener unavailable'); return; } throw error; }
		}
		const workload = await documentPlsql(ctx, 'p1-19c-prod', 'SHOPAPP.WORKLOAD');
		expect(workload.objects.rows.map(o => o.type)).toEqual(['PACKAGE', 'PACKAGE BODY']);
		expect(workload.signatures.map(s => s.name)).toContain('NIGHTLY_PURGE');
		expect(workload.source.rows.some(s => s.type === 'PACKAGE BODY' && s.line === 27 && /DELETE/i.test(s.text))).toBe(true);
		expect(workload.tables.some(t => t.operations.includes('DELETE'))).toBe(true);
		const list = await listPlsql(ctx, 'd1-19c-lab', 'HR');
		const procedure = list.rows.find(o => o.type === 'PROCEDURE'); expect(procedure).toBeDefined();
		const hr = await documentPlsql(ctx, 'd1-19c-lab', `HR.${procedure!.name}`);
		expect(hr.source.status).toBe('ok'); expect(hr.source.rows.length).toBeGreaterThan(0);
		console.log(`PL/SQL live: WORKLOAD ${workload.source.rows.length} lines, ${workload.signatures.length} signatures, jobs=${workload.jobs.status}; HR.${procedure!.name} ${hr.source.rows.length} lines`);
	} finally { await sessions.closeAll(); }
}, 120000);
