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
	try { result = await live('p1-19c-prod', 'NIGHTLY_PURGE_JOB', '7d'); }
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved p1 listener unavailable'); return; } throw error; }
	const issue = result.issues[0]!;
	if (!issue.checks.find(c => c.label.includes('run history'))?.rows.length) { context.skip('NIGHTLY_PURGE_JOB has no failure in the 7d window'); return; }
	expect(issue.codes).toContain('ORA-02292');
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')).toMatchObject({ line: 27, subprogram: 'NIGHTLY_PURGE' });
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')?.statement).toMatch(/DELETE FROM orders/i);
	const constraint = issue.checks.find(c => c.label === 'Constraint SHOPAPP.SYS_C007669');
	expect(constraint?.rows[0]?.slice(0, 3)).toEqual(['SHOPAPP', 'SYS_C007669', 'R']);
	expect(issue.checks.find(c => c.label === 'Columns for SHOPAPP.SYS_C007669')?.rows[0]?.[3]).toBe('ORDER_ID');
	expect(issue.checks.some(c => c.label.startsWith('All visible child foreign keys') && c.rows.length)).toBe(true);
	expect(issue.hypotheses[0]?.title).toMatch(/child foreign key/);
	expect(issue.hypotheses.find(h => h.title.includes('Cutoff evaluated twice'))?.evidence.join(' ')).toMatch(/line 26[\s\S]*line 27/);
	expect(issue.excerpts[0]?.statement).toContain("INTERVAL '7' DAY");
	const count = issue.checks.find(c => c.label.startsWith('Current child references'));
	expect(count).toBeDefined();
	if (count?.status === 'ok') expect(Number(count.rows[0]?.[0])).toBeGreaterThanOrEqual(0);
	else expect(count?.attempts.length).toBeGreaterThan(0);
	expect(issue.concurrency.join(' ')).toContain('cannot explain child rows for old parents');
	expect(renderTriageMarkdown(result)).toContain('SYS_C007669');
	console.log(`p1 triage: SYS_C007669 child=${constraint?.rows[0]?.[3]}; frame=WORKLOAD.NIGHTLY_PURGE:27. Cutoff/predicate mismatch is the leading hypothesis; the aggregate count is a current snapshot.`);
}, 120000);
it('triages older K7Q_FAILJOB failures with the default window and labels historical evidence', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let result;
	try { result = await live('d1-19c-lab', 'K7Q_FAILJOB on the lab keeps failing, what is wrong?'); }
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved d1 listener unavailable'); return; } throw error; }
	const issue = result.issues[0]!;
	expect(issue.codes).toContain('ORA-20001');
	expect(issue.since).toBe('24h');
	expect(issue.limitations.join(' ')).toContain('outside the requested window (last run ');
	const latest = issue.checks.find(c => c.label.startsWith('Latest scheduler runs'));
	expect(latest?.rows.length).toBeGreaterThan(0); expect(latest?.rows.length).toBeLessThanOrEqual(5);
	expect(issue.checks.filter(c => c.label.startsWith('Compile errors') || c.label.startsWith('Invalid objects')).map(c => c.binds.owner)).toEqual(['K7Q_OWNER', 'K7Q_OWNER']);
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

it('reports an unknown free-text name and resolves lowercase retained job names', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let missing;
	try { missing = await live('d1-19c-lab', 'NO_SUCH_JOB_X failed'); }
	catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved d1 listener unavailable'); return; }
		throw error;
	}
	expect(renderTriageMarkdown(missing)).toContain('not found: NO_SUCH_JOB_X - check spelling, owner visibility, or whether it was dropped');
	expect(missing.issues[0]?.hypotheses[0]?.title).not.toContain('no job or object name was recognized');
	const lowercase = await live('d1-19c-lab', 'k7q_failjob failed');
	expect(lowercase.issues[0]?.codes).toContain('ORA-20001');
	expect(lowercase.issues[0]?.limitations.some(s => s.startsWith('not found: K7Q_FAILJOB'))).toBe(false);
}, 120000);

it('correlates p1 purge alert evidence and d1 ORA-00800 without an LLM', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let p1, d1;
	try {
		p1 = await live('p1-19c-prod', 'NIGHTLY_PURGE_JOB ORA-02292', '7d');
		d1 = await live('d1-19c-lab', 'ORA-00800 errors in the alert log', '30d');
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved Oracle listener unavailable'); return; }
		throw error;
	}
	expect(p1.alertLog?.status).toBe('ok');
	const alert = p1.alertLog!;
	const purge = alert.entries.findIndex(e => e.messageText.includes('NIGHTLY_PURGE_JOB') && e.codes.includes('ORA-02292'));
	expect(purge).toBeGreaterThanOrEqual(0);
	expect(alert.entries[purge]?.traceFiles.join(' ')).toContain('_j005_');
	expect(alert.entries[purge]?.timestamp).toContain('2026-11-04T04:30:56');
	expect(alert.correlations.some(c => c.kind === 'jobRun' && c.entryIndexes.includes(purge))).toBe(true);
	expect(alert.checks.every(c => c.sql.includes('FETCH FIRST') && c.binds.fromTime && c.binds.toTime)).toBe(true);
	expect(d1.alertLog?.entries.some(e => e.codes.includes('ORA-00800'))).toBe(true);
	expect(d1.alertLog?.incidents.some(i => i.problemKey === 'ORA 800')).toBe(true);
	expect(renderTriageMarkdown(d1)).toContain('Set Priority Failed');
	expect(d1.issues[0]?.hypotheses[0]?.title).toBe('The VKTM timekeeping process could not raise its OS scheduling priority');
	expect(d1.issues[0]?.suggestions.join(' ')).toContain('CAP_SYS_NICE');
	for (const id of d1.alertLog!.entries.flatMap(e => e.incidentIds)) expect(renderTriageMarkdown(d1)).toContain(`[Incident ${id}](#incident-${id})`);
}, 120000);

it('discovers the live purge failure from natural language via the alert log', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	let result;
	try {
		const config = loadConfig(), sessions = createSessionProvider(config);
		let ageHours: number;
		try {
			const session = await sessions.get('p1-19c-prod');
			const prerequisite = await session.query(`SELECT
				( CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE)
				- CAST(SYS_EXTRACT_UTC(ORIGINATING_TIMESTAMP) AS DATE) ) * 24 AS AGE_HOURS
				FROM V$DIAG_ALERT_EXT
				WHERE INSTR(UPPER(MESSAGE_TEXT), 'ORA-12012') > 0
				AND INSTR(UPPER(MESSAGE_TEXT), 'SHOPAPP') > 0
				AND INSTR(UPPER(MESSAGE_TEXT), 'NIGHTLY_PURGE_JOB') > 0
				AND INSTR(UPPER(MESSAGE_TEXT), 'ORA-02292') > 0
				ORDER BY ORIGINATING_TIMESTAMP DESC FETCH FIRST 1 ROW ONLY`, {}, { maxRows: 1 });
			if (!prerequisite.rows.length) {
				context.skip('Prerequisite p1 alert no longer exists: ORA-12012 for SHOPAPP.NIGHTLY_PURGE_JOB with ORA-02292 in V$DIAG_ALERT_EXT');
				return;
			}
			ageHours = Number(prerequisite.rows[0]![0]);
		} finally { await sessions.closeAll(); }
		// Triage has no absolute window and caps --since at 30d. Include a full
		// extra hour for fractional age and time elapsed between probe and triage.
		expect(Number.isFinite(ageHours)).toBe(true);
		const hours = Math.max(48, Math.ceil(ageHours) + 1);
		expect(hours, 'Retained purge alert exceeds triage’s 30d maximum; absolute-window support is needed (do not skip retained evidence)').toBeLessThanOrEqual(720);
		result = await live('p1-19c-prod', 'nightly purge job failed last night', `${hours}h`);
	}
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved p1 listener unavailable'); return; } throw error; }
	const issue = result.issues[0]!;
	expect(issue.issue.jobs).toContain('NIGHTLY_PURGE_JOB');
	expect(issue.codes).toEqual(expect.arrayContaining(['ORA-12012', 'ORA-02292']));
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')?.line).toBe(27);
	expect(issue.hypotheses[0]?.title).toContain('child foreign key');
	expect(issue.limitations.join(' ')).toContain('SHOPAPP.NIGHTLY_PURGE_JOB: discovered from alert log');
	expect(renderTriageMarkdown(result)).not.toContain('found for FAILED');
}, 120000);
