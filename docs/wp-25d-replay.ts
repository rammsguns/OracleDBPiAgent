/** Offline only. npx tsx docs/wp-25d-replay.ts ../eval-archive ../needlefish/evals/results */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { loadHardCases } from '../evals/validate-hard.js';
import { score } from '../evals/scoring.js';
import type { AskResult, EvalCase } from '../evals/types.js';
const cases = await loadHardCases();
const previous: EvalCase[] = JSON.parse(await readFile('tests/fixtures/wp25d-previous-premises.json', 'utf8'));
const flips: unknown[] = [];
let files = 0, records = 0, targetRecords = 0, otherFlips = 0;
const seen = new Set<string>();
async function walk(path: string): Promise<void> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const file = resolve(path, entry.name);
		if (entry.isDirectory()) { await walk(file); continue; }
		if (!entry.name.endsWith('.json') || seen.has(file)) continue;
		seen.add(file); files++;
		let data: unknown;
		try { data = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
		function visit(value: any): void {
			if (!value || typeof value !== 'object') return;
			if (typeof value.id === 'string' && typeof value.answer === 'string' && Array.isArray(value.checks)) {
				const test = cases.find(test => test.id === value.id);
				if (!test) return;
				records++;
				const old = previous.find(test => test.id === value.id);
				if (old) targetRecords++;
				// Compare changed expectations only. Preserve archived evidence/tool/truth checks:
				// new live data cannot be retroactively required from an old answer.
				function replay(candidate: EvalCase): boolean {
					const fixed = value.checks.filter((check: { check: string }) => !/^(fact:|forbidden:)/.test(check.check));
					return fixed.every((check: { pass: boolean }) => check.pass) && score({ ...candidate, groundTruth: undefined, expect: { ...candidate.expect, requiredTools: [], maxToolCalls: undefined, mustRefuse: false } }, value as AskResult).pass;
				}
				const before = replay(old ?? test), after = replay(test);
				if (before !== after) {
					if (!old) otherFlips++;
					flips.push({ file: relative(process.cwd(), file), id: test.id, iteration: value.iteration, before, after, answer: value.answer, reason: `Intentional premise replacement: the archived answer addresses ${old!.expect.requiredFacts.join(', ')}; the revised case requires ${test.expect.requiredFacts.join(', ')}. This is not a model regression or a retrospective score correction.` });
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
await writeFile('docs/wp-25d-replay.json', JSON.stringify(report, null, '\t') + '\n');
console.log(JSON.stringify({ ...report, flips: flips.length }, null, '\t'));
