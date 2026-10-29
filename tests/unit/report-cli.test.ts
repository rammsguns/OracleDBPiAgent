import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn(), closeAll: vi.fn(), summary: vi.fn() }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: () => ({ defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 100, statementTimeoutSeconds: 30 }, llm: {} }) }));
vi.mock('../../src/agent/dbToolsAdapter.js', () => ({ createSessions: async () => ({ get: async () => ({ query: mocks.query, close: mocks.close }), closeAll: mocks.closeAll }) }));
vi.mock('../../src/audit/index.js', () => ({ JsonlAuditSink: class { async record() {} } }));
vi.mock('../../src/report/summarize.js', () => ({ summarizeReport: mocks.summary }));
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
