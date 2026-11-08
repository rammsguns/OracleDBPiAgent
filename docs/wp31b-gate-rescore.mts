/** Offline replay: archived answers and truth only. No DB/LLM imports or calls. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { score } from '../evals/scoring.js';
import type { EvalCase, AskResult } from '../evals/types.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: npx tsx docs/wp31b-gate-rescore.mts SCRATCHPAD_ROOT');
const before = JSON.parse(execFileSync('git', ['show', '57d2540:evals/cases-hard/phase31-pdb.json'], { encoding: 'utf8' })) as EvalCase[];
const after = JSON.parse(readFileSync('evals/cases-hard/phase31-pdb.json', 'utf8')) as EvalCase[];
for (const test of before.filter(c => c.id !== 'hard-p31-backup-age')) deepStrictEqual(after.find(c => c.id === test.id), test);
const results: { gate: string; label: string; file: string; sha256: string; cases: { id: string; archived: boolean; before: boolean; after: boolean }[] }[] = [];
for (const gate of ['gate31a', 'gate31b']) {
	const manifest = readFileSync(join(root, gate, 'files.tsv'), 'utf8');
	for (const line of manifest.split('\n').filter(line => /^pdb-\d+\t/.test(line))) {
		const [label, file] = line.split('\t') as [string, string];
		const bytes = readFileSync(join(root, gate, file));
		const run = JSON.parse(bytes.toString()) as { records: (AskResult & { id: string; pass: boolean; checks: { check: string; pass: boolean }[] })[] };
		const cases = run.records.map(record => {
			const oldCase = before.find(c => c.id === record.id), newCase = after.find(c => c.id === record.id);
			if (!oldCase || !newCase) throw new Error(`Unknown case ${record.id}`);
			const truth = record.checks.filter(c => c.check.startsWith('fresh ground truth row: ')).map(c => JSON.parse(c.check.slice('fresh ground truth row: '.length)) as unknown[]);
			if (oldCase.groundTruth && !truth.length) throw new Error(`Missing archived truth ${record.id}`);
			const beforeScore = score(oldCase, record, truth).pass;
			strictEqual(beforeScore, record.pass, `${gate}/${label}/${record.id}: baseline mismatch`);
			// Only the backup truth's age-band column survives the case change; do not recompute it.
			const afterTruth = record.id === 'hard-p31-backup-age' ? truth.map(row => [row[0]]) : truth;
			const afterScore = score(newCase, record, afterTruth).pass;
			if (record.id !== 'hard-p31-backup-age') strictEqual(afterScore, beforeScore, `${record.id}: unrelated flip`);
			return { id: record.id, archived: record.pass, before: beforeScore, after: afterScore };
		});
		strictEqual(cases.length, 11);
		results.push({ gate, label, file: basename(file), sha256: createHash('sha256').update(bytes).digest('hex'), cases });
	}
}
strictEqual(results.length, 4);
writeFileSync('docs/wp31b-gate-rescore.json', JSON.stringify({ baseline: '57d2540', results }, null, '\t') + '\n');
const lines = ['# Phase 31 PDB offline replay', '', 'Stored answers and truth from each archive; same scorer before/after. Only backup age truth is projected to its first column. No fresh truth or model calls.', ''];
for (const run of results) {
	lines.push(`## ${run.gate}/${run.label}`, '', `File: ${run.file}`, '', '| Case | Before | After |', '|---|---|---|');
	for (const c of run.cases) lines.push(`| ${c.id} | ${c.before ? 'PASS' : 'FAIL'} | ${c.after ? 'PASS' : 'FAIL'} |`);
	lines.push('', `Total: ${run.cases.filter(c => c.before).length}/11 → ${run.cases.filter(c => c.after).length}/11.`, '');
}
writeFileSync('docs/wp31b-gate-rescore.md', lines.join('\n'));
process.stdout.write(lines.join('\n'));
