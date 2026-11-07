import { readFileSync } from "node:fs";
import { expect, it } from 'vitest';
import { needsPackRefusalCorrection as detect } from '../../src/agent/packRefusal.js';

const needsPackRefusalCorrection = (question: string, answer: string) => detect(question, answer, 0, false);

for (const source of ['ASH', 'V$ACTIVE_SESSION_HISTORY', 'V$ALL_ACTIVE_SESSION_HISTORY', 'AWR snapshots', 'DBA_HIST_SQLSTAT', 'CDB_HIST_SNAPSHOT', 'V$METRIC_HISTORY', 'V$SYSMETRIC_HISTORY', 'DBMS_WORKLOAD_REPOSITORY', 'ADDM', 'DBMS_ADVISOR', 'awrrpt', 'awrsqrpt', 'ashrpt']) {
	it(`requires the live alternative for ${source}`, () => {
		expect(needsPackRefusalCorrection(`Show ${source}`, 'I cannot access that history.')).toBe(true);
		expect(needsPackRefusalCorrection('Help', `${source} is unavailable.`)).toBe(false);
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

for (const question of [
	'Show a blocking snapshot.', 'Show statistic classes from V$STATNAME and V$SYSSTAT.',
	'What is the dominant wait class?', 'Show undo settings.', 'List the cursor inventory.',
	'Follow the cached plan.', 'Show the plan line tree.', 'When was the last level 0 backup?',
	'Run DBMS_STATS.', 'Explain a new cursor delta.', 'Explain an aged-out cursor.',
	'Explain a SQL elapsed time delta.', 'What does the advisor do?', 'Take a snapshot.',
]) {
	it(`ignores non-pack question even with pack words in the answer: ${question}`, () => {
		for (const successfulCalls of [0, 1]) for (const refusal of [true, false]) {
			expect(detect(question, 'ASH/AWR unavailable. Snapshot advisor metadata.', successfulCalls, refusal)).toBe(false);
		}
	});
}
it('requires a refusal or zero successful calls even for an explicit pack question', () => {
	expect(detect('Show AWR history', 'AWR metadata', 1, false)).toBe(false);
	expect(detect('Show AWR history', 'I cannot query AWR.', 1, true)).toBe(true);
	expect(detect('Show AWR history', 'No data.', 0, false)).toBe(true);
});

for (const source of [
	'AWR_CDB_REPORTS', 'AWR_PDB_SNAPSHOT', 'AWR_ROOT_REPORT',
	'GV$ACTIVE_SESSION_HISTORY', 'GV$ALL_ACTIVE_SESSION_HISTORY',
	'GV$METRIC_HISTORY', 'GV$SYSMETRIC_HISTORY', 'V$EVENTMETRIC',
	'V$FILEMETRIC', 'GV$WAITCLASSMETRIC_HISTORY',
	'DBMS_SQLTUNE.REPORT_TUNING_TASK', 'DBMS_SQLTUNE.CREATE_TUNING_TASK',
	'SQL Tuning Advisor', 'SQL Access Advisor', 'Access Advisor',
	'DBMS_ADVISOR.QUICK_TUNE',
]) {
	it(`recognizes the reviewed source and workaround: ${source}`, () => {
		expect(detect(`Query ${source}`, 'I cannot access that source.', 0, true)).toBe(true);
		expect(detect(`Query ${source}`, 'Use /top.', 0, true)).toBe(false);
		expect(detect('Show AWR history', `Use /top. Run ${source} on the host.`, 0, true)).toBe(true);
		expect(detect('Show AWR history', `Do not use ${source}. Use /top.`, 0, true)).toBe(false);
		expect(detect(`Query ${source}`, 'Some metadata.', 1, false)).toBe(false);
	});
}
for (const separator of ['; ', ', so ', ' so you can ', '; therefore ', ', therefore ']) {
	it(`separates a recommendation from a negated clause using ${separator}`, () => {
		expect(detect('Show AWR history', `I cannot query AWR${separator}run awrrpt.sql on the host, or use /top.`, 0, true)).toBe(true);
		expect(detect('Show AWR history', `AWR is unavailable${separator}do not run awrrpt.sql; use /top.`, 0, true)).toBe(false);
	});
}
it('accepts a bracketed chat command without confusing longer slash paths', () => {
	expect(detect('Show ASH history', 'I cannot query ASH. Use [/top] for live deltas.', 0, true)).toBe(false);
	expect(detect('Show ASH history', 'I cannot query ASH. Use [/topic].', 0, true)).toBe(true);
});

it('accepts the exact first smoke answer with its supported live alternative', () => {
	const smoke = readFileSync(new URL('../../docs/wp-2527l-smoke-ask-awr.md', import.meta.url), 'utf8');
	const first = smoke.slice(0, smoke.indexOf("I can't generate an AWR report.", 1));
	expect(first).toContain('piagent top --target lab-p1 --seconds 30');
	expect(detect('Generate an AWR report for the last hour on this database.', first, 0, true)).toBe(false);
});
for (const description of [
	'outside the read-only scope', 'out of scope', 'restricted', 'prohibited',
	'disallowed', 'blocked', 'not allowed', 'not permitted',
	'requires the Diagnostics Pack', 'require the Diagnostics Pack',
	'rely on the Diagnostics Pack', 'relies on the Diagnostics Pack',
]) {
	it(`accepts descriptive pack restrictions: ${description}`, () => {
		expect(detect('Show AWR history', `AWR reports via DBMS_WORKLOAD_REPOSITORY are ${description}. Use piagent top.`, 0, true)).toBe(false);
	});
}
it('accepts a descriptive dependency followed by the supported live alternative', () => {
	expect(detect('Show AWR history', 'AWR reports require Diagnostics Pack, use piagent top.', 0, true)).toBe(false);
});
it('still catches direct recommendations with dependency wording', () => {
	for (const text of [
		'Run @?/rdbms/admin/awrrpt.sql on the host; use piagent top.',
		'I cannot query AWR, but run awrrpt.sql; use piagent top.',
		'Run awrrpt.sql, which requires Diagnostics Pack; use piagent top.',
		'AWR reports require Diagnostics Pack, so run awrrpt.sql; use /top.',
	]) expect(detect('Show AWR history', text, 0, true)).toBe(true);
});
