import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { checkTarget } from '../../src/preflight/index.js';
// Deliberately ignore owner-private targets: workers connect only to packaged labs.
const config = loadConfig({ PIAGENT_TARGETS_FILE: new URL('../../config/targets.json', import.meta.url).pathname, PIAGENT_SECRET_DIR: process.env.PIAGENT_SECRET_DIR });
for (const target of config.targets) it(`account check and targets check: ${target.name}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const sessions = createSessionProvider(config);
	try {
		const result = await checkTarget(sessions, target.name);
		expect(result.accountCheck).toBe('passed');
		expect(result.identity.currentUser).toBe(target.username);
		expect(result.identity.containerName).toBeTruthy();
		expect(result.views.length).toBeGreaterThan(0);
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
