import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLatestReport, loadReportHistory, saveReport } from '../../src/report/history.js';
const targets = [{ name: 'lab' }];
const dirs: string[] = [];
async function temp() { const p = await mkdtemp(join(tmpdir(), 'report-history-')); dirs.push(p); return p; }
const report = (i = 0) => ({ target: 'lab', generatedAt: new Date(Date.UTC(2026, 9, 29, 0, 0, i)).toISOString(), sections: [] });
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
it('round trips atomic private files and retains newest 30 complete pairs', async () => {
	const dir = await temp(); expect(await loadLatestReport(dir, 'lab', targets)).toBeNull();
	for (let i = 0; i < 32; i++) await saveReport(dir, report(i), targets);
	const files = await readdir(join(dir, 'lab')); expect(files).toHaveLength(60); expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
	expect(await loadLatestReport(dir, 'lab', targets)).toEqual(report(31));
	expect((await stat(join(dir, 'lab'))).mode & 0o777).toBe(0o700); expect((await stat(dir)).mode & 0o777).toBe(0o700);
	for (const f of files) expect((await stat(join(dir, 'lab', f))).mode & 0o777).toBe(0o600);
	expect(await readFile(join(dir, 'lab', files.find(f => f.endsWith('.md'))!), 'utf8')).toContain('# Oracle 19c report');
});
it.each(['../escape', 'unknown', '/tmp/escape', 'lab/../other'])('rejects unsafe or unconfigured target %s before writes', async target => {
	const dir = await temp(); await expect(saveReport(dir, { ...report(), target }, [...targets, { name: '../escape' }])).rejects.toThrow();
	await expect(loadLatestReport(dir, target, targets)).rejects.toThrow(); expect(await readdir(dir)).toEqual([]);
});
it('rejects symlinked target directories', async () => {
	const dir = await temp(), other = await temp(); await symlink(other, join(dir, 'lab'));
	await expect(saveReport(dir, report(), targets)).rejects.toThrow(); expect(await readdir(other)).toEqual([]);
});
it('failed serialization leaves no JSON commit marker or temporary file', async () => {
	const dir = await temp(); const bad = { ...report(), sections: [], extra: 1n };
	await expect(saveReport(dir, bad, targets)).rejects.toThrow(); expect(await readdir(join(dir, 'lab'))).toEqual([]);
});

it('loads older saved history with blank lines between Markdown table rows', async () => {
	const dir = await temp();
	const saved = { ...report(), sections: [{ name: 'identity', status: 'ok' as const, source: 'test', columns: ['N'], rows: [[1]], note: '' }] };
	const files = await saveReport(dir, saved, targets);
	await writeFile(files.markdown, '# Oracle 19c report: lab\n\n## identity\n\n| N |\n\n| --- |\n\n| 1 |\n');
	expect(await loadLatestReport(dir, 'lab', targets)).toEqual(saved);
	expect((await loadReportHistory(dir, 'lab', targets)).reports).toEqual([saved]);
});
