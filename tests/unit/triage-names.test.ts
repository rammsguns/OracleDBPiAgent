import { expect, it, vi } from 'vitest';
import { nameCandidates, lookupNames } from '../../src/triage/names.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { loadConfig } from '../../src/config/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { ToolContext } from '../../src/contracts.js';
import type { TriageReader } from '../../src/triage/read.js';

it('extracts unique normalized identifiers, skips prose, SQL and codes, and caps at twenty', () => {
	expect(nameCandidates('daily_load failed ORA-20001 PLS-00302 SELECT FROM JOB APP.task_1 DAILY_LOAD abc')).toEqual([
		{ name: 'DAILY_LOAD', reportMissing: true },
		{ name: 'APP.TASK_1', reportMissing: true },
		{ name: 'ABC', reportMissing: false },
	]);
	expect(nameCandidates(Array.from({ length: 40 }, (_, i) => `TASK_${i}`).join(' '))).toHaveLength(20);
	expect(nameCandidates('ab X$Y#3')).toEqual([{ name: 'X$Y#3', reportMissing: true }]);
});

it('uses one bound union lookup for all three sources with DBA and ALL alternatives', async () => {
	const query = vi.fn(async () => undefined);
	await lookupNames({ query } as unknown as TriageReader, nameCandidates('APP.daily_load NO_SUCH_JOB_X'));
	expect(query).toHaveBeenCalledTimes(1);
	const [, alternatives, binds, cap] = query.mock.calls[0]! as unknown as [string, { sql: string }[], Record<string, unknown>, number];
	expect(binds).toEqual({ owner0: 'APP', name0: 'DAILY_LOAD', owner1: null, name1: 'NO_SUCH_JOB_X' });
	expect(cap).toBe(200);
	for (const [i, prefix] of ['DBA', 'ALL'].entries()) {
		const sql = alternatives[i]!.sql;
		classifySql(sql);
		for (const view of ['SCHEDULER_JOBS', 'SCHEDULER_JOB_RUN_DETAILS', 'OBJECTS']) expect(sql).toContain(`${prefix}_${view}`);
		expect(sql).not.toContain('DAILY_LOAD');
	}
});

it.each([false, true])('finds lowercase object names and reports unknown identifiers (found=%s)', async found => {
	const ctx: ToolContext = {
		config: loadConfig(), runId: 'names', audit: { record: async () => {} },
		sessions: {
			get: async () => ({ close: async () => {}, query: async sql => {
				classifySql(sql);
				return { columns: [], rows: found && sql.startsWith('WITH candidates') ? [[0, 'OBJECT', 'HR', 'DAILY_LOAD']] : [], truncated: false, elapsedMs: 0 };
			} }),
			closeAll: async () => {},
		},
	};
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'daily_load failed; NO_SUCH_JOB_X failed' });
	const issue = result.issues[0]!;
	expect(issue.issue.objects.includes('HR.DAILY_LOAD')).toBe(found);
	expect(issue.limitations.some(s => s.startsWith('not found: DAILY_LOAD'))).toBe(!found);
	expect(renderTriageMarkdown(result)).toContain('not found: NO_SUCH_JOB_X - check spelling, owner visibility, or whether it was dropped');
	expect(issue.hypotheses[0]?.title).not.toContain('no job or object name was recognized');
});
