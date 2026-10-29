import { chmod, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderMarkdown, type DatabaseReport } from './index.js';
export const HISTORY_RETENTION = 30;
export { reportDirectory } from "../config/paths.js";
type Targets = readonly { name: string }[];
export function validateReportTarget(target: string, targets: Targets): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(target) || !targets.some(t => t.name === target)) throw new Error('Invalid or unknown report target');
}
const stampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.json$/;
async function directory(dir: string, target: string, targets: Targets, create: boolean): Promise<string> {
	validateReportTarget(target, targets);
	const root = resolve(dir), path = join(root, target);
	if (create) { await mkdir(root, { recursive: true, mode: 0o700 }); }
	for (const p of [root, path]) {
		try { const stat = await lstat(p); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Report directory must be a real directory'); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; if (!create) throw error; await mkdir(p, { mode: 0o700 }); }
		if (create) await chmod(p, 0o700);
	}
	return path;
}
async function runs(path: string): Promise<string[]> { return (await readdir(path)).filter(n => stampPattern.test(n)).sort().reverse(); }
export async function loadLatestReport(dir: string, target: string, targets: Targets): Promise<DatabaseReport | null> {
	validateReportTarget(target, targets);
	try {
		const path = await directory(dir, target, targets, false), latest = (await runs(path))[0];
		if (!latest) return null;
		const file = join(path, latest);
		if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink()) throw new Error('Invalid saved report file');
		const report = JSON.parse(await readFile(file, 'utf8')) as DatabaseReport;
		if (report.target !== target || !Array.isArray(report.sections) || !Number.isFinite(Date.parse(report.generatedAt))) throw new Error('Invalid saved report');
		return report;
	} catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function saveReport(dir: string, report: DatabaseReport, targets: Targets): Promise<{ json: string; markdown: string }> {
	const path = await directory(dir, report.target, targets, true);
	if (!Number.isFinite(Date.parse(report.generatedAt))) throw new Error('Invalid report timestamp');
	const stamp = new Date(report.generatedAt).toISOString().replace(/:/g, '-');
	const json = join(path, `${stamp}.json`), markdown = join(path, `${stamp}.md`);
	const temps: string[] = [];
	try {
		// JSON is the commit marker: readers never select a run before Markdown is complete.
		for (const [file, content] of [[markdown, renderMarkdown(report)], [json, JSON.stringify(report) + '\n']] as const) {
			const temp = `${file}.${randomUUID()}.tmp`; temps.push(temp);
			await writeFile(temp, content, { mode: 0o600, flag: 'wx' }); await rename(temp, file);
		}
	} finally { await Promise.all(temps.map(p => unlink(p).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }))); }
	for (const old of (await runs(path)).slice(HISTORY_RETENTION)) for (const ext of ['md', 'json']) await unlink(join(path, old.replace(/json$/, ext))).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
	return { json, markdown };
}
