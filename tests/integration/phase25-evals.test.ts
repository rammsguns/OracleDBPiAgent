import { expect, it } from 'vitest';
import { validateP25 } from '../../evals/validate-p25.js';

it('reads p25 backup truth on d1 and reports per-view evidence gaps on p1 without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; Oracle credentials unavailable'); return; }
	try {
		for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
			const report = await validateP25(target);
			expect(report.records).toHaveLength(4);
			for (const record of report.records) {
				if (record.status === 'readable') expect(record.rows?.length).toBeGreaterThan(0);
				else {
					expect(record.status).toBe('not verifiable from this database');
					expect(record).not.toHaveProperty('rows');
				}
			}
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ENOENT/.test(String(error))) { context.skip('Oracle listener or secret file unavailable'); return; }
		throw error;
	}
}, 120000);
