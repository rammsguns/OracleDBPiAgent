import {expect,it} from 'vitest';
import {loadConfig} from '../../src/config/index.js';
import {createSessionProvider} from '../../src/oracle/index.js';
import {readBackup} from '../../src/backup/index.js';
import {runChecks} from '../../src/check/index.js';
import {createWebServer} from '../../src/web/server.js';

it('C1 PDB: UTC backup age, measured health, deliberate defects and all web tabs without LLM',async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset; C1 unavailable');return;}
	const previous=process.env.TZ;process.env.TZ='America/Mexico_City';
	const config=loadConfig(), sessions=createSessionProvider(config);
	let web: ReturnType<typeof createWebServer>|undefined;
	try {
		let s;
		try{s=await sessions.get('c1-19c-pdb');}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(e))){test.skip('C1 listener/PDB unavailable');return;}throw e;}
		expect(s.identity.containerName).toBe('PIPDB1');
		const wall=await s.query("SELECT DATE '2026-11-08', TIMESTAMP '2026-11-08 06:15:00', TO_CHAR(SYSTIMESTAMP,'TZH:TZM') FROM dual");
		expect(wall.rows[0]![2]).toBe('+00:00');
		expect((wall.rows[0]![0] as Date).toISOString()).toBe('2026-11-08T00:00:00.000Z');
		expect((wall.rows[0]![1] as Date).toISOString()).toBe('2026-11-08T06:15:00.000Z');
		const backup=await readBackup(s);
		expect(backup.files.length).toBeGreaterThan(0);expect(backup.files.every(f=>f.level0)).toBe(true);
		const age=await s.query("SELECT (CAST(SYSTIMESTAMP AS DATE)-MAX(COMPLETION_TIME))*24 FROM V$BACKUP_DATAFILE WHERE INCREMENTAL_LEVEL=0 OR INCREMENTAL_LEVEL IS NULL");
		const latest=Math.max(...backup.files.map(f=>Date.parse(f.level0!)));
		expect(Math.abs((Date.now()-latest)/3600000-Number(age.rows[0]![0]))).toBeLessThan(0.02);
		const ctx={config,sessions,audit:{record:async()=>{}},runId:'c1-live'};
		const run=await runChecks(ctx,['c1-19c-pdb']);
		// C1 has no scheduled backups: the expected status follows the measured level-0 age (warn 26h, crit 50h).
		const ageHours=Number(age.rows[0]![0]);
		if(Math.abs(ageHours-26)>0.1&&Math.abs(ageHours-50)>0.1)expect(run.targets[0]!.checks.find(c=>c.id==='backupAge'),'backupAge').toMatchObject({status:ageHours<26?'OK':ageHours<50?'WARN':'CRIT'});
		for(const id of ['archiveGaps','blocking'])expect(run.targets[0]!.checks.find(c=>c.id===id),id).toMatchObject({status:'OK'});
		expect(run.targets[0]!.checks.find(c=>c.id==='alertErrors')!.status).not.toBe('UNKNOWN');
		for(const c of run.targets[0]!.checks.filter(c=>c.id.startsWith('undo:')||c.id.startsWith('temp:')))expect(c.status).toBe('OK');
		web=createWebServer({config,port:0,token:'c1-test-only',sessionFactory:async()=>createSessionProvider(config)});
		const url=new URL(await web.listen());
		for(const path of ['targets','check','backup','space','jobs','top','db-sessions','security','alertlog','sql','plsql/list','report','report/history']){
			const extra=path==='top'?'&seconds=5':path==='sql'?'&text=SHOPAPP':'';
			const response=await fetch(`${url.origin}/api/${path}?target=c1-19c-pdb${extra}`,{headers:{Authorization:'Bearer c1-test-only'}});
			expect(response.status,path+': '+await response.text()).toBe(200);
		}
		const drift=await fetch(`${url.origin}/api/drift`,{method:'POST',headers:{Authorization:'Bearer c1-test-only','Content-Type':'application/json'},body:JSON.stringify({left:'c1-19c-pdb',right:'c1-19c-pdb',scope:'schema:SHOPAPP'})});
		expect(drift.status).toBe(200);
		expect(await drift.json()).toMatchObject({complete:true,hasDrift:false});
	} finally {await web?.close();await sessions.closeAll();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
},180000);
