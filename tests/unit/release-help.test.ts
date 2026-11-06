import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const commands = ['init', 'web', 'report', 'report history', 'report schedule', 'report schedule run', 'triage', 'space', 'sessions', 'security', 'sql', 'alertlog', 'plsql', 'plsql list', 'plsql doc', 'drift', 'targets', 'targets check', 'doctor', 'ask', 'chat'];
it.each(commands)('%s has a nonempty description and working help', command => {
	const p = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...command.split(' '), '--help'], { encoding: 'utf8', timeout: 10000 });
	expect(p.status, p.stderr).toBe(0);
	const description = p.stdout.split('\n\n')[1]?.trim();
	expect(description).toBeTruthy();
	expect(description).not.toMatch(/^(Options|Commands):/);
	if (command === 'drift') {
		const source = readFileSync('src/drift/index.ts', 'utf8');
		const scopes = [...source.matchAll(/scope === '(\w+)'/g)].map(m => m[1]!);
		scopes.push('schema', 'objects');
		for (const scope of scopes) expect(p.stdout).toContain(scope);
	}
});

it('covers every registered CLI command in the help smoke', () => {
	const source = readFileSync('src/cli/index.ts', 'utf8');
	const registered = [...source.matchAll(/\.command\("([^"]+)"\)/g)].map(match => match[1]!.split(' ')[0]!).sort();
	expect(commands.map(command => command.split(' ').at(-1)!).sort()).toEqual(registered);
});
