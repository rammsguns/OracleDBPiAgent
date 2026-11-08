import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, worst, exitCode, parseCheckConfig, loadCheckConfig, thresholdsFor, DEFAULTS, CHECK_NAMES, displayValue, defaultPasswordAccounts, evidenceReason, runChecks, collectors, renderCheckMarkdown, redact } from '../../src/check/index.js';
import { appendCheckRun, runCheck } from '../../src/check/cli.js';
import type { ToolContext } from '../../src/contracts.js';
import { readFile } from 'node:fs/promises';
import { FEATURE_VIEWS } from '../../src/preflight/views.js';

describe('check thresholds and exits', () => {
	for (const [value,status] of [[0,'OK'],[84.9,'OK'],[85,'WARN'],[95,'CRIT'],[100,'CRIT'],[null,'UNKNOWN'],[NaN,'UNKNOWN']] as const) it(`space ${value} => ${status}`, () => expect(classify(value,DEFAULTS.space)).toBe(status));
	for (const [value,status] of [[15,'OK'],[14,'WARN'],[3,'CRIT'],[-1,'CRIT']] as const) it(`expiry ${value}`, () => expect(classify(value,DEFAULTS.expiry,true)).toBe(status));
	for (const key of ['space','recovery','blocking','backupAge','failedJobs','alertErrors','maintenance'] as const) it(`${key} inclusive limits`, () => { expect(classify(DEFAULTS[key].warn,DEFAULTS[key])).toBe('WARN'); if (DEFAULTS[key].crit !== null) expect(classify(DEFAULTS[key].crit,DEFAULTS[key])).toBe('CRIT'); });
	for (const [status,code] of [['OK',0],['WARN',1],['CRIT',2],['UNKNOWN',3]] as const) it(`exit ${status}`, () => { expect(exitCode(status)).toBe(code); expect(exitCode(status,'warn')).toBe(code); expect(exitCode(status,'crit')).toBe(status === 'WARN' ? 0 : code); });
	it('max_state_alt precedence is CRIT > WARN > UNKNOWN > OK', () => { expect(worst(['CRIT','UNKNOWN'])).toBe('CRIT'); expect(worst(['UNKNOWN','WARN'])).toBe('WARN'); expect(worst(['OK','UNKNOWN'])).toBe('UNKNOWN'); expect(worst(['SKIPPED'])).toBe('OK'); expect(worst(['OK','CRIT','WARN'])).toBe('CRIT'); expect(worst(['OK','WARN'])).toBe('WARN'); });
	it('uses defaults and overrides without cross-target mutation', () => { const c = parseCheckConfig({version:1, defaults:{space:{warn:70,crit:90}},targets:{lab:{space:{warn:60,crit:80}}}},['lab','other']); expect(thresholdsFor(c,'lab').space.warn).toBe(60); expect(thresholdsFor(c,'other').space.warn).toBe(70); expect(DEFAULTS.space.warn).toBe(85); });
	for (const raw of [null,[],{}, {version:2}, {version:1,password:'secret'}, {version:1,defaults:{bad:1}}, {version:1,targets:{unknown:{}}}, {version:1,defaults:{space:{warn:95,crit:85}}}, {version:1,defaults:{space:{warn:80,crit:101}}}, {version:1,defaults:{space:{warn:80,crit:90,extra:1}}}, {version:1,defaults:{windowHours:0}}, {version:1,defaults:{windowHours:721}}, {version:1,defaults:{expiry:{warn:3,crit:14}}}]) it(`rejects invalid config ${JSON.stringify(raw)}`, () => expect(() => parseCheckConfig(raw,['lab'])).toThrow());
	it('accepts modes 0600 and 0400 and refuses symlinks, malformed or oversized files', () => {
		const home = mkdtempSync(join(tmpdir(),'check-'));
		try {
			const env = {PIAGENT_HOME:home}; expect(loadCheckConfig(['lab'],env)).toEqual({});
			const path=join(home,'check.json'); writeFileSync(path,'{"version":1}',{mode:0o600}); expect(loadCheckConfig(['lab'],env)).toEqual({version:1});
			chmodSync(path,0o400); expect(loadCheckConfig(['lab'],env)).toEqual({version:1});
			for(const mode of [0o644,0o640,0o604,0o440,0o404,0o700,0o200,0]) { chmodSync(path,mode); expect(() => loadCheckConfig(['lab'],env)).toThrow(); } chmodSync(path,0o600);
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
	const context = {config:{targets:[{name:'lab'},{name:'other'}],limits:{statementTimeoutSeconds:10,maxRows:100}},audit:{record:async () => {}},runId:'test',sessions:{get:async () => ({target:{name:'lab'},identity:{isCdb:false},query:async () => ({columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PRIMARY','READ WRITE','LAB','MAXIMUM PERFORMANCE']],truncated:false,elapsedMs:0})})}} as unknown as ToolContext;
	return {readers,context};
}
const now = new Date('2026-11-07T00:00:00Z');
it('runs sequentially, stable redacted Markdown and JSON with all checks', async () => {
	const {readers,context}=fake(); const order: string[]=[];
	for (const key of Object.keys(readers) as (keyof typeof readers)[]) { const fn=readers[key]; Object.assign(readers,{[key]:async () => {order.push(key); return fn();}}); }
	const run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(run.status).toBe('OK'); expect(run.targets[0]!.checks).toHaveLength(14); expect(order).toEqual(['space','sessions','backup','jobs','security','alerts','incidents','security']);
	expect(renderCheckMarkdown(run)).toContain('| Target |'); expect(JSON.parse(JSON.stringify(run))).toEqual(run);
});
it('all collector failures are UNKNOWN with sanitized errors', async () => {
	for (const code of ['ORA-00942','ORA-01031','ORA-65040','password=do-not-print','CHECK_TIMEOUT']) {
		const {context}=fake(); const readers=Object.fromEntries(Object.keys(collectors).map(key=>[key,async()=>{throw new Error(code);}])) as unknown as typeof collectors;
		const r=await runChecks(context,['lab'],undefined,readers,now); expect(r.status).toBe('UNKNOWN'); expect(r.targets[0]!.checks.every(x=>x.id==='dgLag' ? x.status==='OK' : x.status==='UNKNOWN')).toBe(true); expect(JSON.stringify(r)).not.toContain('do-not-print');
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
	expect(r.targets[0]!.checks.find(x=>x.id==='tablespace:USERS')!.scope).toContain('This PDB (APP_PDB)');expect(r.targets[0]!.checks.find(x=>x.id==='recovery')!.scope).toContain('CDB-wide');expect(r.targets[0]!.checks.find(x=>x.id==='archiveGaps')!.status).toBe('UNKNOWN');
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
it('no expiry is OK while malformed expiry is UNKNOWN',async()=>{
	for(const expiry of [null,'not-a-date']) {
		const {context,readers}=fake(), security=readers.security;
		readers.security=async()=>{const r=await security();r.checks[0]!.evidence[0]!.rows[0]![4]=expiry as never;return r;};
		const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);expect(r.targets[0]!.checks.find(x=>x.id==='expiry')!.status).toBe(expiry===null?'OK':'UNKNOWN');
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
for (const [value,unit,display] of [[3.7128466,'%','3.7 %'],[123.2044,'days','123.2 days'],[60.6,'seconds','61 seconds'],[26.12345,'hours','26.1 hours'],[5,'accounts','5 accounts'],[null,'days','UNKNOWN']] as const) it(`rounds ${unit} display without changing numeric value`,()=>expect(displayValue(value,unit)).toBe(display));
it('formats raw JSON values and terminal Markdown with counts, pipes and backticks',async()=>{
	const {context,readers}=fake(), space=readers.space;
	readers.space=async()=>{const r=await space();r.sections.tablespaces.rows[0]!.usedPercentMax=3.712846619056;r.sections.tablespaces.rows[0]!.name='A|B`C';return r;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now), check=r.targets[0]!.checks[0]!;
	expect(check.value).toBe(3.712846619056);expect(check.display).toBe('3.7 %');const text=renderCheckMarkdown(r);expect(text.split('\n')[0]).toBe('# Check: OK — 0 CRIT, 0 WARN, 0 UNKNOWN, 14 OK (lab)');expect(text).toContain('A\\|B\\`C');expect(text).toContain('> 0 = CRIT');expect(text).not.toContain('&gt;');expect(text).not.toContain('3.712846');
});
it('reports exact max_state_alt aggregate and exits for mixed findings',async()=>{
	const {context,readers}=fake(), jobs=readers.jobs, security=readers.security;
	readers.alerts=async()=>({status:'unavailable',view:'V$DIAG_ALERT_EXT',rows:[],truncated:false,attempts:[{code:'ORA-00942'}]}) as never;
	readers.jobs=async()=>{const r=await jobs();r.sections.runs!.rows=[{STATUS:'FAILED'}];return r;};
	let r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);expect(r.status).toBe('WARN');expect(exitCode(r.status)).toBe(1);
	readers.security=async()=>{const r=await security();r.checks[1]!.findings=[{subject:'SCOTT'}] as never;return r;};
	r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);expect(r.status).toBe('CRIT');expect(exitCode(r.status)).toBe(2);expect(renderCheckMarkdown(r)).toContain('# Check: CRIT — 1 CRIT, 1 WARN, 1 UNKNOWN, 11 OK (lab)');expect(r.targets[0]!.checks.find(x=>x.id==='defaultPasswords')!.note).toBe('Accounts: SCOTT.');
});
for (const code of ['ORA-00942','ORA-01031','ORA-65040']) it(`retains missing view and ${code} reason in collector results`,async()=>{
	const {context,readers}=fake();readers.alerts=async()=>({status:'unavailable',view:'V$DIAG_ALERT_EXT',rows:[],truncated:false,attempts:[{view:'V$DIAG_ALERT_EXT',code}]}) as never;
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now), c=r.targets[0]!.checks.find(x=>x.id==='alertErrors')!;expect(c.status).toBe('UNKNOWN');expect(c.note).toContain('V$DIAG_ALERT_EXT');expect(c.note).toContain(code);expect(c.note).toContain(code==='ORA-65040'?'this PDB':'missing grant');
});
it('distinguishes configured-area absence, unreadable views, empty backup history and NOARCHIVELOG',async()=>{
	const {context,readers}=fake(), space=readers.space, backup=readers.backup;
	readers.space=async()=>{const r=await space();r.sections.recovery.rows=[];return r;};
	readers.backup=async()=>{const r=await backup();r.files=[];for(const e of Object.values(r.evidence))e.rows=[];r.evidence.database!.rows=[{LOG_MODE:'NOARCHIVELOG'}];return r;};
	let r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);let checks=r.targets[0]!.checks;
	expect(checks.find(x=>x.id==='recovery')!.note).toContain('DB_RECOVERY_FILE_DEST unset');expect(checks.find(x=>x.id==='backupAge')!.note).toContain('No backups recorded in the visible control-file history; external catalogs');expect(checks.find(x=>x.id==='archiveGaps')!.note).toContain('NOARCHIVELOG');
	readers.space=async()=>{const r=await space();Object.assign(r.sections.recovery.evidence,{status:'unavailable',view:'V$RECOVERY_FILE_DEST',attempts:[{code:'ORA-01031'}]});r.sections.recovery.status='unavailable';r.sections.recovery.rows=[];return r;};
	r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);checks=r.targets[0]!.checks;expect(checks.find(x=>x.id==='recovery')!.note).toContain('V$RECOVERY_FILE_DEST');expect(checks.find(x=>x.id==='recovery')!.note).toContain('ORA-01031');expect(checks.find(x=>x.id==='recovery')!.note).not.toContain('unset');
});
it('explains PDB-hidden backup and recovery evidence',async()=>{
	const {context,readers}=fake(), space=readers.space, backup=readers.backup, get=context.sessions.get;
	context.sessions.get=async()=>{const s=await get();s.identity.isCdb=true;return s;};readers.space=async()=>{const r=await space();r.sections.recovery.rows=[];return r;};readers.backup=async()=>{const r=await backup();r.files=[];return r;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);for(const id of ['backupAge','recovery'])expect(r.targets[0]!.checks.find(x=>x.id===id)!.note).toContain('PDB-hidden');
});
for(const invalid of [{disable:['typo']},{disable:['backupAge','backupAge']},{disable:'backupAge'},{checks:{typo:{unknownAs:'ok'}}},{checks:{backupAge:{unknownAs:'maybe'}}},{checks:{backupAge:{unknownAs:['ok']}}},{checks:{backupAge:{unknownAs:'ok',extra:true}}},{checks:{backupAge:{}}}])it(`strictly rejects invalid policy ${JSON.stringify(invalid)}`,()=>expect(()=>parseCheckConfig({version:1,targets:{lab:invalid}},['lab'])).toThrow());
it('merges default and target policies with target overrides and disable replacement',()=>{
	const c=parseCheckConfig({version:1,defaults:{disable:['backupAge'],checks:{recovery:{unknownAs:'warn'},archiveGaps:{unknownAs:'crit'}}},targets:{lab:{disable:[],checks:{recovery:{unknownAs:'ok'}}}}},['lab']);
	expect(thresholdsFor(c,'lab').disable).toEqual([]);expect(thresholdsFor(c,'lab').checks).toEqual({recovery:{unknownAs:'ok'},archiveGaps:{unknownAs:'crit'}});expect(thresholdsFor(c,'other').disable).toEqual(['backupAge']);
});
for(const unknownAs of ['ok','warn','crit','unknown'] as const)it(`unknownAs=${unknownAs} preserves raw UNKNOWN and reason`,async()=>{
	const {context,readers}=fake();readers.alerts=async()=>({status:'unavailable',view:'V$DIAG_ALERT_EXT',rows:[],truncated:false,attempts:[{code:'ORA-00942'}]}) as never;
	const settings=thresholdsFor(parseCheckConfig({version:1,targets:{lab:{checks:{alertErrors:{unknownAs}}}}},['lab']),'lab');
	const r=await runChecks(context,['lab'],()=>settings,readers as unknown as typeof collectors,now),check=r.targets[0]!.checks.find(x=>x.id==='alertErrors')!;
	expect(check.status).toBe(unknownAs.toUpperCase());expect(check.value).toBeNull();expect(check.display).toBe('UNKNOWN');expect(check.note).toContain('V$DIAG_ALERT_EXT');if(unknownAs!=='unknown'){expect(check.observedStatus).toBe('UNKNOWN');expect(check.note).toContain(`unknownAs=${unknownAs}`);}expect(r.status).toBe(unknownAs.toUpperCase());
});
it('disabled checks are SKIPPED and excluded even with unknownAs=crit',async()=>{
	const {context,readers}=fake();let backupCalls=0;readers.backup=async()=>{backupCalls++;throw new Error('must not run');};
	const t={...DEFAULTS,disable:['backupAge','archiveGaps'] as const,checks:{backupAge:{unknownAs:'crit' as const}}};
	const r=await runChecks(context,['lab'],()=>({...t,disable:[...t.disable]}),readers as unknown as typeof collectors,now);expect(backupCalls).toBe(0);expect(r.status).toBe('OK');expect(exitCode(r.status)).toBe(0);for(const id of t.disable){const c=r.targets[0]!.checks.find(x=>x.id===id)!;expect(c.status).toBe('SKIPPED');expect(c.display).toBe('SKIPPED');}expect(renderCheckMarkdown(r)).toContain('0 UNKNOWN, 12 OK (lab)');
});
it('all-disabled checks cause no connection and all named families can be disabled',async()=>{
	const {context,readers}=fake();context.sessions.get=async()=>{throw new Error('must not open');};const r=await runChecks(context,['lab'],()=>({...DEFAULTS,disable:[...CHECK_NAMES]}),readers as unknown as typeof collectors,now);expect(r.status).toBe('OK');expect(r.targets[0]!.checks).toHaveLength(CHECK_NAMES.length);expect(r.targets[0]!.checks.every(c=>c.status==='SKIPPED')).toBe(true);expect(renderCheckMarkdown(r)).toContain('0 CRIT, 0 WARN, 0 UNKNOWN, 0 OK');
});
it('default password usernames use only simple identifiers, max 10 and +N more',()=>{
	const names=Array.from({length:12},(_,i)=>`USER${String(i).padStart(2,'0')}`);const note=defaultPasswordAccounts([...names,'USER00','bad user','password=secret','A'.repeat(129)]);expect(note).toContain('USER09 +2 more');expect(note).not.toContain('USER10');expect(note).not.toContain('secret');expect(defaultPasswordAccounts(['SCOTT','C##APP','A_$#'])).toBe('Accounts: A_$#, C##APP, SCOTT.');
});
it('truncated and missing evidence explain why without generic UNKNOWN text',()=>{expect(evidenceReason({status:'ok',view:'DBA_USERS',truncated:true})).toContain('DBA_USERS: row cap');expect(evidenceReason(undefined)).toContain('not returned');});
it('complete users with unlimited lifetimes are OK, without an invented minimum expiry',async()=>{
	const {context,readers}=fake(), security=readers.security;
	readers.security=async()=>{const r=await security();r.checks[0]!.evidence[0]!.rows=[['APP','N','OPEN','DEFAULT',null],['LOCKED_APP','N','LOCKED','DEFAULT','2020-01-01T00:00:00Z'],['ORACLE_OWNER','Y','OPEN','DEFAULT','2020-01-01T00:00:00Z']] as never;return r;};
	const r=await runChecks(context,['lab'],()=>({...DEFAULTS,checks:{expiry:{unknownAs:'crit'}}}),readers as unknown as typeof collectors,now), c=r.targets[0]!.checks.find(c=>c.id==='expiry')!;
	expect(c.status).toBe('OK');expect(c.value).toBeNull();expect(c.display).toBe('none');expect(c.note).toBe('No expiring unlocked accounts (unlimited or no expiry)');expect(c.observedStatus).toBeUndefined();expect(renderCheckMarkdown(r)).toContain('| expiry | OK | none |');expect(r.status).toBe('OK');
});
for(const state of ['unavailable','truncated'])it(`no expiry with ${state} users stays UNKNOWN`,async()=>{
	const {context,readers}=fake(), security=readers.security;
	readers.security=async()=>{const r=await security(),users=r.checks[0]!.evidence[0]!;users.rows[0]![4]=null as never;Object.assign(users,state==='unavailable'?{status:'unavailable',view:'DBA_USERS',attempts:[{code:'ORA-00942'}]}:{truncated:true,view:'DBA_USERS'});return r;};
	const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now),c=r.targets[0]!.checks.find(c=>c.id==='expiry')!;expect(c.status).toBe('UNKNOWN');expect(c.note).toContain('DBA_USERS');expect(c.note).not.toContain('No expiring');
});
it('an explicitly expired unlocked account remains critical even if its expiry date is absent',async()=>{
	const {context,readers}=fake(),security=readers.security;readers.security=async()=>{const r=await security();r.checks[0]!.evidence[0]!.rows[0]![2]='EXPIRED';r.checks[0]!.evidence[0]!.rows[0]![4]=null as never;return r;};const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);expect(r.targets[0]!.checks.find(c=>c.id==='expiry')!.status).toBe('CRIT');
});
for(const [count,expected] of [[0,'UNKNOWN'],[1,'WARN'],[9,'WARN'],[10,'CRIT'],[100,'CRIT']] as const)it(`truncated alert count ${count} reports ${expected} with lower-bound semantics`,async()=>{
	const {context,readers}=fake();readers.alerts=async()=>({status:'ok',view:'V$DIAG_ALERT_EXT',rows:count?[{codes:['ORA-00600'],count}]:[],truncated:true}) as never;
	const r=await runChecks(context,['lab'],()=>({...DEFAULTS,alertErrors:{warn:1,crit:10}}),readers as unknown as typeof collectors,now),c=r.targets[0]!.checks.find(c=>c.id==='alertErrors')!;
	expect(c.status).toBe(expected);expect(c.note).toContain('V$DIAG_ALERT_EXT: row cap reached');expect(c.note).toContain(`at least ${count}`);
	if(expected==='UNKNOWN'){expect(c.value).toBeNull();expect(c.display).toBe('UNKNOWN');expect(c.lowerBound).toBeUndefined();expect(c.note).toContain('below threshold');}else{expect(c.value).toBe(count);expect(c.display).toBe(`>= ${count} errors`);expect(c.lowerBound).toBe(true);expect(renderCheckMarkdown(r)).toContain(`>= ${count} errors`);expect(exitCode(r.status)).toBe(expected==='CRIT'?2:1);}
});
it('truncated alert counts compare ORA occurrences only and honor target thresholds',async()=>{
	const {context,readers}=fake();readers.alerts=async()=>({status:'ok',view:'V$DIAG_ALERT_EXT',rows:[{codes:['TNS-12514'],count:100},{codes:['ORA-00600'],count:2},{codes:['ORA-07445'],count:3}],truncated:true}) as never;
	const config=parseCheckConfig({version:1,targets:{lab:{alertErrors:{warn:5,crit:20}},other:{alertErrors:{warn:6,crit:20}}}},['lab','other']);const r=await runChecks(context,['lab','other'],target=>thresholdsFor(config,target),readers as unknown as typeof collectors,now);expect(r.targets[0]!.checks.find(c=>c.id==='alertErrors')!.display).toBe('>= 5 errors');expect(r.targets[0]!.status).toBe('WARN');expect(r.targets[1]!.checks.find(c=>c.id==='alertErrors')!.status).toBe('UNKNOWN');
});
it('complete alert counts remain exact and unavailable alert evidence cannot assert a lower bound',async()=>{
	for(const status of ['ok','unavailable']){
		const {context,readers}=fake();readers.alerts=async()=>({status,view:'V$DIAG_ALERT_EXT',rows:[{codes:['ORA-00600'],count:100}],truncated:status!=='ok',attempts:status==='ok'?[]:[{code:'ORA-00942'}]}) as never;
		const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now),c=r.targets[0]!.checks.find(c=>c.id==='alertErrors')!;expect(c.status).toBe(status==='ok'?'WARN':'UNKNOWN');expect(c.display).toBe(status==='ok'?'100 errors':'UNKNOWN');expect(c.lowerBound).toBeUndefined();
	}
});
it('truncated incident rows already prove the any-incident critical threshold',async()=>{
	const {context,readers}=fake();readers.incidents=async()=>({status:'ok',view:'V$DIAG_INCIDENT',rows:[{}],truncated:true}) as never;const r=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now),c=r.targets[0]!.checks.find(c=>c.id==='incidents')!;expect(c.status).toBe('CRIT');expect(c.value).toBe(1);expect(c.display).toBe('>= 1 incidents');expect(c.lowerBound).toBe(true);expect(c.note).toContain('row cap reached');
});

it('uses labelled per-datafile fallback only in a PDB with empty RMAN jobs', async () => {
	const {context,readers}=fake();
	const get=context.sessions.get;
	context.sessions.get=async (...args)=>({...await get(...args),identity:{isCdb:true,containerName:'PIPDB1'}} as never);
	const original=readers.backup;
	readers.backup=async()=>{const b=await original();b.evidence.jobs!.rows=[];return b;};
	let run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(run.targets[0]!.checks.find(c=>c.id==='backupAge')).toMatchObject({status:'OK',value:1,note:expect.stringContaining('PDB fallback')});
	readers.backup=async()=>{const b=await original();b.evidence.jobs!.rows=[];b.files=[];return b;};
	run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	expect(run.targets[0]!.checks.find(c=>c.id==='backupAge')!.status).toBe('UNKNOWN');
});

it('discloses instance-wide ADR coverage in PDB alert and incident notes',async()=>{
	const {context,readers}=fake(),get=context.sessions.get;
	context.sessions.get=async(...args)=>({...await get(...args),identity:{isCdb:true,containerName:'PIPDB1'}} as never);
	const run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	for(const id of ['alertErrors','incidents'])expect(run.targets[0]!.checks.find(c=>c.id===id)!.note).toContain('CDB-wide/instance ADR evidence (CON_ID 0/1)');
});
it('standby copied backups stay UNKNOWN and replicated jobs/maintenance retain labels',async()=>{
	const {context,readers}=fake();
	const get=context.sessions.get;
	context.sessions.get=async target=>{const s=await get(target);s.query=async sql=>sql.includes('DATABASE_ROLE')?{columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PHYSICAL STANDBY','READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']],truncated:false,elapsedMs:0}:{columns:[],rows:[],truncated:false,elapsedMs:0};return s;};
	const original=readers.backup;
	readers.backup=async()=>{const r=await original();Object.assign(r.evidence,{archiveGap:{status:'ok',truncated:false,rows:[]}});r.evidence.archives!.rows=[{REGISTRAR:'RFS'}] as never;return r;};
	const run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
	const checks=run.targets[0]!.checks;
	expect(checks.find(c=>c.id==='backupAge')).toMatchObject({status:'UNKNOWN',value:null,note:expect.stringContaining('normally taken on the primary')});
	expect(checks.find(c=>c.id==='archiveGaps')).toMatchObject({status:'OK',scope:expect.stringContaining('Physical standby CDB19S')});
	for(const id of ['failedJobs','maintenance'])expect(checks.find(c=>c.id===id)!.note).toContain('replicated from the primary');
	expect(checks.find(c=>c.id==='dgLag')!.status).toBe('UNKNOWN');
});

it('names V$ARCHIVE_GAP sequences when RFS history is empty or unavailable',async()=>{
	for(const status of ['ok','unavailable']) {
		const {context,readers}=fake(),get=context.sessions.get;
		context.sessions.get=async target=>{const s=await get(target);s.query=async()=>({columns:['DATABASE_ROLE','OPEN_MODE','DB_UNIQUE_NAME','PROTECTION_MODE'],rows:[['PHYSICAL STANDBY','READ ONLY WITH APPLY','CDB19S','MAXIMUM PERFORMANCE']],truncated:false,elapsedMs:0});return s;};
		const original=readers.backup;
		readers.backup=async()=>{const r=await original();Object.assign(r.evidence,{
			archiveGap:{status:'ok',truncated:false,rows:[{'THREAD#':1,'LOW_SEQUENCE#':50,'HIGH_SEQUENCE#':55}]},
			archives:{status,truncated:false,rows:[],view:'V$ARCHIVED_LOG',note:status==='unavailable'?'ORA-00942':undefined},
		});r.gaps=[{thread:1,resetlogsScn:1,fromSequence:50,toSequence:55}] as never;return r;};
		const run=await runChecks(context,['lab'],undefined,readers as unknown as typeof collectors,now);
		const gap=run.targets[0]!.checks.find(c=>c.id==='archiveGaps')!;
		expect(gap).toMatchObject({status:'CRIT',value:1,note:expect.stringContaining('V$ARCHIVE_GAP: missing sequences 50–55 on thread 1.')});
		expect(gap.note).not.toContain('baseline cannot be established');
		if(status==='unavailable')expect(gap.note).toContain('ORA-00942');
	}
});
