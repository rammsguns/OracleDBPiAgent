import { expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext, OracleSession } from '../../src/contracts.js';
import * as features from '../../src/triage/features.js';
import { needsBackup, needsJobs, needsTop, collectTop } from '../../src/triage/features.js';
import { triage } from '../../src/triage/index.js';
import { parseTopCommand, runChatTop } from '../../src/cli/chatTop.js';
import { generateReport } from '../../src/report/index.js';
import { buildReportTrends } from '../../src/report/trends.js';
import { compareTargets } from '../../src/drift/index.js';
const empty = { columns: [], rows: [], truncated: false, elapsedMs: 0 };
function context(query: OracleSession['query'] = async () => empty, pdb = false): ToolContext {
	const config = loadConfig({});
	return { config, runId: 'features', audit: { record: vi.fn(async () => {}) }, sessions: { get: async target => ({ target: config.targets.find(t => t.name === target)!, identity: { isCdb: pdb, containerName: pdb ? 'APP_PDB' : undefined }, query, close: vi.fn(async () => {}) } as OracleSession), closeAll: async () => {} } };
}
it.each(['can we recover', 'backup failed', 'RMAN-03009', 'ORA-19504', 'last successful backup', 'recoverability'])('routes backup evidence: %s', text => expect(needsBackup(text)).toBe(true));
it.each(['slow right now', 'slow now', 'slowness at the moment'])('routes one live sample: %s', text => expect(needsTop(text)).toBe(true));
it.each(['ORA-12012', 'the nightly job failed', 'failed scheduler job'])('routes jobs evidence: %s', text => expect(needsJobs(text)).toBe(true));
it.each(['how many orders are there?', 'explain SH.SALES', 'SQL was slow last week', 'ORA-02292', 'restore button CSS', 'backup_col value', 'job opportunities'])('does not route unrelated text: %s', async text => {
	expect(needsBackup(text)).toBe(false); expect(needsTop(text)).toBe(false); expect(needsJobs(text)).toBe(false);
	const r = (await triage(context(), { target: 'd1-19c-lab', issue: text })).issues[0]!;
	expect(r.backup).toBeUndefined(); expect(r.top).toBeUndefined(); expect(r.jobEvidence).toBeUndefined();
});
it('parses /top strictly and leaves ordinary turns alone', async () => {
	expect(parseTopCommand('/top')).toEqual({ seconds: 15 }); expect(parseTopCommand('/top --seconds 5')).toEqual({ seconds: 5 });
	for (const q of ['  /top --seconds 10', '/top --seconds 10  ', '\t /top --seconds 10 \n']) expect(parseTopCommand(q)).toEqual({ seconds: 10 });
	expect(parseTopCommand('  /top  ')).toEqual({ seconds: 15 });
	for (const q of ['/topical', '/topx', '  /topx  ', '', '   ', '\t\n', 'what is /top', 'hello']) expect(await runChatTop(context(), q)).toBeUndefined();
	for (const q of ['/top --seconds 4', '/top --seconds 121', '/top --seconds 5.5', '/top --seconds 1e2', '/top --target other', '/top extra']) expect(() => parseTopCommand(q)).toThrow();
});
it('cancels the live wait, closes its session and never takes a second snapshot', async () => {
	const query = vi.fn(async () => empty), ctx = context(query), controller = new AbortController();
	const result = collectTop(ctx, 'd1-19c-lab', 15, controller.signal);
	await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(3)); controller.abort();
	await expect(result).rejects.toMatchObject({ name: 'AbortError' }); expect(query).toHaveBeenCalledTimes(3);
	expect(vi.mocked(ctx.audit.record).mock.calls).toHaveLength(3);
});
it('samples once and passes the measured top SQL into SQL evidence', async () => {
	const sample = vi.spyOn(features, 'collectTop').mockResolvedValue({ requestedSeconds: 15, status: 'ok', note: 'Measured interval', sql: { notes: [], rankings: { elapsedUs: [{ name: 'abc1234567890' }] } }, load: { notes: [] }, host: { notes: [] } } as unknown as Awaited<ReturnType<typeof collectTop>>);
	try {
		const query = vi.fn<OracleSession['query']>(async () => empty);
		const r = (await triage(context(query), { target: 'd1-19c-lab', issue: 'slow right now' })).issues[0]!;
		expect(sample).toHaveBeenCalledTimes(1); expect(sample.mock.calls[0]?.slice(1, 3)).toEqual(['d1-19c-lab', 15]); expect(r.topSql).toHaveLength(1);
		expect(query.mock.calls.some(([sql, binds]) => sql.includes('V$SQL') && Object.values(binds ?? {}).includes('abc1234567890'))).toBe(true);
	} finally { sample.mockRestore(); }
});

it('backup/jobs are opt-in, preserve partial evidence and make trend gaps', async () => {
	const ctx = context();
	expect((await generateReport(ctx)).sections.some(s => ['backup', 'jobs'].includes(s.name))).toBe(false);
	const r = await generateReport(ctx, { sections: ['backup', 'jobs'] });
	expect(r.sections.map(s => s.name)).toEqual(['backup', 'jobs']);
	const history = { target: r.target, reports: [r, { ...r, generatedAt: new Date(Date.parse(r.generatedAt) + 3600000).toISOString() }], scanned: 2, skipped: 0, notes: [] };
	const trends = buildReportTrends(history);
	expect(trends.series.find(s => s.id === 'jobs:failed_runs_24h')?.last).toBe(0);
	expect(trends.series.find(s => s.id === 'backup:oldest_full_age_hours')?.last).toBeNull();
	const partial = await generateReport(context(async () => { throw new Error('ORA-65040'); }, true), { sections: ['backup', 'jobs'] });
	expect(partial.sections.every(s => s.status === 'unavailable')).toBe(true);
	expect(buildReportTrends({ ...history, reports: [partial] }).series.every(s => s.last === null)).toBe(true);
});
it('compares only backup configuration, withholds partial/PDB-empty comparisons', async () => {
	const seen: string[] = [];
	const ctx = context(async sql => { seen.push(sql); return { ...empty, rows: sql.includes('RMAN_CONFIGURATION') ? [['RETENTION POLICY', 'REDUNDANCY 1']] : [['LOG_MODE', 'ARCHIVELOG']] }; });
	const result = await compareTargets(ctx, { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'backup' });
	expect(result.complete).toBe(true); expect(result.hasDrift).toBe(false); expect(seen).toHaveLength(4);
	expect(seen.every(sql => /FROM V\$(RMAN_CONFIGURATION|DATABASE)\b/.test(sql))).toBe(true);
	const pdb = await compareTargets(context(undefined, true), { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'backup' });
	expect(pdb.complete).toBe(false); expect(pdb.sections[0]?.notes.join(' ')).toContain('CDB-wide (shared by all PDBs)');
});
it('links a named failed job to redacted errors and its stack object', async () => {
	const error = "ORA-20001: destination unavailable password='synthetic-sensitive-value'\nORA-06512: at \"APP.PKG\", line 3";
	const ctx = context(async sql => {
		if (sql.startsWith('WITH candidates')) return { ...empty, columns: ['CANDIDATE', 'KIND', 'OWNER', 'NAME'], rows: [[0, 'JOB', 'APP', 'NIGHTLY_JOB']] };
		if (sql.includes('SCHEDULER_JOBS') && sql.includes('JOB_TYPE')) return { ...empty, columns: ['OWNER', 'JOB_NAME', 'JOB_TYPE', 'JOB_ACTION'], rows: [['APP', 'NIGHTLY_JOB', 'STORED_PROCEDURE', 'APP.PKG.RUN']] };
		if (sql.includes('SCHEDULER_JOB_RUN_DETAILS') && sql.includes('LOG_DATE')) return { ...empty, columns: ['OWNER', 'JOB_NAME', 'STATUS', 'ADDITIONAL_INFO'], rows: [['APP', 'NIGHTLY_JOB', 'FAILED', error]] };
		if (sql.includes('SCHEDULER_JOB_RUN_DETAILS')) return { ...empty, columns: ['OWNER', 'JOB_NAME', 'STATUS', 'ERROR#', 'ACTUAL_START_DATE', 'ADDITIONAL_INFO'], rows: [['APP', 'NIGHTLY_JOB', 'FAILED', 20001, new Date().toISOString(), error]] };
		if (sql.includes('_SOURCE')) return { ...empty, columns: ['TYPE', 'LINE', 'TEXT'], rows: [['PACKAGE BODY', 1, 'PACKAGE BODY pkg IS'], ['PACKAGE BODY', 2, 'PROCEDURE run IS BEGIN'], ['PACKAGE BODY', 3, "raise_application_error(-20001, 'destination unavailable');"], ['PACKAGE BODY', 4, 'END; END;']] };
		return empty;
	});
	const issue = (await triage(ctx, { target: 'd1-19c-lab', issue: 'APP.NIGHTLY_JOB failed' })).issues[0]!;
	expect(issue.jobEvidence?.sections.lastErrors?.rows[0]?.ADDITIONAL_INFO).toContain('[REDACTED]');
	expect(issue.excerpts.some(e => e.object === 'APP.PKG' && e.line === 3)).toBe(true);
	expect(JSON.stringify(issue)).not.toContain('synthetic-sensitive-value');
});
it('does not collect jobs merely because a mentioned object has referencing jobs', async () => {
	const ctx = context(async sql => {
		if (sql.startsWith('WITH candidates')) return { ...empty, rows: [[0, 'OBJECT', 'SH', 'SALES']] };
		if (sql.includes('INSTR(UPPER(JOB_ACTION)')) return { ...empty, rows: [['SH', 'SALES_JOB', 'STORED_PROCEDURE', 'SH.SALES']] };
		return empty;
	});
	const r = (await triage(ctx, { target: 'd1-19c-lab', issue: 'describe SH.SALES' })).issues[0]!;
	expect(r.jobEvidence).toBeUndefined(); expect(r.backup).toBeUndefined(); expect(r.top).toBeUndefined();
});
