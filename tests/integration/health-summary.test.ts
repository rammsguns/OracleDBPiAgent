import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createHealthCheckTool } from '../../src/tools/healthCheck.js';
for (const target of ['d1-19c-lab', 'c1-19c-pdb']) it(`health_check names maintenance units on ${target} without LLM`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; lab credentials unavailable'); return; }
	const config = loadConfig({...process.env, PIAGENT_TARGETS_FILE:resolve('config/targets.json'), PIAGENT_HOME:'/nonexistent-health-summary-test-home'});
	const sessions = createSessionProvider(config);
	try {
		try { await sessions.get(target); } catch (error) {
			if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { context.skip(`Lab ${target} unavailable`); return; }
			throw error;
		}
		const output = await createHealthCheckTool({config,sessions,runId:'health-summary-live',audit:{record:async()=>{}}}).execute('health-live', {target});
		const text = (output.content[0] as {text:string}).text;
		expect(text).toMatch(/maintenance: (WARN|CRIT)/);
		expect(text).toContain('measures: invalid objects plus unusable index/partition/subpartition units (non-Oracle-maintained owners)');
		expect(text).toContain(`piagent jobs --target ${target}`);
		if (target === 'c1-19c-pdb') {
			const maintenance = text.split('\n').find(line => line.includes('maintenance:'))!;
			expect(maintenance).toContain('SHOPAPP.INVALID_CUSTOMER_VIEW (VIEW)');
			expect(maintenance).toContain('SHOPAPP.HISTORY_ORDER_IX.P_202601');
		}
	} finally { await sessions.closeAll(); }
}, 120000);
