import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { score } from './scoring.js';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import type { AskResult, EvalCase } from './types.js';
import { loadHardCases } from './validate-hard.js';

type ArchiveRecord = AskResult & { id: string; target: string; iteration: number; pass: boolean; checks: { check: string; pass: boolean }[] };
const baselineSource = execFileSync('git', ['show', '8b6ef1c:evals/scoring.ts'], { encoding: 'utf8' });
const baselineModule = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(baselineSource)).toString('base64')}`);
const baselineScore = (baselineModule as { score: typeof score }).score;

function reconstruct(record: ArchiveRecord, definitions: Map<string, EvalCase>) {
	const labels = record.checks.map(check => check.check);
	const rows = labels.filter(label => label.startsWith('fresh ground truth row: ')).map(label => JSON.parse(label.slice('fresh ground truth row: '.length)) as unknown[]);
	const values = labels.filter(label => label.startsWith('fresh ground truth: ')).map(label => label.slice('fresh ground truth: '.length));
	const scalar = labels.includes('no contradicting row count');
	const truth = rows.length ? rows : scalar ? [[Number(values[0]?.split('..')[0])]] : values.map(value => [value]);
	const after = scalar ? [[Number(values[0]?.split('..').at(-1))]] : truth;
	const original = definitions.get(record.id);
	const test: EvalCase = { id: record.id, target: record.target, category: original?.category ?? 'archive', question: 'archived',
		expect: { requiredFacts: labels.filter(label => label.startsWith('fact: ')).map(label => label.slice(6)), forbiddenClaims: labels.filter(label => label.startsWith('forbidden: ')).map(label => label.slice(11)), requiredTools: labels.filter(label => label.startsWith('tool: ')).map(label => label.slice(6)), mustRefuse: labels.includes('explicit refusal'),
			...(labels.some(label => label.startsWith('maxToolCalls: ')) ? { maxToolCalls: Number(labels.find(label => label.startsWith('maxToolCalls: '))!.slice(14)) } : {}) } };
	if (labels.includes('nonempty ground truth')) test.groundTruth = { sql: original?.groundTruth?.sql ?? 'SELECT archived_value FROM archived', mode: rows.length ? 'rowCells' : scalar ? 'scalar' : 'allCells' };
	return { test, truth, after };
}

async function walk(root: string, files: string[]): Promise<void> {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) await walk(path, files);
		else if (entry.name.endsWith('.json')) files.push(path);
	}
}

const defaultArchive = '/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive';
const roots = (process.argv.length > 2 ? process.argv.slice(2) : ['phase25-27', 'phase28', 'phase29', 'phase30', 'phase31', 'phase32', 'phase33'])
	.map(path => resolve(path.startsWith('/') ? path : `${defaultArchive}/${path}`));
const cases = await loadHardCases();
const definitions = new Map(cases.map(test => [test.id, test]));
const files: { root: string; path: string }[] = [];
for (const root of roots) {
	const paths: string[] = [];
	await walk(root, paths);
	files.push(...paths.map(path => ({ root, path })));
}
let records = 0, passToFail = 0, failToPass = 0;
const flips: { file: string; id: string; iteration: number; before: boolean; after: boolean }[] = [];
for (const { root, path: file } of files.sort((a, b) => a.path.localeCompare(b.path))) {
	const data = JSON.parse(await readFile(file, 'utf8')) as { records?: ArchiveRecord[] };
	if (!Array.isArray(data.records)) continue;
	for (const record of data.records) {
		if (typeof record.answer !== 'string' || !Array.isArray(record.checks) || !record.checks.some(check => check.check === 'nonempty ground truth')) continue;
		records++;
		const { test, truth, after } = reconstruct(record, definitions);
		const templates = definitions.get(record.id)?.groundTruth;
		const expectedWidth = record.id === 'hard-p30-d1-fullest-permanent' ? 2 : record.id === 'hard-p19-object-statistics' ? 4 : undefined;
		const compatibleTruth = templates !== undefined && expectedWidth !== undefined && truth.every(row => row.length === expectedWidth);
		const nextTest = compatibleTruth && test.groundTruth ? { ...test, groundTruth: { ...test.groundTruth, factTemplates: templates.factTemplates, contradictionTemplates: templates.contradictionTemplates, captureChecks: templates.captureChecks } } : test;
		const before = baselineScore(test, record, truth, after).pass;
		const next = compatibleTruth ? score(nextTest, record, truth, after).pass : before;
		if (before && !next) {
			passToFail++;
			flips.push({ file: relative(root, file), id: record.id, iteration: record.iteration, before, after: next });
		}
		if (!before && next) {
			failToPass++;
			flips.push({ file: relative(root, file), id: record.id, iteration: record.iteration, before, after: next });
		}
	}
}
console.log(JSON.stringify({ roots, records, passToFail, failToPass, flips }, null, '\t'));
if (passToFail) process.exitCode = 1;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && files.length === 0) throw new Error(`No archive files found under ${roots.join(', ')}`);
