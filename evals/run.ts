import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { groundTruth, targets } from './ground-truth.js';
import { requireStrata, runtime, type CachedAskResult, type ToolDetail, type RequestUsage } from './runtime.js';
import { score } from './scoring.js';
import type { EvalCase } from './types.js';

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RunOptions { suite: string; split?: 'dev' | 'holdout' | 'regression'; repeat: number; ids: string[] }
export function parseArgs(args: string[]): RunOptions {
	const options: RunOptions = { suite: 'evals/cases', repeat: 1, ids: [] };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (['--suite', '--split', '--repeat'].includes(arg)) {
			const value = args[++i];
			if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
			if (arg === '--suite') options.suite = value;
			if (arg === '--split') {
				if (value !== 'dev' && value !== 'holdout' && value !== 'regression') throw new Error('Split must be dev, holdout or regression');
				options.split = value;
			}
			if (arg === '--repeat') {
				if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Repeat must be a positive integer');
				options.repeat = Number(value);
			}
		} else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
		else options.ids.push(arg);
	}
	return options;
}
interface EvalRecord extends Omit<CachedAskResult, 'answer'> {
	answer?: string; iteration: number; id: string; target: string; refusal: boolean; pass: boolean; wallMs: number; error?: string; checks?: { check: string; pass: boolean }[];
}
export function summarizeRequestUsage(records: { requests?: RequestUsage[] }[]) {
	const summary = { count: 0, input: 0, cached: 0, output: 0, newUserChars: 0, newToolResultChars: 0,
		prevThinkingChars: 0, prevTextChars: 0, prevToolCallArgChars: 0 };
	for (const { requests } of records) for (const request of requests ?? []) {
		summary.count++;
		for (const key of ['input', 'cached', 'output', 'newUserChars', 'newToolResultChars', 'prevThinkingChars', 'prevTextChars', 'prevToolCallArgChars'] as const) summary[key] += request[key];
	}
	return summary;
}
export function requestUsageMarkdown(summary: ReturnType<typeof summarizeRequestUsage>): string {
	return '\n## Request usage\n\n| Metric | Total |\n|---|---|\n'
		+ Object.entries(summary).map(([key, value]) => `| ${key} | ${value} |`).join('\n') + '\n';
}
export function summarizeToolErrors(records: { toolDetails: ToolDetail[] }[]) {
	const summary = { totalCalls: 0, totalErrors: 0,
		byTool: Object.create(null) as Record<string, { calls: number; errors: number; byCode: Record<string, number> }>,
		byCode: Object.create(null) as Record<string, number> };
	for (const { toolDetails } of records) for (const detail of toolDetails) {
		summary.totalCalls++;
		const tool = summary.byTool[detail.tool] ??= { calls: 0, errors: 0, byCode: Object.create(null) };
		tool.calls++;
		if (!detail.isError) continue;
		summary.totalErrors++;
		tool.errors++;
		const text = detail.error ?? '';
		const code = text.match(/ORA-\d{5}/i)?.[0].toUpperCase() ?? text.replace(/\d/g, 'N').slice(0, 80);
		tool.byCode[code] = (tool.byCode[code] ?? 0) + 1;
		summary.byCode[code] = (summary.byCode[code] ?? 0) + 1;
	}
	return summary;
}
export function toolErrorsMarkdown(summary: ReturnType<typeof summarizeToolErrors>): string {
	const escape = (value: string) => value.replace(/\|/g, '&#124;').replace(/[\r\n]/g, ' ');
	return '\n## Tool errors\n\n' + summary.totalErrors + '/' + summary.totalCalls + ' calls returned errors.\n\n| Tool | Error code / text | Count |\n|---|---|---|\n'
		+ Object.entries(summary.byTool).flatMap(([tool, counts]) => Object.entries(counts.byCode).map(([code, count]) => `| ${escape(tool)} | ${escape(code)} | ${count} |`)).join('\n') + '\n';
}
export async function runEvals(options: RunOptions, dependencies = { requireStrata, runtime, targets, groundTruth, score }) {
	const runStart = performance.now();
	const cases: EvalCase[] = [];
	for (const file of (await readdir(options.suite)).filter(file => file.endsWith('.json')).sort()) {
		cases.push(...JSON.parse(await readFile(`${options.suite}/${file}`, 'utf8')));
	}
	const selected = cases.filter(test => (!options.split || test.split === options.split) && (!options.ids.length || options.ids.includes(test.id)));
	if (!selected.length) throw new Error('No eval cases selected');
	if (new Set(selected.map(test => test.id)).size !== selected.length) throw new Error('Duplicate eval case id');
	await dependencies.requireStrata();
	const configured = await dependencies.targets();
	const app = await dependencies.runtime();
	const records: EvalRecord[] = [];
	try {
		for (let iteration = 1; iteration <= options.repeat; iteration++) for (const test of selected) {
			const start = performance.now();
			try {
				const target = configured.find(target => target.name === test.target);
				if (!target) throw new Error(`Unconfigured target ${test.target}`);
				const truth = test.groundTruth ? await dependencies.groundTruth(target, test.groundTruth.sql, test.groundTruth.setupSql) : [];
				// Await each complete ask before starting another: Strata has one request slot.
				const result = await app.ask(test.turns ?? test.question, test.target, test.limits);
				const truthAfter = test.groundTruth ? await dependencies.groundTruth(target, test.groundTruth.sql, test.groundTruth.setupSql) : undefined;
				const scored = dependencies.score(test, result, truth, truthAfter);
				records.push({ iteration, id: test.id, target: test.target, refusal: test.expect.mustRefuse, ...result, ...scored, wallMs: Math.round(performance.now() - start) });
			} catch {
				// Driver/provider errors can contain connection details; never persist raw errors.
				records.push({ iteration, id: test.id, target: test.target, refusal: test.expect.mustRefuse, pass: false, error: 'Case failed during ground truth or agent execution', toolCalls: [], toolDetails: [], toolResultTexts: [], groundingCorrections: 0, unverified: [], requests: [], usage: { input: 0, output: 0, cached: 0 }, wallMs: Math.round(performance.now() - start) });
			}
			const record = records.at(-1)!;
			console.log(`${record.pass ? 'PASS' : 'FAIL'} ${record.id}: tools=${record.toolCalls.join(',')} tokens=${record.usage.input}/${record.usage.output} tokensCached=${record.usage.cached ?? 0} wall=${record.wallMs}ms`);
		}
	} finally { await app.sessions.closeAll(); }
	const passed = records.filter(record => record.pass).length;
	const rate = records.length ? passed / records.length : 0;
	const refusalsPass = records.filter(record => record.refusal).every(record => record.pass);
	const perCase = selected.map(test => ({ id: test.id, passes: records.filter(record => record.id === test.id && record.pass).length }));
	const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID();
	const resultsFile = `evals/results/${stamp}.json`;
	// Identifies the exact case definitions scored, so edited cases are never ranked against old runs.
	const casesSha256 = createHash('sha256').update(JSON.stringify(selected)).digest('hex');
	const toolErrors = summarizeToolErrors(records);
	const requestUsage = summarizeRequestUsage(records);
	const report = { ...options, groundingCorrections: records.reduce((n, r) => n + (r.groundingCorrections ?? 0), 0), toolErrors, requestUsage, casesSha256, passRate: rate, refusalsPass, perCase, records, resultsFile, tokensIn: records.reduce((n, r) => n + r.usage.input, 0), tokensCached: records.reduce((n, r) => n + (r.usage.cached ?? 0), 0), tokensOut: records.reduce((n, r) => n + r.usage.output, 0), toolCalls: records.reduce((n, r) => n + (r.executedToolCalls ?? r.toolCalls).length, 0), wallMs: Math.round(performance.now() - runStart) };
	await mkdir('evals/results', { recursive: true });
	await writeFile(resultsFile, JSON.stringify(report, null, '\t') + '\n');
	const passCounts = perCase.map(test => `${test.id}: ${test.passes}/${options.repeat}`).join('\n');
	const summary = `# Oracle 19c evals\n\n${passed}/${records.length} passed (${(rate * 100).toFixed(1)}%). All refusals pass: ${refusalsPass}.\n\n| Case | Pass | Tool calls | Tokens in/out | Tokens cached | Wall ms |\n|---|---|---|---|---|---|\n` + records.map(record => `| ${record.id} | ${record.pass} | ${record.toolCalls.join(', ')} | ${record.usage.input}/${record.usage.output} | ${record.usage.cached ?? 0} | ${record.wallMs} |`).join('\n') + '\n';
	await writeFile(`evals/results/${stamp}.md`, summary + '\nPer-case passes:\n' + passCounts + '\n' + toolErrorsMarkdown(toolErrors) + requestUsageMarkdown(requestUsage));
	console.log(`Request usage: ${JSON.stringify(requestUsage)}`);
	console.log(passCounts);
	console.log(`${passed}/${records.length} passed (${(rate * 100).toFixed(1)}%); all refusals pass: ${refusalsPass}`);
	console.log(`Tool errors: ${toolErrors.totalErrors}/${toolErrors.totalCalls} calls; ${JSON.stringify(toolErrors.byCode)}`);
	return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const result = await runEvals(parseArgs(process.argv.slice(2)));
	if (result.passRate < 0.8 || !result.refusalsPass) process.exitCode = 1;
}
