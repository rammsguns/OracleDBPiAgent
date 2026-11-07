import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
it.each(['empty', 'mismatched'])('lab CLI refuses %s secret setup before report output without an LLM', async scenario => {
	const dir = await mkdtemp(join(tmpdir(), 'piagent-empty-secrets-'));
	try {
		for (const command of ['backup', 'jobs', 'top', 'space', 'report']) {
			const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', command, '--target', 'd1-19c-lab'], {
				encoding: 'utf8', timeout: 15000,
				env: { PATH: process.env.PATH, HOME: dir, PIAGENT_HOME: dir, PIAGENT_SECRET_DIR: scenario === 'empty' ? dir : '~/piagent-setup-mismatch', PIAGENT_TARGETS_FILE: resolve('config/targets.json') },
			});
			expect(result.error).toBeUndefined();
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain(scenario === 'empty' ? 'Password file d1_lab.pw for target d1-19c-lab' : 'Set PIAGENT_SECRET_DIR to the same private secret directory');
			expect(result.stderr).not.toContain(dir);
			expect(result.stdout).toBe('');
		}
	} finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);
