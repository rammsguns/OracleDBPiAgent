import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { classifySql } from '../src/oracle/sqlPolicy.js';
import { createSessionProvider } from '../src/oracle/index.js';
import type { EvalCase } from './types.js';

const P27_METADATA_SQL = "SELECT n.name, n.class FROM v$statname n JOIN v$sysstat s ON s.statistic# = n.statistic# WHERE n.name IN ('user calls', 'session logical reads', 'physical reads', 'redo size', 'parse count (total)', 'parse count (hard)', 'user commits') ORDER BY n.name";

const P27_SYSSTAT_SQL = "SELECT name, class FROM v$sysstat WHERE name IN ('user calls', 'session logical reads', 'physical reads', 'redo size', 'parse count (total)', 'parse count (hard)', 'user commits') ORDER BY name";

export async function loadHardCases(): Promise<EvalCase[]> {
	const directory = new URL('./cases-hard/', import.meta.url);
	const files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
	const cases: EvalCase[] = [];
	for (const file of files) cases.push(...JSON.parse(await readFile(new URL(file, directory), 'utf8')));
	checkHardCases(cases);
	return cases;
}

/** Fail before any connection if suite shape, scoring expressions or SQL are unsafe. */
export function checkHardCases(cases: EvalCase[]): void {
	if (cases.length < 24) throw new Error('Hard suite needs at least 24 cases');
	const ids = new Set<string>();
	const categories = new Map<string, Set<string>>();
	for (const test of cases) {
		if (!test.id.startsWith('hard-') || ids.has(test.id)) throw new Error('Invalid/duplicate hard ID');
		ids.add(test.id);
		if (!['d1-19c-lab', 'p1-19c-prod'].includes(test.target) && !(test.target === 'c1-19c-pdb' && test.split === 'pdb')) throw new Error('Unapproved target');
		if (test.split !== 'dev' && test.split !== 'holdout' && test.split !== 'regression' && test.split !== 'challenge' && test.split !== 'pdb') throw new Error('Missing split');
		if (Boolean(test.question) === Boolean(test.turns) || (test.turns && (test.turns.length < 2 || test.turns.some(turn => !turn.trim())))) throw new Error('Invalid prompts');
		const splits = categories.get(test.category) ?? new Set<string>();
		splits.add(test.split);
		categories.set(test.category, splits);
		for (const pattern of [...test.expect.requiredFacts, ...test.expect.forbiddenClaims]) new RegExp(pattern, 'i');
		if (test.expect.mustRefuse && (test.groundTruth || test.expect.requiredTools.some(tool => ['run_query', 'explain_plan'].includes(tool)))) throw new Error('Refusal must not execute SQL');
		if (test.groundTruth) {
			if (!['scalar', 'allCells', 'rowCells'].includes(test.groundTruth.mode)) throw new Error('Unknown truth mode');
			classifySql(test.groundTruth.sql);
			if (test.groundTruth.setupSql) {
				classifySql(test.groundTruth.setupSql);
				if (!/^SELECT\s/i.test(test.groundTruth.setupSql) || /;|@|\b(?:DBMS_|UTL_|FOR\s+UPDATE)/i.test(test.groundTruth.setupSql)) throw new Error('Setup must be plain SELECT');
			}
			// Match the independent ground-truth reader's deliberately narrower SELECT policy.
			if (!/^SELECT\s/i.test(test.groundTruth.sql) || /;|@|\b(?:DBMS_|UTL_|FOR\s+UPDATE)/i.test(test.groundTruth.sql)) throw new Error('Truth must be plain SELECT');
		}
		if (test.category === 'analytical' && test.groundTruth?.mode !== 'allCells') throw new Error('Analytical cases need allCells');
	}
	for (const category of new Set(['analytical', 'diagnosis', 'cached-plan', 'relationships', 'refusal', 'follow-up', 'numeric-precision', 'unit-conversion', 'name-fidelity', 'refusal-follow-ups', 'grant-limited-p1', ...cases.filter(test => test.split !== 'challenge' && test.split !== 'pdb' && !test.id.startsWith('hard-p21-')).map(test => test.category)])) {
		// Phase 25 re-premises access gaps to memory views outside the phase 25–27 grants.
		if (!(categories.get(category)?.has(category === 'grant-limited-p1' ? 'regression' : 'dev')) || !categories.get(category)?.has('holdout')) throw new Error(`Every category needs dev and holdout: ${category}`);
	}
	const challenge = cases.filter(test => test.split === 'challenge');
	if (challenge.length) {
		const expectedCategories = ['multi-step-diagnosis', 'column-traps', 'false-premises', 'ambiguity', 'multi-turn-dependency', 'wide-exact'];
		if (challenge.filter(test => test.id.startsWith('hard-p11-')).length !== 12 || expectedCategories.some(category => challenge.filter(test => test.id.startsWith('hard-p11-') && test.category === category).length !== 2)) throw new Error('Challenge needs two cases in each of six categories');
		const harder = challenge.filter(test => test.id.startsWith('hard-p11b-'));
		if (harder.length && (harder.length !== 10 || ['sql-semantics', 'long-diagnosis', 'conflicting-evidence', 'partial-grants'].some(category => !harder.some(test => test.category === category)))) throw new Error('Harder challenge needs ten cases covering four categories');
		for (const test of challenge) {
			if ((test.id.startsWith('hard-p27-') || test.id.startsWith('hard-p30-')) && !test.groundTruth) continue;
			if (!test.groundTruth || test.groundTruth.mode !== 'rowCells') throw new Error('Challenge needs rowCells truth');
			if (test.category === 'multi-turn-dependency' && !test.turns) throw new Error('Challenge dependency needs turns');
		}
	}
	// Phase 22 moves the two exposed ADR cases to dev; replacements remain blind.
	for (const test of cases.filter(test => test.id.startsWith('hard-p21-'))) {
		const exposed = ['hard-p21-alert-levels', 'hard-p21-problem-identity', 'hard-p21-public-directory'].includes(test.id);
		if (test.split !== (exposed ? 'dev' : 'holdout') || !test.groundTruth) throw new Error('Phase 21 requires holdout truth');
	}
	const p23 = cases.filter(test => test.id.startsWith('hard-p23-'));
	if (p23.length) {
		if (p23.length !== 6 || ['d1-19c-lab', 'p1-19c-prod'].some(target => p23.filter(test => test.target === target).length !== 3)) throw new Error('Phase 23 needs six cases, three per target');
		for (const test of p23) {
			if (test.split !== 'challenge' || test.category !== 'sessions' || test.groundTruth?.mode !== 'rowCells') throw new Error('Phase 23 requires challenge rowCells truth');
			if (/\b(?:MODULE|ACTION|CLIENT_INFO|CLIENT_IDENTIFIER|P1TEXT|SQL_TEXT|VALUE_STRING|V\$ACTIVE_SESSION_HISTORY|DBA_HIST_\w*)\b/i.test(test.groundTruth.sql)) throw new Error('Forbidden Phase 23 truth column or view');
		}
	}

	const p24 = cases.filter(test => test.id.startsWith('hard-p24-'));
	if (p24.length) {
		if (p24.length !== 6 || ['d1-19c-lab', 'p1-19c-prod'].some(target => p24.filter(test => test.target === target).length !== 3)) throw new Error('Phase 24 needs six cases, three per target');
		for (const test of p24) {
			if (test.split !== 'challenge' || test.category !== 'space' || test.groundTruth?.mode !== 'rowCells') throw new Error('Phase 24 requires challenge rowCells truth');
			if (/\b(?:DBA_EXTENTS|DBA_HIST_\w*|V\$ACTIVE_SESSION_HISTORY|AWR\w*)\b/i.test(test.groundTruth.sql)) throw new Error('Forbidden Phase 24 truth view');
			if (/\b(?:V\$\w+|DBA_\w+|ALL_\w+|run_query|tablespace_usage)\b/i.test(test.question ?? '')) throw new Error('Phase 24 questions must not name tools or views');
		}
	}

	const pdb = cases.filter(test => test.split === 'pdb' || test.id.startsWith('hard-p31-'));
	if (pdb.length) checkP31Cases(pdb);
	checkRepairedCases(cases);
	const health = cases.filter(test => test.id.startsWith('hard-p30-'));
	if (health.length) checkP30Cases(health);

	const jobs = cases.filter(test => test.id.startsWith('hard-p26-'));
	if (jobs.length) checkP26Cases(jobs);
	const top = cases.filter(test => test.id.startsWith('hard-p27-'));
	if (top.length) checkP27Cases(top);

	const backup = cases.filter(test => test.category === 'backup');
	if (backup.length) checkP25Cases(backup);

	const balanced = cases.filter(test => !test.id.startsWith('hard-p21-'));
	const dev = balanced.filter(test => test.split === 'dev').length;
	if (dev / balanced.filter(test => test.split === 'dev' || test.split === 'holdout').length < 0.55 || dev / balanced.filter(test => test.split === 'dev' || test.split === 'holdout').length > 0.72) throw new Error('Expected 55–72% dev (including Phase 5 balanced additions)');
}

export function checkP26Cases(cases: EvalCase[], liveTruth?: { id: string; target: string; rows: unknown[][] }): void {
	// Explanation facts assume the p1 fixture error; never silently grade a different failure.
	if (liveTruth?.target === 'p1-19c-prod' && liveTruth.id === 'hard-p26-p1-last-failed-job' &&
		(liveTruth.rows.length !== 2 || liveTruth.rows[1]?.[0] !== 'ORA-02292')) throw new Error('p26 p1 failure fixture changed: expected ORA-02292; review requiredFacts');
	if (cases.length !== 4 || new Set(cases.map(test => test.id)).size !== 4) throw new Error('Expected four distinct p26 jobs cases');
	for (const test of cases) {
		if (test.target !== 'p1-19c-prod' || test.category !== 'jobs' || test.split !== 'challenge' || test.groundTruth?.mode !== 'rowCells') throw new Error('p26 requires p1 challenge rowCells truth');
		classifySql(test.groundTruth.sql);
		if (/\b(?:run_query|V\$\w+|DBA_\w+|ALL_\w+)\b/i.test(test.question ?? '')) throw new Error('p26 questions must not name tools or views');
		if (/\b(?:ADDITIONAL_INFO|ERRORS|JOB_ACTION|RUN_COUNT|FAILURE_COUNT)\b/i.test(test.groundTruth.sql)) throw new Error('p26 truth must exclude free text and moving counters');
	}
}

export function checkP25Cases(cases: EvalCase[]): void {
	if (cases.length !== 4 || new Set(cases.map(test => test.id)).size !== 4) throw new Error('Expected four distinct p25 backup cases');
	for (const test of cases) {
		if (test.target !== 'd1-19c-lab' || test.category !== 'backup' || test.split !== 'challenge' || test.groundTruth?.mode !== 'rowCells') throw new Error('p25 backup cases require d1 challenge rowCells truth');
		if (/\b(?:run_query|V\$\w+|DBA_\w+)\b/i.test(test.question ?? '')) throw new Error('p25 questions must not name tools or views');
	}
}

/** Fixed required facts must still agree with freshly read dictionary/static data. */
export function checkPinnedFacts(test: EvalCase, rows: unknown[][]): void {
	const count = { 'numeric-precision': 1, 'unit-conversion': 1, 'name-fidelity': test.expect.requiredFacts.length, 'grant-limited-p1': test.id.startsWith('hard-p25-grant-') ? 1 : 2 }[test.category];
	if (count === undefined) return;
	const text = rows.flat().join(' | ');
	for (const pattern of test.expect.requiredFacts.slice(0, count)) {
		if (!new RegExp(pattern, 'i').test(text)) throw new Error(`Pinned fact disagrees with ground truth: ${test.id}`);
	}
}

/** Challenge prerequisites fail closed when the intended trap or wide answer disappears. */
export function checkChallengeRows(test: EvalCase, rows: unknown[][]): void {
	if (test.split !== 'challenge') return;
	if (test.id === 'hard-p24-d1-redo-layout' && (rows.length !== 3 || rows.some(row => row.length !== 4))) throw new Error('Redo layout requires three groups with four per-group fields');
	if (test.category === 'wide-exact' && (rows.length < 8 || new Set(rows.map(row => String(row[0]))).size !== rows.length)) throw new Error(`Challenge needs at least eight distinct records: ${test.id}`);
	if (test.id === 'hard-p11b-salary-ties' && (rows.length <= 3 || !rows.some((row, i) => rows.some((other, j) => i !== j && row[2] === other[2])))) throw new Error('Salary tie prerequisite changed');
	if (test.id === 'hard-p11b-timestamp-boundary' && !(Number(rows[0]?.[0]) > Number(rows[0]?.[1]))) throw new Error('Date boundary prerequisite changed');
	if (test.id === 'hard-p11b-commission-denominators' && !rows.some(row => Number(row[1]) > Number(row[2]) && Number(row[3]) !== Number(row[4]))) throw new Error('NULL denominator prerequisite changed');
	if (test.id === 'hard-p11b-nullable-manager' && !rows.some(row => row[1] === 0 && row[3] === 'NONE')) throw new Error('Empty department prerequisite changed');
	if (test.id === 'hard-p11b-stats-grain' && !(Number(rows[0]?.[1]) > Number(rows[0]?.[2]))) throw new Error('History grain prerequisite changed');
	if (test.id === 'hard-p11-sales-primary-key' && Number(rows[0]?.[0]) !== 0) throw new Error('SALES primary-key premise changed');
	if (test.id === 'hard-p11-commission-zero' && !(Number(rows[0]?.[0]) > 0 && Number(rows[0]?.[1]) === 0 && Number(rows[0]?.[2]) > 0)) throw new Error('Commission premise changed');
}

/** A missing grant is a prerequisite, not an arbitrary connection/query failure. */
export async function verifyUnavailable(probe: () => Promise<unknown>): Promise<void> {
	try { await probe(); }
	catch (error) {
		if (error && typeof error === 'object' && 'code' in error && ['ORA-00942', 'ORA-01031'].includes(String(error.code))) return;
		throw error;
	}
	throw new Error('Expected inaccessible view is now readable; review grant-limited case');
}

export async function validateHardCases(input?: EvalCase[]) {
	const cases = input ?? await loadHardCases();
	checkHardCases(cases);
	const config = loadConfig({ ...process.env, PIAGENT_TARGETS_FILE: fileURLToPath(new URL('../config/targets.json', import.meta.url)) });
	const records = [];
	const skipped: { id: string; reason: string }[] = [];
	const sessions = createSessionProvider(config);
	try {
		for (const test of cases) {
			if (!test.groundTruth) continue;
			const session = await sessions.get(test.target);
			try {
				if (test.groundTruth.setupSql) await session.query(test.groundTruth.setupSql, {}, { maxRows: 1 });
				const result = await session.query(test.groundTruth.sql, {}, { maxRows: 100 });
				const rows = result.rows;
				if (!rows.length && test.skipWhenTruthEmpty) {
					skipped.push({ id: test.id, reason: 'Empty truth permitted by skipWhenTruthEmpty' });
					continue;
				}
				if (!rows.length || rows.length >= 100 || result.truncated || rows.some(row => row.some(cell => cell == null))) throw new Error(`Empty, null or possibly truncated truth: ${test.id}`);
				if (test.id.startsWith('hard-p30-')) checkP30Cases(cases.filter(candidate => candidate.id.startsWith('hard-p30-')), { id: test.id, rows });
				checkPinnedFacts(test, rows);
				checkChallengeRows(test, rows);
				if (test.id.startsWith('hard-p26-')) checkP26Cases(cases.filter(candidate => candidate.id.startsWith('hard-p26-')), { id: test.id, target: test.target, rows });
				if (test.category === 'partial-grants') {
					const view = test.id === 'hard-p11b-partial-memory' ? 'V_$SGASTAT' : 'V_$SGA_DYNAMIC_COMPONENTS';
					await verifyUnavailable(() => session.query(`SELECT * FROM SYS.${view} WHERE ROWNUM=1`));
				}
				if (test.category === 'grant-limited-p1') {
					for (const row of rows) {
						const view = row[0];
						if (test.target !== 'p1-19c-prod' || !['V$SGASTAT', 'V$SGA_DYNAMIC_COMPONENTS'].includes(String(view)) || (test.id.startsWith('hard-p25-grant-') ? row.length !== 1 : row[1] !== 'unavailable')) throw new Error(`Invalid grant prerequisite: ${test.id}`);
						for (const accepted of test.id === 'hard-p25-grant-component-inventory' ? ['V$SGA_DYNAMIC_COMPONENTS', 'V$MEMORY_DYNAMIC_COMPONENTS'] : [String(view)]) await verifyUnavailable(() => session.query(`SELECT * FROM SYS.${accepted.replace('V$', 'V_$')} WHERE ROWNUM=1`));
					}
				}
				records.push({ id: test.id, target: test.target, sql: test.groundTruth.sql, mode: test.groundTruth.mode, rowCount: rows.length, rows });
			} finally { await session.close(); }
		}
	} finally { await sessions.closeAll(); }
	return { validatedAt: new Date().toISOString(), caseCount: cases.length, records, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateHardCases();
	await writeFile(new URL('./hard-ground-truth-validation.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(`Validated ${report.records.length} ground-truth queries for ${report.caseCount} hard cases; row counts recorded.`);
}

/** p27 truth is dictionary metadata or supplied examples, never volatile load. */
export function checkP27Cases(cases: EvalCase[]): void {
	if (cases.length !== 10 || new Set(cases.map(test => test.id)).size !== 10) throw new Error('Expected ten distinct p27 cases');
	if (cases.filter(test => test.expect.mustRefuse).length !== 4 || cases.filter(test => test.groundTruth).length !== 2) throw new Error('p27 requires four refusals and two metadata queries');
	for (const test of cases) {
		if (!test.groundTruth && test.expect.maxToolCalls !== 0) throw new Error('p27 supplied examples and refusals must not call tools');
		if (test.split !== 'challenge' || test.category !== 'top') throw new Error('p27 requires top challenge cases');
		if (test.groundTruth && (test.groundTruth.mode !== 'rowCells' || test.groundTruth.sql !== (test.target === 'd1-19c-lab' ? P27_METADATA_SQL : P27_SYSSTAT_SQL))) throw new Error('p27 truth must read only statistic names and classes');
		if (test.expect.mustRefuse && !test.expect.requiredFacts.includes('piagent\\s+top')) throw new Error('p27 refusals must offer piagent top');
	}
}

/** Phase 29: login identity survives CURRENT_SCHEMA; stable truth must not silently skip. */
export function checkRepairedCases(cases: EvalCase[]): void {
	for (const test of cases) {
		if (test.id.startsWith('hard-p19-') || ['hard-orders-plan', 'hard-lines-plan', 'hard-price-plan'].includes(test.id)) {
			const sql = test.groundTruth?.sql ?? '';
			if (['hard-orders-plan', 'hard-lines-plan'].includes(test.id)) {
				const table = test.id === 'hard-orders-plan' ? 'ORDERS' : 'ORDER_LINES';
				const seed = `SELECT /* piagent_eval_plan_${table.toLowerCase()} */ COUNT(*) FROM SHOPAPP.${table}`;
				if (test.groundTruth?.setupSql !== seed || !sql.includes(`s.sql_text='${seed}'`) || !sql.includes(`WHERE parsing_schema_name='SHOPAPP' AND parsing_user_id=(SELECT user_id FROM all_users WHERE username='HARNESS_RO') AND command_type=3 AND sql_text='${seed}'`)) throw new Error('Plan truth requires exact isolated evaluator seed');
			} else if (!sql.includes("parsing_user_id=(SELECT user_id FROM all_users WHERE username='SHOPAPP')") || test.groundTruth?.setupSql) throw new Error('Workload truth must filter parsing login without seeding diagnostic cursors');
			if (test.id === 'hard-p19-object-statistics' && (/TO_CHAR|last_analyzed_utc/i.test(sql) || !sql.includes("'MISSING' ELSE 'PRESENT'"))) throw new Error('Statistics truth must tolerate nightly collection timestamps');
		}
		if (['hard-p21-public-directory', 'hard-p21-schema-directory-grants', 'hard-p25-grant-component-inventory', 'hard-p25-grant-pool-inventory'].includes(test.id)) {
			if ((!test.id.startsWith('hard-p25-grant-') && test.skipWhenTruthEmpty) || !test.groundTruth) throw new Error('Repaired dictionary premises must fail closed');
			const exposed = ['hard-p21-public-directory', 'hard-p25-grant-component-inventory'].includes(test.id);
			if (test.split !== (exposed ? 'dev' : 'holdout')) throw new Error('Exposed cases move to dev; replacements stay blind holdout');
			if (!exposed && /\b(?:run_query|V\$\w+|DBA_\w+|ALL_\w+)\b/i.test(test.question ?? '')) throw new Error('Blind replacement questions must not name tools or views');
		}
	}
}

/** Health questions choose their own tools; live prerequisites fail closed. */
export function checkP30Cases(cases: EvalCase[], liveTruth?: { id: string; rows: unknown[][] }): void {
	if (cases.length !== 8 || new Set(cases.map(test => test.id)).size !== 8 || cases.filter(test => test.expect.mustRefuse).length !== 1) throw new Error('p30 requires eight distinct cases and one refusal');
	if (['d1-19c-lab', 'p1-19c-prod'].some(target => cases.filter(test => test.target === target).length !== 4)) throw new Error('p30 needs four cases per lab');
	for (const test of cases) {
		if (test.category !== 'check' || test.split !== 'challenge' || !test.question || test.skipWhenTruthEmpty) throw new Error('p30 requires stable challenge health questions');
		if (/\b(?:health_check|run_query|piagent\s+check|V\$\w+|DBA_\w+|ALL_\w+)\b/i.test(test.question) || test.expect.requiredTools.length) throw new Error('p30 must leave tool choice open');
		if (test.expect.mustRefuse) {
			if (test.groundTruth || test.expect.maxToolCalls !== 0) throw new Error('p30 refusal must make no calls');
		} else {
			if (!test.groundTruth || test.groundTruth.mode !== 'rowCells' || test.groundTruth.setupSql) throw new Error('p30 requires read-only rowCells truth without setup');
			classifySql(test.groundTruth.sql);
			if (/\b(?:DBA_HIST_\w*|V\$ACTIVE_SESSION_HISTORY|PASSWORD|SPARE4|ADDITIONAL_INFO|JOB_ACTION)\b/i.test(test.groundTruth.sql)) throw new Error('p30 truth must exclude secrets, free text and pack views');
		}
	}
	if (liveTruth?.id === 'hard-p30-p1-archive-gap' && (liveTruth.rows.length !== 1 || liveTruth.rows[0]?.[0] !== 'NOARCHIVELOG')) throw new Error('p30 archive premise changed; review applicability facts');
	if (liveTruth?.id === 'hard-p30-p1-recovery-config' && (liveTruth.rows.length !== 1 || liveTruth.rows[0]?.[0] !== 'UNCONFIGURED')) throw new Error('p30 recovery premise changed; review limitation facts');
	if (liveTruth?.id === 'hard-p30-d1-default-password-drivers' && !liveTruth.rows.length) throw new Error('p30 default-password driver premise disappeared');
}

export function checkP31Cases(cases: EvalCase[]): void {
	if (cases.length !== 11 || cases.filter(test => test.expect.mustRefuse).length !== 1) throw new Error('p31 requires eleven PDB cases with one refusal');
	const health = cases.find(test => test.id === 'hard-p31-health');
	if (!health?.groundTruth || health.expect.requiredFacts.length < 2 || !health.expect.forbiddenClaims.length) throw new Error('p31 requires guarded broad health truth');
	for (const test of cases) {
		if (test.split !== 'pdb' || test.target !== 'c1-19c-pdb' || !test.id.startsWith('hard-p31-') || test.skipWhenTruthEmpty) throw new Error('p31 requires stable c1 pdb cases');
		if (test.expect.mustRefuse) {
			if (test.groundTruth || test.expect.maxToolCalls !== 0) throw new Error('p31 refusal must execute nothing');
		} else {
			if (!test.groundTruth || test.groundTruth.mode !== 'rowCells' || test.groundTruth.setupSql) throw new Error('p31 requires rowCells truth');
			classifySql(test.groundTruth.sql);
			if (!/^SELECT\s/i.test(test.groundTruth.sql) || /;|@|\b(?:DBMS_|UTL_|FOR\s+UPDATE|password)\b/i.test(test.groundTruth.sql)) throw new Error('p31 truth must be plain SELECT');
		}
	}
}
