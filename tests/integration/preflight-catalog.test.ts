import { expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { FEATURE_VIEWS, grantObject } from '../../src/preflight/views.js';

const config = loadConfig({ PIAGENT_TARGETS_FILE: new URL('../../config/targets.json', import.meta.url).pathname, PIAGENT_SECRET_DIR: process.env.PIAGENT_SECRET_DIR });
for (const target of config.targets) it(`19c public synonym grant objects: ${target.name}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const sessions = createSessionProvider(config);
	try {
		const session = await sessions.get(target.name);
		for (const view of [...new Set(Object.values(FEATURE_VIEWS).flat())].filter(v => v.startsWith('V$')).sort()) {
			const result = await session.query('SELECT owner, table_name FROM all_synonyms WHERE synonym_name=:name AND owner=:owner', { name: view, owner: 'PUBLIC' });
			expect(result.rows, view).toEqual([['PUBLIC', grantObject(view)]]);
		}
	} catch (error) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; }
		throw error;
	} finally { await sessions.closeAll(); }
}, 60000);
