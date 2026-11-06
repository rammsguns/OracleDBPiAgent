import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DENIED_USERS, validateTarget, loadTargets } from '../../src/config/targets.js';
import { checkAccount, SYSTEM_PRIVILEGES } from '../../src/oracle/account.js';
import { checkTarget } from '../../src/preflight/index.js';
const target = { name:'real-db', host:'db.example.com', port:1521, serviceName:'PDB.example', username:'READER', passwordFile:'reader.pw', defaultSchema:'APP', environment:'production', description:'Owner approved' };
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d,{recursive:true,force:true}); });
function fixture() {
	const home=mkdtempSync(join(tmpdir(),'targets-')); dirs.push(home); chmodSync(home,0o700);
	const file=join(home,'targets.json'); writeFileSync(file,JSON.stringify({version:1,targets:[target]}),{mode:0o600});
	return {home,file,env:{PIAGENT_HOME:home}};
}
it.each([...DENIED_USERS])('denies %s case insensitively', username => { expect(() => validateTarget({...target,username:username.toLowerCase()})).toThrow(); });
it.each([
	['name','UPPER'],['name','-a'],['name','a'.repeat(64)],['name',5],['host','a/b'],['host','a@b'],['host','a?b'],['host','a#b'],['host','a:b'],['host','a b'],['host','-db'],['host','[bad]'],['host',''],['port',0],['port',65536],['port',1.5],['port','1521'],['serviceName','a/b'],['serviceName','a'.repeat(129)],['serviceName',''],['username','A B'],['username','"SYS"'],['defaultSchema','A.B'],['passwordFile','../pw'],['passwordFile','/pw'],['passwordFile','..'],['passwordFile','a\\b'],['environment','test'],['description',' '],['unknown',true],['logTables',{}],
])('rejects invalid %s %j', (key,value) => { expect(() => validateTarget({...target,[key as string]:value})).toThrow(); });
it.each(['localhost','127.0.0.1','db.example.com','[::1]'])('accepts host %s',host => { expect(() => validateTarget({...target,host})).not.toThrow(); });
it('accepts common users and valid boundaries',()=>{ expect(()=>validateTarget({...target,username:'C##READER',port:65535})).not.toThrow(); });
it('loads private source and fallback',()=>{const f=fixture();expect(loadTargets(f.env)[0]).toEqual(target); expect(loadTargets({})).toHaveLength(2);});
it.each([0o620,0o602,0o666])('refuses writable mode %s',mode=>{const f=fixture();chmodSync(f.file,mode);expect(()=>loadTargets(f.env)).toThrow();});
it('refuses symlinks and directories',()=>{const f=fixture();const link=join(f.home,'link');symlinkSync(f.file,link);expect(()=>loadTargets({...f.env,PIAGENT_TARGETS_FILE:link})).toThrow();mkdirSync(join(f.home,'dir'));expect(()=>loadTargets({...f.env,PIAGENT_TARGETS_FILE:join(f.home,'dir')})).toThrow();});
it.each([[],Array(21).fill(target),[target,target]])('rejects target count or duplicate',targets=>{const f=fixture();writeFileSync(f.file,JSON.stringify({version:1,targets}));expect(()=>loadTargets(f.env)).toThrow();});
it('rejects invalid JSON, version and home mode',()=>{const f=fixture();writeFileSync(f.file,'{');expect(()=>loadTargets(f.env)).toThrow();writeFileSync(f.file,JSON.stringify({version:2,targets:[target]}));expect(()=>loadTargets(f.env)).toThrow();chmodSync(f.home,0o755);expect(()=>loadTargets(f.env)).toThrow();});
function account(identity: unknown[] = ['READER','FALSE',null,'3','PDB'], system: unknown[][] = [], objects: unknown[][] = []) {
	return {execute:vi.fn().mockResolvedValueOnce({rows:[identity]}).mockResolvedValueOnce({rows:system}).mockResolvedValueOnce({rows:objects})};
}
it.each([...SYSTEM_PRIVILEGES])('permits system privilege %s',async privilege=>{await expect(checkAccount(account(undefined,[[privilege]]),'READER',{})).resolves.toBeUndefined();});
it.each(['CREATE TABLE','DBA','UPDATE ANY TABLE','EXECUTE ANY PROCEDURE','UNKNOWN'])('refuses system privilege %s',async privilege=>{await expect(checkAccount(account(undefined,[[privilege]]),'READER',{})).rejects.toThrow(privilege);});
it.each(['SELECT','READ','EXECUTE','FLASHBACK'])('permits safe object privilege %s',async privilege=>{await expect(checkAccount(account(undefined,[],[[privilege,'SYS','Y']]),'READER',{})).resolves.toBeUndefined();});
it.each([['EXECUTE','APP','N'],['EXECUTE','UNKNOWN',null],['FLASHBACK','APP','N'],['FLASHBACK','UNKNOWN',null],['REFERENCES','APP','N'],['INSERT','SYS','Y'],['UPDATE','APP','N'],['DELETE','APP','N'],['ALTER','SYS','Y']])('refuses object privilege %s',async (...row)=>{await expect(checkAccount(account(undefined,[],[row]),'READER',{})).rejects.toThrow(String(row[0]));});
it.each([['OTHER','FALSE',null,'3','PDB'],['READER','TRUE',null,'3','PDB'],['READER','FALSE','PROXY','3','PDB']])('refuses identity %j',async(...identity)=>{await expect(checkAccount(account(identity),'READER',{})).rejects.toThrow('Account check failed');});
it.each([['1','ROOT'],['3','CDB$ROOT']])('refuses root %s',async(id,name)=>{await expect(checkAccount(account(['READER','FALSE',null,id,name]),'READER',{})).rejects.toThrow('PDB service');});
it.each([0,1,2])('fails closed at query %s',async n=>{const c=account();c.execute.mockReset();c.execute.mockImplementation(async()=>{if(n--===0)throw new Error('private details');return {rows:[['READER','FALSE',null,'0','DB']]};});await expect(checkAccount(c,'READER',{})).rejects.toThrow('connection refused');});
it('uses direct and enabled role sources with Oracle ownership',async()=>{const c=account();await checkAccount(c,'READER',{});const sql=c.execute.mock.calls.map(c=>c[0]).join(' ');expect(sql).toContain('user_tab_privs');expect(sql).toContain('role_tab_privs');expect(sql).toContain('session_roles');expect(sql).toContain('oracle_maintained');});
it('preflight probes bounded SELECTs and emits only missing grants',async()=>{const close=vi.fn();const query=vi.fn(async(sql:string)=>{expect(sql).toMatch(/^SELECT 1 FROM [A-Z0-9_$]+ WHERE ROWNUM = 0$/);if(sql.includes('DBA_USERS'))throw new Error('ORA-00942');return {} as any;});const result=await checkTarget({get:async()=>({target,identity:{isCdb:true},query,close}) as any,closeAll:async()=>{}} as any,'real-db');expect(result.grantsSql).toContain('GRANT SELECT ON SYS.DBA_USERS TO "READER";');expect(result.views.some(v=>v.status==='not-applicable')).toBe(true);expect(close).toHaveBeenCalledOnce();});
it('validates owner, regular-file status, size and writable bits', async()=>{
	const {validatePrivateTargetsStat}=await import('../../src/config/targets.js');
	const stat={isFile:()=>true,mode:0o644,uid:1000,size:100};
	expect(()=>validatePrivateTargetsStat(stat,1000)).not.toThrow();
	for(const patch of [{uid:2000},{isFile:()=>false},{size:131073},{mode:0o622}]) expect(()=>validatePrivateTargetsStat({...stat,...patch},1000)).toThrow();
});
it('init writes a commented private example without overwriting either file',async()=>{
	const {initializeHome}=await import('../../src/config/environment.js');
	const {readFileSync,statSync}=await import('node:fs');
	const f=fixture();expect(initializeHome(f.env)).toBe(true);
	const example=join(f.home,'targets.example.json');expect(readFileSync(example,'utf8')).toMatch(/^\/\//);expect(statSync(example).mode & 0o777).toBe(0o600);
	writeFileSync(example,'keep');expect(initializeHome(f.env)).toBe(false);expect(readFileSync(example,'utf8')).toBe('keep');
});
it('keeps packaged lab values pinned at connect time',async()=>{
	const {loadConfig}=await import('../../src/config/index.js');
	const {createSessionProvider}=await import('../../src/oracle/index.js');
	const config=loadConfig({});config.targets[0]!.host='other.example';
	await expect(createSessionProvider(config).get()).rejects.toThrow('Target endpoint is not approved');
});
it('does not fall back when the private default is a dangling symlink',()=>{
	const f=fixture();rmSync(f.file);symlinkSync(join(f.home,'absent'),f.file);expect(()=>loadTargets(f.env)).toThrow();
});
it('explicit source takes precedence over the home file',()=>{
	const f=fixture();const explicit=join(f.home,'other.json');writeFileSync(explicit,JSON.stringify({version:1,targets:[{...target,name:'explicit'}]}),{mode:0o600});expect(loadTargets({...f.env,PIAGENT_TARGETS_FILE:explicit})[0]!.name).toBe('explicit');
});
it('fails closed on missing identity or unknown privilege result',async()=>{
	for(const rows of [undefined,[],[[null]]]){const c={execute:vi.fn().mockResolvedValue({rows})};await expect(checkAccount(c,'READER',{})).rejects.toThrow();}
});
it('cleans up after an unexpected preflight probe error',async()=>{
	const close=vi.fn();await expect(checkTarget({get:async()=>({target,identity:{},query:async()=>{throw new Error('private details');},close})} as any,'real-db')).rejects.toThrow('Preflight probe failed:');expect(close).toHaveBeenCalledOnce();
});
it.each([
	['READER','FALSE'],['READER','FALSE',null,null,'DB'],['READER','FALSE',null,'unknown','DB'],['READER','FALSE',null,'0',null],
])('fails closed for incomplete container identity %j',async(...identity)=>{
	await expect(checkAccount(account(identity),'READER',{})).rejects.toThrow();
});
