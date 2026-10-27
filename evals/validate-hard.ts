import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { classifySql } from '../src/oracle/sqlPolicy.js';
import { groundTruth } from './ground-truth.js';
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
	if (dev / cases.length < 0.6 || dev / cases.length > 0.72) throw new Error('Expected about 2:1 dev:holdout');
}

export async function validateHardCases(input?: EvalCase[]) {
	const cases = input ?? await loadHardCases();
	checkHardCases(cases);
	const config = loadConfig();
	const records = [];
	for (const test of cases) {
		if (!test.groundTruth) continue;
		const target = config.targets.find(target => target.name === test.target)!;
		const rows = await groundTruth(target, test.groundTruth.sql, test.groundTruth.setupSql);
		if (!rows.length || rows.length >= 100 || rows.some(row => row.some(cell => cell == null))) throw new Error(`Empty, null or possibly truncated truth: ${test.id}`);
		records.push({ id: test.id, target: test.target, sql: test.groundTruth.sql, mode: test.groundTruth.mode, rowCount: rows.length, rows });
	}
	return { validatedAt: new Date().toISOString(), caseCount: cases.length, records };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await validateHardCases();
	await writeFile(new URL('./hard-ground-truth-validation.json', import.meta.url), JSON.stringify(report, null, '\t') + '\n');
	console.log(`Validated ${report.records.length} ground-truth queries for ${report.caseCount} hard cases; row counts recorded.`);
}
