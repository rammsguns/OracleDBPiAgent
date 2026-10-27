import { expect, it } from 'vitest';
import { validateHardCases } from '../../evals/validate-hard.js';

it('validates all hard ground truth on approved 19c targets without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; Oracle credentials unavailable'); return; }
	try {
		const report = await validateHardCases();
		expect(report.records.length).toBeGreaterThanOrEqual(10);
		for (const record of report.records) {
			expect(record.rowCount, record.id).toBeGreaterThan(0);
			expect(record.rowCount, record.id).toBe(record.rows.length);
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ENOENT/.test(String(error))) { context.skip('Oracle listener or secret file unavailable'); return; }
		throw error;
	}
}, 120000);
