import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sessions: vi.fn(), health: vi.fn(), triage: vi.fn(), drift: vi.fn() }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: () => ({ defaultTarget: 'lab-d1', targets: [{ name: 'lab-d1' }, { name: 'lab-p1' }], llm: {} }) }));
vi.mock('../../src/agent/dbToolsAdapter.js', () => ({ createSessions: mocks.sessions }));
vi.mock('../../src/llm/index.js', () => ({ checkStrataHealth: mocks.health }));
vi.mock('../../src/triage/cli.js', () => ({ runTriage: mocks.triage }));
vi.mock('../../src/drift/cli.js', () => ({ runDrift: mocks.drift }));
import { main, handleCliError } from '../../src/cli/index.js';
import { requireConfiguredTarget } from '../../src/config/targetUsage.js';
import { sectionNames, validateReportSections } from '../../src/report/arguments.js';
const originalExit = process.exitCode;
afterEach(() => { process.exitCode = originalExit; vi.restoreAllMocks(); vi.clearAllMocks(); });
const commands = [
	['report', '--target'],
	['triage', '--issue', 'slow', '--target'],
	['drift', '--scope', 'backup', '--right', 'lab-p1', '--left'],
	['drift', '--scope', 'backup', '--left', 'lab-d1', '--right'],
	['ask', 'why slow?', '--target'],
	['chat', '--target'],
];
for (const command of commands) {
	it.each(['lab-nope', '/private/host:1521/user', 'bad\nsecret', 'x'.repeat(64)])(`${command.join(' ')} rejects unknown %s before services`, async target => {
		const output = vi.spyOn(console, 'error').mockImplementation(() => {});
		await main(['node', 'piagent', ...command, target]).catch(handleCliError);
		const safe = target === 'lab-nope' ? ' lab-nope' : '';
		expect(output.mock.calls).toEqual([[`Unknown target${safe}; configured targets: lab-d1, lab-p1 (see piagent targets)`]]);
		expect(process.exitCode).toBe(2);
		for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
	});
}
it.each(['nope', 'identity,nope', '', '/private/secret', 'bad\nsecret'])('rejects report sections %s before services', async sections => {
	const output = vi.spyOn(console, 'error').mockImplementation(() => {});
	await main(['node', 'piagent', 'report', '--target', 'lab-d1', '--sections', sections]).catch(handleCliError);
	const name = sections.includes('nope') ? ' nope' : '';
	expect(output.mock.calls).toEqual([[`Unknown report section${name}; valid sections: ${sectionNames.join(', ')}`]]);
	expect(process.exitCode).toBe(2);
	for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
});
it('accepts configured names and every report section', () => {
	expect(() => requireConfiguredTarget('lab-d1', [{ name: 'lab-d1' }])).not.toThrow();
	expect(() => validateReportSections(sectionNames)).not.toThrow();
	expect(() => validateReportSections()).not.toThrow();
});
it('keeps unexpected failures generic with exit 1', () => {
	const output = vi.spyOn(console, 'error').mockImplementation(() => {});
	handleCliError(new Error('/private/secret'));
	expect(output).toHaveBeenCalledWith('piagent failed; check local configuration and service availability');
	expect(process.exitCode).toBe(1);
});
