import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { triage } from '../../src/triage/index.js';
import { generateReport } from '../../src/report/index.js';
import { compareTargets } from '../../src/drift/index.js';
import { runChatTop } from '../../src/cli/chatTop.js';
for (const target of ['d1-19c-lab', 'p1-19c-prod']) it('integrates backup/jobs/top evidence on ' + target, async test => {
	if (!process.env.PIAGENT_SECRET_DIR) { test.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config), ctx = { config, sessions, audit: { record: async () => {} }, runId: 'feature-integration' };
	try {
		const report = await generateReport(ctx, { target, sections: ['backup', 'jobs'] });
		expect(report.sections.map(s => s.name)).toEqual(['backup', 'jobs']);
		for (const section of report.sections) expect(section.status === 'ok' || /row limit reached/i.test(section.note)).toBe(true);
		const backup = (await triage(ctx, { target, issue: 'can we recover?' })).issues[0]!;
		expect(backup.backup?.status).toBe('ok'); expect(backup.jobEvidence).toBeUndefined(); expect(backup.top).toBeUndefined();
		const jobName = target === 'd1-19c-lab' ? 'K7Q_FAILJOB' : 'NIGHTLY_PURGE_JOB';
		const job = (await triage(ctx, { target, issue: jobName + ' failed', since: '30d' })).issues[0]!;
		expect(job.jobEvidence?.sections.runs?.status).toBe('ok'); expect(job.backup).toBeUndefined(); expect(job.top).toBeUndefined();
		expect(job.checks.some(c => /scheduler run history/i.test(c.label) && c.rows.length > 0)).toBe(true);
		const top = (await triage(ctx, { target, issue: 'slow right now' })).issues[0]!;
		expect(top.top?.requestedSeconds).toBe(15); expect(top.top?.status).not.toBe('failed'); expect(top.top?.load.status).toBe('ok'); expect(top.top?.host.status).toBe('ok'); expect(top.backup).toBeUndefined();
		const chat = await runChatTop({ ...ctx, pinnedTarget: target }, '/top --seconds 5'); expect(chat).toContain('requested 5s');
		console.log(JSON.stringify({ target, report: report.sections.map(s => [s.name, s.status, s.rows.length, /row limit reached/i.test(s.note)]), backup: { status: backup.backup?.status, findings: backup.backup?.findings.map(f => f.id), restore: backup.backup?.restoreEstimate.status }, jobs: { name: jobName, codes: job.codes, objects: job.excerpts.map(e => e.object), sections: Object.keys(job.jobEvidence?.sections ?? {}) }, top: { status: top.top?.status, seconds: top.top?.requestedSeconds, sqlIds: top.top?.sql.rankings.elapsedUs.map(r => r.name), sqlEvidence: top.topSql?.map(s => s.status) }, chat: chat?.split('\n')[0] }));
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.test(String(error))) { test.skip('Approved lab unavailable: ' + target); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 120000);
it('compares live backup configuration on both approved labs', async test => {
	if (!process.env.PIAGENT_SECRET_DIR) { test.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	try {
		const result = await compareTargets({ config, sessions, audit: { record: async () => {} }, runId: 'backup-drift-integration' }, { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'backup' });
		expect(result.complete).toBe(true); expect(result.sections.map(s => s.name)).toEqual(['rman_configuration', 'log_mode']);
		console.log('Backup drift: ' + JSON.stringify(result));
	} finally { await sessions.closeAll(); }
}, 60000);
