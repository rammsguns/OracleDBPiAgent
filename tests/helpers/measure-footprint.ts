import { writeFile } from 'node:fs/promises';
import { commands, measure } from './footprint.js';
const results=[];
for(const target of ['c1-19c-pdb','d1-19c-lab','p1-19c-prod'])for(const name of [...commands,'health_check','list_targets','db_overview','list_schemas','list_objects','describe_object','get_source','explain_plan','top_sql','session_activity','wait_events','tablespace_usage']){
 const r=await measure(target,name);results.push(r);console.log(target,name,Math.round(r.elapsedMs),r.bufferGets,r.stats.length);
 await writeFile('docs/footprint-results.json',JSON.stringify({at:new Date().toISOString(),columns:['sql_id','executions','elapsed_us','cpu_us','buffer_gets','disk_reads','parse_calls','rows_processed','sql_preview'],results},null,2)+'\n');
}
