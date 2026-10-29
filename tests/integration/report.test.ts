import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { generateReport } from '../../src/report/index.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it(`full read-only report and independent facts: ${target}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config = loadConfig(); const sessions = createSessionProvider(config);
	try {
		let session;
		try { session = await sessions.get(target); }
		catch (e) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('Oracle listener unavailable'); return; } throw e; }
		const start = performance.now();
		const r = await generateReport({ config, sessions, audit: { record: async () => {} }, runId: 'report-integration' }, { target });
		expect(performance.now() - start).toBeLessThan(30000);
		expect(r.sections.find(s => s.name === 'identity')?.status).toBe('ok');
		for (const s of r.sections) {
			expect(['ok', 'unavailable']).toContain(s.status);
			if (s.status === 'unavailable') expect(s.note).toMatch(/^not available: (needs SELECT on SYS\.|query timed out \(SYS\.)/);
		}
		const stats = r.sections.find(s => s.name === 'optimizer_stats')!;
		if (stats.status === 'ok') {
			const view = stats.source;
			const count = await session.query(`SELECT COUNT(*) FROM ${view} WHERE owner=:owner AND object_type='TABLE' AND (stale_stats='YES' OR stattype_locked IS NOT NULL OR last_analyzed IS NULL)`, { owner: session.target.defaultSchema });
			for (const row of stats.rows) {
				const estimate = await session.query('SELECT num_rows FROM all_tables WHERE owner=:owner AND table_name=:name', { owner: row[0], name: row[1] });
				expect(row[2]).toBe(estimate.rows[0]?.[0]);
			}
			expect(stats.rows.length).toBe(Math.min(Number(count.rows[0]![0]), 100, config.limits.maxRows));
		}
		const space = r.sections.find(s => s.name === 'tablespaces')!;
		if (space.status === 'ok' && space.source.startsWith('DBA_DATA_FILES')) {
			const independent = await session.query('SELECT tablespace_name, SUM(bytes) FROM dba_data_files GROUP BY tablespace_name');
			const free = await session.query('SELECT tablespace_name, SUM(bytes) FROM dba_free_space GROUP BY tablespace_name');
			for (const row of space.rows) {
				expect(row[1]).toBe(independent.rows.find(v => v[0] === row[0])?.[1]);
				expect(row[2]).toBe(free.rows.find(v => v[0] === row[0])?.[1] ?? 0);
				expect(row[3]).toBe(Number(row[1]) - Number(row[2]));
			}

		}
		const top = r.sections.find(s => s.name === 'top_sql')!;
		if (top.status === 'ok') {
			for (const row of top.rows) {
				const independent = await session.query('SELECT sql_id FROM v$sql WHERE sql_id=:id FETCH FIRST 1 ROWS ONLY', { id: row[0] });
				expect(independent.rows[0]?.[0]).toBe(row[0]);
			}
		}
		console.log(`${target}: ${r.sections.filter(s => s.status === 'ok').length}/${r.sections.length} sections ok; report ${Math.round(performance.now() - start)}ms including independent verification`);
		await session.close();
	} finally { await sessions.closeAll(); }
}, 60000);
