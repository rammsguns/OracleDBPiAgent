import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
it.each([
	[['--target','d1-19c-lab','--seconds','3'], 'seconds must be an integer from 5 to 120'],
	[['--target','d1-19c-lab','--seconds','NaN'], 'seconds must be an integer from 5 to 120'],
	[['--target','invalid-target'], 'Unknown top target'],
	[[], "required option '--target <target>' not specified"],
	[['--target','d1-19c-lab','--invalid'], "unknown option '--invalid'"],
] as const)('prints a specific usage error with exit 2: %j', (args, message) => {
	const result = spawnSync(process.execPath, ['--import','tsx','src/cli/index.ts','top',...args], {
		encoding:'utf8', timeout:10000,
		env: { ...process.env, PIAGENT_TARGETS_FILE:resolve('config/targets.json') },
	});
	expect(result.status, result.stderr).toBe(2); expect(result.stderr).toContain(message);
	expect(result.stderr).not.toContain('check local configuration');
});
