import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { readBackup } from '../../src/backup/index.js';
for(const target of ['d1-19c-lab','p1-19c-prod']) it('reads backup metadata on '+target,async context=>{
	if(!process.env.PIAGENT_SECRET_DIR) {context.skip('PIAGENT_SECRET_DIR unset');return;}
	const provider=createSessionProvider(loadConfig());
	try {
		const r=await readBackup(await provider.get(target));
		expect(r.target).toBe(target);
		expect(Object.keys(r.evidence)).toHaveLength(13);
		if(target==='d1-19c-lab') expect(r.status).toBe('ok');
		else {expect(r.status).toBe('partial');expect(r.restoreEstimate.status).toBe('not-verifiable');}
	} catch(e) {
		if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(e))) {context.skip('Approved database unavailable: '+target);return;}
		throw e;
	} finally {await provider.closeAll();}
},60000);
