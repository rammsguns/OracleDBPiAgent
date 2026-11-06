import { expect, it } from 'vitest';
import { deltas, sampleTop, SQL, validateSeconds } from '../../src/top/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import { FEATURE_VIEWS } from '../../src/preflight/views.js';
import type { OracleSession } from '../../src/contracts.js';
const runtime = () => { let time = 0; return { now: () => time, sleep: async (ms: number) => { time += ms; } }; };
function session(query: OracleSession['query']): OracleSession { return { target: { name: 'lab' }, identity: { isCdb: true, containerName: 'PDB1' }, query, close: async () => {} } as OracleSession; }
it('subtracts counters and keeps unknown baselines unknown', () => {
	expect(deltas([['same',10],['gone',20],['reset',30]], [['same',25],['new',80],['reset',2]], 1, 5)).toEqual([
		{ name:'same', delta:15, perSecond:3, state:'measured' }, { name:'gone', delta:null, perSecond:null, state:'aged-out' },
		{ name:'reset', delta:null, perSecond:null, state:'reset' }, { name:'new', delta:null, perSecond:null, state:'new' },
	]);
});
it.each([0,4,121,5.5,NaN,Infinity])('rejects invalid seconds %s', n => expect(() => validateSeconds(n)).toThrow());
it('uses one supplied session and Node sleep between ordered snapshots, labels PDB scope', async () => {
	const calls: string[] = []; let second = false;
	const s = session(async sql => { calls.push(sql); return { columns: [], rows: sql === SQL.sql ? [['abc',second ? 20 : 10,0,0,0,0]] : [], truncated: false, elapsedMs: 0 }; });
	let time = 0;
	const result = await sampleTop(s,5,{ now: () => time, sleep: async ms => { expect(calls).toEqual(Object.values(SQL)); second = true; time += ms + 100; } });
	expect(calls).toEqual([...Object.values(SQL), ...Object.values(SQL)]);
	expect(result.sql.rankings.elapsedUs[0]).toMatchObject({ delta:10, command:'piagent sql --target lab --sql-id abc' });
	expect(result.sql.intervalSeconds).toBe(5.1); expect(result.scope.load).toContain('CDB-wide'); expect(result.scope.sql).toContain('PDB');
});
it.each(['ORA-00942','ORA-01031','ORA-65040'])('degrades per view for %s', async code => {
	const result = await sampleTop(session(async sql => { if (sql !== SQL.sql) throw new Error(code); return { columns:[], rows:[], truncated:false, elapsedMs:0 }; }),5,runtime());
	expect(result.status).toBe('partial'); expect(result.sql.status).toBe('ok'); expect(result.host.status).toBe('unavailable'); expect(result.host.notes.join()).toContain(code);
});
it('propagates unexpected errors', async () => { await expect(sampleTop(session(async () => { throw new Error('connection lost'); }),5,runtime())).rejects.toThrow('connection lost'); });
it('marks row caps and calculates host CPU from busy plus idle deltas', async () => {
	let count = 0;
	const result = await sampleTop(session(async sql => { count++; return { columns:[], rows:sql === SQL.host ? [['BUSY_TIME',count > 3 ? 30 : 10],['IDLE_TIME', count > 3 ? 80 : 20],['LOAD',2]] : [], truncated:sql === SQL.sql, elapsedMs:0 }; }),5,runtime());
	expect(result.status).toBe('partial'); expect(result.sql.notes.join()).toContain('incomplete'); expect(result.host.cpuPercent).toBe(25); expect(result.host.gauges).toContainEqual({ name:'LOAD',value:2 });
});
it('catalogues and policy-checks every fixed top query', () => {
	for (const sql of Object.values(SQL)) { expect(() => classifySql(sql)).not.toThrow(); const view = /FROM (V\$\w+)/.exec(sql)![1]; expect(FEATURE_VIEWS.top).toContain(view); }
});
it.each(['SELECT * FROM V$ACTIVE_SESSION_HISTORY', 'SELECT * FROM DBA_HIST_SQLSTAT', 'SELECT DBMS_WORKLOAD_REPOSITORY.AWR_REPORT_TEXT(1,1,1,2) FROM dual', 'SELECT DBMS_LOCK.SLEEP(5) FROM dual', 'BEGIN DBMS_LOCK.SLEEP(5); END;', 'BEGIN DBMS_SCHEDULER.RUN_JOB(\'X\'); END;'])('keeps licensed and changing APIs refused: %s', sql => { expect(() => classifySql(sql)).toThrow(); });
it('pages SQL snapshots within one session when the normal row limit is reached', async () => {
	const calls: [string, unknown][] = [];
	const result = await sampleTop(session(async (sql, binds) => {
		calls.push([sql,binds]);
		return { columns:[], rows:sql === SQL.sql ? [['a',1,1,1,1,1]] : sql.startsWith(SQL.sql) ? [['b',1,1,1,1,1]] : [], truncated:sql === SQL.sql, elapsedMs:0 };
	}),5,runtime());
	expect(calls.filter(([sql]) => sql.includes('OFFSET'))).toEqual([[SQL.sql + ' OFFSET :topOffset ROWS', { topOffset:1 }], [SQL.sql + ' OFFSET :topOffset ROWS', { topOffset:1 }]]);
	expect(result.sql.rows.map(r => r.name)).toEqual(['a','b']); expect(result.sql.status).toBe('ok');
});
it.each([1,2,3,4,5])('counts a reset in metric column %s once per SQL_ID', async column => {
	const { renderTop } = await import('../../src/top/index.js');
	let second = false;
	const before = ['abc',10,10,10,10,10], after = ['abc',20,20,20,20,20]; after[column] = 1;
	const result = await sampleTop(session(async sql => ({ columns:[], rows:sql === SQL.sql ? [second ? after : before] : [], truncated:false, elapsedMs:0 })),5,
		{ now: () => second ? 5000 : 0, sleep: async () => { second = true; } });
	expect(renderTop(result)).toContain('reset: 1');
});
