import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.each([
	['--section','unknown'], ['--section','active,'], ['--min-tx-seconds','-1'], ['--min-tx-seconds','86401'],
	['--min-tx-seconds','1.5'], ['--top','51'], ['--top','0'], ['--top','NaN'], ['--json','--markdown'], ['--target','unknown'],
	['--unknown'], ['--top'],
])('sessions returns usage exit 2 for %j', (...args: string[]) => {
	const p = spawnSync(process.execPath, ['--import','tsx','src/cli/index.ts','sessions','--target','d1-19c-lab', ...args], { encoding:'utf8', timeout:10000 });
	expect(p.status, p.stderr).toBe(2); expect(p.stdout).toBe('');
});
it('requires a target and supports help', () => {
	const run = (...args: string[]) => spawnSync(process.execPath, ['--import','tsx','src/cli/index.ts','sessions', ...args], { encoding:'utf8', timeout:10000 });
	expect(run().status).toBe(2); expect(run('--help').status).toBe(0);
});
