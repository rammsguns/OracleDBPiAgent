import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { runChecks, exitCode, collectors, renderCheckMarkdown, worst } from '../../src/check/index.js';
import { resolve } from 'node:path';
for (const target of ['d1-19c-lab','p1-19c-prod']) it(`check collects read-only health verdicts on ${target} without LLM`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset; approved lab credentials unavailable'); return; }
	const config=loadConfig({...process.env,PIAGENT_TARGETS_FILE:resolve('config/targets.json')}), sessions=createSessionProvider(config);
	try {
		try { await sessions.get(target); } catch(error) { if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) {context.skip(`Approved lab ${target} unavailable`);return;} throw error; }
		let backup: Awaited<ReturnType<typeof collectors.backup>> | undefined;
		let space: Awaited<ReturnType<typeof collectors.space>> | undefined;
		const readers = {...collectors,backup: async (...args: Parameters<typeof collectors.backup>) => backup=await collectors.backup(...args),space: async (...args: Parameters<typeof collectors.space>) => space=await collectors.space(...args)};
		const result=await runChecks({config,sessions,audit:{record:async()=>{}},runId:'check-integration'},[target],undefined,readers);
		expect(result.targets).toHaveLength(1);expect(result.targets[0]!.checks.length).toBeGreaterThanOrEqual(10);
		expect(exitCode(result.status)).toBeGreaterThanOrEqual(0);
		for(const check of result.targets[0]!.checks){expect(['OK','WARN','CRIT','UNKNOWN']).toContain(check.status);expect(check.command).toContain(`--target ${target}`);expect(check.scope).toContain('non-CDB');if(check.value===null && check.status==='OK'){if(check.id==='expiry'){expect(check.display).toBe('none');expect(check.note).toBe('No expiring unlocked accounts (unlimited or no expiry)');}else {expect(check.id).toBe('dgLag');expect(check.display).toBe('not applicable (primary)');expect(check.note).toContain('Not applicable (primary)');}}else if(check.value===null) expect(check.status).toBe('UNKNOWN');}
		expect(result.targets[0]!.checks.find(x=>x.id==='failedJobs')!.value).not.toBeNull();
		expect(result.targets[0]!.checks.find(x=>x.id==='defaultPasswords')!.value).not.toBeNull();
		const checks=result.targets[0]!.checks;
		expect(result.status).toBe(worst(checks.map(c=>c.status)));
		if(checks.some(c=>c.status==='CRIT'))expect(exitCode(result.status)).toBe(2);
		const byId=(id:string)=>checks.find(c=>c.id===id)!;
		if(backup?.evidence.database.rows[0]?.LOG_MODE==='NOARCHIVELOG')expect(byId('archiveGaps').note).toContain('NOARCHIVELOG');
		if(backup && ['jobs','backups','sets'].every(id=>!backup!.evidence[id as 'jobs'].rows.length))expect(byId('backupAge').note).toContain('No backups recorded in the visible control-file history');
		if(space?.sections.recovery.status==='ok' && !space.sections.recovery.rows.some(r=>r.kind==='Area'))expect(byId('recovery').note).toContain('DB_RECOVERY_FILE_DEST unset');
		for(const c of checks)if(c.value!==null)expect(c.display).not.toBe('UNKNOWN');
		expect(renderCheckMarkdown(result)).not.toContain('&gt;');

	}finally{await sessions.closeAll();}
},120000);
