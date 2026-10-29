import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn(), closeAll: vi.fn(), summary: vi.fn() }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: () => ({ defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 100, statementTimeoutSeconds: 30 }, llm: {} }) }));
vi.mock('../../src/agent/dbToolsAdapter.js', () => ({ createSessions: async () => ({ get: async () => ({ query: mocks.query, close: mocks.close }), closeAll: mocks.closeAll }) }));
vi.mock('../../src/audit/index.js', () => ({ JsonlAuditSink: class { async record() {} } }));
vi.mock('../../src/report/summarize.js', async importOriginal => ({ ...await importOriginal<typeof import('../../src/report/summarize.js')>(), summarizeReport: mocks.summary }));
import { main } from '../../src/cli/index.js';
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ columns: ['N'], rows: [[1]], truncated: false, elapsedMs: 1 }); mocks.summary.mockResolvedValue('Summary cites identity.'); });
it('defaults to Markdown and requires no LLM for reports', async () => {
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await main(['node', 'piagent', 'report', '--target', 'lab', '--sections', 'identity']);
		expect(log.mock.calls[0]?.[0]).toContain('# Oracle 19c report: lab'); expect(mocks.summary).not.toHaveBeenCalled(); expect(mocks.closeAll).toHaveBeenCalled();
	} finally { log.mockRestore(); }
});
it('keeps stable JSON and prints a requested summary after it exactly once', async () => {
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await main(['node', 'piagent', 'report', '--target', 'lab', '--sections', 'identity', '--json', '--summarize']);
		expect(JSON.parse(log.mock.calls[0]?.[0])).toMatchObject({ target: 'lab', sections: [{ name: 'identity', status: 'ok' }] });
		expect(log.mock.calls[1]?.[0]).toBe('Summary cites identity.'); expect(mocks.summary).toHaveBeenCalledTimes(1); expect(mocks.summary.mock.calls[0]?.[0]).toContain('## identity');
	} finally { log.mockRestore(); }
});
it('rejects conflicting formats', async () => {
	await expect(main(['node', 'piagent', 'report', '--target', 'lab', '--json', '--md'])).rejects.toThrow('Choose --json or --md');
});

it('prints unsupported numbers after the summary without changing the JSON line', async () => {
	mocks.summary.mockResolvedValue('Invented 98,765 rows in PROMO.');
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await main(['node', 'piagent', 'report', '--target', 'lab', '--json', '--summarize', '--sections', 'identity']);
		expect(JSON.parse(log.mock.calls[0]?.[0]).sections).toHaveLength(1);
		expect(log.mock.calls.slice(1)).toEqual([['Invented 98,765 rows in PROMO.'], ['Unverified: 98,765']]);
		expect(mocks.summary).toHaveBeenCalledOnce();
	} finally { log.mockRestore(); }
});

it('preserves the exact default output and JSON keys without history options', async () => {
	const { renderMarkdown } = await import('../../src/report/index.js');
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
	try {
		await main(['node', 'piagent', 'report', '--target', 'lab', '--sections', 'identity', '--json']);
		const r = JSON.parse(log.mock.calls[0]?.[0]);
		expect(Object.keys(r)).toEqual(['target', 'generatedAt', 'sections']);
		await main(['node', 'piagent', 'report', '--target', 'lab', '--sections', 'identity']);
		expect(log.mock.calls[1]?.[0]).toBe(renderMarkdown(r));
	} finally { vi.useRealTimers(); log.mockRestore(); }
});
it('saves and compares before saving; diff-only exits 0 then 3 then 0', async () => {
	const { mkdtemp, rm, readdir } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
	const dir = await mkdtemp(join(tmpdir(), 'report-cli-'));
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	const previousExitCode = process.exitCode;
	try {
		const args = ['node', 'piagent', 'report', '--target', 'lab', '--sections', 'top_sql', '--out', dir, '--diff-only'];
		mocks.query.mockResolvedValue({ columns: ['SQL_ID'], rows: [], truncated: false, elapsedMs: 1 });
		await main(args); expect(process.exitCode).toBe(0); expect(log.mock.calls.at(-1)?.[0]).toContain('No changes.');
		mocks.query.mockResolvedValue({ columns: ['SQL_ID'], rows: [['abc']], truncated: false, elapsedMs: 1 });
		await main([...args, '--json']); expect(process.exitCode).toBe(3);
		expect(JSON.parse(log.mock.calls.at(-1)?.[0]).diff.changes[0].rule).toBe('new_top_sql');
		await main(args); expect(process.exitCode).toBe(0); expect(log.mock.calls.at(-1)?.[0]).not.toContain('# Oracle');
		await main([...args.filter(a => a !== '--diff-only'), '--diff', '--json']);
		expect(JSON.parse(log.mock.calls.at(-1)?.[0])).toMatchObject({ target: 'lab', diff: { changes: [] } });
		expect((await readdir(join(dir, 'lab'))).length).toBeGreaterThanOrEqual(2);
		expect(mocks.summary).not.toHaveBeenCalled();
	} finally { process.exitCode = previousExitCode; log.mockRestore(); await rm(dir, { recursive: true, force: true }); }
});
it('rejects summaries with diff-only', async () => {
	await expect(main(['node', 'piagent', 'report', '--target', 'lab', '--diff-only', '--summarize'])).rejects.toThrow('--diff-only cannot summarize');
});
