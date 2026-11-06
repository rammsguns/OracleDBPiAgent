import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateTarget, loadTargets, validatePrivateTargetsStat } from '../../src/config/targets.js';
import { SafeConfigError } from '../../src/config/safeErrors.js';
import { connectionGuidance, recordConnectionFailure, withConnectionFailures } from '../../src/oracle/connectionErrors.js';
import { doctor, main, handleCliError } from '../../src/cli/index.js';
import { loadConfig } from '../../src/config/index.js';
import { renderFeatureSummary } from '../../src/preflight/render.js';
const target = {name:'lab-d1',host:'localhost',port:1522,serviceName:'ORCL',username:'READER',passwordFile:'reader.pw',defaultSchema:'APP',environment:'development',description:'Approved'};
const dirs: string[]=[];
afterEach(()=>{vi.restoreAllMocks();process.exitCode=0;for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(raw: unknown) {
	const home=mkdtempSync(join(tmpdir(),'target-errors-'));dirs.push(home);chmodSync(home,0o700);writeFileSync(join(home,'targets.json'),JSON.stringify(raw),{mode:0o600});return {PIAGENT_HOME:home};
}
it.each(['host','port','serviceName','username','passwordFile','defaultSchema','environment','description','logTables'])('names invalid %s without echoing its value',field=>{
	expect(()=>validateTarget({...target,[field]:field==='description'?'':'private-value/unsafe'},1)).toThrow(`targets.json target 1 (lab-d1): ${field} is invalid`);
});
it('does not echo invalid names or malformed JSON values',()=>{
	expect(()=>validateTarget({...target,name:'secret/unsafe'},1)).toThrow('targets.json target 1: name is invalid');
	const env=fixture({});writeFileSync(join(env.PIAGENT_HOME,'targets.json'),'{"password":"private-value"');expect(()=>loadTargets(env)).toThrow('targets.json must contain valid JSON');
});
it.each(['SYS','C##SYS'])('names only the denied username %s',username=>{
	expect(()=>loadTargets(fixture({version:1,targets:[{...target,username}]}))).toThrow(`targets.json target 1 (lab-d1): username ${username} is not allowed (system account)`);
});
it.each(['password','unknown\nproperty'])('names unknown property %j without its value',property=>{
	expect(()=>loadTargets(fixture({version:1,targets:[{...target,[property]:'private-password'}]}))).toThrow(`targets.json target 1 (lab-d1): unknown property ${JSON.stringify(property)} (passwords belong in PIAGENT_SECRET_DIR files)`);
});
it('distinguishes duplicate, count, version, shape and top-level unknown property',()=>{
	for(const [raw,reason] of [
		[{version:1,targets:[target,target]},'target 2 (lab-d1): duplicate target name'],
		[{version:1,targets:[]},'must contain 1–20 targets'],
		[{version:9,targets:[target]},'version must be 1'],
		[null,'must be an object'],
		[{version:1,targets:[target],password:'private'},'unknown property "password"'],
	] as const) expect(()=>loadTargets(fixture(raw))).toThrow(reason);
});
it('file diagnostics omit actual paths and values and remain SafeConfigError',()=>{
	for(const patch of [{mode:0o666},{uid:99},{isFile:()=>false}]) expect(()=>validatePrivateTargetsStat({mode:0o600,uid:1,isFile:()=>true,size:10,...patch},1)).toThrow('chmod 600 <path>');
	try{loadTargets({PIAGENT_HOME:fixture({}).PIAGENT_HOME,PIAGENT_TARGETS_FILE:'/private/path/password'});}catch(error){expect(error).toBeInstanceOf(SafeConfigError);expect(String(error)).not.toContain('/private/path');}
});
const cases = [
	['ORA-01017','invalid username/password'],['ORA-28000','account locked'],['ORA-12514','use the PDB service'],['ORA-12505','use the PDB service'],['ORA-12541','listener unreachable'],['ORA-12170','connection timeout'],['NJS-503','listener unreachable'],['ORA-01045','missing CREATE SESSION'],['ORA-28001','expired password'],
] as const;
it.each(cases)('maps %s safely in targets, doctor and the shared command error handler',async(code,hint)=>{
	const error=new Error(`${code}: private-password private-host`);
	const mapped=connectionGuidance(error)!;expect(mapped).toContain(code);expect(mapped).toContain(hint);expect(mapped).not.toContain('private-');
	expect(connectionGuidance({code})).toBe(mapped);
	const log=vi.spyOn(console,'log').mockImplementation(()=>{}),stderr=vi.spyOn(console,'error').mockImplementation(()=>{});
	const closeAll=vi.fn(async()=>{});
	const sessions={get:async()=>{throw error;},closeAll};
	await main(['node','piagent','targets','check','--target','d1-19c-lab'],{createSessions:()=>sessions});
	expect(process.exitCode).toBe(1);expect(log).not.toHaveBeenCalled();expect(stderr).toHaveBeenLastCalledWith(mapped);
	const report=vi.fn();
	await doctor(loadConfig({}),{checkHealth:async()=>{},createSessions:()=>sessions,report});expect(report).toHaveBeenCalledWith(`d1-19c-lab: ${mapped}`,false);
	await doctor(loadConfig({}),{checkHealth:async()=>{},createSessions:()=>sessions});expect(stderr).toHaveBeenCalledWith(`d1-19c-lab: ${mapped}`);
	handleCliError(error);expect(stderr).toHaveBeenLastCalledWith(mapped);
	log.mockClear();stderr.mockClear();
	await main(['node','piagent','targets','check','--target','d1-19c-lab','--json'],{createSessions:()=>sessions});
	expect(JSON.parse(String(log.mock.calls[0]![0])).error).toBe(mapped);expect(stderr).not.toHaveBeenCalled();
});
it('keeps unexpected connection errors generic and preserves swallowed failures for all commands',async()=>{
	expect(connectionGuidance(new Error('ORA-99999: private-password'))).toBeUndefined();
	const stderr=vi.spyOn(console,'error').mockImplementation(()=>{});handleCliError(new Error('ORA-99999: private-password'));expect(stderr).toHaveBeenCalledWith('piagent failed; check local configuration and service availability');
	await expect(withConnectionFailures(async()=>{try{throw recordConnectionFailure(new Error('ORA-01017: private-password'));}catch{/* A report reader may convert this to unavailable. */}})).rejects.toThrow('ORA-01017: invalid username/password');
});
it('summarizes missing and inapplicable views per feature',()=>{
	expect(renderFeatureSummary([{feature:'sql',view:'V$SQL',status:'readable'},{feature:'space',view:'V$LOG',status:'not-applicable'},{feature:'report',view:'V$ARCHIVED_LOG',status:'missing'},{feature:'report',view:'V$LOG_HISTORY',status:'missing'}])).toBe('sql: ok\nspace: ok; 1 not-applicable\nreport: 2 missing: V$ARCHIVED_LOG, V$LOG_HISTORY');
});
it.each(['default','all','json','json-all'])('renders targets check %s output without changing JSON',async mode=>{
	const log=vi.spyOn(console,'log').mockImplementation(()=>{});
	const config=loadConfig({});const close=vi.fn(async()=>{});
	const session={target:config.targets[0]!,identity:{target:'d1-19c-lab',versionFull:'19.9.1.0.0',isCdb:false,currentUser:'HARNESS_LAB',containerName:'ORCL'},close,query:async(sql:string)=>{if(sql.includes('DBA_USERS'))throw new Error('ORA-00942');return {rows:[]};}};
	await main(['node','piagent','targets','check','--target','d1-19c-lab',...(mode.includes('json')?['--json']:[]),...(mode.includes('all')?['--all']:[])],{createSessions:()=>({get:async()=>session as any,closeAll:async()=>{}})});
	const output=log.mock.calls.map(c=>c[0]).join('\n');
	if(mode.includes('json')){const parsed=JSON.parse(output);expect(parsed.accountCheck).toBe('passed');expect(parsed.views.some((v:any)=>v.status==='missing')).toBe(true);expect(parsed).not.toHaveProperty('grantsSql');}
	else {expect(output).toContain('account check passed');expect(output).toContain('Use --grants-sql');if(mode==='all')expect(output).toContain('space\tDBA_USERS\tmissing');else{expect(output).toContain('space: 1 missing: DBA_USERS');expect(output).toContain('sql: ok');expect(output).not.toContain('\tmissing');}}
	expect(close).toHaveBeenCalledOnce();
});
