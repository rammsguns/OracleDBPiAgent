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
	expect(merged.correlations[2]?.entryIndexes).toEqual([1]);
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
