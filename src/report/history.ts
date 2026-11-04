import { Type } from "typebox";
import { Check } from "typebox/value";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { ensureAgentHome } from "../config/environment.js";
import { agentHome } from "../config/paths.js";
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
async function directory(dir: string, target: string, targets: Targets, create: boolean, ensureDefaultHome = true): Promise<string> {
	validateReportTarget(target, targets);
	const root = resolve(dir), path = join(root, target);
	if (create) {
		if (ensureDefaultHome && process.env.PIAGENT_REPORT_DIRECTORY === undefined && root === join(agentHome(), "reports")) ensureAgentHome();
		await mkdir(root, { recursive: true, mode: 0o700 });
	}
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
export async function saveReport(dir: string, report: DatabaseReport, targets: Targets, ensureDefaultHome = true): Promise<{ json: string; markdown: string }> {
	const path = await directory(dir, report.target, targets, true, ensureDefaultHome);
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

/** Maximum bytes read from one untrusted saved snapshot. */
export const MAX_HISTORY_FILE_BYTES = 2 * 1024 * 1024;
export interface ReportHistory { target: string; reports: DatabaseReport[]; scanned: number; skipped: number; notes: string[] }
const savedReportSchema = Type.Object({
	target: Type.String(), generatedAt: Type.String(),
	sections: Type.Array(Type.Object({
		name: Type.String(), status: Type.Union([Type.Literal('ok'), Type.Literal('unavailable')]),
		source: Type.String(), columns: Type.Array(Type.String()),
		rows: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))), note: Type.String(),
	})),
});
/** Reads the newest N filenames (not N valid files), returning valid snapshots chronologically. */
export async function loadReportHistory(dir: string, target: string, targets: Targets, last = HISTORY_RETENTION): Promise<ReportHistory> {
	validateReportTarget(target, targets);
	if (!Number.isInteger(last) || last < 1 || last > HISTORY_RETENTION) throw new Error(`--last must be an integer from 1 to ${HISTORY_RETENTION}`);
	const result: ReportHistory = { target, reports: [], scanned: 0, skipped: 0, notes: [] };
	let path: string, names: string[];
	try { path = await directory(dir, target, targets, false); names = (await runs(path)).slice(0, last); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error; }
	for (const name of names.reverse()) {
		result.scanned++;
		try {
			// O_NOFOLLOW prevents a file being swapped for a symlink between inspection and open.
			const file = await open(join(path, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			try {
				const stat = await file.stat();
				if (!stat.isFile() || stat.size > MAX_HISTORY_FILE_BYTES) throw new Error('Invalid saved file');
				const buffer = Buffer.alloc(MAX_HISTORY_FILE_BYTES + 1);
				let bytes = 0;
				while (bytes < buffer.length) { const read = await file.read(buffer, bytes, buffer.length - bytes, null); if (!read.bytesRead) break; bytes += read.bytesRead; }
				if (bytes > MAX_HISTORY_FILE_BYTES) throw new Error('Oversize saved file');
				const report: unknown = JSON.parse(buffer.subarray(0, bytes).toString('utf8'));
				if (!Check(savedReportSchema, report)) throw new Error('Invalid saved schema');
				const parsed = report as DatabaseReport;
				if (parsed.target !== target || !Number.isFinite(Date.parse(parsed.generatedAt)) || new Date(parsed.generatedAt).toISOString().replace(/:/g, '-') + '.json' !== name || new Set(parsed.sections.map(s => s.name)).size !== parsed.sections.length || parsed.sections.some(s => s.rows.some(r => r.length !== s.columns.length))) throw new Error('Invalid saved report');
				result.reports.push(parsed);
			} finally { await file.close(); }
		} catch (error) {
			if (['EACCES', 'EPERM', 'EIO'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
			result.skipped++;
		}
	}
	if (result.skipped) result.notes.push(`${result.skipped} saved file(s) skipped: invalid, incompatible, oversize or unsafe.`);
	return result;
}
