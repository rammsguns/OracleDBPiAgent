// Offline only: imports the pure scorer, never runtime/config/DB/LLM modules.
// Usage: npx tsx docs/wp-30e-replay.ts [result directories ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { score } from '../evals/scoring.js';
import type { AskResult, EvalCase } from '../evals/types.js';
const path = 'evals/cases-hard/phase30-check.json';
const before = JSON.parse(execFileSync('git', ['show', `b2078085f676ef27bdfc80cde5d887e468b1b45b:${path}`], { encoding: 'utf8' })) as EvalCase[];
const after = JSON.parse(readFileSync(path, 'utf8')) as EvalCase[];
const scratch = '/tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad';
const roots = process.argv.slice(2);
if (!roots.length) roots.push(join(scratch, 'gate30a'), join(scratch, 'gate30b'), 'evals/results', '/home/kiwi/orca/workspaces/OracleDBPiAgent/wp-30c-check-evals/evals/results');
interface Record extends AskResult { id: string; iteration: number; pass: boolean; checks: { check: string; pass: boolean }[] }
function files(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.json') ? [join(dir, entry.name)] : []);
}
let total = 0, oldPass = 0, newPass = 0;
console.log('| Source | Iteration | Case | Before | After | Changed checks / remaining failure |');
console.log('|---|---:|---|---|---|---|');
for (const root of roots) for (const file of files(root).sort()) {
	const data = JSON.parse(readFileSync(file, 'utf8')) as { records?: Record[] };
	for (const record of data.records ?? []) {
		if (!record.id.startsWith('hard-p30-')) continue;
		const oldCase = before.find(c => c.id === record.id)!;
		const newCase = after.find(c => c.id === record.id)!;
		if (!oldCase || !newCase) throw new Error(`Unknown case ${record.id}`);
		const truth = record.checks.filter(c => c.check.startsWith('fresh ground truth row: ')).map(c => JSON.parse(c.check.slice('fresh ground truth row: '.length)) as unknown[]);
		if (oldCase.groundTruth && !truth.length) throw new Error(`Missing archived truth: ${file} ${record.id}`);
		const oldScore = score(oldCase, record, truth), newScore = score(newCase, record, truth);
		if (oldScore.pass !== record.pass) throw new Error(`Baseline mismatch: ${file} ${record.id}`);
		if (oldScore.pass && !newScore.pass) throw new Error(`Regression: ${file} ${record.id}`);
		total++; oldPass += Number(oldScore.pass); newPass += Number(newScore.pass);
		const reason = oldScore.pass !== newScore.pass ? 'Applicability wording now accepted; archived truth unchanged' : newScore.pass ? 'Unchanged' : newScore.checks.filter(c => !c.pass).map(c => c.check).join('; ');
		console.log(`| ${relative(root, file)} (${root.split('/').at(-1)}) | ${record.iteration} | ${record.id} | ${oldScore.pass ? 'PASS' : 'FAIL'} | ${newScore.pass ? 'PASS' : 'FAIL'} | ${reason.replaceAll('|', '\\|')} |`);
	}
}
console.log(`\n${total} records: ${oldPass} → ${newPass} passes; ${newPass - oldPass} flips; no regressions.`);
