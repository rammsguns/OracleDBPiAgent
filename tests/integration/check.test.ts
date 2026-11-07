import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { runChecks, exitCode } from '../../src/check/index.js';
import { resolve } from 'node:path';
for (const target of ['d1-19c-lab','p1-19c-prod']) it(`check collects read-only health verdicts on ${target} without LLM`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved lab credentials unavailable'); return; }
	const config=loadConfig({...process.env,PIAGENT_TARGETS_FILE:resolve('config/targets.json')}), sessions=createSessionProvider(config);
	try {
		try { await sessions.get(target); } catch(error) { if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) {context.skip(`Approved lab ${target} unavailable`);return;} throw error; }
		const result=await runChecks({config,sessions,audit:{record:async()=>{}},runId:'check-integration'},[target]);
		expect(result.targets).toHaveLength(1);expect(result.targets[0]!.checks.length).toBeGreaterThanOrEqual(10);
		expect(exitCode(result.status)).toBeGreaterThanOrEqual(0);
		for(const check of result.targets[0]!.checks){expect(['OK','WARN','CRIT','UNKNOWN']).toContain(check.status);expect(check.command).toContain(`--target ${target}`);expect(check.scope).toContain('non-CDB');if(check.value===null) expect(check.status).toBe('UNKNOWN');}
		expect(result.targets[0]!.checks.find(x=>x.id==='failedJobs')!.value).not.toBeNull();
		expect(result.targets[0]!.checks.find(x=>x.id==='defaultPasswords')!.value).not.toBeNull();
	}finally{await sessions.closeAll();}
},120000);
