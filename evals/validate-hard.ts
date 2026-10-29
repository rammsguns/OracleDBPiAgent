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
		if (test.split !== 'dev' && test.split !== 'holdout') throw new Error('Missing split');
		if (Boolean(test.question) === Boolean(test.turns) || (test.turns && (test.turns.length < 2 || test.turns.some(turn => !turn.trim())))) throw new Error('Invalid prompts');
		const splits = categories.get(test.category) ?? new Set<string>();
		splits.add(test.split);
		categories.set(test.category, splits);
		for (const pattern of [...test.expect.requiredFacts, ...test.expect.forbiddenClaims]) new RegExp(pattern, 'i');
		if (test.expect.mustRefuse && (test.groundTruth || test.expect.requiredTools.some(tool => ['run_query', 'explain_plan'].includes(tool)))) throw new Error('Refusal must not execute SQL');
		if (test.groundTruth) {
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
	for (const category of ['analytical', 'diagnosis', 'cached-plan', 'relationships', 'refusal', 'follow-up']) {
		if (categories.get(category)?.size !== 2) throw new Error('Every category needs both splits');
	}
	const dev = cases.filter(test => test.split === 'dev').length;
	if (dev / cases.length < 0.55 || dev / cases.length > 0.72) throw new Error('Expected 55–72% dev (including Phase 5 balanced additions)');
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
	const sessions = createSessionProvider(config);
	try {
		for (const test of cases) {
			if (!test.groundTruth) continue;
			const session = await sessions.get(test.target);
			try {
				if (test.groundTruth.setupSql) await session.query(test.groundTruth.setupSql, {}, { maxRows: 1 });
				const result = await session.query(test.groundTruth.sql, {}, { maxRows: 100 });
				const rows = result.rows;
				if (!rows.length || rows.length >= 100 || result.truncated || rows.some(row => row.some(cell => cell == null))) throw new Error(`Empty, null or possibly truncated truth: ${test.id}`);
				checkPinnedFacts(test, rows);
				if (test.category === 'grant-limited-p1') {
					const view = rows[0]?.[0];
					if (test.target !== 'p1-19c-prod' || !['V$PARAMETER', 'V$RMAN_BACKUP_JOB_DETAILS'].includes(String(view)) || rows[0]?.[1] !== 'unavailable') throw new Error(`Invalid grant prerequisite: ${test.id}`);
					await verifyUnavailable(() => session.query(`SELECT * FROM SYS.${String(view).replace('V$', 'V_$')} WHERE ROWNUM=1`));
				}
				records.push({ id: test.id, target: test.target, sql: test.groundTruth.sql, mode: test.groundTruth.mode, rowCount: rows.length, rows });
			} finally { await session.close(); }
		}
	} finally { await sessions.closeAll(); }
	return { validatedAt: new Date().toISOString(), caseCount: cases.length, records };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateHardCases();
	await writeFile(new URL('./hard-ground-truth-validation.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(`Validated ${report.records.length} ground-truth queries for ${report.caseCount} hard cases; row counts recorded.`);
}
