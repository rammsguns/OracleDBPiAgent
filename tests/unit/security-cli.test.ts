import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.each([
	['--check', 'unknown'],
	['--check', 'profiles,'],
	['--who-can', 'HR.EMPLOYEES;DROP'],
	['--check', 'who-can'],
	['--json', '--markdown'],
])('security CLI returns usage exit 2 for %j', (...args: string[]) => {
	const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'security', '--target', 'd1-19c-lab', ...args], { encoding: 'utf8', timeout: 10000 });
	expect(child.status, child.stderr).toBe(2);
	expect(child.stdout).toBe('');
});
