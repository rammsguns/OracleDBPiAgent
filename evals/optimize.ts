import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { readBoundedFile } from '../src/config/tunables.js';
import { parseArgs, runEvals, type RunOptions } from './run.js';

export const TUNABLE_KEYS = ['PIAGENT_LLM_THINKING', 'PIAGENT_LLM_MAX_OUTPUT_TOKENS', 'PIAGENT_LLM_TEMPERATURE', 'PIAGENT_PROMPT_APPENDIX_FILE', 'PIAGENT_TOOL_NOTES_FILE'] as const;
const FILE_KEYS = ['PIAGENT_PROMPT_APPENDIX_FILE', 'PIAGENT_TOOL_NOTES_FILE'];
export function parseOptimizeArgs(args: string[]): { report: boolean; variant?: string; run: RunOptions } {
	const rest: string[] = [];
	let variant: string | undefined, report = false;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--report') report = true;
		else if (args[i] === '--variant') {
			if (variant || !args[i + 1] || args[i + 1]!.startsWith('-')) throw new Error('Expected one variant file');
			variant = args[++i];
		} else rest.push(args[i]!);
	}
	if (report ? variant !== undefined || rest.length > 0 : !variant) throw new Error('Use --variant <file> or --report');
	return { report, variant, run: parseArgs(rest) };
}
export function validateVariant(raw: unknown): { name: string; description: string; env: Record<string, string> } {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid variant');
	const value = raw as Record<string, unknown>;
	if (Object.keys(value).some(key => !['name', 'description', 'env'].includes(key)) || typeof value.name !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.name) || typeof value.description !== 'string' || value.description.length > 1024 || !value.env || typeof value.env !== 'object' || Array.isArray(value.env)) throw new Error('Invalid variant');
	const env: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value.env)) {
		if (!(TUNABLE_KEYS as readonly string[]).includes(key) || !['string', 'number'].includes(typeof entry) || (typeof entry === 'number' && !Number.isFinite(entry))) throw new Error('Variant contains an unsupported tunable');
		env[key] = String(entry);
		if (!env[key]!.trim()) throw new Error('Empty variant tunable');
	}
	return { name: value.name, description: value.description, env };
}
async function containedFile(file: string, root: string): Promise<string> {
	const actual = await realpath(resolve(file));
	const rel = relative(await realpath(root), actual);
	if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Variant files must live under evals/variants');
	return actual;
}
export async function loadVariant(file: string, root = 'evals/variants') {
	const actual = await containedFile(file, root);
	if (!actual.endsWith('.json')) throw new Error('Variant must be JSON');
	const bytes = readBoundedFile(actual);
	const variant = validateVariant(JSON.parse(bytes.toString('utf8')));
	const hash = createHash('sha256').update(bytes);
	for (const key of FILE_KEYS) if (variant.env[key]) {
		const referenced = await containedFile(variant.env[key]!, root);
		const contents = readBoundedFile(referenced);
		hash.update(key).update(String(contents.length)).update(':').update(contents);
		variant.env[key] = referenced;
	}
	return { ...variant, sha256: hash.digest('hex') };
}
export function variantEnvironment(base: NodeJS.ProcessEnv, overrides: Record<string, string>): NodeJS.ProcessEnv {
	// Baseline means current defaults even when the invoking shell has tunables set.
	const env = { ...base };
	for (const key of TUNABLE_KEYS) delete env[key];
	return { ...env, ...validateVariant({ name: 'environment', description: '', env: overrides }).env };
}
export interface LedgerRecord {
	at: string; variant: string; variantSha256: string; gitHead: string;
	suite: string; split: string; repeat: number; passRate: number; refusalsPass: boolean;
	perCase: Record<string, number>; tokensIn: number; tokensOut: number; toolCalls: number; wallMs: number; resultsFile: string;
}
export async function appendLedger(record: LedgerRecord, file = 'var/optimize/ledger.jsonl') {
	// Explicit projection: never serialize config, environment, answers or credentials.
	const { at, variant, variantSha256, gitHead, suite, split, repeat, passRate, refusalsPass, perCase, tokensIn, tokensOut, toolCalls, wallMs, resultsFile } = record;
	await mkdir(dirname(file), { recursive: true });
	await appendFile(file, JSON.stringify({ at, variant, variantSha256, gitHead, suite, split, repeat, passRate, refusalsPass, perCase: Object.fromEntries(Object.entries(perCase).map(([id, passes]) => [id, passes])), tokensIn, tokensOut, toolCalls, wallMs, resultsFile }) + '\n');
}
export function leaderboard(records: LedgerRecord[]): string {
	const groups = new Map<string, LedgerRecord[]>();
	for (const record of records) {
		const key = `${record.suite} / ${record.split}`;
		groups.set(key, [...(groups.get(key) ?? []), record]);
	}
	return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
		const eligible = rows.filter(row => row.refusalsPass === true).sort((a, b) => b.passRate - a.passRate || (a.tokensIn + a.tokensOut) - (b.tokensIn + b.tokensOut));
		return `${key}\n${eligible.map((row, i) => `${i + 1}. ${row.variant} ${(100 * row.passRate).toFixed(1)}% tokens=${row.tokensIn + row.tokensOut} repeat=${row.repeat} hash=${row.variantSha256}`).join('\n')}\nDisqualified (refusals): ${rows.filter(row => row.refusalsPass !== true).map(row => row.variant).join(', ') || 'none'}`;
	}).join('\n\n');
}
export async function optimize(args: string[]) {
	const options = parseOptimizeArgs(args);
	if (options.report) {
		let text: string;
		try { text = await readFile('var/optimize/ledger.jsonl', 'utf8'); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; text = ''; }
		console.log(leaderboard(text.split('\n').filter(Boolean).map(line => JSON.parse(line))) || 'No optimization records');
		return;
	}
	const variant = await loadVariant(options.variant!);
	const saved = { ...process.env };
	const env = variantEnvironment(saved, variant.env);
	loadConfig(env); // Reject invalid settings before touching dependencies.
	try {
		for (const key of TUNABLE_KEYS) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
		const result = await runEvals(options.run);
		await appendLedger({ at: new Date().toISOString(), variant: variant.name, variantSha256: variant.sha256, gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), suite: resolve(options.run.suite), split: options.run.split ?? 'all', repeat: options.run.repeat, passRate: result.passRate, refusalsPass: result.refusalsPass, perCase: Object.fromEntries(result.perCase.map(({ id, passes }) => [id, passes])), tokensIn: result.tokensIn, tokensOut: result.tokensOut, toolCalls: result.toolCalls, wallMs: result.wallMs, resultsFile: result.resultsFile });
		if (result.passRate < 0.8 || !result.refusalsPass) process.exitCode = 1;
	} finally {
		for (const key of TUNABLE_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await optimize(process.argv.slice(2));
