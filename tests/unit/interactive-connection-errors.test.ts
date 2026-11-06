import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	question: vi.fn(), close: vi.fn(), prompt: vi.fn(), closeAll: vi.fn(), prepare: vi.fn(), listen: vi.fn(),
}));
vi.mock('node:readline/promises', () => ({ createInterface: () => ({ question: mocks.question, close: mocks.close }) }));
vi.mock('../../src/llm/index.js', () => ({ checkStrataHealth: vi.fn(async () => {}) }));
vi.mock('../../src/agent/index.js', () => ({ createOracleAgent: vi.fn(async () => ({ state: { messages: [] }, subscribe: vi.fn(), prompt: mocks.prompt })) }));
vi.mock('../../src/agent/dbToolsAdapter.js', () => ({ createSessions: vi.fn(async () => ({ closeAll: mocks.closeAll })) }));
vi.mock('../../src/cli/chatTriage.js', () => ({ parseTriageCommand: () => ({ issue: 'connection unavailable' }), prepareChatQuestion: mocks.prepare }));
vi.mock('../../src/web/server.js', () => ({ createWebServer: () => ({ listen: mocks.listen, close: vi.fn() }) }));
import { main, handleCliError } from '../../src/cli/index.js';
import { recordConnectionFailure, withConnectionFailures, withoutConnectionFailures } from '../../src/oracle/connectionErrors.js';
beforeEach(() => { vi.resetAllMocks(); process.exitCode = 0; });
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
it('chat handles a /triage connection failure then /exit without a trailing error or nonzero exit', async () => {
	const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.question.mockResolvedValueOnce('/triage connection unavailable').mockResolvedValueOnce('/exit');
	mocks.prepare.mockImplementation(async () => { throw recordConnectionFailure(new Error('ORA-12541: private-host')); });
	await main(['node', 'piagent', 'chat']).catch(handleCliError);
	expect(mocks.prepare).toHaveBeenCalledOnce();
	expect(mocks.question).toHaveBeenCalledTimes(2);
	expect(mocks.prompt).not.toHaveBeenCalled();
	expect(stderr).toHaveBeenCalledExactlyOnceWith('Triage failed; check local database availability');
	expect(process.exitCode).toBe(0);
	expect(mocks.close).toHaveBeenCalledOnce();
	expect(mocks.closeAll).toHaveBeenCalledOnce();
});
it('web does not surface a handled connection failure as a command-scoped error', async () => {
	const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	mocks.listen.mockImplementation(async () => {
		recordConnectionFailure(new Error('ORA-12541: private-host'));
		return 'http://127.0.0.1:8765';
	});
	await main(['node', 'piagent', 'web']).catch(handleCliError);
	expect(mocks.listen).toHaveBeenCalledOnce();
	expect(stderr).not.toHaveBeenCalled();
	expect(process.exitCode).toBe(0);
});
it('isolates any REPL operation while preserving one-shot failure propagation', async () => {
	await expect(withConnectionFailures(async () => {
		await withoutConnectionFailures(async () => { recordConnectionFailure(new Error('ORA-12541')); });
	})).resolves.toBeUndefined();
	await expect(withConnectionFailures(async () => { recordConnectionFailure(new Error('ORA-12541')); })).rejects.toThrow('ORA-12541: listener unreachable');
});
