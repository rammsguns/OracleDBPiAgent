// Offline only. Usage: npx tsx docs/phase17d-rescore.mts <old-scorer.mts> <archive-root> <report.json>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { score as newScore } from '../evals/scoring.js';
import type { AskResult, EvalCase } from '../evals/types.js';

const [oldPath, archivePath, outputPath] = process.argv.slice(2);
if (!oldPath || !archivePath || !outputPath) throw new Error('Expected old scorer, archive root, output file');
const { score: oldScore } = await import(pathToFileURL(resolve(oldPath)).href) as { score: typeof newScore };
const root = resolve(archivePath);
function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
		? files(resolve(dir, entry.name))
		: entry.name.endsWith('.json') ? [resolve(dir, entry.name)] : []);
}
const cases = new Map<string, EvalCase>(['evals/cases', 'evals/cases-hard']
	.flatMap(dir => files(resolve(dir)))
	.flatMap(file => JSON.parse(readFileSync(file, 'utf8')) as EvalCase[])
	.map(test => [test.id, test]));
const manifest = files(root).sort();
const report = {
	snapshot: new Date().toISOString(), baseline: '6a5fb624bedcbef48cbeba6186e9173b4460e0e4',
	files: manifest.map(file => relative(root, file)), records: 0, scoredRecords: 0,
	totals: {} as Record<string, { records: number; old: number; new: number }>,
	flips: [] as unknown[], checkFlips: [] as unknown[], unscorable: [] as unknown[],
};
for (const file of manifest) {
	const data = JSON.parse(readFileSync(file, 'utf8'));
	if (!Array.isArray(data.records)) throw new Error(`Unrecognized archive ${file}`);
	for (const record of data.records) {
		report.records++;
		const ref = { file: relative(root, file), id: record.id, iteration: record.iteration };
		if (!record.checks) {
			report.unscorable.push({ ...ref, error: record.error });
			continue;
		}
		report.scoredRecords++;
		const names: string[] = record.checks.map((check: { check: string }) => check.check);
		const prefixed = (prefix: string) => names.filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length));
		const rows = prefixed('fresh ground truth row: ').map(row => JSON.parse(row));
		const values = prefixed('fresh ground truth: ');
		const scalar = names.includes('no contradicting row count');
		const bounds = scalar ? values[0]!.split('..').map(Number) : [];
		const truth = rows.length ? rows : scalar ? [[bounds[0]]] : values.map(value => [value]);
		const after = scalar ? [[bounds[1] ?? bounds[0]]] : undefined;
		const original = cases.get(record.id);
		if (rows.length && !original?.groundTruth?.sql) throw new Error(`Missing SQL labels: ${record.id}`);
		const maxToolCalls = prefixed('maxToolCalls: ')[0];
		const test: EvalCase = {
			id: record.id, target: record.target, category: 'archived', question: 'archived',
			expect: {
				requiredFacts: prefixed('fact: '), forbiddenClaims: prefixed('forbidden: '),
				requiredTools: prefixed('tool: '), mustRefuse: names.includes('explicit refusal'),
				...(maxToolCalls === undefined ? {} : { maxToolCalls: Number(maxToolCalls) }),
			},
			...(names.includes('nonempty ground truth') ? { groundTruth: {
				sql: original?.groundTruth?.sql ?? '',
				mode: rows.length ? 'rowCells' as const : scalar ? 'scalar' as const : 'allCells' as const,
			} } : {}),
		};
		const before = oldScore(test, record as AskResult, truth, after);
		const next = newScore(test, record as AskResult, truth, after);
		for (let i = 0; i < before.checks.length; i++) {
			if (before.checks[i]!.pass !== next.checks[i]!.pass) report.checkFlips.push({
				...ref, check: before.checks[i]!.check, old: before.checks[i]!.pass, new: next.checks[i]!.pass,
			});
		}
		if (before.pass !== next.pass) report.flips.push({ ...ref, old: before.pass, new: next.pass });
		const group = relative(root, file).split('/').slice(0, -1).join('/');
		const total = report.totals[group] ??= { records: 0, old: 0, new: 0 };
		total.records++;
		total.old += Number(before.pass);
		total.new += Number(next.pass);
	}
}
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, files: report.files.length }, null, 2));
