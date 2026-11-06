import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext } from '../../src/contracts.js';
import { jobQueries, readJobs, renderJobs, safeJobText } from '../../src/jobs/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import { FEATURE_VIEWS } from '../../src/preflight/views.js';
function fixture(code?: string) {
	const query = vi.fn(async (sql: string) => {
		if (code && sql.includes('FROM DBA_SCHEDULER_WINDOWS')) throw new Error(code);
		return { columns: ['ADDITIONAL_INFO'], rows: [["password='private-value' " + '界'.repeat(1200)]], truncated: true, elapsedMs: 1 };
	});
	const close = vi.fn(async () => {}), get = vi.fn(async () => ({ query, close, identity: { isCdb: true, containerName: 'APPPDB' } }));
	const record = vi.fn(async () => {});
	return { ctx: { config: loadConfig(), sessions: { get }, audit: { record }, runId: 'jobs-test' } as unknown as ToolContext, query, close, get, record };
}
describe('jobs read-only evidence', () => {
	it.each([
		'Authorization: Bearer hidden-value', 'authorization: Basic hidden-value',
		'Bearer hidden-value', 'pass=hidden-value', 'SECRET_KEY: "hidden-value"',
		'credentials = hidden-value', '{"clientSecret": "hidden-value"}', 'PASSWORD_SUFFIX=hidden-value', 'prefixPASSWDsuffix: hidden-value',
		'appPWDextra=hidden-value', 'appPASSextra=hidden-value', 'mySECRETstuff=hidden-value',
		'appTOKENextra=hidden-value', 'monKEY: hidden-value', 'myCREDENTIALSextra=hidden-value',
		'https://hidden-value@example.test/path', '//hidden-value@example.test/path',
		'https://user:hidden-value@example.test/path', 'user/hidden-value@service',
		"myKEY = 'hidden-value' || 'hidden-other'", "myKEY = q'[hidden-value]'",
		"myKEY = 'hidden-value\ncontinued'", 'Authorization:\nBearer hidden-value',
	])('redacts application credential pattern %s', value => {
		const safe = safeJobText(value); expect(safe.text).not.toContain('hidden-value');
		expect(safe.text).not.toContain('hidden-other'); expect(safe.text).toContain('REDACTED');
	});
	it('preserves application business text rather than promising anonymization', () => {
		const text = 'ORA-20001 Customer SSN 123-45-6789 Salary $250,000 cannot be processed';
		expect(safeJobText(text).text).toBe(text);
	});
	it('includes failed/retry states and the latest retained failure in current jobs', async () => {
		const f = fixture(), result = await readJobs(f.ctx, 'd1-19c-lab', { failedOnly: true });
		const sql = result.sections.jobs!.sql;
		expect(sql).toContain("STATE IN ('FAILED', 'BROKEN', 'RETRY SCHEDULED')");
		expect(sql).toContain('MAX(latest_run.STATUS) KEEP (DENSE_RANK LAST ORDER BY latest_run.LOG_DATE, latest_run.LOG_ID)');
		expect(sql).toContain('latest_run.OWNER = DBA_SCHEDULER_JOBS.OWNER');
		expect(sql).toContain('latest_run.JOB_NAME = DBA_SCHEDULER_JOBS.JOB_NAME');
		expect(sql).not.toContain(':fromTime');
		expect(result.sections.lastErrors!.sql).toContain('ORDER BY DBA_SCHEDULER_JOB_RUN_DETAILS.LOG_DATE DESC, DBA_SCHEDULER_JOB_RUN_DETAILS.LOG_ID DESC)');
	});
	for (const code of ['ORA-00942', 'ORA-01031', 'ORA-65040']) it(`retains current job evidence without last-run privileges for ${code}`, async () => {
		const f = fixture(); f.query.mockImplementation(async sql => {
			if (sql.includes('FROM DBA_SCHEDULER_JOB_RUN_DETAILS')) throw new Error(code);
			return { columns: ['JOB_NAME'], rows: [['FAILED_ONCE']], truncated: false, elapsedMs: 1 };
		});
		const result = await readJobs(f.ctx, 'd1-19c-lab', { failedOnly: true });
		expect(result.sections.jobs!.status).toBe('ok'); expect(result.sections.jobs!.note).toContain('last-run status not available');
		expect(result.sections.jobs!.sql).not.toContain('latest_run'); expect(result.sections.jobs!.rows).toEqual([{ JOB_NAME: 'FAILED_ONCE' }]);
		expect(result.sections.lastErrors!.status).toBe('unavailable'); expect(f.close).toHaveBeenCalledOnce();
	});

	for (const sql of ["BEGIN DBMS_SCHEDULER.RUN_JOB('X'); END;", "SELECT DBMS_SCHEDULER.RUN_JOB('X') FROM DUAL", "SELECT DBMS_LOCK.SLEEP(1) FROM DUAL", "SELECT DBMS_WORKLOAD_REPOSITORY.CREATE_SNAPSHOT() FROM DUAL"]) it('blocks scheduler and maintenance writers before database access', () => { expect(() => classifySql(sql)).toThrow(); });
	it('binds filters, caps, redacts before UTF8 clipping, audits hashes and closes', async () => {
		const f = fixture(); const result = await readJobs(f.ctx, 'd1-19c-lab', { owner: 'sh', since: '2d', failedOnly: true });
		expect(result.note).toContain('Current PDB visibility');
		for (const [sql, binds, options] of f.query.mock.calls as unknown as [string, Record<string, unknown>, { maxRows: number }][]) {
			classifySql(sql); expect(sql).not.toContain("'SH'"); expect(options.maxRows).toBe(f.ctx.config.limits.maxRows);
			if (sql.includes(':owner')) expect(binds.owner).toBe('SH');
		}
		expect(result.sections.lastErrors!.sql).toContain('ROW_NUMBER()');
		expect(result.sections.runs!.sql).toContain("STATUS <> 'SUCCEEDED'");
		expect(result.sections.runs!.sql).toContain('ORDER BY DBA_SCHEDULER_JOB_RUN_DETAILS.LOG_DATE DESC');
		expect(result.sections.runs!.sql).toContain('TO_TIMESTAMP_TZ(:fromTime');
		expect(result.sections.jobs!.sql).not.toContain(':fromTime');
		expect(result.sections.runs!.rows[0]!.ADDITIONAL_INFO_TRUNCATED).toBe(true);
		expect(Buffer.byteLength(String(result.sections.runs!.rows[0]!.ADDITIONAL_INFO))).toBeLessThanOrEqual(2048);
		expect(JSON.stringify(result)).not.toContain('private-value');
		expect(JSON.stringify(f.record.mock.calls)).not.toMatch(/private-value|fromTime|ADDITIONAL_INFO/);
		expect(renderJobs(result)).toContain('partial evidence'); expect(f.close).toHaveBeenCalledOnce();
	});
	for (const code of ['ORA-00942', 'ORA-01031', 'ORA-65040']) it(`degrades one view for ${code}`, async () => {
		const f = fixture(code), result = await readJobs(f.ctx, 'd1-19c-lab');
		expect(result.sections.windows!.status).toBe('unavailable'); expect(result.sections.jobs!.status).toBe('ok'); expect(f.close).toHaveBeenCalledOnce();
	});
	it('propagates unexpected errors and closes', async () => { const f = fixture('ORA-00600'); await expect(readJobs(f.ctx, 'd1-19c-lab')).rejects.toThrow('ORA-00600'); expect(f.close).toHaveBeenCalledOnce(); });
	for (const options of [{ since: '0h' }, { since: '31d' }, { owner: 'SH OR 1=1' }]) it('rejects bad options before acquiring a session', async () => { const f = fixture(); await expect(readJobs(f.ctx, 'd1-19c-lab', options)).rejects.toThrow(); expect(f.get).not.toHaveBeenCalled(); });
	it('rejects unknown and unpinned targets', async () => { const f = fixture(); f.ctx.pinnedTarget = 'p1-19c-prod'; await expect(readJobs(f.ctx, 'd1-19c-lab')).rejects.toThrow(); await expect(readJobs(f.ctx, 'other')).rejects.toThrow(); });
	it('covers every view in preflight', () => { for (const def of Object.values(jobQueries)) expect(FEATURE_VIEWS.jobs).toContain(def.view); });
	it('redacts split credentials and keeps small text', () => { expect(safeJobText("token =\n'sensitive'").text).not.toContain('sensitive'); expect(safeJobText('ORA-00001')).toEqual({ text: 'ORA-00001', truncated: false }); });
});
