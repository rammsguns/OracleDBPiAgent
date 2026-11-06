import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/contracts.js';
import { loadConfig } from '../../src/config/index.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { collectSessions, needsSessions, sessionHypotheses } from '../../src/triage/sessions.js';
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
it('triggers session keywords and unnamed slowness, with token boundaries', () => {
	for (const word of ['hang', 'hung', 'locked', 'blocked', 'blocking', 'waiting', 'enqueue', 'deadlock', 'stuck', 'slowness', 'slow']) expect(needsSessions(word)).toBe(true);
	for (const issue of ['clock failed', 'NIGHTLY_JOB failed', 'slow SQL_ID abcdfghjkmnpq']) expect(needsSessions(issue)).toBe(false);
	expect(needsSessions('blocked SQL_ID abcdfghjkmnpq')).toBe(true);
});
it('keeps nontriggered triage JSON and Markdown byte-identical to pre-WP snapshot', async () => {
	vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-06T00:00:00.000Z'));
	const { ctx, query } = setup();
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/triage-before-sessions.json', import.meta.url), 'utf8'));
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'NIGHTLY_JOB failed ORA-20001' });
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
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'blocked' });
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
	expect(sessionHypotheses((await collectSessions(ctx, 'd1-19c-lab')).activity)[0]?.title).toContain('User I/O (context)');
});
it('puts a deadlock ahead of idle blockers and other session context', async () => {
	const { ctx } = setup(true);
	const activity = (await collectSessions(ctx, 'd1-19c-lab')).activity!;
	activity.sections.blocking.rows[0]!.children[0]!.cycle = true;
	expect(sessionHypotheses(activity).map(h => h.title)).toEqual([expect.stringContaining('deadlock'), expect.stringContaining('Idle-in-transaction')]);
});
