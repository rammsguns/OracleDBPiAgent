import { it, expect, vi } from 'vitest';
const fake = vi.hoisted(() => ({ summary: vi.fn(async () => 'No failures in the visible window.'), health: vi.fn(async () => {}), query: vi.fn(async () => ({ rows: [], columns: [], truncated: false, elapsedMs: 0 })), close: vi.fn(async () => {}) }));
vi.mock('../../src/report/summarize.js', () => ({ summarizeReport: fake.summary, checkReportSummary: () => [] }));
vi.mock('../../src/llm/index.js', () => ({ checkStrataHealth: fake.health }));
vi.mock('../../src/oracle/index.js', () => ({ createSessionProvider: () => ({ get: async () => ({ query: fake.query, close: async () => {} }), closeAll: fake.close }) }));
vi.mock('../../src/audit/index.js', () => ({ JsonlAuditSink: class { async record() {} } }));
import { runTriage } from '../../src/triage/cli.js';
it('runs --summarize once with a fake model and emits valid JSON; default never uses it', async () => {
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await runTriage({ target: 'p1-19c-prod', json: true });
		expect(fake.summary).not.toHaveBeenCalled(); expect(fake.health).not.toHaveBeenCalled();
		await runTriage({ target: 'p1-19c-prod', summarize: true, json: true });
		expect(fake.summary).toHaveBeenCalledTimes(1); expect(fake.health).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).summary.narrative).toContain('No failures');
		expect(fake.close).toHaveBeenCalledTimes(2);
	} finally { log.mockRestore(); }
});
