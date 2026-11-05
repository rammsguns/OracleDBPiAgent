/** Offline replay; jq extracts answer records without loading huge archives into JS. */
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { score } from '../evals/scoring.js';
import { score as beforeScore } from '../tests/fixtures/wp22a/scoring-before.js';
import { loadHardCases } from '../evals/validate-hard.js';
import type { AskResult, EvalCase } from '../evals/types.js';
const cases = await loadHardCases();
for (const file of await readdir(new URL('../evals/cases/', import.meta.url))) {
	if (file.endsWith('.json')) cases.push(...JSON.parse(await readFile(new URL('../evals/cases/' + file, import.meta.url), 'utf8')));
}
const originals: EvalCase[] = JSON.parse(await readFile(new URL('../tests/fixtures/wp22a/cases-before.json', import.meta.url), 'utf8'));
const flips: unknown[] = []; let files = 0, records = 0;
async function walk(root: string): Promise<void> {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const file = resolve(root, entry.name);
		if (entry.isDirectory()) { await walk(file); continue; }
		if (!file.endsWith('.json')) continue;
		files++;
		let extracted: string;
		try { extracted = execFileSync('jq', ['-c', '.. | objects | select(.id? and (.answer? | type == "string") and (.checks? | type == "array")) | {id,answer,checks,toolCalls,executedToolCalls,iteration}', file], {encoding:'utf8', maxBuffer: 64*1024*1024}); } catch { continue; }
		for (const line of extracted.trim().split('\n').filter(Boolean)) {
			const record = JSON.parse(line); const test = cases.find(t => t.id === record.id); if (!test) continue;
			records++;
			const truth = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth row: ')).map((c: any) => JSON.parse(c.check.slice('fresh ground truth row: '.length)));
			const isolated = {...test, groundTruth: test.groundTruth?.mode === 'rowCells' ? test.groundTruth : undefined};
			const fixed = record.checks.filter((c: any) => c.check.startsWith('fresh ground truth:') || c.check === 'no contradicting row count');
			const old = originals.find(t => t.id === test.id) ?? structuredClone(isolated);

			const before = fixed.every((c: any) => c.pass) && beforeScore(old, record as AskResult, truth).pass;
			const after = fixed.every((c: any) => c.pass) && score(isolated, record as AskResult, test.id === 'hard-p21-products-stats' ? truth.map((row: unknown[]) => row.slice(1)) : truth).pass;
			if (before !== after) flips.push({file:relative(process.cwd(),file), id:test.id, iteration:record.iteration, before, after, truth, answer:record.answer,
				reason: test.id === 'hard-p21-history-signature' ? 'Each argument explicitly has No default, equivalent to DEFAULTED=N.' : 'Both statistics flags appear with their own labels in a single vertical table; the question already identifies the table.'});
		}
	}
}
for (const root of process.argv.slice(2)) await walk(root);
await writeFile('docs/wp-22a-replay.json', JSON.stringify({files,records,flips},null,'\t')+'\n');
console.log(JSON.stringify({files,records,flips:flips.length, ids: [...new Set(flips.map((f:any)=>f.id))]}));
