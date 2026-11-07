import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, worst, exitCode, parseCheckConfig, loadCheckConfig, thresholdsFor, DEFAULTS, runChecks, collectors, renderCheckMarkdown, redact } from '../../src/check/index.js';
import { appendCheckRun, runCheck } from '../../src/check/cli.js';
import type { ToolContext } from '../../src/contracts.js';
import { readFile } from 'node:fs/promises';
import { FEATURE_VIEWS } from '../../src/preflight/views.js';

describe('check thresholds and exits', () => {
	for (const [value,status] of [[0,'OK'],[84.9,'OK'],[85,'WARN'],[95,'CRIT'],[100,'CRIT'],[null,'UNKNOWN'],[NaN,'UNKNOWN']] as const) it(`space ${value} => ${status}`, () => expect(classify(value,DEFAULTS.space)).toBe(status));
	for (const [value,status] of [[15,'OK'],[14,'WARN'],[3,'CRIT'],[-1,'CRIT']] as const) it(`expiry ${value}`, () => expect(classify(value,DEFAULTS.expiry,true)).toBe(status));
	for (const key of ['space','recovery','blocking','backupAge','failedJobs','alertErrors','maintenance'] as const) it(`${key} inclusive limits`, () => { expect(classify(DEFAULTS[key].warn,DEFAULTS[key])).toBe('WARN'); if (DEFAULTS[key].crit !== null) expect(classify(DEFAULTS[key].crit,DEFAULTS[key])).toBe('CRIT'); });
	for (const [status,code] of [['OK',0],['WARN',1],['CRIT',2],['UNKNOWN',3]] as const) it(`exit ${status}`, () => { expect(exitCode(status)).toBe(code); expect(exitCode(status,'warn')).toBe(code); expect(exitCode(status,'crit')).toBe(status === 'WARN' ? 0 : code); });
	it('UNKNOWN dominates; then CRIT then WARN', () => { expect(worst(['CRIT','UNKNOWN'])).toBe('UNKNOWN'); expect(worst(['OK','CRIT','WARN'])).toBe('CRIT'); expect(worst(['OK','WARN'])).toBe('WARN'); });
	it('uses defaults and overrides without cross-target mutation', () => { const c = parseCheckConfig({version:1, defaults:{space:{warn:70,crit:90}},targets:{lab:{space:{warn:60,crit:80}}}},['lab','other']); expect(thresholdsFor(c,'lab').space.warn).toBe(60); expect(thresholdsFor(c,'other').space.warn).toBe(70); expect(DEFAULTS.space.warn).toBe(85); });
	for (const raw of [null,[],{}, {version:2}, {version:1,password:'secret'}, {version:1,defaults:{bad:1}}, {version:1,targets:{unknown:{}}}, {version:1,defaults:{space:{warn:95,crit:85}}}, {version:1,defaults:{space:{warn:80,crit:101}}}, {version:1,defaults:{space:{warn:80,crit:90,extra:1}}}, {version:1,defaults:{windowHours:0}}, {version:1,defaults:{windowHours:721}}, {version:1,defaults:{expiry:{warn:3,crit:14}}}]) it(`rejects invalid config ${JSON.stringify(raw)}`, () => expect(() => parseCheckConfig(raw,['lab'])).toThrow());
	it('requires mode 0600 and refuses symlinks, malformed or oversized files', () => {
		const home = mkdtempSync(join(tmpdir(),'check-'));
		try {
			const env = {PIAGENT_HOME:home}; expect(loadCheckConfig(['lab'],env)).toEqual({});
			const path=join(home,'check.json'); writeFileSync(path,'{"version":1}',{mode:0o600}); expect(loadCheckConfig(['lab'],env)).toEqual({version:1});
			chmodSync(path,0o644); expect(() => loadCheckConfig(['lab'],env)).toThrow(/0600/); chmodSync(path,0o600);
			writeFileSync(path,'{'); expect(() => loadCheckConfig(['lab'],env)).toThrow(/JSON/);
			writeFileSync(path,' '.repeat(131073)); expect(() => loadCheckConfig(['lab'],env)).toThrow(/128 KiB/);
			rmSync(path); symlinkSync('missing',path); expect(() => loadCheckConfig(['lab'],env)).toThrow();
		} finally { rmSync(home,{recursive:true,force:true}); }
	});
});
function fake() {
	const evidence = {status:'ok',truncated:false,rows:[],label:'users'};
	const section = (rows: unknown[] = []) => ({...evidence,rows,evidence:{...evidence},supportingEvidence:[]});
	const security = {checks:[{id:'accounts',status:'ok',evidence:[{...evidence,rows:[['APP','N','OPEN','DEFAULT','2030-01-01T00:00:00Z']]}],findings:[]},{id:'default-passwords',status:'ok',findings:[],evidence:[]}]};
	const readers = {
		space:async () => ({sections:{tablespaces:section([{name:'USERS',contents:'PERMANENT',maxBytes:100,usedPercentMax:10},{name:'UNDO',contents:'UNDO',maxBytes:100,usedPercentMax:10}]),undo:section(),temp:section([{kind:'Usage',tablespace:'TEMP',usedBytes:10},{kind:'File',tablespace:'TEMP',maxBytes:100}]),recovery:section([{kind:'Area',usedPercent:10}])}}),
		sessions:async () => ({sections:{blocking:section()}}),
		backup:async () => ({files:[{level0:'2026-11-06T23:00:00Z'}],gaps:[],evidence:Object.fromEntries(['database','jobs','datafiles','backups','sets','pieces','archives','history'].map(id => [id,{...evidence,rows:id==='database'?[{LOG_MODE:'ARCHIVELOG'}]:id==='jobs'?[{STATUS:'COMPLETED',INPUT_TYPE:'DB FULL'}]:[]}]))}),
		jobs:async () => ({sections:Object.fromEntries(['runs','invalidObjects','indexes','indexPartitions','indexSubpartitions'].map(id => [id,section()]))}),
		alerts:async () => section(), incidents:async () => section(), security:async () => security,
	};
	const context = {config:{targets:[{name:'lab'},{name:'other'}],limits:{statementTimeoutSeconds:10,maxRows:100}},audit:{record:async () => {}},runId:'test',sessions:{get:async () => ({target:{name:'lab'},identity:{isCdb:false},query:async () => ({columns:[],rows:[],truncated:false,elapsedMs:0})})}} as unknown as ToolContext;
	return {readers,context};
}
const now = new Date('2026-11-07T00:00:00Z');
it('runs sequentially, stable redacted Markdown and JSON with all checks', async () => {
	const {readers,context}=fake(); const order: string[]=[];
	for (const key of Object.keys(readers) as (keyof typeof readers)[]) { const fn=readers[key]; Object.assign(readers,{[key]:async () => {order.push(key); return fn();}}); }
	const run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(run.status).toBe('OK'); expect(run.targets[0]!.checks).toHaveLength(13); expect(order).toEqual(['space','sessions','backup','jobs','security','alerts','incidents','security']);
	expect(renderCheckMarkdown(run)).toContain('| Target |'); expect(JSON.parse(JSON.stringify(run))).toEqual(run);
});
it('all collector failures are UNKNOWN with sanitized errors', async () => {
	for (const code of ['ORA-00942','ORA-01031','ORA-65040','password=do-not-print','CHECK_TIMEOUT']) {
		const {context}=fake(); const readers=Object.fromEntries(Object.keys(collectors).map(key=>[key,async()=>{throw new Error(code);}])) as unknown as typeof collectors;
		const r=await runChecks(context,['lab'],undefined,readers,now); expect(r.status).toBe('UNKNOWN'); expect(r.targets[0]!.checks.every(x=>x.status==='UNKNOWN')).toBe(true); expect(JSON.stringify(r)).not.toContain('do-not-print');
	}
});
it('per-view unavailable and truncated evidence never become OK', async () => {
	for (const key of ['status','truncated']) {
		const {context,readers}=fake(); readers.alerts=async()=>({status:'ok',truncated:false,rows:[],[key]:key==='status'?'unavailable':true}) as never;
		const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now); expect(r.targets[0]!.checks.find(x=>x.id==='alertErrors')!.status).toBe('UNKNOWN');
	}
});
it('NOARCHIVELOG, missing full backup and unconfigured recovery are UNKNOWN',async()=>{
	const {context,readers}=fake(), original=readers.backup;
	readers.backup=async()=>{const b=await original(); b.evidence.database!.rows=[{LOG_MODE:'NOARCHIVELOG'}]; b.files=[];return b;};
	const space=readers.space; readers.space=async()=>{const s=await space();s.sections.recovery.rows=[];return s;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	for(const id of ['archiveGaps','backupAge','recovery']) expect(r.targets[0]!.checks.find(x=>x.id===id)!.status).toBe('UNKNOWN');
});
it('critical gaps/incidents/default passwords, WARN jobs, critical maintenance and expiry',async()=>{
	const {context,readers}=fake(), backup=readers.backup, jobs=readers.jobs, security=readers.security;
	readers.backup=async()=>({...await backup(),gaps:[{}]}) as never;
	readers.incidents=async()=>({status:'ok',rows:[{}]}) as never;
	readers.jobs=async()=>{const r=await jobs();r.sections.runs!.rows=[{STATUS:'FAILED'}];r.sections.invalidObjects!.rows=[{OWNER:'APP',OBJECT_COUNT:20},{OWNER:'SYS',OBJECT_COUNT:100}];return r;};
	readers.security=async()=>{const r=await security();r.checks[0]!.evidence[0]!.rows[0]![4]='2026-11-08T00:00:00Z'; r.checks[1]!.findings=[{}] as never;return r;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now); const status=(id:string)=>r.targets[0]!.checks.find(x=>x.id===id)!.status;
	for(const id of ['archiveGaps','incidents','defaultPasswords','maintenance','expiry']) expect(status(id)).toBe('CRIT');expect(status('failedJobs')).toBe('WARN');
});
it('output appends exactly one redacted line per run',async()=>{
	const dir=mkdtempSync(join(tmpdir(),'check-out-'));
	try {const {context,readers}=fake();const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);r.targets[0]!.checks[0]!.note='password=secret123';await appendCheckRun(dir,r);await appendCheckRun(dir,r);const text=await readFile(join(dir,'check.jsonl'),'utf8');expect(text.trim().split('\n')).toHaveLength(2);expect(text).not.toContain('secret123');expect(redact('Bearer abc123')).not.toContain('abc123');}finally{rmSync(dir,{recursive:true,force:true});}
});
it('rejects usage before connecting',async()=>{for(const o of [{},{target:'lab',allTargets:true},{target:'lab',failOn:'bad'}]) await expect(runCheck(o)).rejects.toThrow(/Usage/);});
it('preflight group is exactly the reused feature union',()=>expect([...FEATURE_VIEWS.check!].sort()).toEqual([...new Set(['space','backup','sessions','jobs','alertlog','security'].flatMap(x=>FEATURE_VIEWS[x]!))].sort()));
it('applies per-target thresholds in the engine and preserves ordering',async()=>{
	const {context,readers}=fake(); const settings=parseCheckConfig({version:1,targets:{lab:{space:{warn:1,crit:5}}}},['lab','other']);
	const r=await runChecks(context,['lab','other'],target=>thresholdsFor(settings,target),readers as unknown as typeof collectors,now);
	expect(r.targets.map(x=>x.target)).toEqual(['lab','other']);expect(r.targets.map(x=>x.checks[0]!.status)).toEqual(['CRIT','OK']);
});
it('labels PDB-local and CDB-wide checks distinctly and treats invisible backup rows as UNKNOWN',async()=>{
	const {context,readers}=fake(); const get=context.sessions.get;
	context.sessions.get=async()=>{const s=await get();s.identity.isCdb=true;s.identity.containerName='APP_PDB';return s;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(r.targets[0]!.checks.find(x=>x.id==='tablespace:USERS')!.scope).toBe('This PDB (APP_PDB)');expect(r.targets[0]!.checks.find(x=>x.id==='recovery')!.scope).toContain('CDB-wide');expect(r.targets[0]!.checks.find(x=>x.id==='archiveGaps')!.status).toBe('UNKNOWN');
});
it('passes a decreasing deadline to sequential statements and stops a timed-out probe',async()=>{
	const {context,readers}=fake(); const timeouts:number[]=[];
	context.config.limits.statementTimeoutSeconds=0.01;
	const get=context.sessions.get;
	context.sessions.get=async()=>{const s=await get();s.query=async(_sql,_binds,o)=>{timeouts.push(o!.timeoutSeconds!);await new Promise(r=>setTimeout(r,15));return {columns:[],rows:[],truncated:false,elapsedMs:15};};return s;};
	readers.space=async(s: unknown)=>{const session=s as import('../../src/contracts.js').OracleSession;await session.query('SELECT 1 FROM DUAL');await session.query('SELECT 2 FROM DUAL');return {} as never;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(timeouts).toHaveLength(1);expect(timeouts[0]).toBeLessThanOrEqual(0.01);expect(r.targets[0]!.checks.find(x=>x.id==='tablespaces')!.status).toBe('UNKNOWN');
});
it('no applicable expiry and malformed expiry are UNKNOWN',async()=>{
	for(const expiry of [null,'not-a-date']) {
		const {context,readers}=fake(), security=readers.security;
		readers.security=async()=>{const r=await security();r.checks[0]!.evidence[0]!.rows[0]![4]=expiry as never;return r;};
		const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);expect(r.targets[0]!.checks.find(x=>x.id==='expiry')!.status).toBe('UNKNOWN');
	}
});
it('rejects unconfigured or unpinned API targets before any collector',async()=>{
	const {context,readers}=fake();context.pinnedTarget='lab';
	for(const targets of [[],['other'],['unconfigured']]) await expect(runChecks(context,targets,undefined,readers as unknown as typeof collectors,now)).rejects.toThrow(/configured targets/);
});
it('opens one underlying session per target and propagates configuration errors',async()=>{
	const {context,readers}=fake();let opens=0;const get=context.sessions.get;context.sessions.get=async()=>{opens++;return get();};
	await runChecks(context,['lab','other'],undefined,readers as unknown as typeof collectors,now);expect(opens).toBe(2);
	const {SafeConfigError}=await import('../../src/config/safeErrors.js');context.sessions.get=async()=>{throw new SafeConfigError('Invalid password file');};await expect(runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now)).rejects.toThrow('Invalid password file');
});
