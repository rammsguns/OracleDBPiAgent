import { afterEach, it, expect, vi } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer, type WebServerOptions } from '../../src/web/server.js';
import type { CheckRun } from '../../src/check/index.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.unstubAllEnvs(); });
function deferred() { let resolve!:()=>void; const promise=new Promise<void>(r=>resolve=r); return {promise,resolve}; }
async function fixture(runner?: WebServerOptions['runChecks'], aliases?: string[]) {
	const dir = await mkdtemp(join(tmpdir(), 'web-check-'));
	cleanup.push(() => rm(dir,{recursive:true,force:true})); vi.stubEnv('PIAGENT_HOME',dir);
	const config = {...loadConfig({}),auditFile:join(dir,'audit.jsonl')};
	if (aliases) { config.targets = aliases.map(name => ({...config.targets[0]!, name})); config.defaultTarget = aliases[0]!; }
	const closeAll = vi.fn(async()=>{}), get=vi.fn(async()=>{throw new Error('ORA-00942 password=never-print');});
	const web = createWebServer({config,port:0,token:'check-token',runChecks:runner,sessionFactory:async()=>({get,closeAll})});
	const url = new URL(await web.listen()); cleanup.push(web.close);
	const call = (query='') => fetch(`${url.origin}/api/check${query}`,{headers:{Authorization:'Bearer check-token'}});
	return {web,url,call,closeAll,get};
}
it('returns real-engine verdicts for one or all targets, redacts and closes once per request',async()=>{
	const f=await fixture();
	for (const query of ['?target=d1-19c-lab','?target=p1-19c-prod','?target=__all_targets__']) {
		const response=await f.call(query); expect(response.status).toBe(200);
		const text=await response.text(), run=JSON.parse(text).result as CheckRun;
		expect(run.status).toBe('UNKNOWN'); expect(run.targets).toHaveLength(query==='?target=__all_targets__'?3:1);
		expect(text).not.toContain('never-print'); expect(text).toContain('ORA-00942');
	}
	expect(f.closeAll).toHaveBeenCalledTimes(3);
});
it('enforces the Top response cap and releases resources and the shared lock on errors',async()=>{
	const runner=vi.fn(async (_ctx,targets)=>({version:1,capturedAt:'now',status:'OK',targets:targets.map((target:string)=>({target,status:'OK',checks:[],note:'x'.repeat(1024*1024)}))} as CheckRun));
	const f=await fixture(runner);
	expect((await f.call()).status).toBe(413); expect(f.closeAll).toHaveBeenCalledTimes(1);
	runner.mockRejectedValueOnce(new Error('password=hidden'));
	const failed=await f.call(); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain('hidden'); expect(f.closeAll).toHaveBeenCalledTimes(2);
	runner.mockResolvedValueOnce({version:1,capturedAt:'now',status:'OK',targets:[]});
	expect((await f.call()).status).toBe(200); expect(f.closeAll).toHaveBeenCalledTimes(3);
});
it('holds the shared insight lock until a cancelled native operation finishes',async()=>{
	const started=deferred(), release=deferred();
	const f=await fixture(async (_ctx,targets)=>{started.resolve();await release.promise;return {version:1,capturedAt:'now',status:'OK',targets:targets.map(target=>({target,status:'OK',checks:[]}))};});
	const req=request({hostname:f.url.hostname,port:f.url.port,path:'/api/check?target=__all_targets__',headers:{Authorization:'Bearer check-token'}});
	req.on('error',()=>{}); req.end(); await started.promise;
	try {
		expect((await f.call()).status).toBe(429);
		req.destroy(); await new Promise(r=>setTimeout(r,20));
		expect(f.closeAll).not.toHaveBeenCalled(); expect((await f.call()).status).toBe(429);
	} finally { release.resolve(); }
	await vi.waitFor(()=>expect(f.closeAll).toHaveBeenCalledTimes(1));
	expect((await f.call()).status).toBe(200);
});

it('uses only configured product aliases, including an alias named all', async () => {
	const runner=vi.fn(async (_ctx,targets)=>({version:1,capturedAt:'now',status:'OK',targets:targets.map((target:string)=>({target,status:'OK',checks:[]}))} as CheckRun));
	const f=await fixture(runner,['owner-lab','all']);
	for(const [query,targets] of [['?target=owner-lab',['owner-lab']],['?target=all',['all']],['?target=__all_targets__',['owner-lab','all']]] as const) {
		const response=await f.call(query); expect(response.status).toBe(200);
		expect((await response.json()).result.targets.map((t:{target:string})=>t.target)).toEqual(targets);
	}
	expect(f.get).not.toHaveBeenCalled();
	expect((await f.call('?target=d1-19c-lab')).status).toBe(400);
});
