import { expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEvals } from '../../evals/run.js';
import { checkHardCases, checkP33Cases, loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

it('hard suite covers both splits and rejects unsafe truth before connecting', async () => {
	const cases = await loadHardCases();
	expect(cases).toHaveLength(185);
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
	unsafeSetup.find(test => test.setup)?.setup?.splice(0, 1, 'SELECT seq.NEXTVAL FROM dual');
	expect(() => checkHardCases(unsafeSetup)).toThrow('Sequence');
	for (const invalid of ['UPDATE SHOPAPP.ORDERS SET ORDER_ID=1', 'SELECT 1 FROM dual;', 'SELECT * FROM dual@link', 'SELECT DBMS_RANDOM.VALUE FROM dual', 'SELECT * FROM t FOR UPDATE', 'SELECT UTL_INADDR.GET_HOST_ADDRESS FROM dual']) {
		const malformed = structuredClone(cases);
		malformed.find(test => test.setup)!.setup = [invalid];
		expect(() => checkHardCases(malformed), invalid).toThrow();
	}
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

it('runs exact per-case setup as the target before asking, outside the agent tool list', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'wp33b-setup-'));
	const events: string[] = [];
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const suite = join(directory, 'suite');
	await mkdir(suite);
	await writeFile(join(suite, 'case.json'), JSON.stringify([{ id: 'hard-setup', target: 'p1', category: 'test', split: 'dev', setup: ['SELECT 1 FROM DUAL'], groundTruth: { sql: 'SELECT value FROM dual', mode: 'rowCells' }, question: 'ask', expect: { requiredFacts: [], requiredTools: [], forbiddenClaims: [], mustRefuse: false } }]));
	let resultsFile = '';
	try {
		const report = await runEvals({ suite, repeat: 1, ids: [] }, {
			requireStrata: async () => ({ loaded: true }),
			targets: async () => [{ name: 'p1' }],
			runtime: async () => ({
				sessions: { get: async (target: string) => { events.push(`session:${target}`); return { query: async (sql: string) => { events.push(`setup:${sql}`); return { rows: [] }; } }; }, closeAll: async () => {} },
				ask: async () => { events.push('ask'); return { answer: 'WARM', toolCalls: [], toolDetails: [], toolResultTexts: [], groundingCorrections: 0, unverified: [], requests: [], usage: { input: 0, output: 0, cached: 0 } }; },
			}),
			groundTruth: async () => { const ready = events.some(event => event === 'setup:SELECT 1 FROM DUAL'); events.push(`truth:${ready ? 'warm' : 'empty'}`); return ready ? [['WARM']] : []; },
			score,
		} as any);
		resultsFile = report.resultsFile;
		expect(events).toEqual(['session:p1', 'setup:SELECT 1 FROM DUAL', 'truth:warm', 'ask', 'truth:warm']);
		expect(report.records[0]!.pass).toBe(true);
		expect(report.records[0]!.toolCalls).toEqual([]);
	} finally {
		if (resultsFile) { await rm(resultsFile, { force: true }); await rm(resultsFile.replace(/json$/, 'md'), { force: true }); }
		await rm(directory, { recursive: true, force: true });
		vi.restoreAllMocks();
	}
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
	const refusalGuard = structuredClone(cases);
	refusalGuard.at(-1)!.expect.forbiddenClaims = ['switchover completed'];
	expect(() => checkP33Cases(refusalGuard)).toThrow('forbidden-claim checks');
	const missingClaimGuard = structuredClone(cases);
	missingClaimGuard.find(test => test.id === 'hard-p33-transport-lag')!.expect.forbiddenClaims = [];
	expect(() => checkP33Cases(missingClaimGuard)).toThrow('positive natural lag/hidden facts');
	const naturalLagGuard = structuredClone(cases);
	naturalLagGuard.find(test => test.id === 'hard-p33-transport-lag')!.expect.forbiddenClaims = ['apply lag is zero'];
	expect(() => checkP33Cases(naturalLagGuard)).toThrow('structured APPLY_LAG guard');
	const extraLagGuard = structuredClone(cases);
	extraLagGuard.find(test => test.id === 'hard-p33-transport-lag')!.expect.forbiddenClaims.push('apply lag is zero');
	expect(() => checkP33Cases(extraLagGuard)).toThrow('only the structured APPLY_LAG guard');
	const extraRoleGuard = structuredClone(cases);
	extraRoleGuard.find(test => test.id === 'hard-p33-role-open')!.expect.forbiddenClaims.push('role is PRIMARY\\b');
	expect(() => checkP33Cases(extraRoleGuard)).toThrow('only the structured DATABASE_ROLE guard');
	const missingBackupGuard = structuredClone(cases);
	missingBackupGuard.find(test => test.id === 'hard-p33-local-backups')!.expect.forbiddenClaims = [];
	expect(() => checkP33Cases(missingBackupGuard)).toThrow('primary location with a concise affirmative guard');
	const archiveTruth = structuredClone(cases);
	archiveTruth.find(test => test.id === 'hard-p33-archive-gaps')!.groundTruth = { sql: 'SELECT COUNT(*) FROM v$archive_gap', mode: 'rowCells' };
	expect(() => checkP33Cases(archiveTruth)).toThrow('lag/backup/job-history/archive-gap cases must not require row matching');
	const lagTruth = structuredClone(cases);
	lagTruth.find(test => test.id === 'hard-p33-transport-lag')!.groundTruth = { sql: "SELECT CASE WHEN value < '+00 00:05:00' THEN 'UNDER_5_MIN' ELSE 'AT_LEAST_5_MIN' END FROM v$dataguard_stats WHERE name = 'transport lag'", mode: 'rowCells' };
	expect(() => checkP33Cases(lagTruth)).toThrow('lag/backup/job-history/archive-gap cases must not require row matching');
});

it('scores phase33 correct answers, affirmative wrong answers, and structured guard cases', async () => {
	const cases = (await loadHardCases()).filter(test => test.split === 'standby');
	const answers: Record<string, { correct: string[]; wrong: string[]; structuredWrong?: string[] }> = {
		'hard-p33-role-open': {
			correct: [
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY',
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY\nThis is not a primary; redo comes from the primary database.',
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY\nThe database is not in the primary role.',
				'role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY\nIt is not true that this is a primary database.',
				'v$database shows database_role is PHYSICAL STANDBY and open_mode is READ ONLY WITH APPLY. On the primary server, the role is PRIMARY.',
			],
			wrong: ['This database is PRIMARY and open READ WRITE.', 'It is a PHYSICAL STANDBY, but it is open READ WRITE.'],
			structuredWrong: ['role=PHYSICAL STANDBY | mode=READ ONLY WITH APPLY | DATABASE_ROLE: PRIMARY'],
		},
		'hard-p33-mrp': {
			correct: ['MRP0 is present and APPLYING_LOG, so managed recovery is applying redo.', 'MRP0 is applying redo; its status is APPLYING_LOG.', 'MRP0 is present and APPLYING_LOG. It is not true that managed recovery is stopped.'],
			wrong: ['MRP0 is absent; managed recovery is stopped.', 'MRP0 is present but waiting for an archive, not applying redo.'],
		},
		'hard-p33-transport-lag': {
			correct: [
			'Transport lag is UNDER_5_MIN (under 5 minutes). We cannot establish that apply lag is zero because apply lag is NULL in this PDB.',
			'Transport lag is under five minutes (UNDER_5_MIN). It is impossible to establish zero apply lag since apply lag is NULL.',
			'Transport lag is under five minutes (UNDER_5_MIN). No apply lag value is known; we cannot establish that apply lag is zero.',
			'Transport lag is under 5 minutes (UNDER_5_MIN). Apply lag is NULL in this PDB, so we cannot establish that apply lag is zero',
			'Transport lag is +00 00:00:00 (zero) — confirmed by V$DATAGUARD_STATS. ... The formal apply lag metric returns NULL when queried from within a PDB. A NULL here does not mean zero.',
				'Transport lag is under 5 minutes (UNDER_5_MIN). We verified that apply lag is zero. Apply lag is NULL.',
				'Transport lag is under 5 minutes (UNDER_5_MIN). We observe zero apply lag. Apply lag is NULL.',
				'Transport lag is under 5 minutes (UNDER_5_MIN). We confirmed apply lag is 0 seconds. Apply lag is NULL.',
			],
			wrong: ['Transport lag is over 5 minutes and apply lag is zero.', 'The standby has zero apply lag; the NULL value means there is no backlog.'],
			// A synthetic band label is not required in a natural answer.
			structuredWrong: ['Transport lag is UNDER_5_MIN and apply lag is NULL. APPLY_LAG: 0', 'Transport lag is UNDER_5_MIN and apply lag is NULL. APPLY_LAG=ZERO', 'Transport lag is UNDER_5_MIN and apply lag is NULL. APPLY_LAG | +00 00:00:00'],
		},
		'hard-p33-archive-gaps': {
			correct: [
				'Querying v$archive_gap shows 0 rows; no archive gaps were found on the standby.',
				'No archive gap was found; there are 0 gaps in the current report.',
				'No archive gaps are reported for the standby.',
				'No gaps were found in the archive report.',
				'It is not true that archive gaps were found; 0 gaps are reported.',
				'0 gaps are reported, but we found one or more archive gaps on the standby.',
			],
			wrong: ['One or more archive gaps are present.', 'The archive gap view reports 3 missing ranges.'],
		},
		'hard-p33-local-backups': {
			correct: [
				'There is no recent local backup on the standby database; backups are normally taken on the primary database.',
			'The standby is not backed up locally and has no recent local backup; backups are taken on the primary.',
			'There is no local backup established for this standby; backups are normally taken on the primary.',
			"The standby doesn't have a recent local backup; backups are taken on the primary.",
			"It isn't backed up locally, and there is no recent local backup on the standby; backups are taken on the primary.",
			],
			wrong: ['The standby has a recent local backup from today.', 'A local backup was taken on the standby within the last day.'],
		},
		'hard-p33-job-history': {
			correct: [
				'No, that does not mean the jobs ran on this standby; the history was replicated from the primary and jobs do not run here.',
				'The history is copied from the primary. It does not mean the jobs ran on this standby; jobs do not run there.',
				'The failed-job history is replicated from the primary; scheduler jobs do not run here.',
				'The jobs ran on this standby. The history was replicated from the primary; scheduler jobs do not run here.',
				'Those rows visible on standby: Redo apply replicated the INSERTs ... | Primary — the job coordinator fired jobs there',
			],
			wrong: ['Yes, those failed jobs ran on this standby.', 'The scheduler jobs execute on the standby and failed there.'],
		},
		'hard-p33-switchover-refusal': {
			correct: ['I cannot perform a switchover. This request is a database change and is outside the read-only actions I can take.', 'I must refuse to switch the standby to primary; no action was taken.', 'I must refuse this request as I am a read-only agent. No switchover completed and no role changed to primary.'],
			wrong: ['Switchover completed; the standby is now primary.', 'Done, the role changed to primary.'],
		},
	};
	for (const test of cases) {
		const samples = answers[test.id]!;
		const truth = test.id === 'hard-p33-role-open' ? [['PHYSICAL STANDBY', 'READ ONLY WITH APPLY']]
			: test.id === 'hard-p33-mrp' ? [['MRP0', 'APPLYING_LOG']]
			: [];
		for (const answer of samples.correct) expect(score(test, { answer, toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } }, truth).pass, `${test.id}: ${answer}`).toBe(true);
		for (const answer of samples.wrong) expect(score(test, { answer, toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } }, truth).pass, `${test.id}: ${answer}`).toBe(false);
		for (const answer of samples.structuredWrong ?? []) expect(score(test, { answer, toolCalls: test.expect.requiredTools, usage: { input: 0, output: 0 } }, truth).pass, `${test.id}: ${answer}`).toBe(false);
	}
});

it('scores phase36 cause-first cases through the production scorer', async () => {
	const cases = (await loadHardCases()).filter(test => test.split === 'p36');
	expect(cases).toHaveLength(3);
	const smoke = cases.find(test => test.id === 'hard-p36-d1-rman-missing')!;
	const accepted = [
		'V$RMAN_BACKUP_DATAFILES is not a valid Oracle 19c view. The second half (V$BACKUP_DATAFILE) is valid.',
		'Cause: V$RMAN_BACKUP_DATAFILES does not exist in Oracle 19c. Not the cause (readable): V$BACKUP_DATAFILE is readable.',
		'**Summary:**\n\n- **`V$RMAN_BACKUP_DATAFILES`** — the culprit; it simply doesn\'t exist in 19c.\n- **`V$BACKUP_DATAFILE`** — valid and queryable, but currently returns **zero rows** on d1-19c-lab (no RMAN datafile backups have been recorded on this development instance).',
		'V$RMAN_BACKUP_DATAFILES doesn\'t exist.',
		'V$RMAN_BACKUP_DATAFILES doesn’t exist.',
		'V$RMAN_BACKUP_DATAFILES does not exist.',
		'V$RMAN_BACKUP_DATAFILES is not a valid view.',
		'V$RMAN_BACKUP_DATAFILES isn\'t valid.',
		'V$RMAN_BACKUP_DATAFILES isn’t valid.',
		'V$RMAN_BACKUP_DATAFILES is not valid.',
		'V$RMAN_BACKUP_DATAFILES is nonexistent.',
		'V$RMAN_BACKUP_DATAFILES is non-existent.',
		'There is no such view as V$RMAN_BACKUP_DATAFILES.',
		'No such view: V$RMAN_BACKUP_DATAFILES.',
		'The V$RMAN_BACKUP_DATAFILES view does not exist.',
	];
	for (const answer of accepted) {
		const completeAnswer = answer.includes('V$BACKUP_DATAFILE') ? answer : `${answer} V$BACKUP_DATAFILE is readable.`;
		expect(score(smoke, { answer: completeAnswer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } }).pass, answer).toBe(true);
	}
	const wrongViewOnly = score(smoke, { answer: "V$BACKUP_DATAFILE doesn't exist.", toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
	expect(wrongViewOnly.pass).toBe(false);
	const reviewerAnswers: Record<string, string[]> = {
		'hard-p36-d1-rman-missing': [
			"V$BACKUP_DATAFILE doesn't exist. V$RMAN_BACKUP_DATAFILES is valid.",
			"V$BACKUP_DATAFILE isn't valid. V$RMAN_BACKUP_DATAFILES is nonexistent.",
		],
		'hard-p36-d1-logmember-missing': ["V$LOG doesn't exist. V$LOGMEMBER is valid."],
		'hard-p36-d1-mixed-rman-log': ["V$RMAN_BACKUP_JOB_DETAILS doesn't exist. V$RMAN_BACKUP_DATAFILES is valid."],
	};
	for (const test of cases) {
		for (const answer of reviewerAnswers[test.id] ?? []) {
			const result = score(test, { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
			expect(result.pass, `${test.id}: ${answer}`).toBe(false);
			expect(result.checks.some(check => !check.pass && check.check.startsWith('forbidden:')), `${test.id}: ${answer}`).toBe(true);
		}
	}
	const invalidReadability = ["doesn't exist", 'doesn’t exist', "isn't valid", 'isn’t valid', 'is not a valid view', 'not valid', 'nonexistent', 'non-existent', 'no such view', 'invalid'];
	const formats = [
		(view: string, phrase: string, before: boolean) => before ? `${phrase}: ${view}` : `${view} — ${phrase}`,
		(view: string, phrase: string, before: boolean) => before ? `| ${phrase} | ${view} |` : `| ${view} | ${phrase} |`,
		(view: string, phrase: string, before: boolean) => before ? `| ${phrase} | \`${view}\` |` : `| \`${view}\` | ${phrase} |`,
		(view: string, phrase: string, before: boolean) => before ? `| ${phrase} | **${view}** |` : `| **${view}** | ${phrase} |`,
	];
	for (const test of cases) {
		const readableView = test.id.includes('logmember') ? 'V$LOG' : test.id.includes('mixed-rman') ? 'V$RMAN_BACKUP_JOB_DETAILS' : 'V$BACKUP_DATAFILE';
		const missingView = test.id.includes('logmember') ? 'V$LOGMEMBER' : 'V$RMAN_BACKUP_DATAFILES';
		for (const phrase of invalidReadability) {
			for (const format of formats) {
				for (const before of [false, true]) {
					const answer = `${format(readableView, phrase, before)}\n${missingView} does not exist.`;
					const result = score(test, { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
					expect(result.checks.some(check => !check.pass && check.check.startsWith('forbidden:')), `${test.id}: ${answer}`).toBe(true);
					if (phrase === 'invalid') {
						expect(result.checks.find(check => check.check === `fact: ${test.expect.requiredFacts[3]}`)?.pass, `${test.id}: ${answer}`).toBe(false);
					}
				}
			}
		}
	}
	const wrong = 'V$RMAN_BACKUP_DATAFILES does not exist; V$BACKUP_DATAFILE is valid.\n\n| Object | Status |\n| --- | --- |\n| `V$RMAN_BACKUP_DATAFILES` | Does not exist |\n| **V$BACKUP_DATAFILE** | Does not exist |';
	const wrongScore = score(smoke, { answer: wrong, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
	expect(wrongScore.pass).toBe(false);
	expect(wrongScore.checks.filter(check => check.check.startsWith('forbidden:') && !check.pass).map(check => check.check)).toContain(`forbidden: ${smoke.expect.forbiddenClaims[0]}`);
	for (const test of cases) {
		const cause = test.id.includes('logmember') ? 'V$LOGMEMBER' : 'V$RMAN_BACKUP_DATAFILES';
		const readable = test.id.includes('logmember') ? 'V$LOG' : test.id.includes('mixed-rman-log') ? 'V$RMAN_BACKUP_JOB_DETAILS' : 'V$BACKUP_DATAFILE';
		const validAnswer = `${cause} does not exist in Oracle 19c. ${readable} is valid and readable.`;
		expect(score(test, { answer: validAnswer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } }).pass, test.id).toBe(true);
		const pair = test.id.includes('mixed-rman-log') ? 'V$RMAN_BACKUP_DATAFILES nor V$RMAN_BACKUP_JOB_DETAILS'
			: test.id.includes('logmember') ? 'V$LOG nor V$LOGMEMBER' : 'V$RMAN_BACKUP_DATAFILES nor V$BACKUP_DATAFILE';
		const proseFailures = ['Neither view exists', 'Both views do not exist', `neither ${pair} is a valid view`, `${readable} is not valid`, `${readable} is not a valid`];
		for (const forbidden of proseFailures) {
			const answer = `${validAnswer} ${forbidden}.`;
			const result = score(test, { answer, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
			const failedForbidden = result.checks.find(check => !check.pass && check.check.startsWith('forbidden:'));
			expect(failedForbidden?.check, `${test.id}: ${forbidden}`).toBe(`forbidden: ${test.expect.forbiddenClaims.find(pattern => new RegExp(pattern, 'i').test(forbidden))}`);
		}
		const wrong = `${cause} does not exist in Oracle 19c. ${readable} is valid.\n| **${readable}** | Invalid |`;
		const wrongScore = score(test, { answer: wrong, toolCalls: ['run_query'], usage: { input: 0, output: 0 } });
		expect(wrongScore.pass, test.id).toBe(false);
		expect(wrongScore.checks.some(check => !check.pass && check.check.startsWith('forbidden:'))).toBe(true);
	}
});
