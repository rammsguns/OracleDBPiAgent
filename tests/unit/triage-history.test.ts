import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { collectRunHistory } from '../../src/triage/history.js';
import { TriageReader } from '../../src/triage/read.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function context(query: OracleSession['query']): ToolContext {
	return { config: loadConfig(), runId: 'triage-history', audit: { record: async () => {} }, sessions: { get: async () => ({ query, close: async () => {} } as OracleSession), closeAll: async () => {} } };
}
const empty = { rows: [], columns: [], truncated: false, elapsedMs: 0 };
const historical = ['K7Q_OWNER', 'K7Q_FAILJOB', 'FAILED', 20001, '2026-10-26T06:12:12.333Z', 'ORA-20001: destination unavailable\nORA-06512: at line 1', 1];
it('uses a single latest-five bound lookup for an older dropped job and scopes diagnostics to its historical owner', async () => {
	let latestCalls = 0;
	const diagnosticOwners: unknown[] = [];
	const ctx = context(async (sql, binds, options) => {
		classifySql(sql);
		if (sql.includes('AS OUTSIDE_WINDOW')) {
			latestCalls++; expect(binds).toEqual({ hours: 24, name: 'K7Q_FAILJOB' }); expect(options?.maxRows).toBe(5); expect(options?.timeoutSeconds).toBe(30);
			expect(sql).toContain('ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC'); expect(sql.split('WHERE')[1]).not.toContain('ACTUAL_START_DATE >=');
			return { ...empty, rows: [historical], columns: ['OWNER','JOB_NAME','STATUS','ERROR#','ACTUAL_START_DATE','ADDITIONAL_INFO','OUTSIDE_WINDOW'] };
		}
		if (/_ERRORS|_OBJECTS/.test(sql) && !sql.startsWith('WITH candidates')) diagnosticOwners.push(binds?.owner);
		return empty;
	});
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'K7Q_FAILJOB on the lab keeps failing, what is wrong?' });
	const issue = result.issues[0]!;
	expect(latestCalls).toBe(1); expect(issue.codes).toContain('ORA-20001'); expect(issue.since).toBe('24h');
	expect(issue.limitations.join(' ')).toContain('outside the requested window (last run 2026-10-26T06:12:12.333Z)');
	expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('outside the requested window');
	expect(diagnosticOwners).toEqual(['K7Q_OWNER', 'K7Q_OWNER']);
	expect(issue.checks.find(c => c.label.startsWith('Scheduler run history in window'))?.rows).toEqual([]);
	expect(renderTriageMarkdown(result)).toContain('ORA-20001');
});
it('does not look outside the window for a scope with recent runs; only fills missing scopes', async () => {
	let latest = 0;
	const ctx = context(async (sql, binds, options) => {
		classifySql(sql);
		if (sql.includes('AS OUTSIDE_WINDOW')) { latest++; expect(binds?.name).toBe('OLD_JOB'); expect(binds?.owner).toBe('OTHER'); expect(options?.maxRows).toBe(5); return { ...empty, rows: [['OTHER', 'OLD_JOB', 'FAILED', 20001, '2026-10-25', 'ORA-20001', 1]] }; }
		return { ...empty, rows: [['APP', 'RECENT_JOB', 'FAILED', 20001, '2026-11-04', 'ORA-20001']] };
	});
	const reader = new TriageReader(ctx, 'd1-19c-lab');
	const history = await collectRunHistory(reader, [{ owner: 'APP', name: 'RECENT_JOB' }, { owner: 'OTHER', name: 'OLD_JOB' }], 24, '24h');
	expect(latest).toBe(1); expect(history.rows).toHaveLength(2); expect(history.notes).toHaveLength(1);
});
it('does not mislabel a recent run omitted by a cap or appearing between queries as outside the window', async () => {
	const ctx = context(async sql => sql.includes('AS OUTSIDE_WINDOW') ? { ...empty, rows: [[...historical.slice(0, 6), 0]] } : empty);
	const result = await collectRunHistory(new TriageReader(ctx, 'd1-19c-lab'), [{ name: 'K7Q_FAILJOB' }], 24, '24h');
	expect(result.notes.join(' ')).not.toContain('outside the requested window'); expect(result.notes.join(' ')).toContain('latest runs after the empty or capped window search');
});
it('reports an empty search plainly with names, views, window, owner scope and actionable next steps, without empty bullets', async () => {
	const queries: { sql: string; binds: Record<string, unknown> | undefined }[] = [];
	const ctx = context(async (sql, binds) => { classifySql(sql); queries.push({ sql, binds }); return empty; });
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'job APP.MISSING_JOB keeps failing' });
	const issue = result.issues[0]!, markdown = renderTriageMarkdown(result);
	expect(issue.hypotheses[0]?.title).toMatch(/No recorded failure was found.*MISSING_JOB/);
	expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('DBA_SCHEDULER_JOB_RUN_DETAILS'); expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('requested 24h window');
	expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('Owner scope for compile errors and invalid objects: APP');
	expect(issue.suggestions.join(' ')).toMatch(/--since 30d[\s\S]*spelling[\s\S]*dropped[\s\S]*cannot see/);
	expect(markdown).toContain('Codes: none.'); expect(markdown).not.toContain('Codes: .'); expect(markdown).not.toContain('needs correlation'); expect(markdown).not.toMatch(/^\s*-\s*$/m);
	expect(queries.filter(q => q.sql.includes('AS OUTSIDE_WINDOW'))).toHaveLength(1);
	// Renderer also refuses empty evidence entries supplied by external callers.
	issue.hypotheses[0]!.evidence.push('', '  '); expect(renderTriageMarkdown(result)).not.toMatch(/^\s*-\s*$/m);
});
it('discovers an unqualified object in another owner and follows its jobs without default-schema diagnostics', async () => {
	const owners: unknown[] = [];
	const ctx = context(async (sql, binds) => {
		classifySql(sql);
		if (sql.startsWith('WITH candidates')) return { ...empty, rows: [[0, 'OBJECT', 'K7Q_OWNER', 'TASKS']] };
		if (sql.includes('_SCHEDULER_JOBS') && sql.includes('INSTR')) return { ...empty, rows: [['K7Q_OWNER', 'K7Q_FAILJOB', 'PLSQL_BLOCK', 'BEGIN K7Q_OWNER.TASKS.RUN; END;', 'TRUE', 'SCHEDULED']] };
		if (sql.includes('AS OUTSIDE_WINDOW') && binds?.name === 'K7Q_FAILJOB') return { ...empty, rows: [historical] };
		if (sql.includes('_ERRORS') || (sql.includes('_OBJECTS') && sql.includes("STATUS = 'INVALID'"))) owners.push(binds?.owner);
		return empty;
	});
	const result = await triage(ctx, { target: 'd1-19c-lab', issue: 'package TASKS keeps failing' });
	expect(result.issues[0]?.codes).toContain('ORA-20001'); expect(owners).toEqual(['K7Q_OWNER', 'K7Q_OWNER']);
});
it('shows failed view access as unavailable in an empty search instead of implying complete visibility', async () => {
	const result = await triage(context(async sql => { if (sql.includes('_SCHEDULER')) throw new Error('ORA-00942'); return empty; }), { target: 'd1-19c-lab', issue: 'MISSING_JOB' });
	const issue = result.issues[0]!;
	expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('ALL_SCHEDULER_JOB_RUN_DETAILS'); expect(issue.hypotheses[0]?.evidence.join(' ')).toContain('ORA-00942');
	expect(renderTriageMarkdown(result)).toContain('unavailable');
});
it('preserves an explicitly requested owner in both job discovery and history fallback', async () => {
	const ctx = context(async (sql, binds) => {
		classifySql(sql);
		if (sql.includes('_SCHEDULER_JOBS') && !sql.includes('INSTR')) { expect(sql).toContain('OWNER = :namedOwner0_0'); expect(binds?.namedOwner0_0).toBe('APP'); }
		if (sql.includes('AS OUTSIDE_WINDOW')) { expect(binds?.owner).toBe('APP'); expect(binds?.name).toBe('MISSING_JOB'); }
		return empty;
	});
	const issue = (await triage(ctx, { target: 'd1-19c-lab', issue: 'APP.MISSING_JOB' })).issues[0]!;
	expect(issue.checks.find(c => c.label.startsWith('Compile errors'))?.binds.owner).toBe('APP');
});
it('does not assume the default owner for an unresolved unqualified object with retained history', async () => {
	const ctx = context(async (sql, binds) => {
		classifySql(sql);
		if (sql.includes('AS OUTSIDE_WINDOW')) { expect(binds).not.toHaveProperty('owner'); return { ...empty, rows: [historical] }; }
		return empty;
	});
	const issue = (await triage(ctx, { target: 'd1-19c-lab', issue: 'object K7Q_FAILJOB fails' })).issues[0]!;
	expect(issue.codes).toContain('ORA-20001'); expect(issue.checks.find(c => c.label.startsWith('Compile errors'))?.binds.owner).toBe('K7Q_OWNER');
});

it('deduplicates searched views in first-seen order and names unknown candidates', async () => {
	const result = await triage(context(async () => empty), {
		target: 'd1-19c-lab', issue: 'NO_SUCH_JOB_X failed this morning',
	});
	const evidence = result.issues[0]!.hypotheses[0]!.evidence[0]!;
	expect(evidence).toBe('Searched DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_OBJECTS, DBA_ERRORS for NO_SUCH_JOB_X, in the requested 24h window and (for named jobs/objects) up to 5 latest runs without a time filter.');
});

it('keeps the no-recognizable-name wording when no name was recognized', async () => {
	const result = await triage(context(async () => empty), {
		target: 'd1-19c-lab', issue: 'failed',
	});
	const evidence = result.issues[0]!.hypotheses[0]!.evidence[0]!;
	expect(evidence).toContain('for no recognizable job name, in the requested 24h window');
	expect(evidence).toContain('Searched DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_ERRORS, DBA_OBJECTS for ');
});
