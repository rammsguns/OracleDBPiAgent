import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
const fakes=vi.hoisted(()=>({closeAll:vi.fn(async()=>{}),run:vi.fn(),config:vi.fn(()=>({targets:[{name:'lab'},{name:'other'}],auditFile:'unused'}))}));
vi.mock('../../src/config/index.js',()=>({loadConfig:fakes.config}));
vi.mock('../../src/oracle/index.js',()=>({createSessionProvider:()=>({closeAll:fakes.closeAll})}));
vi.mock('../../src/audit/index.js',()=>({JsonlAuditSink:class {}}));
vi.mock('../../src/check/index.js',async original=>({...await original<typeof import('../../src/check/index.js')>(),runChecks:fakes.run}));
import { runCheck } from '../../src/check/cli.js';
afterEach(()=>{process.exitCode=0;vi.restoreAllMocks();vi.clearAllMocks();});
for(const [status,failOn,code] of [['OK',undefined,0],['WARN',undefined,1],['WARN','crit',0],['WARN','warn',1],['CRIT','crit',2],['UNKNOWN','crit',3]] as const) it(`CLI outputs ${status} and exit ${code}`,async()=>{
	const dir=mkdtempSync(join(tmpdir(),'check-cli-')), previous=process.env.PIAGENT_HOME;process.env.PIAGENT_HOME=dir;
	try {
		const log=vi.spyOn(console,'log').mockImplementation(()=>{});fakes.run.mockResolvedValue({version:1,capturedAt:'2026-11-07T00:00:00Z',status,targets:[]});
		await runCheck({allTargets:true,json:true,failOn,out:dir});expect(process.exitCode).toBe(code);expect(JSON.parse(String(log.mock.calls[0]![0])).status).toBe(status);expect(fakes.run.mock.calls[0]![1]).toEqual(['lab','other']);expect(fakes.closeAll).toHaveBeenCalledOnce();expect((await readFile(join(dir,'check.jsonl'),'utf8')).trim().split('\n')).toHaveLength(1);
	} finally{if(previous===undefined)delete process.env.PIAGENT_HOME;else process.env.PIAGENT_HOME=previous;rmSync(dir,{recursive:true,force:true});}
});
it('rejects unknown target without connecting',async()=>{await expect(runCheck({target:'missing'})).rejects.toThrow(/Unknown target missing; configured targets: lab, other/);expect(fakes.run).not.toHaveBeenCalled();});
it('closes provider when engine fails',async()=>{const dir=mkdtempSync(join(tmpdir(),'check-cli-')),previous=process.env.PIAGENT_HOME;process.env.PIAGENT_HOME=dir;try{fakes.run.mockRejectedValueOnce(new Error('failed'));await expect(runCheck({target:'lab'})).rejects.toThrow('failed');expect(fakes.closeAll).toHaveBeenCalledOnce();}finally{if(previous===undefined)delete process.env.PIAGENT_HOME;else process.env.PIAGENT_HOME=previous;rmSync(dir,{recursive:true,force:true});}});
