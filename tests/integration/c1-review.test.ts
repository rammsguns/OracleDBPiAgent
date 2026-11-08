import {expect,it} from 'vitest';
import {loadConfig} from '../../src/config/index.js';
import {createSessionProvider} from '../../src/oracle/index.js';
import {readAlertLog,readIncidents,renderAlertLogMarkdown} from '../../src/alertlog/index.js';

it('C1: server text decoding preserves New York spring-forward gap, types, CTEs and duplicate names',async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset; C1 unavailable');return;}
	const previous=process.env.TZ;process.env.TZ='America/New_York';
	const sessions=createSessionProvider(loadConfig());
	try {
		let s;
		try{s=await sessions.get('c1-19c-pdb');}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(e))){test.skip('C1 unavailable');return;}throw e;}
		const r=await s.query("WITH t AS (SELECT TO_DATE('2026-03-08 02:30:00','YYYY-MM-DD HH24:MI:SS') d, TIMESTAMP '2026-03-08 02:30:00.123456789' t FROM dual) SELECT d X,t X,CAST(NULL AS DATE) N,42 V FROM t");
		expect(r.columns).toEqual(['X','X_1','N','V']);
		expect(r.columnTypes).toEqual(['DATE','TIMESTAMP','DATE','NUMBER']);
		expect(r.rows).toEqual([[new Date('2026-03-08T02:30:00Z'),new Date('2026-03-08T02:30:00.123Z'),null,42]]);
	}finally{await sessions.closeAll();if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
},30000);

it('C1: current PDB includes existing CDB-wide/instance alert evidence with explicit labels',async test=>{
	if(!process.env.PIAGENT_SECRET_DIR){test.skip('PIAGENT_SECRET_DIR unset; C1 unavailable');return;}
	const config=loadConfig(),sessions=createSessionProvider(config);
	try{
		let s;
		try{s=await sessions.get('c1-19c-pdb');}catch(e){if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(e))){test.skip('C1 unavailable');return;}throw e;}

		const ctx={config,sessions,audit:{record:async()=>{}},runId:'c1-review'};
		const r=await readAlertLog(ctx,'c1-19c-pdb',{since:'24h',level:'all',text:'ORA-',limit:config.limits.maxRows});
		const expected=await s.query("SELECT CON_ID,COUNT(*) FROM V$DIAG_ALERT_EXT WHERE ORIGINATING_TIMESTAMP >= TO_TIMESTAMP_TZ(:fromTime,'YYYY-MM-DD\"T\"HH24:MI:SS.FF3TZH:TZM') AND ORIGINATING_TIMESTAMP < TO_TIMESTAMP_TZ(:toTime,'YYYY-MM-DD\"T\"HH24:MI:SS.FF3TZH:TZM') AND INSTR(UPPER(MESSAGE_TEXT),'ORA-')>0 AND CON_ID IN (0,1,3) GROUP BY CON_ID",{fromTime:r.window.from.replace('Z','+00:00'),toTime:r.window.to.replace('Z','+00:00')});
		expect(r.truncated).toBe(false);
		for(const [id,count] of expected.rows)expect(r.rows.filter(row=>row.containerId===Number(id)).reduce((n,row)=>n+row.count,0)).toBe(Number(count));
		expect(r.rows.every(row=>[0,1,3].includes(row.containerId!))).toBe(true);
		expect(r.sql).toContain('OR CON_ID IN (0,1)');
		expect(r.note).toContain('Oracle may hide CDB-wide/instance rows');
		expect(renderAlertLogMarkdown(r)).toContain('CDB-wide/instance');

		const incidents=await readIncidents(ctx,'c1-19c-pdb',{since:'24h',limit:100});
		expect(incidents.sql).toContain('i.CON_ID IN (0,1)');
		expect(incidents.note).toContain('CDB-wide/instance');
		expect(incidents.rows.every(row=>[0,1,3].includes(row.containerId!))).toBe(true);
	}finally{await sessions.closeAll();}
},60000);
