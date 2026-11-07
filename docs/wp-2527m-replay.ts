/** Offline only. Compare the branch-base scorer and cases with this worktree. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { score } from '../evals/scoring.js';
import { loadHardCases } from '../evals/validate-hard.js';
import type { EvalCase } from '../evals/types.js';

const base = '21f51e19fd4071942ce9a8aa1745fb198d508cfd';
const original = execFileSync('git', ['show', `${base}:evals/scoring.ts`], { encoding: 'utf8' });
const current = await readFile('evals/scoring.ts', 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const directory = await mkdtemp(join(tmpdir(), 'wp27-replay-'));
try {
	const modulePath = join(directory, 'scoring-before.ts');
	await writeFile(modulePath, original);
	const { score: beforeScore } = await import(pathToFileURL(modulePath).href);
	const cases = await loadHardCases();
	for (const file of await readdir('evals/cases')) if (file.endsWith('.json')) cases.push(...JSON.parse(await readFile(`evals/cases/${file}`, 'utf8')));
	const beforeCases = new Map<string, EvalCase>();
	for (const file of execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'evals/cases', 'evals/cases-hard'], { encoding: 'utf8' }).trim().split('\n')) {
		if (file.endsWith('.json')) for (const test of JSON.parse(execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }))) beforeCases.set(test.id, test);
	}
	const changedExistingCases = [...beforeCases].filter(([id, test]) => JSON.stringify(cases.find(current => current.id === id)) !== JSON.stringify(test)).map(([id]) => id);
	if (changedExistingCases.sort().join(',') !== 'hard-p25-d1-last-level0,hard-p27-refuse-ash,hard-p27-refuse-awr,hard-p27-refuse-metric-history,hard-p27-refuse-repository') throw new Error('Unexpected case changes');
	const flips: any[] = [], checkDifferences: any[] = [], roots = [];
	const definitions = await Promise.all(['evals/cases-hard/phase25-backup.json', 'evals/cases-hard/phase26-jobs.json', 'evals/cases-hard/phase27-top.json'].map(async file => ({ file, sha256: hash(await readFile(file, 'utf8')) })));
	for (const root of ['../eval-archive', '../needlefish/evals/results', '/tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad/gate150', '/tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad/gate150b']) {
		const counts = { root, files: 0, records: 0, unknownRecords: 0 };
		async function walk(path: string): Promise<void> {
			for (const entry of await readdir(path, { withFileTypes: true })) {
				const file = resolve(path, entry.name);
				if (entry.isDirectory()) { await walk(file); continue; }
				if (!file.endsWith('.json')) continue;
				counts.files++;
				const extracted = execFileSync('jq', ['-c', '.. | objects | select(.id? and (.answer? | type == "string") and (.checks? | type == "array")) | {id,answer,checks,toolCalls,executedToolCalls,iteration}', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
				for (const line of extracted.trim().split('\n').filter(Boolean)) {
					const record = JSON.parse(line), afterCase = cases.find(test => test.id === record.id), beforeCase = beforeCases.get(record.id);
					if (!afterCase || !beforeCase) { counts.unknownRecords++; continue; }
					counts.records++;
					let truth = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth row: ')).map((c: any) => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
					// Pre-J archives include a derived status before the four counts.
					// Both sides use J's count-only contract; reproject identically.
					if (record.id === 'hard-p25-d1-no-backups-recorded') truth = truth.map((row: unknown[]) => row.length === 5 ? row.slice(1) : row);
					// Preserve archived scalar/allCells checks; never replace archived truth with live data.
					const fixed = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth:') || c.check === 'no contradicting row count').every((c: any) => c.pass);
					const isolate = (test: EvalCase) => ({ ...test, groundTruth: test.groundTruth?.mode === 'rowCells' ? test.groundTruth : undefined });
					const beforeResult = beforeScore(isolate(beforeCase), record, truth);
					// Reproject archived values only; never substitute live truth.
					const afterResult = score(isolate(afterCase), record, truth);
					if (JSON.stringify(beforeResult) !== JSON.stringify(afterResult)) checkDifferences.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration });
					const before = fixed && beforeResult.pass;
					const after = fixed && afterResult.pass;
					if (before !== after) flips.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before, after });
				}
			}
		}
		await walk(root); roots.push(counts);
	}
	const allowedChangedIds = [...changedExistingCases, 'hard-p25-d1-no-backups-recorded'];
	const unexpectedFlips = flips.filter(row => !allowedChangedIds.includes(row.id));
	const unexpectedCheckDifferences = checkDifferences.filter(row => !allowedChangedIds.includes(row.id));
	const report = { definitions, unexpectedFlips, unexpectedCheckDifferences, base, existingCaseCount: beforeCases.size, changedExistingCases, scorerBeforeSha256: hash(original), scorerAfterSha256: hash(current), roots, flips, checkDifferences };
	await writeFile('docs/wp-2527m-replay.json', JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report));
	if (unexpectedFlips.length || unexpectedCheckDifferences.length) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
