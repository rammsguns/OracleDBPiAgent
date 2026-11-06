import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { loadConfig } from '../../src/config/index.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { collectSessions, needsSessions, sessionHypotheses, sessionWaitContext } from '../../src/triage/sessions.js';
import { SQL } from '../../src/sessions/sql.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
afterEach(() => vi.useRealTimers());
function setup(blocking = false, fail = '') {
	const query = vi.fn(async (sql: string) => {
		classifySql(sql);
		if (fail && sql.includes(fail)) throw Error('ORA-00942 private driver details');
		let rows: unknown[][] = [];
		if (sql === SQL.self) rows = [[999]];
		if (sql === SQL.waits) rows = [['db file sequential read', 'User I/O', 10, 10000000]];
		if (blocking && sql === SQL.active) rows = [1, 2, 3, 4].map(sid => [sid, 1, 'APP', '', '', '', 'USER', sid === 1 ? 'INACTIVE' : 'ACTIVE', ['abcdfghjkmnpq', 'bcdfghjkmnpqr', 'cdfghjkmnpqrs', 'dfghjkmnpqrst'][sid - 1], null, 'enq: TX', 'Application', 'WAITING', 90, 100, '', sid === 1 ? null : sid - 1, sid === 1 ? null : 1, null]);
		return { columns: ['N'], rows, truncated: false, elapsedMs: 0 };
	});
	const close = vi.fn(async () => {}), get = vi.fn(async () => ({ target: { name: 'd1-19c-lab' }, query, close }));
	const ctx = { config: loadConfig({}), sessions: { get }, audit: { record: vi.fn(async () => {}) }, runId: 'sessions-unit' } as unknown as ToolContext;
	return { ctx, query, close, get };
}
it.each([
	'row lock', 'table is locked', 'lock wait', 'blocked session',
	'session 42 is blocked', 'query is blocked', 'blocked update', 'requests are blocked',
	'transaction locks a row', 'blocking queries', 'enq: TX - row lock contention',
	'TX enqueue contention', 'TM lock contention', 'deadlock detected', 'process hanging',
	'database hung', 'query is waiting', 'request stuck', 'slow execution', 'slowness',
	'query blocked while account is active', 'session is blocked after login',
	'takes long', 'blocked SQL_ID abcdfghjkmnpq query',
])('collects session evidence for %s', issue => {
	expect(needsSessions(issue)).toBe(true);
});
it.each([
	'locked account', 'account is locked', 'account locked', 'ORA-28000',
	'User SCOTT locked account ORA-28000', 'blocked user login', 'login blocked',
	'user blocked', 'user is blocked', 'password locked', 'password lock',
	'password expired', 'password expiry', 'expired password', 'password lockout',
	'account locked; user waiting', 'ORA-28000: login stuck', 'blocked authentication',
	'account SCOTT is locked', 'password has expired', 'account will be locked', 'clock failed', 'NIGHTLY_JOB failed ORA-20001',
	'slow SQL_ID abcdfghjkmnpq', 'lock', 'locked', 'blocked', 'blocking',
])('does not collect session evidence for %s', issue => {
	expect(needsSessions(issue)).toBe(false);
});
it('keeps session-unrelated evidence byte-identical apart from the new jobs evidence', async () => {
	vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T00:00:00.000Z'));
	const { ctx, query } = setup();
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/triage-before-sessions.json', import.meta.url), 'utf8'));
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'NIGHTLY_JOB failed ORA-20001' });
	expect(result.issues[0]?.jobEvidence).toBeDefined();
	Reflect.deleteProperty(result.issues[0]!, 'jobEvidence');
	result.issues[0]!.checks = result.issues[0]!.checks.filter(c => !c.label.startsWith('Jobs '));
	expect(JSON.stringify(result)).toBe(JSON.stringify(baseline.result));
	expect(renderTriageMarkdown(result)).toBe(baseline.markdown);
	expect(query.mock.calls.some(([sql]) => sql === SQL.self)).toBe(false);
});
it('reuses one session, ranks idle blockers first and caps SQL IDs at two', async () => {
	const { ctx, get, close } = setup(true);
	const evidence = await collectSessions(ctx, 'd1-19c-lab');
	expect(evidence.sqlIds).toEqual(['abcdfghjkmnpq', 'bcdfghjkmnpqr']);
	expect(sessionHypotheses(evidence.activity)[0]?.title).toContain('Idle-in-transaction blocker SID 1 (APP)');
	expect(get).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
	expect(ctx.audit.record).toHaveBeenCalledTimes(evidence.checks.length);
});
it('wires blocker SQL through existing evidence and renders the snapshot', async () => {
	const { ctx } = setup(true);
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'requests are blocked' });
	expect(result.issues[0]?.blockerSql).toHaveLength(2);
	expect(result.issues[0]?.hypotheses[0]?.title).toContain('Idle-in-transaction');
	expect(renderTriageMarkdown(result)).toContain('Blocking tree');
});
it('retains missing grants and sanitizes acquisition failures', async () => {
	const { ctx } = setup(false, 'V$SYSTEM_EVENT');
	const evidence = await collectSessions(ctx, 'd1-19c-lab');
	expect(evidence.activity?.sections.waits.status).toBe('unavailable');
	expect(JSON.stringify(evidence)).not.toContain('private');
	ctx.sessions.get = async () => { throw Error('private connection'); };
	expect((await collectSessions(ctx, 'd1-19c-lab')).status).toBe('unavailable');
});
it('uses cumulative wait context when there is no blocking', async () => {
	const { ctx } = setup();
	const activity = (await collectSessions(ctx, 'd1-19c-lab')).activity;
	expect(sessionHypotheses(activity)).toEqual([]);
	expect(sessionWaitContext(activity)[0]?.title).toContain('User I/O (context)');
});
it('puts a deadlock ahead of idle blockers and other session context', async () => {
	const { ctx } = setup(true);
	const activity = (await collectSessions(ctx, 'd1-19c-lab')).activity!;
	activity.sections.blocking.rows[0]!.children[0]!.cycle = true;
	expect(sessionHypotheses(activity).map(h => h.title)).toEqual([expect.stringContaining('deadlock'), expect.stringContaining('Idle-in-transaction')]);
});

it.each(['ORA-28000: account is locked and user waiting', 'ORA-28000 blocked user login', 'ORA-28000: login stuck'])('keeps authentication evidence first without session queries: %s', async issue => {
	const { ctx, query } = setup();
	const result = (await triage(ctx, { target: 'd1-19c-lab', issue })).issues[0]!;
	expect(result.hypotheses[0]?.evidence).toContain('ORA-28000');
	expect(result.hypotheses[0]?.rank).toBe(1);
	expect(result.sessions).toBeUndefined();
	expect(query.mock.calls.some(([sql]) => sql === SQL.self)).toBe(false);
});
it('ranks wait context after every error-derived cause when session evidence is triggered', async () => {
	const { ctx, query } = setup();
	const read = query.getMockImplementation()!;
	query.mockImplementation(async sql => {
		const result = await read(sql);
		if (sql.includes('FROM DBA_ERRORS')) result.rows = [['SH', 'BROKEN_PROC', 'PROCEDURE', 1, 1, 'PLS-00201: identifier must be declared']];
		return result;
	});
	const result = (await triage(ctx, { target: 'd1-19c-lab', issue: 'query is waiting ORA-20001' })).issues[0]!;
	expect(result.sessions?.activity).toBeDefined();
	expect(result.hypotheses[0]?.title).toContain('invalid or uncompilable');
	expect(result.hypotheses.at(-1)?.title).toContain('Dominant non-idle wait class');
	expect(result.hypotheses.at(-1)?.rank).toBeGreaterThan(1);
});
it('ranks an actual blocking chain ahead of error evidence', async () => {
	const { ctx, query } = setup(true);
	const read = query.getMockImplementation()!;
	query.mockImplementation(async sql => {
		const result = await read(sql);
		if (sql === SQL.active) result.rows.forEach(row => { row[7] = 'ACTIVE'; });
		return result;
	});
	const result = (await triage(ctx, { target: 'd1-19c-lab', issue: 'query is blocked ORA-02292' })).issues[0]!;
	expect(result.hypotheses[0]).toMatchObject({ rank: 1, title: 'A live blocking chain is a likely cause.' });
	expect(result.hypotheses.slice(1).some(h => h.evidence.includes('ORA-02292'))).toBe(true);
});

it('nests session evidence without duplicate titles or unrequested sections', async () => {
	const { ctx } = setup();
	const md = renderTriageMarkdown(await triage(ctx, { target: 'd1-19c-lab', issue: 'sessions are blocked waiting on a row lock' }));
	expect(md.match(/^# /gm)).toHaveLength(1);
	expect(md).not.toContain('# Sessions —');
	expect(md).toContain('#### Blocking tree');
	expect(md).toContain('#### Waits since');
	expect(md).not.toContain('## Active sessions');
	expect(md).not.toContain('## Time model');
	expect(md).not.toContain('Status: skipped');
});
