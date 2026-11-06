import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { buildBlockingTree, classifyWaits, readSessionActivity, renderSessionsMarkdown, validateSessionsOptions, SessionsUsageError, SECTION_IDS, type SessionRow } from '../../src/sessions/index.js';
import { SQL } from '../../src/sessions/sql.js';
import type { OracleSession } from '../../src/contracts.js';
import { securitySourceStrings } from './security-sql-scan.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
const row = (sid: number, blockerSid: number|null = null): SessionRow => ({ sid, blockerSid, finalBlockerSid: null, serial: 1, username: 'U', osuser: '', machine: '', program: '', type: 'USER', status: 'ACTIVE', sqlId: 'abc1234567890', event: 'enqueue', waitClass: 'Application', state: 'WAITING', secondsInWait: 90, lastCallSeconds: 90, logonTime: '', objectId: null });
const raw = (r: SessionRow) => [r.sid,r.serial,r.username,r.osuser,r.machine,r.program,r.type,r.status,r.sqlId,null,r.event,r.waitClass,r.state,r.secondsInWait,r.lastCallSeconds,r.logonTime,r.blockerSid,r.finalBlockerSid,r.objectId];
function fixture(data: Partial<Record<keyof typeof SQL, unknown[][]>> = {}, missing: string[] = [], truncated = false): OracleSession {
	return { target: { name: 'fixture' }, query: async (sql: string) => {
		const key = (Object.keys(SQL) as (keyof typeof SQL)[]).find(k => SQL[k] === sql)!;
		if (missing.includes(key)) throw new Error('ORA-00942');
		return { rows: data[key] ?? (key === 'self' ? [[999]] : []), columns: [], truncated, elapsedMs: 0 };
	} } as unknown as OracleSession;
}
it('handles no blocking, a chain of three, two roots and vanished blockers', () => {
	expect(buildBlockingTree([row(1)])).toEqual([]);
	const chain = buildBlockingTree([row(1),row(2,1),row(3,2)]);
	expect(chain[0]?.children[0]?.children[0]?.sid).toBe(3);
	expect(buildBlockingTree([row(1),row(2,1),row(3),row(4,3)]).map(n => n.sid)).toEqual([1,3]);
	expect(buildBlockingTree([row(2,1)])[0]).toMatchObject({ sid:1, vanished:true });
});
it('marks a deadlock cycle and caps depth at ten', () => {
	expect(buildBlockingTree([row(1,2),row(2,1)])[0]?.children[0]?.children[0]?.cycle).toBe(true);
	let n = buildBlockingTree(Array.from({ length: 15 }, (_,i) => row(i+1, i || null)))[0]!;
	for (let i = 0; i < 10; i++) n = n.children[0]!;
	expect(n.depthLimited).toBe(true); expect(n.children).toEqual([]);
});
it('uses final blocker when immediate blocker vanished', () => {
	expect(buildBlockingTree([{ ...row(2), finalBlockerSid: 1 }])[0]?.sid).toBe(1);
});
it('finds idle-in-transaction, long wait and transaction, and links SQL IDs', async () => {
	const b = { ...row(1), status: 'INACTIVE' };
	const a = await readSessionActivity(fixture({ active:[raw(b),raw(row(2,1))], transactions:[[1,'U',b.sqlId,'2026-11-05T00:00:00Z',601,2,4]] }));
	expect(a.findings.map(f => f.id)).toEqual(expect.arrayContaining(['idle-in-transaction-1','blocking-over-60-1','long-transaction-1']));
	for (const f of a.findings) expect(f.advice).toContain('piagent sql --target fixture --sql-id ' + b.sqlId);
	expect(a.sections.active.rows.map(r => r.sid)).toEqual([2]);
	expect(renderSessionsMarkdown(a)).toContain('not one consistent read');
});
it('finds cycles and tolerates vanished blockers', async () => {
	const a = await readSessionActivity(fixture({ active:[raw(row(1,2)),raw(row(2,1)),raw(row(4,3))] }));
	expect(a.findings.some(f => f.id.startsWith('deadlock-'))).toBe(true);
	expect(renderSessionsMarkdown(a)).toContain('vanished blocker');
});
for (const [id, missing] of [['active',['active']],['blocking',['chains','active']],['waits',['waits']],['timeModel',['timeModel']],['transactions',['transactions']]] as const) it('handles missing grant for ' + id, async () => {
	const a = await readSessionActivity(fixture({}, [...missing]), { sections:[id] });
	expect(a.sections[id].status).toBe('unavailable'); expect(a.status).toBe('failed');
});
it('falls back from wait chains and DBA_OBJECTS, preserving attempts', async () => {
	const a = await readSessionActivity(fixture({ active:[raw(row(1)),raw(row(2,1))], allObjects:[[42,'U','T']], locked:[[2,42,3]], locks:[[2,'TX',0,6]] }, ['chains','objects']));
	expect(a.status).toBe('ok');
	expect(a.sections.blocking.note).toContain('V$SESSION');
	expect(a.sections.blocking.rows[0]?.children[0]?.session).toMatchObject({ object:'U.T', lockType:'Transaction', lockMode:'Exclusive' });
});
it('uses wait chains first and returns partial with missing auxiliary grants', async () => {
	const a = await readSessionActivity(fixture({ active:[raw(row(1)),raw(row(2))], chains:[[2,1]] }, ['locks']));
	expect(a.sections.blocking.rows[0]?.children[0]?.sid).toBe(2); expect(a.status).toBe('partial');
});
it('classifies cumulative waits using all events and handles zero totals', async () => {
	const a = await readSessionActivity(fixture({ waits:[['A','User I/O',10,7000000],['B','User I/O',10,1000000],['C','CPU',10,2000000]] }), { topWaits:1 });
	expect(a.sections.waits.rows[0]).toMatchObject({ percent:80, seconds:8 });
	expect(a.sections.waits.rows[0]?.events[0]).toMatchObject({ percent:70, averageMs:700 });
	expect(a.findings[0]?.severity).toBe('info');
	expect(classifyWaits([{ event:'x',waitClass:'Idle',seconds:1,totalWaits:1,percent:0,averageMs:1 }])).toEqual([]);
	expect(classifyWaits([{ event:'x',waitClass:'Other',seconds:0,totalWaits:0,percent:0,averageMs:0 }])[0]?.percent).toBe(0);
});
it('validates before SQL and skips unrequested sections', async () => {
	for (const o of [{ sections:[] },{ sections:['x'] },{ topWaits:0 },{ topWaits:51 },{ topWaits:1.2 },{ minTxSeconds:-1 },{ minTxSeconds:86401 },{ minTxSeconds:NaN }]) expect(() => validateSessionsOptions(o)).toThrow(SessionsUsageError);
	const a = await readSessionActivity(fixture(), { sections:['waits'] });
	expect(a.sections.active.status).toBe('skipped'); expect(a.status).toBe('ok');
	expect((await readSessionActivity(fixture({}, [], true))).status).toBe('partial');
});
it('returns failed only when every selected section is unavailable', async () => {
	const a = await readSessionActivity(fixture({}, ['active','chains','locks','locked','objects','allObjects','waits','timeModel','transactions']));
	expect(a.status).toBe('failed'); expect(SECTION_IDS.every(id => a.sections[id].status === 'unavailable')).toBe(true);
});
/** TypeScript parser reconstructs literals, templates and concatenations without evaluating source. */
const forbidden = (s: string) => /\b(?:G?V_?\$ACTIVE_SESSION_HISTORY|AWR\w*|DBA_HIST_\w*|MODULE|ACTION|CLIENT_INFO|CLIENT_IDENTIFIER|P1TEXT|SQL_TEXT|SQL_FULLTEXT|VALUE_STRING)\b/i.test(s.replace(/"/g,''));
it('parser scans every sessions source string and enforces SELECT-only catalog', () => {
	for (const name of readdirSync('src/sessions').filter(n => n.endsWith('.ts'))) {
		const strings = securitySourceStrings(readFileSync('src/sessions/' + name,'utf8'),name);
		for (const s of strings) expect(forbidden(s),s).toBe(false);
		for (const s of strings.filter(s => /^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|DECLARE|CALL|MERGE)\b/i.test(s))) expect(() => classifySql(s)).not.toThrow();
	}
	for (const sql of Object.values(SQL)) { expect(sql).toMatch(/^SELECT /); expect(() => classifySql(sql)).not.toThrow(); expect(sql).not.toMatch(/SELECT\s+\*/i); }
});
it.each(['SELECT MODULE FROM V$SESSION','SELECT "CLIENT_IDENTIFIER" FROM V$SESSION','SELECT * FROM V$ACTIVE_SESSION_HISTORY','SELECT * FROM DBA_HIST_SQLSTAT','SELECT VALUE_STRING FROM V$SQL_BIND_CAPTURE','SELECT AWR_REPORT FROM DUAL'])('rejects forbidden SQL %s', sql => expect(forbidden(sql)).toBe(true));
it.each(['DELETE FROM T','BEGIN NULL; END;','ALTER SYSTEM KILL SESSION \'1,1\''])('rejects non-SELECT %s', sql => expect(() => classifySql(sql)).toThrow());
it('pages waits under the session cap before computing percentages and applies one global top N', async () => {
	const calls: string[] = [];
	const s = fixture();
	s.query = async (sql, binds) => {
		calls.push(sql);
		if (sql === SQL.self) return { rows:[[999]], columns:['SID'], truncated:false, elapsedMs:0 };
		expect(sql).toContain('V$SYSTEM_EVENT');
		const page = binds?.sessionsOffset === 1;
		return { rows:page ? [['B','Other',2,2000000]] : [['A','User I/O',1,1000000]], columns:['EVENT'], truncated:!page, elapsedMs:0 };
	};
	const a = await readSessionActivity(s, { sections:['waits'], topWaits:1 });
	expect(a.status).toBe('ok'); expect(calls).toHaveLength(3);
	expect(a.sections.waits.rows[0]?.percent).toBeCloseTo(66.666);
	expect(a.sections.waits.rows.flatMap(g => g.events).map(e => e.event)).toEqual(['B']);
});
it('handles ORA-01031 and propagates unexpected query failures', async () => {
	const s = fixture(); s.query = async sql => { if (sql === SQL.self) return { rows:[[1]],columns:[],truncated:false,elapsedMs:0 }; throw new Error('ORA-01031'); };
	expect((await readSessionActivity(s, { sections:['transactions'] })).status).toBe('failed');
	s.query = async () => { throw new Error('ORA-03113'); };
	await expect(readSessionActivity(s)).rejects.toThrow('ORA-03113');
});
it('escapes dictionary and session strings in markdown', async () => {
	const a = await readSessionActivity(fixture({ active:[raw({ ...row(1), username:'<script>|user' })] }));
	const md = renderSessionsMarkdown(a); expect(md).toContain('&lt;script&gt;&#124;user'); expect(md).not.toContain('<script>');
});
it('preserves the final root across a vanished intermediate blocker', async () => {
	const waiter = { ...row(3,2), finalBlockerSid:1 };
	const tree = buildBlockingTree([row(1),waiter]);
	expect(tree).toHaveLength(1); expect(tree[0]?.sid).toBe(1);
	expect(tree[0]?.children[0]).toMatchObject({ sid:2, vanished:true });
	expect(tree[0]?.children[0]?.children[0]?.sid).toBe(3);
	const a = await readSessionActivity(fixture({ active:[raw({ ...row(1),status:'INACTIVE' }),raw(waiter)] }));
	expect(a.findings.some(f => f.id === 'idle-in-transaction-1')).toBe(true);
});
