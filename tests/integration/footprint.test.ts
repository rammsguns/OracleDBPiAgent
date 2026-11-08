import { expect, it } from 'vitest';
import { budgets, commands, config, measure } from '../helpers/footprint.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { TOP_SQL } from '../../src/oracle/topSnapshot.js';
import { SQL } from '../../src/security/sql.js';

for(const name of commands) it(`C1 footprint budget: ${name}`,async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset; C1 credentials unavailable');return;}
	const provider=createSessionProvider(config());
	try{await provider.get('c1-19c-pdb');}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(e))){test.skip('C1 listener/PDB unavailable');return;}throw e;}finally{await provider.closeAll();}
	const result=await measure('c1-19c-pdb',name);
	expect(result.stats.length,'measurement must capture SQL, not silently report zero').toBeGreaterThan(4);
	expect(result.elapsedMs).toBeLessThan(budgets[name]!.elapsedMs);
	expect(result.bufferGets).toBeLessThan(budgets[name]!.bufferGets);
	if(name==='top'){const sql=result.stats.filter(r=>String(r[8]).includes(TOP_SQL));expect(sql).toHaveLength(1);expect(Number(sql[0]![1])).toBe(2);}
},120000);

for(const target of ['c1-19c-pdb','d1-19c-lab','p1-19c-prod'])it(`PUBLIC grant rewrite retains rows on ${target}`,async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset');return;}
	const provider=createSessionProvider(config());
	try{
		let s;try{s=await provider.get(target);}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(e))){test.skip('Lab unavailable');return;}throw e;}
		const legacy="SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWNER = P.OWNER AND O.OBJECT_NAME = P.TABLE_NAME AND O.SUBOBJECT_NAME IS NULL AND O.OBJECT_TYPE NOT IN ('PACKAGE BODY','TYPE BODY') JOIN DBA_USERS U ON U.USERNAME = P.OWNER WHERE P.GRANTEE = 'PUBLIC' AND ((P.OWNER = 'SYS' AND P.TABLE_NAME IN ('UTL_FILE','UTL_HTTP','UTL_TCP','UTL_SMTP','UTL_INADDR','DBMS_SQL','DBMS_JAVA','DBMS_LDAP','DBMS_SCHEDULER')) OR (U.ORACLE_MAINTAINED = 'N' AND O.OBJECT_TYPE IN ('TABLE','VIEW','MATERIALIZED VIEW'))) ORDER BY P.OWNER, P.TABLE_NAME, P.PRIVILEGE";
		const before=await s.query(legacy),after=await s.query(SQL.public);
		expect(after.rows).toEqual(before.rows);expect(after.truncated).toBe(before.truncated);
		const owners=await s.query("SELECT USERNAME FROM DBA_USERS WHERE ORACLE_MAINTAINED='N'");
		const names=new Set(owners.rows.map(r=>r[0]));
		const counts=await s.query('SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS GROUP BY OWNER ORDER BY OWNER');
		expect((await s.query(SQL.owned)).rows).toEqual(counts.rows.filter(r=>names.has(r[0])));
	}finally{await provider.closeAll();}
},60000);
