import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { withOracleAction } from '../../src/oracle/observability.js';
import { runChecks } from '../../src/check/index.js';
import { readBackup } from '../../src/backup/index.js';
import { readJobs } from '../../src/jobs/index.js';
import { sampleTop } from '../../src/top/index.js';
import { readSpaceUsage } from '../../src/space/index.js';
import { readSessionActivity } from '../../src/sessions/index.js';
import { readSecurityPosture } from '../../src/security/index.js';
import { readAlertLog, readIncidents } from '../../src/alertlog/index.js';
import { compareTargets } from '../../src/drift/index.js';
import { sectionNames } from '../../src/report/arguments.js';
import { generateReport } from '../../src/report/index.js';
import { checkTarget } from '../../src/preflight/index.js';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';

export const config = () => loadConfig({...process.env, PIAGENT_TARGETS_FILE: new URL('../../config/targets.json', import.meta.url).pathname});
export const commands = ['check','backup','jobs','top','space','sessions','security','alertlog','drift','report','targets check'] as const;
export const budgets: Record<string,{elapsedMs:number;bufferGets:number}> = {
	check:{elapsedMs:20000,bufferGets:200000}, backup:{elapsedMs:10000,bufferGets:15000},
	jobs:{elapsedMs:15000,bufferGets:75000}, top:{elapsedMs:30000,bufferGets:15000},
	space:{elapsedMs:15000,bufferGets:150000}, sessions:{elapsedMs:10000,bufferGets:100000},
	security:{elapsedMs:15000,bufferGets:150000}, alertlog:{elapsedMs:10000,bufferGets:20000},
	drift:{elapsedMs:90000,bufferGets:1000000}, report:{elapsedMs:45000,bufferGets:350000},
	'targets check':{elapsedMs:30000,bufferGets:25000},
};
export async function measure(target: string, name: string) {
	const cfg=config(), tag='fp_'+randomBytes(8).toString('hex');
	const statements: {sql:string;elapsedMs:number;error?:string}[]=[];
	const sessions=createSessionProvider(cfg,undefined,{tag,statement:(sql,elapsedMs,error)=>statements.push({sql,elapsedMs,...(error?{error}:{})})});
	const ctx:ToolContext={config:cfg,sessions,audit:{record:async()=>{}},runId:tag};
	const owner=cfg.targets.find(t=>t.name===target)!.defaultSchema;
	const one=async(work:(s:OracleSession)=>Promise<unknown>)=>{const s=await sessions.get(target);try{return await work(s);}finally{await s.close();}};
	const started=performance.now();
	try {
		await withOracleAction(name,async()=>{
			switch(name){
				case 'check': return runChecks(ctx,[target]);
				case 'backup': return one(s=>readBackup(s));
				case 'jobs': return readJobs(ctx,target);
				case 'top': return one(s=>sampleTop(s,5));
				case 'space': return one(s=>readSpaceUsage(s));
				case 'sessions': return one(s=>readSessionActivity(s));
				case 'security': return one(s=>readSecurityPosture(s));
				case 'alertlog': await readAlertLog(ctx,target); return readIncidents(ctx,target);
				case 'drift': {
					for(const scope of ['parameters',`schema:${owner}`,`objects:${owner}`,'security','space','backup']) await compareTargets(ctx,{left:target,right:target,scope});
					return;
				}
				case 'report': return generateReport(ctx,{target,sections:sectionNames});
				case 'targets check': return checkTarget(sessions,target);
				default: {
					const tool=createDbTools(ctx).find(t=>t.name===name)!;
					const args:Record<string,unknown>={target};
					if(name==='list_objects')args.schema=owner;
					if(name==='describe_object')args.name=owner==='SH'?'SALES':'ORDERS';
					if(name==='get_source') {args.name=target==='c1-19c-pdb'?'CURSOR_CHURN':'NONEXISTENT';args.schema=target==='c1-19c-pdb'?'BULKAPP':owner;args.type='PROCEDURE';}
					if(name==='explain_plan') {const s=await sessions.get(target);try{const r=await s.query('SELECT sql_id FROM v$sql WHERE plan_hash_value<>0 AND ROWNUM=1');args.sql_id=String(r.rows[0]?.[0]);}finally{await s.close();}}
					return tool.execute(tag,args);
				}
			}
		});
	}finally{await sessions.closeAll();}
	const elapsedMs=performance.now()-started;
	// Snapshot after sessions close, excluding the observer. Tags isolate cumulative stats
	// without requiring resets, flushing the pool, or SYS on non-CDB targets.
	const columns='sql_id,SUM(executions),SUM(elapsed_time),SUM(cpu_time),SUM(buffer_gets),SUM(disk_reads),SUM(parse_calls),SUM(rows_processed),MAX(SUBSTR(sql_text,1,700))';
	let rows:unknown[][];
	if(target==='c1-19c-pdb'){
		const sql=`set pages 0 feedback off heading off lines 32767 trimspool on\nalter session set container=PIPDB1;\nselect json_array(sql_id,sum(executions),sum(elapsed_time),sum(cpu_time),sum(buffer_gets),sum(disk_reads),sum(parse_calls),sum(rows_processed),max(substr(sql_text,1,700)) returning varchar2(4000)) from v$sql where sql_text like '/* ${tag} */%' group by sql_id;\nexit\n`;
		const output=execFileSync('docker',['exec','-i','oracle19c-cdb','bash','-lc','export ORACLE_SID=CDB19; sqlplus -s / as sysdba'],{input:sql,encoding:'utf8',maxBuffer:16*1024*1024}).split('\n').filter(l=>!l.includes('ORACLE_PWD'));
		if(output.some(l=>/ORA-|SP2-/.test(l)))throw new Error('SYS footprint snapshot failed');
		rows=output.filter(l=>l.trim().startsWith('[')).map(l=>JSON.parse(l));
	}else{
		const observer=createSessionProvider(cfg);try{const s=await observer.get(target);const r=await s.query(`SELECT ${columns} FROM v$sql WHERE sql_text LIKE :tag GROUP BY sql_id`,{tag:`/* ${tag} */%`},{maxRows:cfg.limits.maxRows});if(r.truncated)throw new Error('Footprint snapshot truncated');rows=r.rows;}finally{await observer.closeAll();}
	}
	return {target,name,elapsedMs,bufferGets:rows.reduce((n,r)=>n+Number(r[4]),0),stats:rows,statements};
}
