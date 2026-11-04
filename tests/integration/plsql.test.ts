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
		const purge = workload.signatures.find(s => s.name === 'NIGHTLY_PURGE')!;
		expect(purge.bodyRange).toMatchObject({ startLine: 24, endLine: 29 });
		expect(purge.tables.find(t => t.name === 'ORDERS')?.operations).toEqual(['SELECT', 'DELETE']);
		expect(purge.tables.find(t => t.name === 'ORDER_LINES')?.operations).toEqual(['DELETE']);
		expect(workload.tables.find(t => t.name === 'ORDER_LINES')?.operations).not.toContain('SELECT');
		const ship = workload.signatures.find(s => s.name === 'SHIP_ORDERS')!;
		expect(ship.tables.map(t => [t.name, t.operations])).toEqual([['ORDERS', ['UPDATE']]]);
		expect(workload.signatures.find(s => s.name === 'PLACE_ORDERS')?.signature).toContain('DEFAULT 25');
		expect(workload.callers.rows.some(c => c.owner === 'SHOPAPP' && c.name === 'WORKLOAD' && c.type === 'PACKAGE BODY')).toBe(false);
		expect(workload.graph.edges.find(e => e.from === 'job:SHOPAPP.NIGHTLY_PURGE_JOB')?.to).toBe(`subprogram:SHOPAPP.WORKLOAD:${purge.subprogramId}:${purge.overload ?? ''}`);
		expect(workload.graph.edges.some(e => e.label === 'DELETE' && e.from.includes(`:${purge.subprogramId}:`))).toBe(true);
		expect(workload.source.rows.some(s => s.type === 'PACKAGE BODY' && s.line === 27 && /DELETE/i.test(s.text))).toBe(true);
		expect(workload.tables.some(t => t.operations.includes('DELETE'))).toBe(true);
		const list = await listPlsql(ctx, 'd1-19c-lab', 'HR');
		const procedure = list.rows.find(o => o.type === 'PROCEDURE'); expect(procedure).toBeDefined();
		const hr = await documentPlsql(ctx, 'd1-19c-lab', `HR.${procedure!.name}`);
		expect(hr.signatures[0]?.bodyRange).not.toBeNull(); expect(hr.signatures[0]?.tables.length).toBeGreaterThan(0);
		expect(hr.source.status).toBe('ok'); expect(hr.source.rows.length).toBeGreaterThan(0);
		console.log(`PL/SQL live: WORKLOAD ${workload.source.rows.length} lines, ${workload.signatures.length} signatures, jobs=${workload.jobs.status}; HR.${procedure!.name} ${hr.source.rows.length} lines`);
	} finally { await sessions.closeAll(); }
}, 120000);
