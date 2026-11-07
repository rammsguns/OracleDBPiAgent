import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state = vi.hoisted(() => ({ config: undefined as any }));
vi.mock('../../src/config/index.js', async original => ({ ...await original<typeof import('../../src/config/index.js')>(), loadConfig: () => state.config }));
vi.mock('../../src/llm/index.js', async original => ({ ...await original<typeof import('../../src/llm/index.js')>(), checkStrataHealth: async () => {} }));
import { loadConfig } from '../../src/config/index.js';
import { main, handleCliError } from '../../src/cli/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { SafeConfigError } from '../../src/config/safeErrors.js';
import { connectionGuidance, recordConnectionFailure, withConnectionFailures } from '../../src/oracle/connectionErrors.js';
let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'piagent-setup-'));
	const actual = await vi.importActual<typeof import('../../src/config/index.js')>('../../src/config/index.js');
	state.config = actual.loadConfig({ PIAGENT_TARGETS_FILE: join(process.cwd(), 'config/targets.json'), PIAGENT_SECRET_DIR: directory, PIAGENT_HOME: directory });
	vi.stubEnv('PIAGENT_SECRET_DIR', directory);
	vi.stubEnv('PIAGENT_HOME', directory);
	vi.stubEnv('PIAGENT_ENV_FILE', undefined);
	process.exitCode = 0;
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); process.exitCode = 0; await rm(directory, { recursive: true, force: true }); });
const families = [
	['backup'], ['jobs'], ['top'], ['space'], ['sessions'], ['security'],
	['sql', '--sql-id', 'abc1234567890'], ['alertlog'], ['plsql', 'list'],
	['drift', '--scope', 'parameters', '--left', 'd1-19c-lab', '--right', 'p1-19c-prod'], ['triage', '--issue', 'ORA-00600'],
	['report', '--sections', 'identity'], ['targets', 'check'], ['doctor'],
];
for (const scenario of ['missing', 'mismatched']) it.each(families)(`${scenario} setup: %j reaches stderr with exit 1`, async (...args) => {
	if (scenario === 'mismatched') state.config.secretDir = join(directory, 'other');
	const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
	const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
	const command = [...args];
	if (!['doctor', 'drift'].includes(command[0]!)) command.push('--target', 'd1-19c-lab');
	await main(['node', 'piagent', ...command]).catch(handleCliError);
	expect(process.exitCode).toBe(1);
	const text = stderr.mock.calls.flat().join('\n');
	expect(text).toContain(scenario === 'missing' ? 'Password file d1_lab.pw for target d1-19c-lab' : 'Set PIAGENT_SECRET_DIR to the same private secret directory');
	expect(text).not.toContain(directory);
	expect(text).not.toContain('piagent failed');
	if (command[0] === 'report') expect(stdout).not.toHaveBeenCalled();
});
it.each(['missing', 'empty', 'whitespace', 'directory', 'unreadable'])('password file %s is a recorded SafeConfigError without a path', async kind => {
	const file = join(directory, 'd1_lab.pw');
	if (kind === 'directory') await mkdir(file);
	else if (kind !== 'missing') { await writeFile(file, kind === 'whitespace' ? ' \n' : '', { mode: 0o600 }); if (kind === 'unreadable') await chmod(file, 0); }
	const provider = createSessionProvider(loadConfig());
	await expect(withConnectionFailures(async () => {
		try { await provider.get('d1-19c-lab'); } catch (error) {
			expect(error).toBeInstanceOf(SafeConfigError);
			expect(connectionGuidance(error)).toContain('d1_lab.pw');
			expect(String(error)).not.toContain(directory);
		}
	})).rejects.toThrow('Password file d1_lab.pw');
});
it('retains catalog errors through the connection-failure layer', async () => {
	const error = new SafeConfigError('Set PIAGENT_SECRET_DIR to the same private secret directory configured for this process.');
	expect(recordConnectionFailure(error)).toBe(error);
	await expect(withConnectionFailures(async () => { recordConnectionFailure(error); })).rejects.toBe(error);
});
it.each(['missing', 'mismatched'])('web DB and report surfaces preserve %s setup guidance', async scenario => {
	if (scenario === 'mismatched') state.config.secretDir = join(directory, 'other');
	const { SessionManager } = await import('../../src/web/sessions.js');
	const { createWebServer } = await import('../../src/web/server.js');
	const manager = new SessionManager({ config: state.config });
	const web = createWebServer({ manager, port: 0, token: 'unit-test', sessionFactory: async () => createSessionProvider(state.config) });
	const url = new URL(await web.listen());
	try {
		for (const path of ['/api/backup', '/api/jobs', '/api/top', '/api/space', '/api/security', '/api/db-sessions', '/api/sql', '/api/alertlog', '/api/plsql/list', '/api/report']) {
			const response = await fetch(new URL(path + '?target=d1-19c-lab' + (path === '/api/sql' ? '&text=select' : ''), url), { headers: { authorization: 'Bearer unit-test' } });
			const body = await response.text();
			expect(response.status, path + body).toBe(500);
			expect(body, path).toContain(scenario === 'missing' ? 'Password file d1_lab.pw' : 'Set PIAGENT_SECRET_DIR');
			expect(body).not.toContain(directory);
		}
		for (const [path, data] of [['/api/triage', { target: 'd1-19c-lab', issue: 'ORA-00600' }], ['/api/drift', { left: 'd1-19c-lab', right: 'p1-19c-prod', scope: 'parameters' }]] as const) {
			const response = await fetch(new URL(path, url), { method: 'POST', headers: { authorization: 'Bearer unit-test', 'content-type': 'application/json' }, body: JSON.stringify(data) });
			expect(response.status, path).toBe(500);
			expect(await response.text(), path).toContain(scenario === 'missing' ? 'Password file d1_lab.pw' : 'Set PIAGENT_SECRET_DIR');
		}
	} finally { await web.close(); }
});
