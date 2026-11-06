import { expect, it } from 'vitest';
import { validateP26 } from '../../evals/validate-p26.js';
it('reads p26 truth on both labs without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; credentials unavailable'); return; }
	try {
		for (const target of ['d1-19c-lab', 'p1-19c-prod']) {
			const report = await validateP26(target);
			expect(report.views.every(view => view.status === 'readable')).toBe(true);
			expect(report.records).toHaveLength(4);
			expect(report.records.every(record => record.status === 'readable')).toBe(true);
			if (target === 'p1-19c-prod') expect(report.records.every(record => 'rows' in record && record.rows.length)).toBe(true);
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ENOENT/.test(String(error))) { context.skip('Oracle listener or secret file unavailable'); return; }
		throw error;
	}
}, 120000);
