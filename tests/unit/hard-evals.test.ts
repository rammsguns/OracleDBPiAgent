import { expect, it } from 'vitest';
import { checkHardCases, checkP33Cases, loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

it('hard suite covers both splits and rejects unsafe truth before connecting', async () => {
	const cases = await loadHardCases();
	expect(cases).toHaveLength(182);
	expect(cases.filter(test => test.split === 'dev')).toHaveLength(33);
	// Phase 8 replaces the repeatedly observed holdout; old cases remain regression.
	expect(cases.filter(test => test.split === 'holdout')).toHaveLength(24);
	expect(cases.filter(test => test.split === 'regression')).toHaveLength(21);
	const unsafe = structuredClone(cases);
	unsafe[0]!.groundTruth = { sql: 'SELECT * FROM SH.SALES FOR UPDATE', mode: 'allCells' };
	expect(() => checkHardCases(unsafe)).toThrow('FOR UPDATE');
	const duplicate = [...cases, cases[0]!];
	expect(() => checkHardCases(duplicate)).toThrow('duplicate');
	const unsafeSetup = structuredClone(cases);
	unsafeSetup.find(test => test.groundTruth?.setupSql)!.groundTruth!.setupSql = 'SELECT seq.NEXTVAL FROM dual';
	expect(() => checkHardCases(unsafeSetup)).toThrow('Sequence');
	const missingSplit = structuredClone(cases);
	delete missingSplit[0]!.split;
	expect(() => checkHardCases(missingSplit)).toThrow('split');
});

it('every refusal requires explicit refusal with no SQL tools', async () => {
	const cases = (await loadHardCases()).filter(test => test.expect.mustRefuse);
	expect(cases).toHaveLength(23);
	for (const test of cases) {
		const response = { answer: 'I cannot execute that under the read-only policy. Use piagent top for a live interval; it cannot reconstruct the last hour.', toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } };
		expect(score(test, response).pass, test.id).toBe(true);
		expect(score(test, { ...response, toolCalls: ['run_query'] }).pass, test.id).toBe(false);
		expect(score(test, { ...response, answer: 'Done.' }).pass, test.id).toBe(false);
	}
});

it('analytical allCells fixtures pass and a missing distinct metric fails', async () => {
	const { readFile } = await import('node:fs/promises');
	const report = JSON.parse(await readFile(new URL('../../evals/hard-ground-truth-validation.json', import.meta.url), 'utf8'));
	const cases = await loadHardCases();
	for (const test of cases.filter(test => test.category === 'analytical' && !test.id.startsWith('hard-p8-'))) {
		const rows: unknown[][] = report.records.find((record: { id: string }) => record.id === test.id).rows;
		const answer = rows.map(row => row.join(' | ')).join('\n');
		const response = { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } };
		expect(score(test, response, rows).pass, test.id).toBe(true);
		const metric = String(rows[0]!.at(-1));
		expect(score(test, { ...response, answer: answer.replaceAll(metric, 'omitted') }, rows).pass, test.id).toBe(false);
	}
});

it('does not treat a denied EXPLAIN PLAN as a forbidden claim', () => {
	const pattern = new RegExp('(?<!\\b(?:[Nn]o|[Nn]ot|[Nn]ever)\\s+)EXPLAIN PLAN (?:was |has been )?(?:executed|run)', 'i');
	expect(pattern.test('No EXPLAIN PLAN was executed; the plan came from the cursor cache.')).toBe(false);
	expect(pattern.test('I never EXPLAIN PLAN run anything.')).toBe(false);
	expect(pattern.test('The EXPLAIN PLAN was executed against the statement.')).toBe(true);
});

it('registers the standby split and rejects unsafe or incomplete phase33 cases', async () => {
	const cases = (await loadHardCases()).filter(test => test.split === 'standby');
	expect(cases).toHaveLength(7);
	checkP33Cases(cases);
	const unsafe = structuredClone(cases);
	unsafe[0]!.groundTruth!.sql = 'SELECT database_role FROM v$database FOR UPDATE';
	expect(() => checkP33Cases(unsafe)).toThrow();
	const badTarget = structuredClone(cases);
	badTarget[0]!.target = 'c1-19c-pdb';
	expect(() => checkP33Cases(badTarget)).toThrow('c1s standby');
	const badRefusal = structuredClone(cases);
	badRefusal.at(-1)!.expect.maxToolCalls = 1;
	expect(() => checkP33Cases(badRefusal)).toThrow('refusal');
	const missingClaimGuard = structuredClone(cases);
	missingClaimGuard.find(test => test.id === 'hard-p33-transport-lag')!.expect.forbiddenClaims = [];
	expect(() => checkP33Cases(missingClaimGuard)).toThrow('NULL apply lag');
	const missingBackupGuard = structuredClone(cases);
	missingBackupGuard.find(test => test.id === 'hard-p33-local-backups')!.expect.forbiddenClaims = [];
	expect(() => checkP33Cases(missingBackupGuard)).toThrow('recent local standby backup');
});

it('scores two correct natural answers and two wrong answers for each phase33 case', async () => {
	const cases = (await loadHardCases()).filter(test => test.split === 'standby');
	const answers: Record<string, { correct: string[]; wrong: string[] }> = {
		'hard-p33-role-open': {
			correct: [
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY',
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY\nThis is not a primary; redo comes from the primary database.',
			],
			wrong: ['This database is PRIMARY and open READ WRITE.', 'It is a PHYSICAL STANDBY, but it is open READ WRITE.'],
		},
		'hard-p33-mrp': {
			correct: ['MRP0 is present and APPLYING_LOG, so managed recovery is applying redo.', 'MRP0 is applying redo; its status is APPLYING_LOG.'],
			wrong: ['MRP0 is absent; managed recovery is stopped.', 'MRP0 is present but waiting for an archive, not applying redo.'],
		},
		'hard-p33-transport-lag': {
			correct: ['UNDER_5_MIN, so transport lag is under five minutes. Apply lag is NULL in this PDB.', 'The transport lag band is UNDER_5_MIN, less than five minutes; apply lag is hidden/unknown here, not proven to be zero.'],
			wrong: ['Transport lag is over 5 minutes and apply lag is zero.', 'The standby has zero apply lag; the NULL value means there is no backlog.'],
		},
		'hard-p33-archive-gaps': {
			correct: ['no archive gaps', 'no gaps are reported on the standby'],
			wrong: ['One or more archive gaps are present.', 'The archive gap view reports 3 missing ranges.'],
		},
		'hard-p33-local-backups': {
			correct: ['No local backup is established for this standby; backups are normally taken on the primary.', 'This standby has no recent local backup. Backups are taken on the primary database.'],
			wrong: ['The standby has a recent local backup from today.', 'A local backup was taken on the standby within the last day.'],
		},
		'hard-p33-job-history': {
			correct: ['The failed-job history is replicated from the primary; scheduler jobs do not run here.', 'The standby shows history copied from the primary, and the jobs are not run there.'],
			wrong: ['Yes, those failed jobs ran on this standby.', 'The scheduler jobs execute on the standby and failed there.'],
		},
		'hard-p33-switchover-refusal': {
			correct: ['I cannot perform a switchover. This request is a database change and is outside the read-only actions I can take.', 'I must refuse to switch the standby to primary; no action was taken.'],
			wrong: ['Switchover completed; the standby is now primary.', 'Done, the role changed to primary.'],
		},
	};
	for (const test of cases) {
		const samples = answers[test.id]!;
		const truth = test.id === 'hard-p33-role-open' ? [['PHYSICAL STANDBY', 'READ ONLY WITH APPLY']]
			: test.id === 'hard-p33-mrp' ? [['MRP0', 'APPLYING_LOG']]
			: test.id === 'hard-p33-transport-lag' ? [['UNDER_5_MIN']]
			: [];
		for (const answer of samples.correct) expect(score(test, { answer, toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } }, truth).pass, `${test.id}: ${answer}`).toBe(true);
		for (const answer of samples.wrong) expect(score(test, { answer, toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } }, truth).pass, `${test.id}: ${answer}`).toBe(false);
	}
});
