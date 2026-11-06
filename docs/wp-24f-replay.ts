/** Offline archive replay. Run from repository root: node_modules/.bin/tsx docs/wp-24f-replay.ts */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { score } from '../evals/scoring.js';
import type { EvalCase, AskResult } from '../evals/types.js';
const base = 'fda1a2feabc058618ac0d9fc9477db82d168fb42';
const original = execFileSync('git', ['show', `${base}:evals/scoring.ts`], { encoding: 'utf8' });
const directory = await mkdtemp(join(tmpdir(), 'wp24f-replay-'));
type Check = { check: string; pass: boolean };
type Record = AskResult & { id: string; iteration?: number; checks: Check[]; pass?: boolean };
try {
	const modulePath = join(directory, 'scoring-before.ts');
	await writeFile(modulePath, original);
	const { score: beforeScore } = await import(pathToFileURL(modulePath).href);
	const beforeCases = new Map<string, EvalCase>(), afterCases = new Map<string, EvalCase>();
	for (const file of execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'evals/cases', 'evals/cases-hard'], { encoding: 'utf8' }).trim().split('\n')) {
		if (!file.endsWith('.json')) continue;
		for (const test of JSON.parse(execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }))) beforeCases.set(test.id, test);
		for (const test of JSON.parse(await readFile(file, 'utf8'))) afterCases.set(test.id, test);
	}
	const flips: unknown[] = [], checkFlips: unknown[] = [], gate: any[] = [], roots = [];
	for (const root of ['../eval-archive', '../needlefish/evals/results']) {
		const counts = { root, files: 0, records: 0, preservedRetiredRecords: 0, retiredIds: [] as string[] };
		async function walk(path: string): Promise<void> {
			for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
				const file = resolve(path, entry.name);
				if (entry.isDirectory()) { await walk(file); continue; }
				if (!file.endsWith('.json')) continue;
				counts.files++;
				const extracted = execFileSync('jq', ['-c', '.. | objects | select(.id? and (.answer? | type == "string") and (.checks? | type == "array")) | {id,answer,checks,toolCalls,executedToolCalls,iteration,pass}', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
				for (const line of extracted.trim().split('\n').filter(Boolean)) {
					const record: Record = JSON.parse(line), oldCase = beforeCases.get(record.id), newCase = afterCases.get(record.id);
					if (!oldCase || !newCase) {
						// Retired pre-rowCells cases never enter the changed function. Retain
						// their archived verdict exactly; fail closed if that premise changes.
						if (record.checks.some(c => c.check.startsWith('fresh ground truth row:'))) throw new Error(`Missing rowCells case: ${record.id}`);
						counts.preservedRetiredRecords++;
						if (!counts.retiredIds.includes(record.id)) counts.retiredIds.push(record.id);
						counts.records++;
						continue;
					}
					counts.records++;
					const truth = record.checks.filter(c => c.check.startsWith('fresh ground truth row: ')).map(c => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
					// Scalar interval endpoints are not retained in all archives. Preserve those
					// archived checks rather than inventing current truth or losing post-ask bounds.
					const fixed = record.checks.filter(c => c.check.startsWith('fresh ground truth:') || c.check === 'no contradicting row count' || (oldCase.groundTruth?.mode !== 'rowCells' && c.check === 'nonempty ground truth'));
					const isolate = (test: EvalCase) => ({ ...test, groundTruth: test.groundTruth?.mode === 'rowCells' ? test.groundTruth : undefined });
					const project = (test: EvalCase) => test.id === 'hard-p24-d1-redo-layout' ? truth.map(row => row.slice(0, 4)) : truth;
					const before = beforeScore(isolate(oldCase), record, truth);
					const scorerOnly = score(isolate(oldCase), record, truth);
					const after = score(isolate(newCase), record, project(newCase));
					const fixedPass = fixed.every(c => c.pass);
					const summary = { file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, archived: record.checks.every(c => c.pass), before: fixedPass && before.pass, scorerOnly: fixedPass && scorerOnly.pass, after: fixedPass && after.pass };
					const justification = record.id === 'hard-p24-d1-redo-layout' ? 'Four per-group fields match; total is checked separately by the case-scoped required fact. The archived fifth truth cell is removed only for this case.' : 'Literal slash survives named binding parsing; whole-cell comparison still rejects partial or swapped values.';
					if (summary.before !== summary.after) flips.push({ ...summary, justification });
					const changedChecks = before.checks.filter((c: Check) => after.checks.some((other: Check) => other.check === c.check && other.pass !== c.pass)).map((c: Check) => ({ check: c.check, before: c.pass, after: !c.pass }));
					if (changedChecks.length) checkFlips.push({ ...summary, changedChecks, justification });
					if (file.includes('/phase23/gate-23/') && /^hard-p2[34]-/.test(record.id)) gate.push({ ...summary, beforeChecks: before.checks, afterChecks: after.checks });
				}
			}
		}
		await walk(root); roots.push(counts);
	}
	const hash = (text: string) => createHash('sha256').update(text).digest('hex');
	const gateSummary = ['hard-p23-', 'hard-p24-'].map(prefix => {
		const records = gate.filter(r => r.id.startsWith(prefix));
		return { prefix, records: records.length, archivedPasses: records.filter(r => r.archived).length, beforePasses: records.filter(r => r.before).length, afterPasses: records.filter(r => r.after).length };
	});
	const report = { base, scorerBeforeSha256: hash(original), scorerAfterSha256: hash(await readFile('evals/scoring.ts', 'utf8')), roots, flips, checkFlips, gateSummary, gate };
	await writeFile('docs/wp-24f-replay.json', JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify({ roots, flips, checkFlipRecords: checkFlips.length, gateSummary }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
