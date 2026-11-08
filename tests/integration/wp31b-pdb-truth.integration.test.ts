import { expect, it } from 'vitest';
import { loadHardCases, checkP31Cases } from '../../evals/validate-hard.js';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { runChecks, collectors, classify, DEFAULTS } from '../../src/check/index.js';

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
			if (test.id === 'hard-p31-backup-age') {
				expect(result.rows).toHaveLength(1);
				expect(result.rows[0]).toHaveLength(1);
				expect((await session.query('SELECT log_mode FROM v$database')).rows).toEqual([['ARCHIVELOG']]);
			}
			if (test.id === 'hard-p31-health') {
				expect(result.rows).toEqual(expect.arrayContaining([['REPORT_EXPORT_JOB'], ['INVALID_CUSTOMER_VIEW']]));
			}
		}
		let failureWindow: { from: string; to: string } | undefined;
		const check = await runChecks({ config, sessions, audit: { record: async () => {} }, runId: 'p31-truth' }, ['c1-19c-pdb'], undefined, {
			...collectors,
			jobs: async (...args) => {
				const result = await collectors.jobs(...args);
				failureWindow = result.window;
				return result;
			},
		});
		expect(check.targets[0]!.checks.find(c => c.id === 'maintenance')?.status).toMatch(/WARN|CRIT/);
		expect(failureWindow).toBeDefined();
		// The half-hour failure fixture must remain visible in the one-hour health window.
		// Compare the windowed health measurement to independent SQL over the exact collector window.
		const failures = await session.query(`SELECT COUNT(*) FROM dba_scheduler_job_run_details
			WHERE status='FAILED'
			AND log_date>=FROM_TZ(TO_TIMESTAMP(:from_time,'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')
			AND log_date<FROM_TZ(TO_TIMESTAMP(:to_time,'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'),'UTC')`,
			{ from_time: failureWindow!.from, to_time: failureWindow!.to });
		const failedCount = Number(failures.rows[0]![0]);
		expect(failedCount).toBeGreaterThan(0);
		expect(check.targets[0]!.checks.find(c => c.id === 'failedJobs')).toMatchObject({
			value: failedCount, status: classify(failedCount, DEFAULTS.failedJobs),
		});
	} finally { await sessions.closeAll(); }
}, 120000);
