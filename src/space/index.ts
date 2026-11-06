import type { OracleSession } from '../contracts.js';
import type { Check } from '../triage/read.js';
import { SQL } from './sql.js';
export class SpaceUsageError extends Error { constructor(message:string) { super(message); this.name='SpaceUsageError'; } }
export const SECTION_IDS=['tablespaces','segments','temp','undo','redo','recovery'] as const;
export type SectionId=typeof SECTION_IDS[number];
export interface SpaceOptions { sections?:string[]; top?:number; owner?:string; includeOracleMaintained?:boolean }
export interface SpaceFile { bytes:number; maxBytes:number; autoextensible:boolean; path?:string }
/** Expansion available beyond current allocation; malformed maxima never shrink a file. */
export function tablespaceHeadroom(files:readonly SpaceFile[]) {
	const allocatedBytes=files.reduce((n,f)=>n+f.bytes,0), maxBytes=files.reduce((n,f)=>n+(f.autoextensible?Math.max(f.bytes,f.maxBytes):f.bytes),0);
	return {allocatedBytes,maxBytes,headroomBytes:maxBytes-allocatedBytes};
}
export function formatBytes(n:number):string {
	if(!Number.isFinite(n)) return 'unknown';
	const units=['B','KiB','MiB','GiB','TiB','PiB']; let i=0;
	while(Math.abs(n)>=1024&&i<units.length-1) { n/=1024; i++; }
	return Number(n.toFixed(2))+' '+units[i];
}
export interface TablespaceRow { name:string; contents:string; bigfile:boolean; fileCount:number; files:SpaceFile[]; allocatedBytes:number; usedBytes:number; freeBytes:number; maxBytes:number; headroomBytes:number; usedPercentAllocated:number; usedPercentMax:number; autoextensible:boolean }
export type SpaceRow=Record<string,string|number|boolean|null>;
export interface SpaceFinding { id:string; severity:'high'|'medium'|'low'|'info'; subject:string; detail:string; advice:string }
export interface SpaceSection<T> { status:'ok'|'unavailable'|'skipped'; rows:T[]; evidence:Check; supportingEvidence:Check[]; note?:string }
export interface SpaceReport { status:'ok'|'partial'|'failed'; target:string; capturedAt:string; sections:{tablespaces:SpaceSection<TablespaceRow>;segments:SpaceSection<SpaceRow>;temp:SpaceSection<SpaceRow>;undo:SpaceSection<SpaceRow>;redo:SpaceSection<SpaceRow> & { logMode?:string };recovery:SpaceSection<SpaceRow>}; findings:SpaceFinding[] }
export function validateSpaceOptions(o:SpaceOptions) {
	if(o.sections&&(!o.sections.length||o.sections.some(s=>!SECTION_IDS.includes(s as SectionId)))) throw new SpaceUsageError('section must be tablespaces, segments, temp, undo, redo or recovery');
	if(o.top!==undefined&&(!Number.isInteger(o.top)||o.top<1||o.top>100)) throw new SpaceUsageError('top must be an integer from 1 to 100');
	if(o.owner!==undefined&&!/^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(o.owner)) throw new SpaceUsageError('owner must be a simple Oracle identifier');
}
const num=(v:unknown)=>Number(v??0), str=(v:unknown)=>String(v??'');
function check(label:string):Check { return {label,sql:'',binds:{},view:'',status:'ok',columns:[],rows:[],truncated:false,attempts:[]}; }
function section<T>(label:string):SpaceSection<T> { return {status:'skipped',rows:[],evidence:check(label),supportingEvidence:[]}; }
export async function readSpaceUsage(session:OracleSession,options:SpaceOptions={}):Promise<SpaceReport> {
	validateSpaceOptions(options);
	const report:SpaceReport={status:'ok',target:session.target.name,capturedAt:new Date().toISOString(),sections:{tablespaces:section('tablespaces'),segments:section('segments'),temp:section('temp'),undo:section('undo'),redo:section('redo'),recovery:section('recovery')},findings:[]};
	async function read(id:SectionId,key:keyof typeof SQL,binds:Record<string,unknown>={},optional=false) {
		const s=report.sections[id], c=check(key); c.sql=SQL[key]; c.binds=binds; c.view=[...c.sql.matchAll(/(?:FROM|JOIN)\s+([a-z][a-z0-9_$]*)/gi)].map(m=>m[1]).join(', ');
		if(s.status==='skipped') {s.status='ok';s.evidence=c;} else s.supportingEvidence.push(c);
		try {
			Object.assign(c,await session.query(c.sql,binds));
			while(c.truncated && c.rows.length>0 && c.rows.length<10000 && key!=='segments') {
				const offset=c.rows.length, page=await session.query(c.sql+' OFFSET :spaceOffset ROWS',{...binds,spaceOffset:offset});
				c.rows.push(...page.rows.slice(0,10000-offset));c.truncated=page.truncated||offset+page.rows.length>10000;
				if(!page.rows.length) break;
			}
		} 
		catch(e) {const code=/ORA-\d{5}/.exec(String(e))?.[0];if(!code||!['ORA-00942','ORA-01031','ORA-65040'].includes(code)) throw e;c.status='unavailable';c.attempts.push({view:c.view,code});if(!optional) {s.status='unavailable';s.note=code==='ORA-65040'?'Not available in a PDB (ORA-65040).':'Missing view access ('+code+').';}}
		if(c.truncated) s.note='Row cap reached; snapshot is incomplete.';
		return c.rows;
	}
	const selected=(id:SectionId)=> {
		const requested=!options.sections||options.sections.includes(id);
		if(requested && session.identity?.isCdb && ['undo','redo','recovery'].includes(id)) {
			const s=report.sections[id]; s.status='unavailable';
			s.note=id==='undo'?'Not available in a PDB: undo depends on local/shared undo mode; instance undo findings withheld.':'Not available in a PDB: CDB-wide redo/recovery configuration; PDB-local findings withheld.';
			return false;
		}
		return requested;
	};
	if(selected('tablespaces')) {
		const rows=await read('tablespaces','tablespaces'), grouped=new Map<string,unknown[][]>();
		for(const r of rows) grouped.set(str(r[0]),[...(grouped.get(str(r[0]))??[]),r]);
		for(const [name,rs] of grouped) {
			const r=rs[0]!,files=rs.map(x=>({path:str(x[3]),bytes:num(x[4]),autoextensible:x[5]==='YES',maxBytes:num(x[6])})),h=tablespaceHeadroom(files),usedBytes=r[8]==null?Math.max(0,h.allocatedBytes-num(r[7])):num(r[8]);
			report.sections.tablespaces.rows.push({name,contents:str(r[1]),bigfile:r[2]==='YES',fileCount:files.length,files,...h,usedBytes,freeBytes:Math.max(0,h.allocatedBytes-usedBytes),headroomBytes:Math.max(0,h.maxBytes-usedBytes),usedPercentAllocated:h.allocatedBytes?usedBytes/h.allocatedBytes*100:0,usedPercentMax:h.maxBytes?usedBytes/h.maxBytes*100:0,autoextensible:files.some(f=>f.autoextensible)});
		}
	}
	if(selected('segments')) report.sections.segments.rows=(await read('segments','segments',{owner:options.owner?.toUpperCase()??null,allOwners:options.includeOracleMaintained?1:0,top:options.top??20})).map(r=>({owner:str(r[0]),name:str(r[1]),partition:str(r[2]),type:str(r[3]),tablespace:str(r[4]),bytes:num(r[5]),lobTable:r[6]?r[0]+'.'+r[6]+'.'+r[7]:''}));
	const files=(rs:unknown[][])=>rs.map(r=>({kind:'File',tablespace:str(r[0]),path:str(r[1]),allocatedBytes:num(r[2]),maxBytes:r[3]==='YES'?Math.max(num(r[2]),num(r[4])):num(r[2])}));
	if(selected('temp')) {
		const s=report.sections.temp;s.rows.push(...files(await read('temp','tempFiles')));
		s.rows.push(...(await read('temp','temp')).map(r=>({kind:'Usage',tablespace:str(r[0]),totalBytes:num(r[1]),usedBytes:num(r[2]),freeBytes:num(r[3]),usedPercent:num(r[1])?num(r[2])/num(r[1])*100:0})));
		s.rows.push(...(await read('temp','consumers')).map(r=>({kind:'Consumer',sid:num(r[0]),username:str(r[1]),sqlId:str(r[2]),segmentType:str(r[3]),tablespace:str(r[4]),bytes:num(r[5])})));
	}
	if(selected('undo')) {
		const s=report.sections.undo;s.rows.push(...files(await read('undo','undoFiles')));
		s.rows.push(...(await read('undo','undoExtents')).map(r=>({kind:'Extent status',tablespace:str(r[0]),status:str(r[1]),bytes:num(r[2])})));
		const rs=await read('undo','undo'),p=await read('undo','retention');
		s.rows.push(...rs.map(r=>({kind:'Last 24 h',maxQuerySeconds:num(r[0]),snapshotTooOldCount:num(r[1]),noSpaceCount:num(r[2]),minTunedRetentionSeconds:num(r[3]),maxTunedRetentionSeconds:num(r[4]),retentionSeconds:num(p[0]?.[0])})));
	}
	if(selected('redo')) {
		const s=report.sections.redo;s.rows.push(...(await read('redo','redo')).map(r=>({kind:'Group',group:num(r[0]),thread:num(r[1]),bytes:num(r[2]),members:num(r[3]),status:str(r[4]),archived:str(r[5])})));
		s.rows.push(...(await read('redo','members')).map(r=>({kind:'Member',group:num(r[0]),path:str(r[1]),type:str(r[2]),status:str(r[3])})));
		s.logMode=str((await read('redo','logMode',{},true))[0]?.[0])||'unavailable';
		if(s.logMode==='ARCHIVELOG') {
			await read('redo','recovery',{},true);
			await read('redo','archiveDestinations',{},true);
		}
	}
	if(selected('recovery')) {
		const s=report.sections.recovery,rs=await read('recovery','recovery');
		s.rows=rs.filter(r=>num(r[1])>0).map(r=>({kind:'Area',path:str(r[0]),limitBytes:num(r[1]),usedBytes:num(r[2]),reclaimableBytes:num(r[3]),fileCount:num(r[4]),usedPercent:Math.max(0,num(r[2])-num(r[3]))/num(r[1])*100}));
		if(!s.rows.length&&s.status==='ok') s.note='no recovery area configured';
		s.rows.push(...(await read('recovery','recoveryTypes')).filter(r=>num(r[3])>0).map(r=>({kind:'File type',type:str(r[0]),usedPercent:num(r[1]),reclaimablePercent:num(r[2]),fileCount:num(r[3])})));
	}
	if(session.identity?.isCdb) for(const id of ['tablespaces','segments','temp'] as const) {
		const s=report.sections[id]; if(s.status!=='skipped') s.note=[s.note, 'Current PDB visibility only; file visibility and temporary/undo allocation depend on container configuration.'].filter(Boolean).join(' ');
	}
	report.findings=spaceFindings(report);
	const ss=Object.values(report.sections).filter(s=>s.status!=='skipped');report.status=ss.every(s=>s.status==='unavailable')?'failed':ss.some(s=>s.status==='unavailable'||[s.evidence,...s.supportingEvidence].some(c=>c.truncated||c.status==='unavailable'))?'partial':'ok';return report;
}
export function spaceFindings(r:SpaceReport):SpaceFinding[] {
	const out:SpaceFinding[]=[];
	const add=(id:string,severity:SpaceFinding['severity'],subject:string,detail:string,advice:string)=>out.push({id,severity,subject,detail,advice});
	if(r.sections.tablespaces.status==='ok') for(const t of r.sections.tablespaces.rows) {
		if(t.contents==='PERMANENT'&&t.usedPercentMax>85) add('tablespace-max-'+t.name,t.usedPercentMax>95?'high':'medium',t.name,t.usedPercentMax.toFixed(2)+'% of maximum used.','Review growth, storage capacity and autoextend limits with the DBA.');
		if(!t.autoextensible&&t.usedPercentAllocated>85) add('tablespace-fixed-'+t.name,'medium',t.name,t.usedPercentAllocated.toFixed(2)+'% of allocated space used without autoextend.','For a human DBA: consider adding capacity after checking storage headroom.');
	}
	if(r.sections.temp.status==='ok') for(const t of r.sections.temp.rows) if(t.kind==='Usage'&&num(t.usedPercent)>80) add('temp-'+t.tablespace,'medium',str(t.tablespace),'Temp above 80% used right now.','Review current temp consumers and their SQL_IDs.');
	if(r.sections.undo.status==='ok') for(const u of r.sections.undo.rows) {
		if(num(u.snapshotTooOldCount)>0) add('undo-01555','medium','Undo','ORA-01555 reported in the last 24 h.','Compare query duration with tuned retention and undo capacity.');
		if(num(u.noSpaceCount)>0) add('undo-no-space','high','Undo','Undo no-space errors in the last 24 h.','Review undo capacity and active transactions.');
	}
	if(r.sections.recovery.status==='ok') for(const f of r.sections.recovery.rows) if(f.kind==='Area'&&num(f.usedPercent)>80) add('fra',num(f.usedPercent)>90?'high':'medium','Recovery area',num(f.usedPercent).toFixed(2)+'% used after reclaimable space.','Review recovery retention and storage with the backup owner.');
	if(r.sections.redo.status==='ok') {
		const redo=r.sections.redo;
		if(redo.logMode==='NOARCHIVELOG') add('redo-noarchivelog','info','Redo','Database is in NOARCHIVELOG mode: online redo is not archived, so point-in-time recovery is not possible.','Review recovery requirements and backup strategy with the DBA.');
		const recovery=redo.supportingEvidence.find(c=>c.label==='recovery'),destinations=redo.supportingEvidence.find(c=>c.label==='archiveDestinations');
		if(redo.logMode==='ARCHIVELOG'&&recovery?.status==='ok'&&!recovery.truncated&&destinations?.status==='ok'&&!destinations.truncated&&!recovery.rows.some(row=>num(row[1])>0)&&!destinations.rows.some(row=>str(row[1]).trim())) add('redo-no-archive-destination','high','Redo','Database is in ARCHIVELOG mode with no recovery area and no log_archive_dest_n set.','For a human DBA: configure and verify an archive destination to protect recovery and avoid archiving stalls.');
		const gs=r.sections.redo.rows.filter(x=>x.kind==='Group');
		if(gs.length<3||new Set(gs.map(g=>g.bytes)).size>1) add('redo-groups','low','Redo','Fewer than 3 groups or unequal group sizes.','Review redo sizing and group configuration with the DBA.');
		if(gs.length&&gs.every(g=>g.members===1)) add('redo-members','info','Redo','A single member per redo group.','Review redo multiplexing and storage failure protection.');
	}
	return out.sort((a,b)=>['high','medium','low','info'].indexOf(a.severity)-['high','medium','low','info'].indexOf(b.severity));
}
const escape=(v:unknown)=>String(v??'').replace(/[&<>|\r\n]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','|':'&#124;','\r':' ','\n':' '})[c]!);
const bar=(n:number)=>'█'.repeat(Math.round(Math.min(100,Math.max(0,n))/10))+'░'.repeat(10-Math.round(Math.min(100,Math.max(0,n))/10))+' '+n.toFixed(1)+'%';
export function renderSpaceMarkdown(r:SpaceReport):string {
	const lines=['# Space — '+escape(r.target),'','Captured at '+r.capturedAt+' (UTC). Binary units (KiB, MiB, GiB, TiB).','Snapshot is a short sequence of queries, not one consistent read.','','## Findings',''];
	for(const f of r.findings) lines.push('- **'+f.severity+': '+escape(f.subject)+'** — '+escape(f.detail)+' '+escape(f.advice));
	if(!r.findings.length) lines.push('No findings.');
	function table(rows:Record<string,unknown>[]) {
		const keys=[...new Set(rows.flatMap(Object.keys))].filter(k=>rows.some(r=>r[k]!==''&&r[k]!=null));
		const labels:Record<string,string>={name:'Name',sid:'SID',sqlId:'SQL_ID',allocatedBytes:'Allocated',usedBytes:'Used',freeBytes:'Free',maxBytes:'Maximum',headroomBytes:'Headroom',usedPercentAllocated:'Used / allocated',usedPercentMax:'Used / max',usedPercent:'Usage',lobTable:'LOB table.column'};
		const label=(k:string)=>labels[k]??k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()).replace(/sql Id/i,'SQL_ID');
		lines.push('| '+keys.map(label).join(' | ')+' |','| '+keys.map(()=>'---').join(' | ')+' |');
		for(const row of rows) lines.push('| '+keys.map(k=>escape(row[k]==null?'':/bytes$/i.test(k)?formatBytes(Number(row[k])):/percent/i.test(k)?bar(Number(row[k])):row[k])).join(' | ')+' |');
	}
	for(const id of SECTION_IDS) {
		const s=r.sections[id];if(s.status==='skipped') continue;
		lines.push('','## '+({tablespaces:'Tablespaces',segments:'Top segments',temp:'Temp',undo:'Undo (last 24 h)',redo:'Online redo',recovery:'Recovery area'})[id],'');
		if(s.status==='unavailable') lines.push('Unavailable. '+escape(s.note));else if(s.note) lines.push(escape(s.note));
		if(!s.rows.length&&s.note) continue;
		if(id==='redo'&&r.sections.redo.logMode) lines.push('Log mode: '+escape(r.sections.redo.logMode)+'.','');
		if(!s.rows.length) {lines.push('None in this snapshot.');continue;}
		if(id==='tablespaces') {
			table(r.sections.tablespaces.rows.map(t=>({name:t.name,allocatedBytes:t.allocatedBytes,usedBytes:t.usedBytes,maxBytes:t.maxBytes,usedPercentAllocated:t.usedPercentAllocated,usedPercentMax:t.usedPercentMax,headroomBytes:t.headroomBytes})));
			lines.push('','<details><summary>Tablespace configuration and files</summary>','');
			table(r.sections.tablespaces.rows.map(t=>({name:t.name,contents:t.contents,bigfile:t.bigfile,fileCount:t.fileCount,freeBytes:t.freeBytes})));lines.push('');table(r.sections.tablespaces.rows.flatMap(t=>t.files.map(f=>({tablespace:t.name,path:f.path,bytes:f.bytes,maxBytes:f.maxBytes,autoextend:f.autoextensible}))));lines.push('','</details>');
		} else {
			const rows=s.rows as SpaceRow[], kinds=[...new Set(rows.map(x=>x.kind))];
			for(const kind of kinds) {if(kind) {if(lines.at(-1)!=='') lines.push('');lines.push('**'+escape(kind)+'**','');}table(rows.filter(x=>x.kind===kind).map(({kind:_,...rest})=>rest));}
		}
	}
	return lines.join('\n').replace(/\n{3,}/g, '\n\n')+'\n';
}
