import { afterEach, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mocks = vi.hoisted(() => ({ config: vi.fn(), sessions: vi.fn(), compare: vi.fn(), close: vi.fn(), log: vi.fn() }));
vi.mock('node:fs/promises', async original => {
	const actual = await original<typeof import('node:fs/promises')>();
	return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});
vi.mock('../../src/config/index.js', () => ({ loadConfig: mocks.config }));
vi.mock('../../src/oracle/index.js', () => ({ createSessionProvider: mocks.sessions }));
vi.mock('../../src/audit/index.js', () => ({ JsonlAuditSink: class {} }));
vi.mock('../../src/drift/index.js', async original => ({ ...await original<typeof import('../../src/drift/index.js')>(), compareTargets: mocks.compare }));
import { runDrift } from '../../src/drift/cli.js';
const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = 0; await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
function setup(complete = true, hasDrift = false) {
	vi.clearAllMocks(); mocks.config.mockReturnValue({ targets: [{ name: 'left' }, { name: 'right' }] }); mocks.sessions.mockReturnValue({ closeAll: mocks.close });
	mocks.compare.mockResolvedValue({ left: 'left', right: 'right', scope: 'parameters', generatedAt: '2026-11-03T00:00:00Z', complete, hasDrift, sections: [] });
	vi.spyOn(console, 'log').mockImplementation(mocks.log);
}
const options = { left: 'left', right: 'right', scope: 'parameters' };
for (const [complete, drift, code] of [[true, false, 0], [true, true, 3], [false, false, 1], [false, true, 3]] as const) it(`sets exit ${code} for complete=${complete} drift=${drift}`, async () => {
	setup(complete, drift); await runDrift({ ...options, json: true }); expect(process.exitCode).toBe(code); expect(JSON.parse(mocks.log.mock.calls[0]![0]).hasDrift).toBe(drift); expect(mocks.close).toHaveBeenCalledOnce();
});
it('validates before constructing sessions', async () => {
	setup(); await expect(runDrift({ ...options, left: '../bad' })).rejects.toThrow(); expect(mocks.sessions).not.toHaveBeenCalled();
});
it('cleans up after collection fails', async () => {
	setup(); mocks.compare.mockRejectedValueOnce(new Error('failure')); await expect(runDrift(options)).rejects.toThrow('failure'); expect(mocks.close).toHaveBeenCalledOnce();
});
it('saves private JSON and Markdown files without overwriting earlier runs', async () => {
	setup(); const dir = await mkdtemp(join(tmpdir(), 'drift-')); dirs.push(dir);
	await runDrift({ ...options, out: dir }); await runDrift({ ...options, out: dir });
	const files = await readdir(dir); expect(files).toHaveLength(4);
	for (const file of files) { expect((await stat(join(dir, file))).mode & 0o777).toBe(0o600); if (file.endsWith('.json')) expect(JSON.parse(await readFile(join(dir, file), 'utf8')).scope).toBe('parameters'); }
});
it('refuses a symlink output directory', async () => {
	setup(); const dir = await mkdtemp(join(tmpdir(), 'drift-')); dirs.push(dir); const link = join(dir, 'link'); await symlink(dir, link);
	await expect(runDrift({ ...options, out: link })).rejects.toThrow('real directory'); expect(mocks.close).toHaveBeenCalledOnce();
});

it('stages private files in the destination and publishes Markdown before the JSON commit marker', async () => {
	setup(); const dir = await mkdtemp(join(tmpdir(), 'drift-')); dirs.push(dir);
	const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
	vi.mocked(fs.rename).mockImplementationOnce(async (source, destination) => {
		const staged = await readdir(dir);
		expect(staged).toHaveLength(2); expect(staged.every(file => file.endsWith('.tmp'))).toBe(true);
		for (const file of staged) expect((await stat(join(dir, file))).mode & 0o777).toBe(0o600);
		expect(String(destination)).toMatch(/\.md$/);
		await actual.rename(source, destination);
	}).mockImplementationOnce(async (source, destination) => {
		expect((await readdir(dir)).filter(file => file.endsWith('.md'))).toHaveLength(1);
		expect(String(destination)).toMatch(/\.json$/);
		await actual.rename(source, destination);
	});
	await runDrift({ ...options, out: dir });
	expect(fs.rename).toHaveBeenCalledTimes(2);
	for (const [file, , flags] of vi.mocked(fs.writeFile).mock.calls) {
		expect(String(file)).toMatch(/\.tmp$/); expect(String(file).startsWith(dir + '/')).toBe(true);
		expect(flags).toEqual({ mode: 0o600, flag: 'wx' });
	}
	expect((await readdir(dir)).some(file => file.endsWith('.tmp'))).toBe(false);
});
for (const failure of ['json write', 'markdown rename', 'json rename']) it(`cleans up staged and uncommitted exports after ${failure} fails`, async () => {
	setup(); const dir = await mkdtemp(join(tmpdir(), 'drift-')); dirs.push(dir);
	const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
	const error = new Error('simulated export failure');
	if (failure === 'json write') {
		vi.mocked(fs.writeFile).mockImplementationOnce(actual.writeFile).mockImplementationOnce(async (file, content, flags) => {
			await actual.writeFile(file, String(content).slice(0, 5), flags); throw error;
		});
	} else {
		if (failure === 'json rename') vi.mocked(fs.rename).mockImplementationOnce(actual.rename);
		vi.mocked(fs.rename).mockRejectedValueOnce(error);
	}
	await expect(runDrift({ ...options, out: dir })).rejects.toThrow(error);
	expect(await readdir(dir)).toEqual([]); expect(mocks.close).toHaveBeenCalledOnce();
	expect(mocks.log).not.toHaveBeenCalled();
});
