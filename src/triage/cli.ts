import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { checkStrataHealth } from '../llm/index.js';
import { summarizeReport, checkReportSummary } from '../report/summarize.js';
import { triage, renderTriageMarkdown, type TriageResult } from './index.js';
import { sinceHours } from './parse.js';
import type { LlmConfig } from '../contracts.js';
/** Injected summarizer permits unit coverage without any model invocation. */
export async function summarizeTriage(markdown: string, config: LlmConfig, summarize = summarizeReport) {
	const narrative = await summarize(markdown, config);
	return { narrative, unverified: checkReportSummary(narrative.replace(/\bPLS-\d{3,5}\b/g, ''), markdown, config) };
}
export async function saveTriage(directory: string, result: TriageResult, markdown: string) {
	const dir = resolve(directory); await mkdir(dir, { recursive: true, mode: 0o700 });
	const stat = await lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Triage output must be a real directory');
	const stem = join(dir, `triage-${randomUUID()}`), temps: string[] = [];
	const files = [[stem + '.md', markdown], [stem + '.json', JSON.stringify(result) + '\n']] as const;
	let published = false, committed = false;
	try {
		for (const [file, content] of files) { const temp = `${file}.${randomUUID()}.tmp`; temps.push(temp); await writeFile(temp, content, { mode: 0o600, flag: 'wx' }); }
		await rename(temps[0]!, files[0][0]); published = true;
		await rename(temps[1]!, files[1][0]); committed = true;
	} finally {
		for (const file of [...temps, ...(!committed && published ? [files[0][0]] : [])]) await unlink(file).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
	}
	return files.map(([file]) => file);
}
export async function runTriage(options: { target: string; issue?: string; issueFile?: string; since?: string; json?: boolean; out?: string; summarize?: boolean }) {
	if (options.issue !== undefined && options.issueFile !== undefined) throw new Error('Choose --issue or --issue-file');
	sinceHours(options.since);
	const issue = options.issueFile ? await readFile(options.issueFile, 'utf8') : options.issue;
	if ((issue?.length ?? 0) > 65536) throw new Error('Issue text exceeds 64 KiB');
	const config = loadConfig();
	if (!config.targets.some(t => t.name === options.target)) throw new Error('Unknown triage target');
	const sessions = createSessionProvider(config);
	const controller = new AbortController(), cancel = () => controller.abort();
	process.once('SIGINT', cancel);
	try {
		const result = await triage({ config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() }, { target: options.target, issue, since: options.since, signal: controller.signal });
		let markdown = renderTriageMarkdown(result);
		let summary: Awaited<ReturnType<typeof summarizeTriage>> | undefined;
		if (options.summarize) {
			await checkStrataHealth(config.llm);
			summary = await summarizeTriage(markdown, config.llm);
			markdown += `\n## Strata narrative\n\n${summary.narrative}\n\nUnverified numbers: ${summary.unverified.join(', ') || 'none'}\n`;
		}
		const output = summary ? { ...result, summary } : result;
		if (options.out) await saveTriage(options.out, output, markdown);
		console.log(options.json ? JSON.stringify(output) : markdown);
	} finally { process.removeListener('SIGINT', cancel); await sessions.closeAll(); }
}
