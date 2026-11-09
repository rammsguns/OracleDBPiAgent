import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { score } from './scoring.js';
import type { AskResult, EvalCase } from './types.js';
import { loadHardCases } from './validate-hard.js';

type ArchiveRecord = AskResult & {
	id: string;
	target: string;
	iteration: number;
	pass: boolean;
	checks: { check: string; pass: boolean }[];
};

// Load the scorer from the current master ref, not an older phase baseline.
const masterSource = execFileSync('git', ['show', 'master:evals/scoring.ts'], { encoding: 'utf8' });
const masterModule = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(masterSource)).toString('base64')}`);
const masterScore = (masterModule as { score: typeof score }).score;

function rowFromCheck(label: string): unknown[] | undefined {
	const start = label.lastIndexOf(' [');
	if (start < 0 || !label.endsWith(']')) return undefined;
	try {
		const row = JSON.parse(label.slice(start + 2, -1));
		return Array.isArray(row) ? row as unknown[] : undefined;
	} catch {
		return undefined;
	}
}

function reconstruct(record: ArchiveRecord, definitions: Map<string, EvalCase>) {
	const checkLabels = record.checks.map(check => check.check);
	const original = definitions.get(record.id);
	const extractedRows = checkLabels.flatMap(label => {
		if (label.startsWith('fresh ground truth row: ')) {
			try { return [JSON.parse(label.slice('fresh ground truth row: '.length)) as unknown[]]; }
			catch { return []; }
		}
		return label.startsWith('fresh ground truth template: ') || label.startsWith('no contradictory ground truth template: ') || label.startsWith('capture ground truth: ')
			? [rowFromCheck(label)].filter((row): row is unknown[] => row !== undefined)
			: [];
	});
	const rows = [...new Map(extractedRows.map(row => [JSON.stringify(row), row])).values()];
	const valueLabels = checkLabels.filter(label => label.startsWith('fresh ground truth: '));
	const values = valueLabels.map(label => label.slice('fresh ground truth: '.length));
	const scalar = checkLabels.includes('no contradicting row count');
	const truth = rows.length ? rows : scalar ? [[Number(values[0]?.split('..')[0])]] : values.map(value => [value]);
	const after = scalar ? [[Number(values[0]?.split('..').at(-1))]] : truth;
	const expect = {
		requiredFacts: checkLabels.filter(label => label.startsWith('fact: ')).map(label => label.slice(6)),
		forbiddenClaims: checkLabels.filter(label => label.startsWith('forbidden: ')).map(label => label.slice(11)),
		requiredTools: checkLabels.filter(label => label.startsWith('tool: ')).map(label => label.slice(6)),
		mustRefuse: checkLabels.includes('explicit refusal'),
		...(checkLabels.some(label => label.startsWith('maxToolCalls: ')) ? { maxToolCalls: Number(checkLabels.find(label => label.startsWith('maxToolCalls: '))!.slice(14)) } : {}),
	};
	const groundTruth = original?.groundTruth ?? (checkLabels.includes('nonempty ground truth') ? {
		sql: 'SELECT archived_value FROM archived',
		mode: rows.length ? 'rowCells' as const : scalar ? 'scalar' as const : 'allCells' as const,
	} : undefined);
	const test: EvalCase = {
		id: record.id,
		target: record.target,
		category: original?.category ?? 'archive',
		question: 'archived',
		expect,
		...(groundTruth ? { groundTruth } : {}),
	};
	return { test, truth, after };
}

async function walk(root: string, files: string[]): Promise<void> {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) await walk(path, files);
		else if (entry.name.endsWith('.json')) files.push(path);
	}
}

const archiveRoot = '/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive';
const phaseRoots = process.argv.length > 2
	? process.argv.slice(2).map(path => resolve(path.startsWith('/') ? path : `${archiveRoot}/${path}`))
	: ['phase25-27', 'phase28', 'phase29', 'phase30', 'phase31', 'phase32', 'phase33', 'phase34', 'phase35'].map(path => resolve(archiveRoot, path));
const definitions = new Map((await loadHardCases()).map(test => [test.id, test]));
const files: string[] = [];
for (const root of phaseRoots) await walk(root, files);

let records = 0, passToFail = 0, failToPass = 0;
const flips: { file: string; id: string; iteration: number; before: boolean; after: boolean }[] = [];
for (const file of files.sort((a, b) => a.localeCompare(b))) {
	const data = JSON.parse(await readFile(file, 'utf8')) as { records?: ArchiveRecord[] };
	if (!Array.isArray(data.records)) continue;
	for (const record of data.records) {
		if (typeof record.answer !== 'string' || !Array.isArray(record.checks)
			|| !record.checks.some(check => check.check === 'nonempty ground truth')) continue;
		records++;
		const { test, truth, after } = reconstruct(record, definitions);
		const before = masterScore(test, record, truth, after).pass;
		const next = score(test, record, truth, after).pass;
		if (before && !next) {
			passToFail++;
			flips.push({ file: relative(archiveRoot, file), id: record.id, iteration: record.iteration, before, after: next });
		} else if (!before && next) {
			failToPass++;
			flips.push({ file: relative(archiveRoot, file), id: record.id, iteration: record.iteration, before, after: next });
		}
	}
}

console.log(JSON.stringify({ baseline: 'master:evals/scoring.ts', roots: phaseRoots, records, passToFail, failToPass, flips }, null, '\t'));
if (passToFail) process.exitCode = 1;
if (files.length === 0) throw new Error(`No archive files found under ${phaseRoots.join(', ')}`);
