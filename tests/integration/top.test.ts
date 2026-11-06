import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { sampleTop } from '../../src/top/index.js';
for (const target of ['d1-19c-lab','p1-19c-prod']) it('samples top without ASH on ' + target, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const provider = createSessionProvider(loadConfig());
	try {
		const result = await sampleTop(await provider.get(target),5);
		expect(result.sql.status).not.toBe('unavailable'); expect(result.sql.intervalSeconds).toBeGreaterThanOrEqual(5);
		if (target === 'd1-19c-lab') { expect(result.load.status).toBe('ok'); expect(result.host.status).toBe('ok'); }
		else { expect(['ok','unavailable']).toContain(result.load.status); expect(['ok','unavailable']).toContain(result.host.status); }
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(e))) { context.skip('Approved database unavailable: ' + target); return; } throw e;
	} finally { await provider.closeAll(); }
},30000);
