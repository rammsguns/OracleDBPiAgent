import { it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { compareTargets } from '../../src/drift/index.js';
it('read-only drift self-comparisons and stable cross-target comparisons on both 19c targets', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR unset'); return; }
	const config = loadConfig(), sessions = createSessionProvider(config);
	const ctx = { config, sessions, audit: { record: async () => {} }, runId: 'drift-integration' };
	try {
		for (const target of config.targets) {
			try { const session = await sessions.get(target.name); await session.close(); }
			catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Approved Oracle listener unavailable'); return; } throw error; }
			for (const scope of ['parameters', 'schema:HR', 'objects:HR']) {
				const self = await compareTargets(ctx, { left: target.name, right: target.name, scope });
				expect(self.hasDrift).toBe(false);
				if (scope !== 'parameters') expect(self.complete).toBe(true);
				expect(self.sections.every(s => !s.onlyLeft.length && !s.onlyRight.length && !s.different.length)).toBe(true);
			}
		}
		for (const scope of ['parameters', 'schema:HR', 'objects:HR']) {
			const options = { left: 'd1-19c-lab', right: 'p1-19c-prod', scope };
			const first = await compareTargets(ctx, options), second = await compareTargets(ctx, options);
			expect(second.sections).toEqual(first.sections); expect(second.hasDrift).toBe(first.hasDrift);
			if (scope !== 'parameters') { expect(first.complete).toBe(true); expect(first.hasDrift).toBe(true); }
			console.log(`${scope}: complete=${first.complete}, drift=${first.hasDrift}; ${first.sections.map(s => `${s.name}:${s.status}`).join(', ')}`);
		}
	} finally { await sessions.closeAll(); }
}, 120000);
