import { expect, it, vi } from 'vitest';
import { collectAlerts, alertHypotheses, mergeAlerts } from '../../src/triage/alerts.js';
import { triage, renderTriageMarkdown } from '../../src/triage/index.js';
import { summarizeTriage } from '../../src/triage/cli.js';
import { loadConfig } from '../../src/config/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { ToolContext } from '../../src/contracts.js';
function context(unavailable = false): ToolContext {
	return { config: loadConfig(), runId: 'alerts-test', audit: { record: vi.fn(async () => {}) }, sessions: { closeAll: async () => {}, get: async () => ({ close: async () => {}, query: async (sql, binds) => {
		classifySql(sql);
		if (unavailable && sql.includes('V$DIAG')) throw Error('ORA-01031');
		const rows = sql.includes('FROM V$DIAG_ALERT_EXT') ? [['2026-11-04T04:30:56Z', 16, 'test problem', 'ORA-00600: internal error incident=12 /diag/j005.trc password=hidden']] : sql.includes('FROM V$DIAG_INCIDENT') ? [[12, 'test problem', '2026-11-04T04:30:56Z', 1]] : [];
		if (sql.includes('V$DIAG')) { expect(binds).toHaveProperty('fromTime'); expect(sql).toContain('FETCH FIRST'); }
		return { rows, columns: [], elapsedMs: 0, truncated: false };
	} }) } };
}
it('collects exact evidence and bounds failed-run windows independently of the issue window', async () => {
	const alert = await collectAlerts(context(), 'p1-19c-prod', 24, ['ORA-00600'], [['SHOPAPP', 'PURGE', 'FAILED', 600, '2026-11-04T04:30:56Z'], ['SHOPAPP', 'OK', 'SUCCEEDED', 0, '2026-11-04T04:30:56Z']]);
	expect(alert.correlations.map(c => c.kind)).toEqual(['code', 'jobRun']);
	expect(alert.correlations[1]?.entryIndexes).toEqual([0]);
	expect(alert.checks[1]?.binds.fromTime).toBe('2026-11-04T04:20:56.000+00:00');
	expect(alert.checks[1]?.binds.toTime).toBe('2026-11-04T04:40:56.000+00:00');
	expect(JSON.stringify(alert)).not.toContain('hidden');
	expect(alertHypotheses(alert)[0]?.evidence.join(' ')).toContain('Incident 12; problem key test problem');
	const merged = mergeAlerts([alert, alert])!;
	expect(merged.correlations[2]?.entryIndexes).toEqual([0]);
	expect(merged.incidents).toHaveLength(1);
});
it('returns the shared top-level shape, Markdown evidence, checklist and stubbed summary grounding', async () => {
	const result = await triage(context(), { target: 'd1-19c-lab', issue: 'ORA-00600 in the alert log' });
	expect(Object.keys(result.alertLog!).sort()).toEqual(['checks', 'correlations', 'entries', 'incidents', 'status', 'window']);
	expect(result.issues[0]?.graph.nodes.some(n => n.id === 'alertlog')).toBe(true);
	const markdown = renderTriageMarkdown(result);
	expect(markdown).toContain('### Alert log'); expect(markdown).toContain('Correlation (code)'); expect(markdown).toContain('FROM V$DIAG_ALERT_EXT');
	const stub = vi.fn(async () => 'Incident 12: ORA-00600.');
	expect((await summarizeTriage(markdown, loadConfig().llm, stub)).unverified).toEqual([]);
	expect(stub).toHaveBeenCalledOnce();
});
it('reports missing grants once without failing triage', async () => {
	const result = await triage(context(true), { target: 'd1-19c-lab', issue: 'ORA-00800 errors in the alert log' });
	expect(result.alertLog?.status).toBe('unavailable');
	const markdown = renderTriageMarkdown(result);
	expect(markdown.match(/GRANT SELECT ON SYS.V_\$DIAG_ALERT_EXT/g)).toHaveLength(1);
	expect(result.alertLog?.checks.every(c => c.status === 'unavailable')).toBe(true);
});
it.each([
	['ORA-04031', 'Shared pool'], ['ORA-01555', 'Undo retention'], ['ORA-01653', 'Tablespace'], ['ORA-01654', 'Tablespace'], ['ORA-01688', 'Tablespace'], ['ORA-00060', 'deadlock'], ['ORA-12850', 'Network'], ['TNS-12541', 'Network'],
])('adds a grounded diagnostic lead for %s', async (code, title) => {
	const alert = await collectAlerts(context(), 'd1-19c-lab', 24, [code], []);
	alert.entries[0]!.codes = [code];
	expect(alertHypotheses(alert)[0]?.title).toContain(title);
	if (code === 'ORA-00060') expect(alertHypotheses(alert)[0]?.evidence.join(' ')).toContain('/diag/j005.trc');
});
it('requires incident evidence for internal-error SR hypotheses', async () => {
	const alert = await collectAlerts(context(), 'd1-19c-lab', 24, ['ORA-00600'], []);
	alert.incidents = []; alert.entries[0]!.incidentIds = []; alert.entries[0]!.incidentId = null;
	expect(alertHypotheses(alert)).toEqual([]);
});

it('rejects prose after job and common words as missing identifiers', async () => {
	const { parseIssue } = await import('../../src/triage/parse.js');
	const { nameCandidates } = await import('../../src/triage/names.js');
	for (const word of ['FAILED', 'FAILING', 'ERROR', 'ERRORS', 'LAST', 'NIGHT', 'YESTERDAY', 'TODAY', 'RUN', 'RUNNING']) {
		expect(parseIssue(`job ${word}`).jobs).toEqual([]);
		expect(nameCandidates(word)).toEqual([]);
	}
	expect(parseIssue('nightly purge job failed last night').jobs).toEqual([]);
});
it('discovers job names and frames from alert text before reading history, even without retained runs', async () => {
	const ctx = context();
	const get = ctx.sessions.get.bind(ctx.sessions);
	ctx.sessions.get = async target => {
		const session = await get(target), original = session.query.bind(session);
		session.query = async (sql, binds, options) => {
			if (sql.includes('FROM V$DIAG_ALERT_EXT')) return { columns: [], elapsedMs: 0, truncated: false, rows: [['2026-11-04T04:30:56Z', 16, '', 'ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"\nORA-02292: integrity constraint (SHOPAPP.FK_TEST) violated - child record found\nORA-06512: at "SHOPAPP.WORKLOAD", line 27']] };
			if (sql.includes('_SOURCE')) return { columns: [], elapsedMs: 0, truncated: false, rows: [['PACKAGE BODY', 25, 'PROCEDURE nightly_purge IS'], ['PACKAGE BODY', 26, 'BEGIN'], ['PACKAGE BODY', 27, 'DELETE FROM orders;'], ['PACKAGE BODY', 28, 'END;']] };
			if (sql.includes('_CONSTRAINTS') && binds?.name === 'FK_TEST') return { columns: [], elapsedMs: 0, truncated: false, rows: [['SHOPAPP', 'FK_TEST', 'R', 'ORDER_LINES', 'SHOPAPP', 'PK_ORDERS', 'NO ACTION', 'ENABLED']] };
			return original(sql, binds, options);
		};
		return session;
	};
	const result = await triage(ctx, { target: 'p1-19c-prod', issue: 'nightly purge job failed last night', since: '2d' });
	const issue = result.issues[0]!;
	expect(issue.issue.jobs).toContain('NIGHTLY_PURGE_JOB');
	expect(issue.codes).toContain('ORA-02292');
	expect(issue.excerpts.find(e => e.object === 'SHOPAPP.WORKLOAD')?.line).toBe(27);
	expect(issue.hypotheses[0]?.title).toContain('child foreign key');
	expect(issue.checks.some(c => c.label === 'Constraint SHOPAPP.FK_TEST')).toBe(true);
	expect(issue.limitations.join(' ')).toContain('discovered from alert log');
	expect(result.alertLog?.correlations.some(c => c.label.includes('from alert log'))).toBe(true);
	const markdown = renderTriageMarkdown(result);
	expect(markdown).toMatch(/\| Index[^\n]*\n\|---[^\n]*\n\| 0/);
	expect(markdown).not.toContain('found for FAILED');
	const { discoverAlertJobs } = await import('../../src/triage/alerts.js');
	expect((await discoverAlertJobs(ctx, 'p1-19c-prod', 48, 'purge failed', false)).jobs).toHaveLength(1);
	expect((await discoverAlertJobs(ctx, 'p1-19c-prod', 48, 'unrelated outage', false)).jobs).toHaveLength(0);
});
it('labels capped unmatched recent evidence and omits an empty trace diagram', async () => {
	const result = await triage(context(), { target: 'd1-19c-lab', issue: 'something went wrong' });
	const recent = result.alertLog?.checks.find(c => c.label.startsWith('Recent errors'));
	expect(recent?.binds.fetchLimit).toBe(11);
	expect(result.alertLog?.correlations).toEqual([]);
	expect(renderTriageMarkdown(result)).toContain('Recent errors in the window, not matched to the issue');
	expect(renderTriageMarkdown(result)).not.toContain('### Trace diagram');
});

it('ranks the VKTM priority lead with folded incident evidence and unexecuted checks', async () => {
	const { alertSuggestions } = await import('../../src/triage/alerts.js');
	const alert = await collectAlerts(context(), 'd1-19c-lab', 24, ['ORA-00800'], []);
	const row = alert.entries[0]!;
	row.codes = ['ORA-00800']; row.messageText = 'ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration]';
	row.incidentIds = ['12', '13'];
	const lead = alertHypotheses(alert)[0]!;
	expect(lead.title).toBe('The VKTM timekeeping process could not raise its OS scheduling priority');
	expect(lead.evidence.join(' ')).toContain(row.messageText);
	expect(lead.evidence.join(' ')).toContain('Incident 12; Incident 13');
	expect(alertSuggestions(alert).join(' ')).toMatch(/oradism.*ownership.*setuid.*ORACLE_HOME\/bin/);
	expect(alertSuggestions(alert).join(' ')).toContain('CAP_SYS_NICE in Docker');
	expect(alertSuggestions(alert).join(' ')).toContain('usually a soft, non-data error');
	const result = await triage(context(), { target: 'd1-19c-lab', issue: 'ORA-00800' });
	result.issues[0]!.alertLog = alert; result.issues[0]!.hypotheses = [{ ...lead, rank: 1 }];
	const markdown = renderTriageMarkdown(result);
	expect(markdown).toContain('[Incident 12](#incident-12)');
	expect(markdown).toContain('<a id="incident-12"></a>');
	for (const message of ['ORA-00800: arguments: [Other Error], [VKTM]', 'ORA-00800: arguments: [Set Priority Failed], [OTHER]', 'ORA-00800: other error mentions Set Priority Failed and VKTM']) {
		row.messageText = message;
		expect(alertHypotheses(alert)[0]?.title).toContain('soft external error');
		expect(alertSuggestions(alert)).toEqual([]);
	}
});
