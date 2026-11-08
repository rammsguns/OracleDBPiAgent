import { expect, it } from 'vitest';
import { loadHardCases, checkP31Cases } from '../../evals/validate-hard.js';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { runChecks } from '../../src/check/index.js';

it('C1: every phase31 truth SELECT parses and runs as PIAGENT_RO with nonempty truth', async ctx => {
	if (!process.env.PIAGENT_SECRET_DIR) { ctx.skip('PIAGENT_SECRET_DIR unset; C1 unavailable'); return; }
	const cases = (await loadHardCases()).filter(c => c.split === 'pdb');
	checkP31Cases(cases);
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		let session;
		try { session = await sessions.get('c1-19c-pdb'); }
		catch (error) {
			if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ENOENT/.test(String(error))) { ctx.skip('C1 listener/PDB or secret unavailable'); return; }
			throw error;
		}
		expect((await session.query("SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') FROM dual")).rows).toEqual([['PIAGENT_RO', 'PIPDB1']]);
		for (const test of cases) {
			if (!test.groundTruth) continue;
			// Successful Oracle execution proves syntax, grants and visibility; no SQL is submitted for refusals.
			const result = await session.query(test.groundTruth.sql);
			expect(result.truncated, test.id).toBe(false);
			expect(result.rows.length, test.id).toBeGreaterThan(0);
			for (const row of result.rows) for (const cell of row) expect(cell, test.id).not.toBeNull();
			if (test.id === 'hard-p31-health') {
				expect(result.rows).toEqual(expect.arrayContaining([['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]));
			}
		}
		const check = await runChecks({ config, sessions, audit: { record: async () => {} }, runId: 'p31-truth' }, ['c1-19c-pdb']);
		for (const id of ['failedJobs', 'maintenance']) expect(check.targets[0]!.checks.find(c => c.id === id)?.status).toMatch(/WARN|CRIT/);
	} finally { await sessions.closeAll(); }
}, 120000);
