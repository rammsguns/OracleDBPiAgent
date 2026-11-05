/** Offline item-3 replay. Usage: npx tsx docs/wp-20e-replay.ts <archive> <results> ... */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { loadHardCases } from '../evals/validate-hard.js';
import { score } from '../evals/scoring.js';
import type { AskResult, EvalCase } from '../evals/types.js';
const id = 'hard-p16-history-arguments';
const cases = await loadHardCases();
const old = (JSON.parse(execFileSync('git', ['show', '3fb73dc64d5db0e222ea9cdd308cb6e15518f898:evals/cases-hard/phase16-plsql.json'], { encoding: 'utf8' })) as EvalCase[]).find(test => test.id === id)!;
const flips: unknown[] = [];
let records = 0, targetRecords = 0, otherFlips = 0, files = 0;
const seen = new Set<string>();
async function walk(path: string): Promise<void> {
	const entries = await readdir(path, { withFileTypes: true });
	for (const entry of entries) {
		const file = resolve(path, entry.name);
		if (entry.isDirectory()) { await walk(file); continue; }
		if (!entry.name.endsWith('.json') || seen.has(file)) continue;
		seen.add(file); files++;
		let data;
		try { data = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
		function visit(value: any): void {
			if (!value || typeof value !== 'object') return;
			if (typeof value.id === 'string' && typeof value.answer === 'string' && Array.isArray(value.checks)) {
				const test = cases.find(test => test.id === value.id);
				if (!test) return;
				records++;
				if (test.id === id) targetRecords++;
				// Recompute only item-3 fact/forbidden checks. Preserve archived tool/truth checks,
				// so live cursor changes and unrelated later scorer improvements cannot create flips.
				function replay(expect: EvalCase['expect']): boolean {
					const fixed = value.checks.filter((check: {check: string}) => !/^(fact:|forbidden:)/.test(check.check));
					const isolated = { ...test, groundTruth: undefined, expect: { ...expect, requiredTools: [], maxToolCalls: undefined, mustRefuse: false } };
					return fixed.every((check: {pass: boolean}) => check.pass) && score(isolated, value as AskResult).pass;
				}
				const before = replay(test.id === id ? old.expect : test.expect);
				const after = replay(test.expect);
				if (before !== after) {
					if (test.id !== id) otherFlips++;
					flips.push({ file: relative(process.cwd(), file), id: test.id, iteration: value.iteration, before, after, conclusion: new RegExp(test.expect.requiredFacts[0]!, 'i').exec(value.answer)?.[0], reason: 'Accepts explicit no-default conclusion; archived truth/tool checks still pass.' });
				}
				return;
			}
			for (const child of Object.values(value)) visit(child);
		}
		visit(data);
	}
}
for (const root of process.argv.slice(2)) await walk(root);
const report = { roots: process.argv.slice(2), files, records, targetRecords, otherFlips, flips };
await writeFile('docs/wp-20e-replay.json', JSON.stringify(report, null, '\t') + '\n');
console.log(JSON.stringify(report, null, '\t'));
