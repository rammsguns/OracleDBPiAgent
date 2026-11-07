import { expect, it } from 'vitest';
import { needsPackRefusalCorrection } from '../../src/agent/packRefusal.js';

for (const source of ['ASH', 'V$ACTIVE_SESSION_HISTORY', 'V$ALL_ACTIVE_SESSION_HISTORY', 'AWR snapshots', 'DBA_HIST_SQLSTAT', 'CDB_HIST_SNAPSHOT', 'V$METRIC_HISTORY', 'V$SYSMETRIC_HISTORY', 'DBMS_WORKLOAD_REPOSITORY', 'ADDM', 'SQL tuning advisor', 'awrrpt', 'awrsqrpt', 'ashrpt']) {
	it(`requires the live alternative for ${source}`, () => {
		expect(needsPackRefusalCorrection(`Show ${source}`, 'I cannot access that history.')).toBe(true);
		expect(needsPackRefusalCorrection('Help', `${source} is unavailable.`)).toBe(true);
	});
}
for (const suggestion of ['Run @?/rdbms/admin/awrrpt.sql on the host.', 'Run awrsqrpt.sql.', 'Run ashrpt.sql.', 'Run addmrpt.sql.', 'Call DBMS_WORKLOAD_REPOSITORY.CREATE_SNAPSHOT.', 'Use DBMS_ADVISOR.CREATE_TASK.', 'Generate an AWR report.', 'Create an AWR snapshot.']) {
	it(`removes workaround: ${suggestion}`, () => {
		expect(needsPackRefusalCorrection('Show AWR history', `Use piagent top. ${suggestion}`)).toBe(true);
	});
}
for (const answer of ['AWR is unavailable; use piagent top --target lab --seconds 15.', 'ASH is refused. Use /top.', 'Do not run awrrpt.sql. Use piagent top.', 'DBMS_WORKLOAD_REPOSITORY is forbidden; use piagent top.']) {
	it(`accepts a complete refusal: ${answer}`, () => {
		expect(needsPackRefusalCorrection('Show AWR history', answer)).toBe(false);
	});
}
it('detects a workaround following a refusal in the same sentence', () => {
	expect(needsPackRefusalCorrection('AWR?', 'I cannot query AWR, but run awrrpt.sql; also piagent top.')).toBe(true);
});
it('leaves ordinary questions, snapshots and unrelated slash paths alone', () => {
	for (const text of ['Show top SQL', 'Explain an application snapshot', 'Count orders']) {
		expect(needsPackRefusalCorrection(text, 'No evidence available.')).toBe(false);
	}
	expect(needsPackRefusalCorrection('ASH history', 'Use /topic.')).toBe(true);
});
