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

const base = 'dcc4111555588a814f7d0f21d25abb1c20216b97';
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
	// Retired case IDs still have real definitions in local git history.
	const historical = new Map<string, EvalCase | undefined>();
	function historicalCase(id: string): EvalCase | undefined {
		if (historical.has(id)) return historical.get(id);
		let test: EvalCase | undefined;
		try {
			const commit = execFileSync('git', ['log', '-1', '--format=%H', '-S', id, '--all', '--', 'evals/cases', 'evals/cases-hard'], { encoding: 'utf8' }).trim();
			if (!commit) throw new Error('No historical definition');
			for (const revision of [`${commit}^`, commit]) {
				try {
					const files = execFileSync('git', ['grep', '-l', '-F', id, revision, '--', 'evals/cases', 'evals/cases-hard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n');
					for (const file of files) {
						const definitions: EvalCase[] = JSON.parse(execFileSync('git', ['show', file], { encoding: 'utf8' }));
						test ??= definitions.find(test => test.id === id);
					}
				} catch { /* An addition has no matching definition in its parent. */ }
				if (test) break;
			}
		} catch { /* Missing historical definitions are counted explicitly below. */ }
		historical.set(id, test);
		return test;
	}
	const changedExistingCases = [...beforeCases].filter(([id, test]) => JSON.stringify(cases.find(current => current.id === id)) !== JSON.stringify(test)).map(([id]) => id);
	if (changedExistingCases.join(',') !== 'hard-p26-p1-stats-autotask') throw new Error('Unexpected case changes');
	const flips: any[] = [], checkDifferences: any[] = [], roots = [];
	const stored = JSON.parse(await readFile('tests/unit/phase29a-stored.json', 'utf8'));
	const approved = new Map<string, string>(stored.map((record: any) => [hash(record.answer), record.id === 'hard-p25-d1-retention-setting'
		? 'Correct implied REDUNDANCY 1 in copy / image copy prose; unrelated not a setting does not deny it.'
		: 'No. directly answers Does ENABLED alone guarantee a successful run?; configuration is distinct from outcome.']));
	approved.set(hash('**SH.CUSTOMERS contains 55500.00 rows** (target `d1-19c-lab`, via `run_query`).'), '55500.00 is numerically equal to archived scalar truth 55500.');
	const definitions = await Promise.all(['evals/cases-hard/phase25-backup.json', 'evals/cases-hard/phase26-jobs.json', 'evals/cases-hard/phase27-top.json'].map(async file => ({ file, sha256: hash(await readFile(file, 'utf8')) })));
	for (const root of ['../eval-archive', '../needlefish/evals/results']) {
		const counts = { root, files: 0, records: 0, unknownRecords: 0, historicalRecords: 0, reconstructedSmokeRecords: 0 };
		async function walk(path: string): Promise<void> {
			for (const entry of await readdir(path, { withFileTypes: true })) {
				const file = resolve(path, entry.name);
				if (entry.isDirectory()) { await walk(file); continue; }
				if (!file.endsWith('.json')) continue;
				counts.files++;
				const extracted = execFileSync('jq', ['-c', '.. | objects | select(.id? and (.answer? | type == "string") and (.checks? | type == "array")) | {id,answer,checks,toolCalls,executedToolCalls,iteration}', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
				for (const line of extracted.trim().split('\n').filter(Boolean)) {
					const record = JSON.parse(line);
					const currentCase = cases.find(test => test.id === record.id);
					// Six worker-smoke IDs predate their committed hard-* names.
					// Their complete checks are archived; reconstruct those expectations.
					const smokeIds = ['health-sh-stats', 'health-p1-index', 'health-p1-stats', 'ops-parameter-d1', 'ops-jobs-p1', 'ops-backups-d1'];
					const patterns = (prefix: string) => record.checks.filter((check: any) => check.check.startsWith(prefix)).map((check: any) => check.check.slice(prefix.length));
					const smoke: EvalCase | undefined = smokeIds.includes(record.id) ? {
						id: record.id, target: 'd1-19c-lab', category: 'archived-smoke', question: '',
						expect: { requiredFacts: patterns('fact: '), forbiddenClaims: patterns('forbidden: '), requiredTools: patterns('tool: '), mustRefuse: false },
						groundTruth: patterns('fresh ground truth: ').length ? { sql: '', mode: 'allCells' } : undefined,
					} : undefined;
					const afterCase = currentCase ?? historicalCase(record.id) ?? smoke, beforeCase = beforeCases.get(record.id) ?? historicalCase(record.id) ?? smoke;
					if (smoke) counts.reconstructedSmokeRecords++;
					if (!currentCase && afterCase && !smoke) counts.historicalRecords++;
					if (!afterCase || !beforeCase) { counts.unknownRecords++; continue; }
					counts.records++;
					let truth = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth row: ')).map((c: any) => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
					// Pre-J archives include a derived status before the four counts.
					// Both sides use J's count-only contract; reproject identically.
					if (record.id === 'hard-p25-d1-no-backups-recorded') truth = truth.map((row: unknown[]) => row.length === 5 ? row.slice(1) : row);
					// Reconstruct numeric scalar/allCells truth from the archived checks.
					// Scalar ranges retain both endpoints; no live data is queried.
					let truthAfter: unknown[][] | undefined;
					if (afterCase.groundTruth?.mode !== 'rowCells') {
						const values = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth: ')).map((c: any) => c.check.slice(20));
						truth = values.map((value: string) => [value]);
						if (afterCase.groundTruth?.mode === 'scalar' && values.length === 1) {
							const range = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/.exec(values[0]);
							if (range) { truth = [[Number(range[1])]]; truthAfter = [[Number(range[2])]]; }
							else if (/^-?\d+(?:\.\d+)?$/.test(values[0])) truth = [[Number(values[0])]];
						}
					}
					const beforeResult = beforeScore(beforeCase, record, truth, truthAfter);
					const afterResult = score(afterCase, record, truth, truthAfter);
					if (JSON.stringify(beforeResult) !== JSON.stringify(afterResult)) checkDifferences.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before: beforeResult.checks, after: afterResult.checks });
					const before = beforeResult.pass;
					const after = afterResult.pass;
					if (before !== after) flips.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before, after, answerSha256: hash(record.answer), justification: !before && after ? approved.get(hash(record.answer)) : undefined });
				}
			}
		}
		await walk(root); roots.push(counts);
	}
	const unexpectedFlips = flips.filter(row => !row.justification);
	const report = { definitions, unexpectedFlips, base, existingCaseCount: beforeCases.size, changedExistingCases, scorerBeforeSha256: hash(original), scorerAfterSha256: hash(current), roots, flips, checkDifferences };
	await writeFile('docs/wp-29a-replay.json', JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify(report));
	if (unexpectedFlips.length || roots.some(root => root.unknownRecords)) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
