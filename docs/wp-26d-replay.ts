/** Offline only: npx tsx docs/wp-26d-replay.ts ../eval-archive ../needlefish/evals/results */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { score } from '../evals/scoring.js';
import type { EvalCase } from '../evals/types.js';
const baseline = 'd25f1cb3e613572db3195dee9d6bd931b1af7d40';
const commit = execFileSync('git', ['rev-parse', baseline], { encoding: 'utf8' }).trim();
const before: EvalCase[] = [], after: EvalCase[] = [];
const definitions = [];
for (const dir of ['evals/cases', 'evals/cases-hard']) {
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, dir], { encoding: 'utf8' }).trim().split('\n').filter(file => file.endsWith('.json'));
	for (const file of files) {
		const old = execFileSync('git', ['show', `${commit}:${file}`], { encoding: 'utf8' });
		const current = await readFile(file, 'utf8');
		if (old !== current) throw new Error(`Existing case file changed: ${file}`);
		definitions.push({ file, sha256: createHash('sha256').update(current).digest('hex') });
		before.push(...JSON.parse(old)); after.push(...JSON.parse(current));
	}
}
let files = 0, records = 0, flips = 0;
async function walk(path: string): Promise<void> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const file = resolve(path, entry.name);
		if (entry.isDirectory()) { await walk(file); continue; }
		if (!file.endsWith('.json')) continue;
		files++;
		let data: unknown;
		try { data = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
		function visit(value: unknown): void {
			if (!value || typeof value !== 'object') return;
			const row = value as Record<string, unknown>;
			if (typeof row.id === 'string' && typeof row.answer === 'string' && Array.isArray(row.checks)) {
				const old = before.find(test => test.id === row.id), current = after.find(test => test.id === row.id);
				if (!old || !current) return;
				records++;
				const response = { answer: row.answer, toolCalls: [] as string[], usage: { input: 0, output: 0 } };
				// Preserve archived truth/tool checks; never compare historical answers to today's DB.
				const fixed = row.checks.filter(check => !/^(fact:|forbidden:)/.test(check.check)).every(check => check.pass);
				const replay = (test: EvalCase) => fixed && score({ ...test, groundTruth: undefined, expect: { ...test.expect, requiredTools: [], maxToolCalls: undefined, mustRefuse: false } }, response).pass;
				if (replay(old) !== replay(current)) flips++;
				return;
			}
			for (const child of Object.values(row)) visit(child);
		}
		visit(data);
	}
}
for (const root of process.argv.slice(2)) await walk(root);
if (!records || flips) throw new Error(`Invalid replay: ${records} records, ${flips} flips`);
const report = { commit, roots: process.argv.slice(2), files, records, flips, existingCases: before.length, definitions };
await writeFile('docs/wp-26d-replay.json', JSON.stringify(report, null, '\t') + '\n');
console.log(JSON.stringify({ ...report, definitions: definitions.length }));
