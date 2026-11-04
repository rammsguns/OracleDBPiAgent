import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
async function live(target: string, issue: string, since = '24h') {
	const config = loadConfig(), sessions = createSessionProvider(config);
	try { return await triage({ config, sessions, audit: { record: async () => {} }, runId: 'triage-integration' }, { target, issue, since }); }
	finally { await sessions.closeAll(); }
}
it('triages live NIGHTLY_PURGE_JOB with read-only source and constraint evidence', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let result;
	try { result = await live('p1-19c-prod', 'NIGHTLY_PURGE_JOB'); }
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved p1 listener unavailable'); return; } throw error; }
	const issue = result.issues[0]!;
	if (!issue.checks.find(c => c.label.includes('run history'))?.rows.length) { context.skip('NIGHTLY_PURGE_JOB has no failure in the 24h window'); return; }
	expect(issue.codes).toContain('ORA-02292');
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')).toMatchObject({ line: 27, subprogram: 'NIGHTLY_PURGE' });
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')?.statement).toMatch(/DELETE FROM orders/i);
	const constraint = issue.checks.find(c => c.label === 'Constraint SHOPAPP.SYS_C007669');
	expect(constraint?.rows[0]?.slice(0, 3)).toEqual(['SHOPAPP', 'SYS_C007669', 'R']);
	expect(issue.checks.find(c => c.label === 'Columns for SHOPAPP.SYS_C007669')?.rows[0]?.[3]).toBe('ORDER_ID');
	expect(issue.checks.some(c => c.label.startsWith('All visible child foreign keys') && c.rows.length)).toBe(true);
	expect(issue.hypotheses[0]?.title).toMatch(/Cutoff evaluated twice/);
	expect(issue.hypotheses[0]?.evidence.join(' ')).toMatch(/line 26[\s\S]*line 27/);
	expect(issue.excerpts[0]?.statement).toContain("INTERVAL '7' DAY");
	const count = issue.checks.find(c => c.label.startsWith('Current child references'));
	expect(count).toBeDefined();
	if (count?.status === 'ok') expect(Number(count.rows[0]?.[0])).toBeGreaterThanOrEqual(0);
	else expect(count?.attempts.length).toBeGreaterThan(0);
	expect(issue.concurrency.join(' ')).toContain('cannot explain child rows for old parents');
	expect(renderTriageMarkdown(result)).toContain('SYS_C007669');
	console.log(`p1 triage: SYS_C007669 child=${constraint?.rows[0]?.[3]}; frame=WORKLOAD.NIGHTLY_PURGE:27. Cutoff/predicate mismatch is the leading hypothesis; the aggregate count is a current snapshot.`);
}, 120000);
it('triages K7Q_FAILJOB history and job_action when the live job still exists', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let result;
	try { result = await live('d1-19c-lab', 'K7Q_OWNER.K7Q_FAILJOB', '30d'); }
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved d1 listener unavailable'); return; } throw error; }
	const issue = result.issues[0]!;
	if (!issue.codes.length) { context.skip('K7Q_FAILJOB has no history in the 30d window'); return; }
	expect(issue.codes).toContain('ORA-20001');
	const frame = issue.excerpts.find(e => e.object === 'K7Q_OWNER.K7Q_FAILJOB'); expect(frame?.line).toBe(1);
	const job = issue.checks.find(c => c.label === 'Named scheduler job actions');
	if (!job?.rows.length) {
		expect(frame?.status).toBe('unavailable');
		expect(issue.limitations.join(' ')).toMatch(/dropped or auto-dropped/);
		expect(issue.hypotheses.some(h => h.title.includes('RAISE_APPLICATION_ERROR'))).toBe(true);
		console.log('d1: ORA-20001 history and anonymous line 1 verified; job is absent from DBA_SCHEDULER_JOBS, so historical job_action cannot be verified.');
		return;
	}
	expect(frame?.subprogram).toBe('anonymous block (job_action)'); expect(frame?.statement).toMatch(/raise_application_error\s*\(\s*-20001/i);
}, 120000);
