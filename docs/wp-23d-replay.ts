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

const base = '1d84ee093941dd16c6da4578a3077be4f186d7ce';
const original = execFileSync('git', ['show', `${base}:evals/scoring.ts`], { encoding: 'utf8' });
const current = await readFile('evals/scoring.ts', 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const directory = await mkdtemp(join(tmpdir(), 'wp23-replay-'));
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
	const flips: unknown[] = [], roots = [];
	for (const root of ['../eval-archive', '../needlefish/evals/results']) {
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
					const truth = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth row: ')).map((c: any) => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
					// Preserve archived scalar/allCells checks; never replace archived truth with live data.
					const fixed = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth:') || c.check === 'no contradicting row count').every((c: any) => c.pass);
					const isolate = (test: EvalCase) => ({ ...test, groundTruth: test.groundTruth?.mode === 'rowCells' ? test.groundTruth : undefined });
					const before = fixed && beforeScore(isolate(beforeCase), record, truth).pass;
					const after = fixed && score(isolate(afterCase), record, truth).pass;
					if (before !== after) flips.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before, after });
				}
			}
		}
		await walk(root); roots.push(counts);
	}
	const report = { base, scorerBeforeSha256: hash(original), scorerAfterSha256: hash(current), roots, flips };
	await writeFile('docs/wp-23d-replay.json', JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report));
	if (flips.length) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
