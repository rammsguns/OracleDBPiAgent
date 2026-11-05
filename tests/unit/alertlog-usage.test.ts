import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { AlertlogUsageError, readAlertLog } from '../../src/alertlog/index.js';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext } from '../../src/contracts.js';
const execute = promisify(execFile);
for (const [flags, message] of [
	[['--since', '31d'], '--since must be a positive duration (m/h/d), at most 30d'],
	[['--limit', '0'], 'limit must be a positive integer'],
	[['--level', 'bad'], 'level must be default, all, or an integer from 1 to 32'],
	[['--code', 'INVALID'], 'codes must contain at most 20 ORA-/TNS- codes with five digits'],
	[['--from', 'bad', '--to', 'bad'], 'Window timestamps require ISO date/time with a timezone'],
	[['--json', '--markdown'], 'Choose --json or --markdown'],
	[['--incidents', '--grep', 'x'], 'Incident mode accepts window and limit options only'],
] as const) it(`prints specific usage error with exit 2 for ${flags.join(' ')}`, async () => {
	let failure: { code?: number; stderr?: string; stdout?: string } | undefined;
	try { await execute(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'alertlog', '--target', 'd1-19c-lab', ...flags], { timeout: 15000 }); }
	catch (error) { failure = error as typeof failure; }
	expect(failure?.code).toBe(2); expect(failure?.stderr?.trim()).toBe(message); expect(failure?.stdout).toBe('');
}, 20000);
it('exports usage errors from reader validation without acquiring a session', async () => {
	const ctx: ToolContext = { config: loadConfig(), runId: 'usage', audit: { record: async () => {} }, sessions: { get: async () => { throw new Error('must not connect'); }, closeAll: async () => {} } };
	await expect(readAlertLog(ctx, 'd1-19c-lab', { since: '31d' })).rejects.toBeInstanceOf(AlertlogUsageError);
});
