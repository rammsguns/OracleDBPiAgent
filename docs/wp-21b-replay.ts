/** Offline replay; jq extracts answer records without loading huge archives into JS. */
import { execFileSync } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { score } from '../evals/scoring.js';
import { score as beforeScore } from '../tests/fixtures/wp21b/scoring-before.js';
import { loadHardCases } from '../evals/validate-hard.js';
import type { AskResult, EvalCase } from '../evals/types.js';
const cases = await loadHardCases();
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
			const old = structuredClone(isolated);
			if (test.id === 'hard-p8-description-language') old.expect.requiredTools = ['run_query'];
			const before = fixed.every((c: any) => c.pass) && beforeScore(old, record as AskResult, truth).pass;
			const after = fixed.every((c: any) => c.pass) && score(isolated, record as AskResult, truth).pass;
			if (before !== after) flips.push({file:relative(process.cwd(),file), id:test.id, iteration:record.iteration, before, after, truth, answer:record.answer,
				reason: test.id === 'hard-p8-description-language' ? 'Correct dictionary facts; describe_object supplies the same column metadata.' : 'All truth cells occur together in one labelled record, with their own labels and values.'});
		}
	}
}
for (const root of process.argv.slice(2)) await walk(root);
await writeFile('docs/wp-21b-replay.json', JSON.stringify({files,records,flips},null,'\t')+'\n');
console.log(JSON.stringify({files,records,flips:flips.length, ids: [...new Set(flips.map((f:any)=>f.id))]}));
