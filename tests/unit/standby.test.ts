import { expect, it, vi } from 'vitest';
import type { OracleSession } from '../../src/contracts.js';
import { readDatabaseRole, readDgLag, lagSeconds } from '../../src/backup/role.js';
import { analyzeBackup, SQL, type BackupReport } from '../../src/backup/index.js';
import { classify, DEFAULTS, parseCheckConfig, thresholdsFor } from '../../src/check/index.js';
function session(role='PHYSICAL STANDBY', apply:unknown='+00 00:00:00', mrp=true) {
	return {identity:{},query:vi.fn(async(sql:string)=>{
		if(sql.includes('DATABASE_ROLE')) return {columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[[role,'READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']]};
		if(sql.includes('FROM DUAL')) return {rows:[[new Date().toISOString()]]};
		if(sql.includes('MANAGED_STANDBY')) return {rows:mrp ? sql.includes('THREAD#') ? [['MRP0','APPLYING_LOG',1,37,66517],['RFS','RECEIVING',1,37,66509]] : [['MRP0','APPLYING_LOG']] : []};
		if(sql.includes('ARCHIVED_LOG')) return {rows:[]};
		return {rows:[['transport lag','+00 00:00:00',new Date().toISOString(),new Date().toISOString()],['apply lag',apply,new Date().toISOString(),new Date().toISOString()]]};
	})} as unknown as OracleSession;
}
function hiddenApplySession(options:{mrp:unknown[][];archived?:unknown[][];transportTime?:string;datumTime?:string;databaseTime?:string}) {
	const s=session('PHYSICAL STANDBY',null);
	vi.mocked(s.query).mockImplementation(async(sql:string)=>{
		if(sql.includes('DATABASE_ROLE')) return {columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PHYSICAL STANDBY','READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']]};
		if(sql.includes('FROM DUAL')) return {rows:[[options.databaseTime ?? new Date().toISOString()]]};
		if(sql.includes('MANAGED_STANDBY')) return {rows:options.mrp};
		if(sql.includes('ARCHIVED_LOG')) return {rows:options.archived ?? []};
		const computed=options.transportTime ?? new Date().toISOString();
		return {rows:[['transport lag','+00 00:00:00',computed,options.datumTime ?? computed],['apply lag',null,computed,null]]};
	});
	return s;
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
	const behind=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,37,66500],['RFS','RECEIVING',1,37,66509]]});
	expect((await readDgLag(behind)).note).toContain('MRP0 is missing or behind');
	expect((await readDgLag(hiddenApplySession({mrp:[]}))).note).toContain('no visible MRP0');
});
it('hidden PDB apply lag stays unknown when datum is stale',async()=>{
	const computed=new Date().toISOString();
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,37,66517],['RFS','RECEIVING',1,37,66509]],transportTime:computed,datumTime:new Date(Date.now()-180000).toISOString()});
	expect((await readDgLag(s)).note).toContain('within 120 seconds');
});
it('fails closed for an unapplied archive on a thread without an MRP row',async()=>{
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,1200,500],['RFS','RECEIVING',1,1200,490]],archived:[[2,25]]});
	const result=await readDgLag(s);expect(result.value).toBeNull();expect(result.note).toContain('thread 2');
});
it('fails closed for even one unapplied next archived sequence',async()=>{
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,37,66517],['RFS','RECEIVING',1,37,66509]],archived:[[1,38]]});
	const result=await readDgLag(s);expect(result.value).toBeNull();expect(result.note).toContain('thread 1');expect(result.note).toContain("APPLIED='NO'");
});
it('ignores idle RFS sequence zero and requires a valid received position',async()=>{
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,37,10],['RFS','IDLE',1,0,0]]});
	const result=await readDgLag(s);expect(result.value).toBeNull();expect(result.note).toContain('no visible RFS received-redo position');
});
it('compares and reports received positions independently by thread',async()=>{
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,1200,10],['MRP0','WAIT_FOR_LOG',2,45,20],['RFS','RECEIVING',1,1200,9],['RFS','RECEIVING',2,45,19]]});
	const result=await readDgLag(s);expect(result.value).toBe(0);expect(result.note).toContain('thread 1 seq/block 1200/9');expect(result.note).toContain('thread 2 seq/block 45/19');
});
it('does not use a high sequence on another thread to prove apply caught up',async()=>{
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,1200,500],['RFS','RECEIVING',1,1200,490],['RFS','RECEIVING',2,45,20]]});
	const result=await readDgLag(s);expect(result.value).toBeNull();expect(result.note).toContain('thread 2');
});
it('checks Oracle time strings against the database clock across timezone offsets',async()=>{
	const databaseTime='01/01/2026 08:00:30';
	const s=hiddenApplySession({mrp:[['MRP0','APPLYING_LOG',1,37,66517],['RFS','RECEIVING',1,37,66509]],transportTime:'01/01/2026 08:00:00',datumTime:'01/01/2026 08:00:00',databaseTime});
	const result=await readDgLag(s);expect(result.value).toBe(0);expect(result.note).toContain('bounded by transport lag');
	expect(vi.mocked(s.query)).toHaveBeenCalledWith(expect.stringContaining('SYSDATE'));
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
