import { readFile, writeFile } from 'node:fs/promises';
import { commands, measure, ledgerText } from './footprint.js';
const refresh=process.argv.includes('--refresh');
const results=refresh?JSON.parse(await readFile('docs/footprint-results.json','utf8')).results:[];
for(const target of (process.argv.slice(2).filter(x=>x!=='--refresh').length ? process.argv.slice(2).filter(x=>x!=='--refresh') : ['c1-19c-pdb','d1-19c-lab','p1-19c-prod']))for(const name of (refresh?[...['top','explain_plan','top_sql','session_activity','wait_events','tablespace_usage'],'get_source:view','top_sql:cpu_time','top_sql:buffer_gets','top_sql:executions']:[...commands,'health_check','list_targets','db_overview','list_schemas','list_objects','describe_object','get_source','explain_plan','top_sql','session_activity','wait_events','tablespace_usage','get_source:view','top_sql:cpu_time','top_sql:buffer_gets','top_sql:executions'])){
 const r=await measure(target,name);const i=results.findIndex((x:any)=>x.target===target&&x.name===name);if(i<0)results.push(r);else results[i]=r;console.log(target,name,Math.round(r.elapsedMs),r.bufferGets,r.stats.length);
 await writeFile('docs/footprint-results.json',ledgerText({at:new Date().toISOString(),columns:['sql_id','executions','elapsed_us','cpu_us','buffer_gets','disk_reads','parse_calls','rows_processed','sql_preview'],results})+'\n');
}
