import { afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ rename: vi.fn() }));
vi.mock('node:fs/promises', async original => {
	const real = await original<typeof import('node:fs/promises')>();
	return { ...real, rename: async (from: string, to: string) => { await hooks.rename(from, to); return real.rename(from, to); } };
});
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLatestReport, saveReport } from '../../src/report/history.js';
const targets = [{ name: 'lab' }];
const report = (day: number) => ({ target: 'lab', generatedAt: `2026-10-${day}T12:00:00.000Z`, sections: [] });
let dir: string;
afterEach(async () => { hooks.rename.mockReset(); if (dir) await rm(dir, { recursive: true, force: true }); });
it('renames complete private temp files and publishes JSON last', async () => {
	dir = await mkdtemp(join(tmpdir(), 'report-atomic-')); await saveReport(dir, report(28), targets);
	hooks.rename.mockClear();
	hooks.rename.mockImplementation(async (from: string, to: string) => {
		expect(from).toMatch(/\.tmp$/); expect((await stat(from)).mode & 0o777).toBe(0o600);
		expect(await readFile(from, 'utf8')).not.toBe('');
		expect(await loadLatestReport(dir, 'lab', targets)).toEqual(report(28));
		if (to.endsWith('.json')) expect(await readFile(to.replace(/json$/, 'md'), 'utf8')).toContain('2026-10-29');
	});
	await saveReport(dir, report(29), targets);
	expect(hooks.rename).toHaveBeenCalledTimes(2); expect(await loadLatestReport(dir, 'lab', targets)).toEqual(report(29));
});
it('failed JSON publication preserves the previous baseline and cleans temp files', async () => {
	dir = await mkdtemp(join(tmpdir(), 'report-atomic-')); await saveReport(dir, report(28), targets);
	hooks.rename.mockClear();
	hooks.rename.mockImplementation(async (_from: string, to: string) => { if (to.endsWith('.json')) throw new Error('simulated publication failure'); });
	await expect(saveReport(dir, report(29), targets)).rejects.toThrow('simulated');
	expect(await loadLatestReport(dir, 'lab', targets)).toEqual(report(28));
	expect((await readdir(join(dir, 'lab'))).some(n => n.endsWith('.tmp'))).toBe(false);
});
