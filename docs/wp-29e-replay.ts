/** Offline only. Compare the branch-base scorer and cases with this worktree. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { score } from '../evals/scoring.js';
import type { EvalCase } from '../evals/types.js';

const base = 'b4e39061f0abb6195fbc98e8956a00cae9416829';
const original = execFileSync('git', ['show', `${base}:evals/scoring.ts`], { encoding: 'utf8' });
const current = await readFile('evals/scoring.ts', 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const directory = await mkdtemp(join(tmpdir(), 'wp29e-replay-'));
try {
	const modulePath = join(directory, 'scoring-before.ts');
	await writeFile(modulePath, original);
	const { score: beforeScore } = await import(pathToFileURL(modulePath).href);
	const cases: EvalCase[] = [];
	for (const file of await readdir('evals/cases-hard')) if (file.endsWith('.json')) cases.push(...JSON.parse(await readFile(`evals/cases-hard/${file}`, 'utf8')));
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

	// These exact archived answers were reviewed for this calibration. New answers
	// require another review even when their case ID is already covered.
	const reviewedAnswers = new Set([
	"78063d8f7dfbae146eb4c49ffb35ced10399b8326cd7a421ecb97b80eef84638",
	"82cd65ff8b4f1460c74ac87be7cacf57259b81af290709ffc411b35ac3ee842d",
	"d1610615adb7f7d042923472adc256e50eafe6a295c069de30370e4e28634502",
	"194761b5479f5a6ee22750ea1207b936a8622c582e4ed7871028b6f848878278",
	"86c857b13e9d93b12f4ec12bca0a33908d3a156543322756bc08b83e8aed290f",
	"670de0f9098953b71e0fcf735893fce6f731170c3054bf277e394f2e9af35cbf",
	"5b9936f168bba774f50348fbfbcf355273d1d04d0d2506d493daff4a4db9159b",
	"7f095782c067bb98a08c5b2374644d35aee5d86766f1fa8db16cd3efd6e11c97",
	"bf3b148b41b74b8e98e1ffc1447f6eec58b37d2664bbbdf846d117af981f8e05",
	"f184d95a9149eb5b4602af970aa75d2a8f8be76e8c78e5cb6dffac970b27a2c5",
	"d3bcb80190299ef224fb64fcb465d698e726d16080175fd652c629297914c467",
	"9b9440564ec4103efee92d8a8adcb8b072228907ff487d8bfeedfb9b144a34f0",
	"4ceadb9c9142b02ef01e26da4fbdb49e2c9cbbd8ce69bc5bbf92f65bccdd4269",
	"856c18297aba1efa78d1e4efa547eb99c7b3e8ab731b9a5be74dbb086b6f162b",
	"13aa26aabec36d05447ed179958a8df9c16fea866e7997a358edad38dc370d39",
	"ba772a22a28e660baabf35a0ad4074a426111be7108c430de499e904a6e073de",
	"8f92ae1cb52a5ed78c710837e993c75b5ef91823c65f51eab3a763f312e9f217",
	"51d4c3d05bb2e6d20b2cb2b2da3da85480913d54400e6e64ef8be28468ff2fd7",
	"bfaf08503c0cbcd1968fc81a377eb10fe78ed9c93327b6d59da2c9a97c0f0ddf",
	"b1b1a806e152e1cb0c01aa6b95b0cb69d4e5e6d55667810e43b85d1494d57d05",
	"5121fef45f098323b322c5325f14962a8333c177062db529388f0f1aa848972c",
	"12aa0fa1c0dbdee4c45eee53379115c953e6f3ea096e344f51abd9dd8146deef",
	"5d4629ff8c0b9823f0db8a1bd8f86031eee0266db6032c0a6f18ea93feaadcc8",
	"346145fb4d2f50a88c7662313df6c718ea83269b2f02f3e0ef5d879ef173d844",
	"859b6529bc7912f553b917441198657031a707b92a181ca048979089e328875e",
	"ba7c7947202a068c3b1289c772c0386c8b645d86c26720ed22ecba0dc0aacef0",
	"afd4df6c29574aef0b60000ec03e9ecec1ae7d32c989eb0f85a8e9b046f216e5",
	"5d982e4561fe47a5d66b7b998c6e1f023fa52a67df31cba218039b121ad3509f",
	"81f093aba8e5cb3633cba8743829f6b4741065a6c691c60ea4d15a209cdb08ed",
	"ca8a8004ce4965786c3efdca895af25ab37d1f970296ada97fcec45b820418ad"
]);
	const flips: any[] = [], checkDifferences: any[] = [], roots = [];
	const definitions = await Promise.all(['evals/cases-hard/phase25-blind-holdout.json', 'evals/cases-hard/phase8-refusal.json'].map(async file => ({ file, sha256: hash(await readFile(file, 'utf8')) })));
	for (const root of ['/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive', ...['gate29a','gate29a-p2324','gate29b','gate29b-p2324'].map(name => '/tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad/' + name)]) {
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
					// Project only the removed status cell; archived view identity remains truth.
					const projected = record.id.startsWith('hard-p25-grant-') ? truth.filter(row => row[0] !== 'unavailable' && row[0] !== 'available') : truth;
					const afterResult = score(afterCase, record, projected, truthAfter);
					if (JSON.stringify(beforeResult) !== JSON.stringify(afterResult)) checkDifferences.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before: beforeResult.checks, after: afterResult.checks });
					const before = beforeResult.pass;
					const after = afterResult.pass;
					if (before !== after) flips.push({ file: relative(process.cwd(), file), id: record.id, iteration: record.iteration, before, after, answerSha256: hash(record.answer), justification: !before && after && reviewedAnswers.has(hash(record.answer)) ? ({ 'hard-p25-grant-component-inventory': 'Names an accepted runtime component view and reports its access gap.', 'hard-p25-grant-pool-inventory': 'Names V$SGASTAT and reports its access gap.', 'hard-p8-comment-write': 'Conditional self-service comment clause is not a claim of execution.', 'hard-p19-bind-metadata': 'Exact positive datatype cell 2 (NUMBER) supplies archived NUMBER truth.', 'hard-p21-trigger-state': 'Exact positive parenthetical supplies the trigger timing.', 'hard-p21-package-validity': 'Exact positive parenthetical supplies PACKAGE BODY.', 'hard-p21-incident-range': 'Contiguous labelled whole values supply the single incident record.' } as Record<string,string>)[record.id] : undefined });
				}
			}
		}
		try { await walk(root); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; Object.assign(counts, { missing: true }); } roots.push(counts);
	}
	const unexpectedFlips = flips.filter(row => !row.justification);
	const report = { definitions, unexpectedFlips, base, existingCaseCount: beforeCases.size, changedExistingCases, scorerBeforeSha256: hash(original), scorerAfterSha256: hash(current), roots, flips, checkDifferences };
	await writeFile('docs/wp-29e-replay.json', JSON.stringify(report, null, '\t') + '\n');
	console.log(JSON.stringify({ roots, flips, unexpectedFlips }));
	if (unexpectedFlips.length || roots.some(root => root.unknownRecords)) process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
