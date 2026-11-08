import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.each([[], ['--json']])('unknown backup target returns usage exit 2 %j', (...args: string[]) => {
	const p = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'backup', '--target', 'unknown', ...args], { encoding: 'utf8', timeout: 10000 });
	expect(p.status, p.stderr).toBe(2);
	expect(p.stdout).toBe('');
	expect(p.stderr.trim()).toBe('Unknown target unknown; configured targets: d1-19c-lab, p1-19c-prod, c1-19c-pdb, c1s-19c-stby (see piagent targets)');
});
