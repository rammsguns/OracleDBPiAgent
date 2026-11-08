import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readDatabaseRole, readDgLag } from '../../src/backup/role.js';
import { runChecks } from '../../src/check/index.js';
it('C1S standby scope, received archive continuity and honest lag/backup evidence',async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset');return;}
	const config=loadConfig(),sessions=createSessionProvider(config);
	try {
		let s;try{s=await sessions.get('c1s-19c-stby');}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(e))){test.skip('C1S listener on 1525 unavailable');return;}throw e;}
		expect(await readDatabaseRole(s)).toMatchObject({standby:true,uniqueName:'CDB19S',openMode:'READ ONLY WITH APPLY'});
		const run=await runChecks({config,sessions,audit:{record:async()=>{}},runId:'standby-live'},['c1s-19c-stby']);
		const checks=run.targets[0]!.checks;
		expect(checks.find(c=>c.id==='archiveGaps')).toMatchObject({status:'OK',value:0,scope:expect.stringContaining('Physical standby CDB19S')});
		expect(checks.find(c=>c.id==='backupAge')).toMatchObject({status:'UNKNOWN',note:expect.stringContaining('normally taken on the primary')});
		const lag=await readDgLag(s);
		// Oracle 19.9 exposes NULL apply lag inside this PDB even while root reports 0.
		expect(checks.find(c=>c.id==='dgLag')!.status).toBe(lag.value===null?'UNKNOWN':'OK');
		for(const target of ['c1-19c-pdb','d1-19c-lab','p1-19c-prod'])expect((await readDatabaseRole(await sessions.get(target))).role).toBe('PRIMARY');
	} finally {await sessions.closeAll();}
},120000);
