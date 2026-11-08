import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const fakes = vi.hoisted(() => ({ provider: vi.fn(), config: { targets: [{ name: 'first' }, { name: 'second' }] } }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: () => fakes.config }));
vi.mock('../../src/oracle/index.js', () => ({ createSessionProvider: fakes.provider }));
afterEach(() => vi.clearAllMocks());
it.each(['backup', 'space', 'top', 'sessions', 'security', 'sqlperf', 'plsql', 'check', 'jobs', 'alertlog'])('%s rejects unknown targets before creating a provider', async name => {
	const module = await import(`../../src/${name}/cli.ts`);
	const options = { target: 'missing', sqlId: '0123456789abc' };
	const run = name === 'plsql' ? () => module.runPlsql('list', options)
		: () => module[({ sqlperf: 'runSql', alertlog: 'runAlertLog' } as Record<string, string>)[name] ?? 'run' + name[0]!.toUpperCase() + name.slice(1)](options);
	await expect(run()).rejects.toThrow('Unknown target missing; configured targets: first, second (see piagent targets)');
	expect(fakes.provider).not.toHaveBeenCalled();
});
it.each([
	['backup'], ['space'], ['top'], ['sessions'], ['security'], ['sql', '--sql-id', '0123456789abc'],
	['plsql', 'list'], ['plsql', 'doc', '--object', 'APP.TEST'], ['check'], ['jobs'], ['alertlog'],
	['targets', 'check'], ['report'], ['report', 'history'], ['report', 'schedule', '--every', '1h'], ['report', 'schedule', 'run'],
	['triage', '--issue', 'test'], ['ask', 'test'], ['chat'],
])('CLI %j exits 2 with configured target guidance', (...args: string[]) => {
	const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...args, '--target', 'missing'], {
		encoding: 'utf8', timeout: 15000,
		env: { PATH: process.env.PATH, HOME: process.env.HOME, PIAGENT_TARGETS_FILE: resolve('config/targets.json') },
	});
	expect(child.error).toBeUndefined();
	expect(child.status, child.stderr).toBe(2);
	expect(child.stdout).toBe('');
	expect(child.stderr.trim()).toBe((args[0] === 'check' ? 'Usage/config error: ' : '') + 'Unknown target missing; configured targets: d1-19c-lab, p1-19c-prod, c1-19c-pdb, c1s-19c-stby (see piagent targets)');
});

it('shared usage guidance preserves safe names and omits unsafe input', async () => {
	const { requireConfiguredTarget, TargetUsageError } = await import('../../src/config/targetUsage.js');
	expect(() => requireConfiguredTarget('first', fakes.config.targets)).not.toThrow();
	expect(() => requireConfiguredTarget('missing', fakes.config.targets)).toThrow(TargetUsageError);
	expect(() => requireConfiguredTarget('secret/unsafe\nvalue', fakes.config.targets)).toThrow('Unknown target; configured targets: first, second (see piagent targets)');
});
