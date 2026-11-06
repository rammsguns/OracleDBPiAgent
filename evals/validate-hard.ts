import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { classifySql } from '../src/oracle/sqlPolicy.js';
import { createSessionProvider } from '../src/oracle/index.js';
import type { EvalCase } from './types.js';

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
		if (!['d1-19c-lab', 'p1-19c-prod'].includes(test.target)) throw new Error('Unapproved target');
		if (test.split !== 'dev' && test.split !== 'holdout' && test.split !== 'regression' && test.split !== 'challenge') throw new Error('Missing split');
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
	for (const category of new Set(['analytical', 'diagnosis', 'cached-plan', 'relationships', 'refusal', 'follow-up', 'numeric-precision', 'unit-conversion', 'name-fidelity', 'refusal-follow-ups', 'grant-limited-p1', ...cases.filter(test => test.split !== 'challenge' && !test.id.startsWith('hard-p21-')).map(test => test.category)])) {
		// Phase 20 made the former grant-limited dev case positive; backup regression and archive-log holdout retain coverage.
		if (!(categories.get(category)?.has(category === 'grant-limited-p1' ? 'regression' : 'dev')) || !categories.get(category)?.has('holdout')) throw new Error(`Every category needs dev and holdout: ${category}`);
	}
	const challenge = cases.filter(test => test.split === 'challenge');
	if (challenge.length) {
		const expectedCategories = ['multi-step-diagnosis', 'column-traps', 'false-premises', 'ambiguity', 'multi-turn-dependency', 'wide-exact'];
		if (challenge.filter(test => test.id.startsWith('hard-p11-')).length !== 12 || expectedCategories.some(category => challenge.filter(test => test.id.startsWith('hard-p11-') && test.category === category).length !== 2)) throw new Error('Challenge needs two cases in each of six categories');
		const harder = challenge.filter(test => test.id.startsWith('hard-p11b-'));
		if (harder.length && (harder.length !== 10 || ['sql-semantics', 'long-diagnosis', 'conflicting-evidence', 'partial-grants'].some(category => !harder.some(test => test.category === category)))) throw new Error('Harder challenge needs ten cases covering four categories');
		for (const test of challenge) {
			if (!test.groundTruth || test.groundTruth.mode !== 'rowCells') throw new Error('Challenge needs rowCells truth');
			if (test.category === 'multi-turn-dependency' && !test.turns) throw new Error('Challenge dependency needs turns');
		}
	}
	// Phase 22 moves the two exposed ADR cases to dev; replacements remain blind.
	for (const test of cases.filter(test => test.id.startsWith('hard-p21-'))) {
		const exposed = ['hard-p21-alert-levels', 'hard-p21-problem-identity'].includes(test.id);
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

	const balanced = cases.filter(test => !test.id.startsWith('hard-p21-'));
	const dev = balanced.filter(test => test.split === 'dev').length;
	if (dev / balanced.filter(test => test.split === 'dev' || test.split === 'holdout').length < 0.55 || dev / balanced.filter(test => test.split === 'dev' || test.split === 'holdout').length > 0.72) throw new Error('Expected 55–72% dev (including Phase 5 balanced additions)');
}

/** Fixed required facts must still agree with freshly read dictionary/static data. */
export function checkPinnedFacts(test: EvalCase, rows: unknown[][]): void {
	const count = { 'numeric-precision': 1, 'unit-conversion': 1, 'name-fidelity': test.expect.requiredFacts.length, 'grant-limited-p1': 2 }[test.category];
	if (count === undefined) return;
	const text = rows.flat().join(' | ');
	for (const pattern of test.expect.requiredFacts.slice(0, count)) {
		if (!new RegExp(pattern, 'i').test(text)) throw new Error(`Pinned fact disagrees with ground truth: ${test.id}`);
	}
}

/** Challenge prerequisites fail closed when the intended trap or wide answer disappears. */
export function checkChallengeRows(test: EvalCase, rows: unknown[][]): void {
	if (test.split !== 'challenge') return;
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
	const config = loadConfig();
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
				checkPinnedFacts(test, rows);
				checkChallengeRows(test, rows);
				if (test.category === 'partial-grants') {
					const view = test.id === 'hard-p11b-partial-memory' ? 'V_$SGASTAT' : 'V_$RMAN_BACKUP_JOB_DETAILS';
					await verifyUnavailable(() => session.query(`SELECT * FROM SYS.${view} WHERE ROWNUM=1`));
				}
				if (test.category === 'grant-limited-p1') {
					for (const row of rows) {
						const view = row[0];
						if (test.target !== 'p1-19c-prod' || !['V$PARAMETER', 'V$RMAN_BACKUP_JOB_DETAILS', 'V$ARCHIVED_LOG', 'V$LOG_HISTORY'].includes(String(view)) || row[1] !== 'unavailable') throw new Error(`Invalid grant prerequisite: ${test.id}`);
						await verifyUnavailable(() => session.query(`SELECT * FROM SYS.${String(view).replace('V$', 'V_$')} WHERE ROWNUM=1`));
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
