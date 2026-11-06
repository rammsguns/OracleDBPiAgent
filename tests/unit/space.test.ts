import { expect,it } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { readSpaceUsage,renderSpaceMarkdown,tablespaceHeadroom,formatBytes,validateSpaceOptions,SpaceUsageError,SECTION_IDS } from '../../src/space/index.js';
import { SQL } from '../../src/space/sql.js';
import type { OracleSession } from '../../src/contracts.js';
import { securitySourceStrings } from './security-sql-scan.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
type Data=Partial<Record<keyof typeof SQL,unknown[][]>>;
function fixture(data:Data={},missing:string[]=[],code='ORA-00942',truncated=false):OracleSession {
	return {target:{name:'fixture'},query:async(sql:string)=>{const key=(Object.keys(SQL) as (keyof typeof SQL)[]).find(k=>SQL[k]===sql)!;if(missing.includes(key)) throw new Error(code);return {rows:data[key]??[],columns:['C'],truncated,elapsedMs:0};}} as unknown as OracleSession;
}
const ts=(used:number,auto='YES',contents='PERMANENT',bigfile='NO')=>['T',contents,bigfile,'/data/t.dbf',100,auto,100,100-used,used];
it('computes mixed autoextend headroom and clamps MAXBYTES below BYTES',()=>{
	expect(tablespaceHeadroom([{bytes:100,maxBytes:400,autoextensible:true},{bytes:200,maxBytes:900,autoextensible:false},{bytes:100,maxBytes:50,autoextensible:true}])).toEqual({allocatedBytes:400,maxBytes:700,headroomBytes:300});
	expect(tablespaceHeadroom([])).toEqual({allocatedBytes:0,maxBytes:0,headroomBytes:0});
	expect(formatBytes(1024)).toBe('1 KiB');expect(formatBytes(1024**4)).toBe('1 TiB');expect(formatBytes(0)).toBe('0 B');
});
it('aggregates mixed files, bigfiles, block metrics and free-space fallback',async()=>{
	const r=await readSpaceUsage(fixture({tablespaces:[ts(50,'YES','PERMANENT','YES'),['T','PERMANENT','YES','/data/2',100,'NO',0,150,50]]}));
	expect(r.sections.tablespaces.rows[0]).toMatchObject({bigfile:true,fileCount:2,allocatedBytes:200,usedBytes:50,freeBytes:150,maxBytes:200,headroomBytes:150});
	const f=await readSpaceUsage(fixture({tablespaces:[['T','PERMANENT','NO','/f',100,'NO',0,25,null]]}));expect(f.sections.tablespaces.rows[0]?.usedBytes).toBe(75);
});
it('maps LOB segment and index to table.column and preserves partitions',async()=>{
	const r=await readSpaceUsage(fixture({segments:[['APP','SYS_LOB','P1','LOBSEGMENT','T',2048,'DOCS','BODY'],['APP','SYS_IL',null,'LOBINDEX','T',1024,'DOCS','BODY']]}));
	expect(r.sections.segments.rows.map(s=>s.lobTable)).toEqual(['APP.DOCS.BODY','APP.DOCS.BODY']);expect(r.sections.segments.rows[0]?.partition).toBe('P1');
});
it('reports no configured FRA as ok',async()=>{const r=await readSpaceUsage(fixture({recovery:[[null,0,0,0,0]]}));expect(r.sections.recovery).toMatchObject({status:'ok',rows:[],note:'no recovery area configured'});expect(renderSpaceMarkdown(r)).not.toContain('Status: ok');});
for(const code of ['ORA-00942','ORA-01031']) for(const [id,keys] of Object.entries({tablespaces:['tablespaces'],segments:['segments'],temp:['tempFiles','temp','consumers'],undo:['undoFiles','undoExtents','undo','retention'],redo:['redo','members'],recovery:['recovery','recoveryTypes']})) for(const key of keys) it('isolates '+code+' in '+key,async()=>{const r=await readSpaceUsage(fixture({},[key],code));expect(r.sections[id as typeof SECTION_IDS[number]].status).toBe('unavailable');expect(r.status).toBe('partial');});
it('fails when all requested sections unavailable; propagates other failures; marks caps partial',async()=>{
	expect((await readSpaceUsage(fixture({},['redo']),{sections:['redo']})).status).toBe('failed');
	await expect(readSpaceUsage(fixture({},['redo'],'ORA-00600'))).rejects.toThrow('ORA-00600');
	expect((await readSpaceUsage(fixture({},[],'',true))).status).toBe('partial');
});
it.each([[84.999,undefined],[85,undefined],[85.001,'medium'],[95,'medium'],[95.001,'high']] as const)('permanent threshold %s',async(n,severity)=>{const r=await readSpaceUsage(fixture({tablespaces:[ts(n)]}));expect(r.findings.find(f=>f.id==='tablespace-max-T')?.severity).toBe(severity);});
it.each([84.999,85,85.001])('fixed allocation threshold %s',async n=>{const r=await readSpaceUsage(fixture({tablespaces:[ts(n,'NO','UNDO')]}));expect(r.findings.some(f=>f.id==='tablespace-fixed-T')).toBe(n>85);});
it.each([79.999,80,80.001])('temp threshold %s',async n=>{const r=await readSpaceUsage(fixture({temp:[['TEMP',100,n,100-n]]}));expect(r.findings.some(f=>f.id==='temp-TEMP')).toBe(n>80);});
it.each([[79.999,undefined],[80,undefined],[80.001,'medium'],[90,'medium'],[90.001,'high']] as const)('FRA net threshold %s',async(n,severity)=>{const r=await readSpaceUsage(fixture({recovery:[['/fra',100,n+10,10,1]]}));expect(r.findings.find(f=>f.id==='fra')?.severity).toBe(severity);});
it.each([0,1])('undo error counts %s',async n=>{const r=await readSpaceUsage(fixture({undo:[[300,n,n,900,1800]],retention:[[900]]}));expect(r.findings.find(f=>f.id==='undo-01555')?.severity).toBe(n?'medium':undefined);expect(r.findings.find(f=>f.id==='undo-no-space')?.severity).toBe(n?'high':undefined);});
it.each([[2,false,2,true,false],[3,false,2,false,false],[3,true,2,true,false],[3,false,1,false,true]] as const)('redo boundaries %s %s %s',async(count,unequal,members,low,info)=>{const redo=Array.from({length:count},(_,i)=>[i+1,1,unequal&&i===0?200:100,members,'CURRENT','NO']);const r=await readSpaceUsage(fixture({redo}));expect(r.findings.some(f=>f.id==='redo-groups')).toBe(low);expect(r.findings.some(f=>f.id==='redo-members')).toBe(info);});
it('validates filters before any SQL and binds owner/top',async()=>{
	for(const o of [{top:0},{top:101},{top:1.5},{owner:'A.B'},{sections:[]},{sections:['bad']}]) expect(()=>validateSpaceOptions(o)).toThrow(SpaceUsageError);
	const r=await readSpaceUsage(fixture(),{sections:['segments'],owner:'sys',top:100});expect(r.sections.tablespaces.status).toBe('skipped');expect(r.sections.segments.evidence.binds).toEqual({owner:'SYS',top:100,allOwners:0});
});
const forbidden=(s:string)=>/\b(?:DBA_EXTENTS|G?V_?\$ACTIVE_SESSION_HISTORY|ASH|AWR\w*|DBA_HIST_\w*)\b/i.test(s.replace(/"/g,''));
it('parser scans every space source string, catalog SELECT policy and explicit projections',()=>{
	for(const name of readdirSync('src/space').filter(n=>n.endsWith('.ts'))) for(const s of securitySourceStrings(readFileSync('src/space/'+name,'utf8'),name)) {
		expect(forbidden(s),s).toBe(false);
		if(/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|DECLARE|CALL|MERGE)\b/i.test(s)) expect(()=>classifySql(s),s).not.toThrow();
	}
	for(const sql of Object.values(SQL)) {expect(sql).toMatch(/^SELECT /);expect(()=>classifySql(sql)).not.toThrow();expect(sql).not.toMatch(/SELECT\s+\*/i);}
});
it.each(['SELECT * FROM DBA_EXTENTS','SELECT * FROM "DBA_HIST_SQLSTAT"','SELECT * FROM V$ACTIVE_SESSION_HISTORY','SELECT AWR_REPORT FROM DUAL','SELECT ASH FROM DUAL'])('rejects forbidden %s',sql=>expect(forbidden(sql)).toBe(true));
it.each(['DELETE FROM T','BEGIN NULL; END;','ALTER TABLE T ADD X NUMBER'])('rejects write %s',sql=>expect(()=>classifySql(sql)).toThrow());
it('renders findings first, text bars, hidden empty columns, paths and escaped values',async()=>{
	const r=await readSpaceUsage(fixture({tablespaces:[ts(96)],segments:[['APP','<x>|',null,'TABLE','T',1024,null,null]]}));const md=renderSpaceMarkdown(r);expect(md.indexOf('## Findings')).toBeLessThan(md.indexOf('## Tablespaces'));expect(md).toContain('██████████ 96.0%');expect(md).not.toContain('Lob Table');expect(md).toContain('&lt;x&gt;&#124;');expect(md).toContain('/data/t.dbf');
});

it('pages catalog evidence before aggregating tablespace files',async()=>{
	const s=fixture();let calls=0;
	s.query=async(sql,binds)=>{calls++;expect(sql).toContain(SQL.tablespaces);if(calls===1) return {rows:[ts(50)],columns:['T'],truncated:true,elapsedMs:0};expect(binds).toEqual({spaceOffset:1});return {rows:[['T','PERMANENT','NO','/other',100,'NO',0,50,50]],columns:['T'],truncated:false,elapsedMs:0};};
	const r=await readSpaceUsage(s,{sections:['tablespaces']});expect(calls).toBe(2);expect(r.status).toBe('ok');expect(r.sections.tablespaces.rows[0]?.fileCount).toBe(2);
});
