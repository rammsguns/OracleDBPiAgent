import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { initializeHome, loadEnvironment, SafeConfigError } from '../../src/config/environment.js';

const message = 'PIAGENT_SECRET_DIR still holds the init placeholder /absolute/path/to/db-secrets. Edit your private .env or export PIAGENT_SECRET_DIR to your private database password directory.';
it('rejects the init secret-dir placeholder as a reviewed SafeConfigError', () => {
	try { loadConfig({ PIAGENT_SECRET_DIR: '/absolute/path/to/db-secrets/.' }); throw new Error('accepted placeholder'); }
	catch (error) { expect(error).toBeInstanceOf(SafeConfigError); expect((error as Error).message).toBe(message); }
});
it('allows an explicit secret-dir export to override the private init .env', () => {
	const home = mkdtempSync(join(tmpdir(), 'piagent-secret-env-'));
	try {
		chmodSync(home, 0o700); initializeHome({ PIAGENT_HOME: home });
		const env = { PIAGENT_HOME: home, PIAGENT_SECRET_DIR: join(home, 'unused-secrets') };
		loadEnvironment(env);
		expect(loadConfig(env).secretDir).toBe(env.PIAGENT_SECRET_DIR);
	} finally { rmSync(home, { recursive: true, force: true }); }
});
it('packaged CLI rejects every DB command before network access with init placeholders', () => {
	const root = mkdtempSync(join(tmpdir(), 'piagent-secret-package-'));
	try {
		const pkg = join(root, 'package'), home = join(root, 'home');
		mkdirSync(pkg); mkdirSync(home, { mode: 0o700 });
		const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--outDir', join(pkg, 'dist')], { encoding: 'utf8', timeout: 60000 });
		expect(build.status, build.stdout + build.stderr).toBe(0);
		for (const file of ['package.json', '.env.example', 'config']) cpSync(file, join(pkg, file), { recursive: true });
		symlinkSync(resolve('node_modules'), join(pkg, 'node_modules'));
		const guard = join(root, 'guard.mjs');
		writeFileSync(guard, `import net from 'node:net'; const deny = () => { process.stderr.write('NETWORK_ATTEMPT'); process.exit(97); }; net.Socket.prototype.connect = deny; globalThis.fetch = deny;`);
		const run = (args: string[]) => spawnSync(process.execPath, ['--import', guard, join(pkg, 'dist/cli/index.js'), ...args], {
			cwd: root, env: { PATH: process.env.PATH, HOME: root, PIAGENT_HOME: home }, encoding: 'utf8', timeout: 15000,
		});
		expect(run(['init']).status).toBe(0);
		for (const args of [
			['plsql', 'list', '--target', 'd1-19c-lab'], ['plsql', 'doc', '--target', 'd1-19c-lab', '--object', 'SH.EXAMPLE'],
			['drift', '--left', 'd1-19c-lab', '--right', 'p1-19c-prod', '--scope', 'parameters'],
			['sql', '--target', 'd1-19c-lab', '--text', 'test'],
			['ask', 'test'], ['chat'], ['doctor'], ['targets', 'check', '--target', 'd1-19c-lab'], ['report', '--target', 'd1-19c-lab'],
			...['sessions', 'space', 'security', 'alertlog', 'triage', 'backup', 'jobs', 'top'].map(command => [command, '--target', 'd1-19c-lab']),
		]) {
			const child = run(args);
			expect(child.error, args.join(' ')).toBeUndefined();
			expect(child.status, args.join(' ') + child.stderr).toBe(1);
			expect(child.stderr.trim(), args.join(' ')).toBe(message);
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
}, 120000);
