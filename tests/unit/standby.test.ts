import { expect, it, vi } from 'vitest';
import type { OracleSession } from '../../src/contracts.js';
import { readDatabaseRole, readDgLag, lagSeconds } from '../../src/backup/role.js';
import { analyzeBackup, SQL, type BackupReport } from '../../src/backup/index.js';
import { classify, DEFAULTS, parseCheckConfig, thresholdsFor } from '../../src/check/index.js';
function session(role='PHYSICAL STANDBY', apply:unknown='+00 00:00:00', mrp=true) {
	return {identity:{},query:vi.fn(async(sql:string)=>sql.includes('DATABASE_ROLE')?{columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[[role,'READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']]}:sql.includes('MANAGED_STANDBY')?{rows:mrp?sql.includes('THREAD#')?[['MRP0','APPLYING_LOG',1,37,66517],['RFS','RECEIVING',1,37,66509]]:[['MRP0','APPLYING_LOG']]:[]}:sql.includes('ARCHIVED_LOG')?{rows:[]}: {rows:[['transport lag','+00 00:00:00',new Date().toISOString(),new Date().toISOString()],['apply lag',apply,new Date().toISOString(),new Date().toISOString()]]})} as unknown as OracleSession;
}
it('detects role once across wrappers sharing session identity',async()=>{
	const s=session();expect(await readDatabaseRole(s)).toMatchObject({standby:true,uniqueName:'CDB19S'});
	expect((await readDatabaseRole({...s})).label).toContain('Physical standby CDB19S (read only with apply)');expect(s.query).toHaveBeenCalledTimes(1);
});
it('primary lag is explicitly not applicable without a fabricated measurement',async()=>expect(await readDgLag(session('PRIMARY'))).toMatchObject({value:null,note:expect.stringContaining('Not applicable (primary)')}));
it('hidden role stays unknown',async()=>{const s=session();vi.mocked(s.query).mockRejectedValue(new Error('ORA-00942'));expect((await readDatabaseRole(s)).role).toBe('');expect((await readDgLag(s)).value).toBeNull();});
it('lag requires both valid measurements and MRP',async()=>{
	expect((await readDgLag(session())).value).toBe(0);
	for(const s of [session('PHYSICAL STANDBY','bad'),session('PHYSICAL STANDBY','+00 00:00:00',false)])expect((await readDgLag(s)).value).toBeNull();
	expect(lagSeconds('+02 01:02:03')).toBe(176523);
	for(const [seconds,status] of [[299,'OK'],[300,'WARN'],[1800,'CRIT']] as const)expect(classify(seconds,DEFAULTS.dgLag)).toBe(status);
	const cfg=parseCheckConfig({version:1,defaults:{dgLag:{warn:60,crit:120},disable:['dgLag']}},['lab']);expect(thresholdsFor(cfg,'lab').dgLag.warn).toBe(60);
});
it('hidden PDB apply lag uses recent transport lag only when MRP is caught up',async()=>{
	const s=session('PHYSICAL STANDBY',null);const note=await readDgLag(s);
	expect(note.value).toBe(0);expect(note.note).toContain('PDB hides apply lag');expect(note.note).toContain('seq/block 37/66509');
});
it('hidden PDB apply lag stays unknown when MRP is behind or missing',async()=>{
	const behind=session('PHYSICAL STANDBY',null);vi.mocked(behind.query).mockImplementation(async(sql:string)=>sql.includes('DATABASE_ROLE')?{columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PHYSICAL STANDBY','READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']]}:sql.includes('THREAD#')?{rows:[['MRP0','APPLYING_LOG',1,37,66500],['RFS','RECEIVING',1,37,66509]]}:sql.includes('MANAGED_STANDBY')?{rows:[['MRP0','APPLYING_LOG']]}:sql.includes('ARCHIVED_LOG')?{rows:[]}:{rows:[['transport lag','+00 00:00:00',new Date().toISOString(),new Date().toISOString()],['apply lag',null,new Date().toISOString(),new Date().toISOString()]]});
	expect((await readDgLag(behind)).note).toContain('MRP0 is behind');
	expect((await readDgLag(session('PHYSICAL STANDBY',null,false))).note).toContain('no visible MRP0');
});
it('hidden PDB apply lag stays unknown when datum is stale',async()=>{
	const s=session('PHYSICAL STANDBY',null);vi.mocked(s.query).mockImplementation(async(sql:string)=>sql.includes('DATABASE_ROLE')?{columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PHYSICAL STANDBY','READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']]}:{rows:[['transport lag','+00 00:00:00',new Date().toISOString(),new Date(Date.now()-180000).toISOString()],['apply lag',null]]});
	expect((await readDgLag(s)).note).toContain('within 120 seconds');
});
it('duplicate and deleted received redo do not create false gaps; missing received sequences and V$ARCHIVE_GAP do',()=>{
	const evidence=Object.fromEntries(Object.keys(SQL).map(id=>[id,{status:'ok',rows:[],truncated:false}])) as unknown as BackupReport['evidence'];
	evidence.database.rows=[{'RESETLOGS_CHANGE#':1,LOG_MODE:'ARCHIVELOG'}];
	const log=(seq:number,registrar='RFS')=>({'THREAD#':1,'SEQUENCE#':seq,'RESETLOGS_CHANGE#':1,REGISTRAR:registrar,STATUS:'D',DELETED:'YES'});
	evidence.archives.rows=[log(32,'SRMN'),log(33,'SRMN'),log(34),log(35),log(35)];
	expect(analyzeBackup('lab',true,evidence,new Date(),true).gaps).toEqual([]);
	evidence.archives.rows.push(log(37));expect(analyzeBackup('lab',true,evidence,new Date(),true).gaps).toMatchObject([{fromSequence:36,toSequence:36}]);
	evidence.archiveGap.rows=[{'THREAD#':2,'LOW_SEQUENCE#':8,'HIGH_SEQUENCE#':9}];expect(analyzeBackup('lab',true,evidence,new Date(),true).gaps).toHaveLength(2);
	evidence.archives.status='unavailable';expect(analyzeBackup('lab',true,evidence,new Date(),true).gaps).toMatchObject([{thread:2,fromSequence:8,toSequence:9}]);
});
