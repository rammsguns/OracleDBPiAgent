import { expect, it } from 'vitest';
import { validateP18 } from '../../evals/validate-p18.js';

it('validates p18 SQL ground truth against alert-reader APIs on both approved targets without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved database credentials unavailable'); return; }
	try {
		const report = await validateP18();
		expect(report.records).toHaveLength(6);
		for (const record of report.records) expect(record.rows).toHaveLength(1);
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip('Approved 19c database unavailable'); return; }
		throw error;
	}
}, 60000);
