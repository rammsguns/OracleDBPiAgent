import { expect, it } from 'vitest';
import { loadHardCases, checkP33Cases } from '../../evals/validate-hard.js';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';

it('C1S: every phase33 truth SELECT parses and returns nonempty truth as PIAGENT_RO', async ctx => {
	if (!process.env.PIAGENT_SECRET_DIR) { ctx.skip('PIAGENT_SECRET_DIR unset; C1S unavailable'); return; }
	const cases = (await loadHardCases()).filter(test => test.split === 'standby');
	checkP33Cases(cases);
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		let session;
		try { session = await sessions.get('c1s-19c-stby'); }
		catch (error) {
			if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ENOENT/.test(String(error))) { ctx.skip('C1S listener/PIPDB1 service or configured secret unavailable'); return; }
			throw error;
		}
		expect((await session.query("SELECT USER, SYS_CONTEXT('USERENV','CON_NAME') FROM dual")).rows).toEqual([['PIAGENT_RO', 'PIPDB1']]);
		for (const test of cases) {
			if (!test.groundTruth) continue;
			let result;
			try { result = await session.query(test.groundTruth.sql); }
			catch (error) { throw new Error(`Truth query failed for ${test.id}: ${String(error).split('\n')[0]}`); }
			expect(result.truncated, test.id).toBe(false);
			expect(result.rows.length, test.id).toBeGreaterThan(0);
			for (const row of result.rows) for (const cell of row) expect(cell, test.id).not.toBeNull();
			if (test.id === 'hard-p33-role-open') expect(result.rows).toEqual([['PHYSICAL STANDBY', 'READ ONLY WITH APPLY']]);
			if (test.id === 'hard-p33-mrp') expect(result.rows.some(row => row[0] === 'MRP0' && row[1] === 'APPLYING_LOG')).toBe(true);
			if (test.id === 'hard-p33-transport-lag') expect(result.rows).toEqual([['UNDER_5_MIN']]);
			if (test.id === 'hard-p33-job-history') expect(result.rows).toHaveLength(1);
		}
	} finally { await sessions.closeAll(); }
}, 120000);
