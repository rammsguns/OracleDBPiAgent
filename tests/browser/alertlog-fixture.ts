import type { AlertRow, IncidentRow, AlertResult } from '../../src/alertlog/index.js';
export const alertRow: AlertRow = {
	timestamp: '2026-11-04T12:00:00Z', firstTime: '2026-11-04T11:00:00Z', lastTime: '2026-11-04T12:00:00Z', count: 3,
	level: 1, codes: ['ORA-00600'], problemKey: 'ORA 600 [example]', incidentId: '123', traceFile: 'example.trc',
	messageText: '<img src=x onerror=alert(1)> ORA-00600 incident=123\nErrors in file /opt/oracle/diag/example.trc\n' + 'Diagnostic context for the internal error. '.repeat(20) + '\nFinal diagnostic line', textTruncated: true,
	incidentIds: ['123', '124', '125', '126', '127', '128', '129'], traceFiles: ['/opt/oracle/diag/example.trc'], problemKeys: ['ORA 600 [example]'], metadataTruncated: true,
};
export const incidentRow: IncidentRow = { incidentId: '123', problemKey: 'ORA 600 [example]', createTime: alertRow.timestamp, status: 1 };
export function alertResult<T>(target: string, rows: T[]): AlertResult<T> {
	return { target, rows, status: 'ok', view: 'V$DIAG_ALERT_EXT', window: { from: alertRow.firstTime, to: alertRow.lastTime }, limit: 50, truncated: true, sql: 'SELECT bounded evidence', binds: {}, grants: [], attempts: [] };
}
export const alertEvidence = { status: 'ok', window: alertResult('', []).window, entries: [alertRow], incidents: [incidentRow], correlations: [{ kind: 'jobRun', label: 'NIGHTLY_PURGE_JOB', at: alertRow.timestamp, entryIndexes: [0] }], checks: [] };
