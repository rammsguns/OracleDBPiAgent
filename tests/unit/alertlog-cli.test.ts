import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), sessions: vi.fn(), read: vi.fn(), incidents: vi.fn(), close: vi.fn(async () => {}), log: vi.fn() }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: mocks.config }));
vi.mock('../../src/oracle/index.js', () => ({ createSessionProvider: mocks.sessions }));
vi.mock('../../src/audit/index.js', () => ({ JsonlAuditSink: class {} }));
vi.mock('../../src/alertlog/index.js', () => ({ readAlertLog: mocks.read, readIncidents: mocks.incidents, renderAlertLogMarkdown: () => '# Alert log\n' }));
import { runAlertLog } from '../../src/alertlog/cli.js';
afterEach(() => { vi.restoreAllMocks(); });
function setup() {
	vi.clearAllMocks(); mocks.config.mockReturnValue({ targets: [{ name: 'd1-19c-lab' }] }); mocks.sessions.mockReturnValue({ closeAll: mocks.close });
	mocks.read.mockResolvedValue({ status: 'ok', rows: [] }); mocks.incidents.mockResolvedValue({ status: 'ok', rows: [{ incidentId: '123' }] }); vi.spyOn(console, 'log').mockImplementation(mocks.log);
}
it('maps repeatable codes, text, numeric level and limit into reader options and prints JSON', async () => {
	setup(); await runAlertLog({ target: 'd1-19c-lab', since: '7d', code: ['ORA-00600', 'TNS-12514'], grep: 'internal', level: '16', limit: '5', json: true });
	expect(mocks.read.mock.calls[0]?.slice(1)).toEqual(['d1-19c-lab', expect.objectContaining({ since: '7d', codes: ['ORA-00600', 'TNS-12514'], text: 'internal', level: 16, limit: 5 })]);
	expect(JSON.parse(mocks.log.mock.calls[0]![0])).toEqual({ status: 'ok', rows: [] }); expect(mocks.close).toHaveBeenCalledOnce();
});
it('selects the incident reader and Markdown output', async () => {
	setup(); await runAlertLog({ target: 'd1-19c-lab', incidents: true, markdown: true }); expect(mocks.incidents).toHaveBeenCalledOnce(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.log).toHaveBeenCalledWith('# Alert log\n'); expect(mocks.close).toHaveBeenCalledOnce();
});
it('refuses conflicting output and incident-only filters before session construction', async () => {
	setup(); for (const extra of [{ json: true, markdown: true }, { incidents: true, code: ['ORA-00600'] }, { incidents: true, grep: 'x' }]) await expect(runAlertLog({ target: 'd1-19c-lab', ...extra })).rejects.toThrow(); expect(mocks.sessions).not.toHaveBeenCalled();
});
it('closes the provider on query failure without printing the error', async () => {
	setup(); mocks.read.mockRejectedValueOnce(new Error('query failed')); await expect(runAlertLog({ target: 'd1-19c-lab' })).rejects.toThrow('query failed'); expect(mocks.close).toHaveBeenCalledOnce(); expect(mocks.log).not.toHaveBeenCalled();
});
