import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createDbTools } from '../../src/tools/index.js';
import type { AppConfig } from '../../src/contracts.js';

const targets = JSON.parse(await readFile(new URL('../../config/targets.json', import.meta.url), 'utf8')).targets;
const config = { targets, defaultTarget: targets[0].name, secretDir: process.env.PIAGENT_SECRET_DIR, limits: { maxRows: 100, statementTimeoutSeconds: 15, maxToolResultBytes: 16000 } } as AppConfig;
for (const target of targets) it(`dictionary permissions and hidden source through tools: ${target.name}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const provider = createSessionProvider(config);
	try {
		let session;
		try { session = await provider.get(target.name); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		const readable: string[] = [];
		const unavailable: string[] = [];
		for (const view of ['SOURCE', 'ERRORS', 'DEPENDENCIES', 'PROCEDURES', 'ARGUMENTS', 'OBJECTS', 'TAB_COLUMNS', 'CONSTRAINTS', 'CONS_COLUMNS', 'INDEXES', 'IND_COLUMNS', 'TABLES', 'VIEWS']) {
			try { await session.query(`SELECT 1 FROM dba_${view} WHERE ROWNUM=1`, {}, { maxRows: 1 }); readable.push(`DBA_${view}`); }
			catch (error) {
				const code = String(error).match(/ORA-(00942|01031)\b/)?.[0];
				if (!code) throw error;
				unavailable.push(`DBA_${view}:${code}`);
			}
		}
		console.info(`${target.name} readable: ${readable.join(', ')}; unavailable: ${unavailable.join(', ') || 'none'}`);
		expect(readable).toContain('DBA_SOURCE');
		expect(readable).toContain('DBA_OBJECTS');
		const prod = target.name === 'p1-19c-prod';
		const params = prod ? { schema: 'SHOPAPP', name: 'WORKLOAD', type: 'PACKAGE BODY', startLine: 24, lines: 6 } : { schema: 'HR', name: 'SECURE_EMPLOYEES', type: 'TRIGGER' };
		const hidden = await session.query('SELECT line FROM all_source WHERE owner=:owner AND name=:name AND type=:type', { owner: params.schema, name: params.name, type: params.type });
		expect(hidden.rows).toEqual([]);
		await session.close();
		const tools = createDbTools({ config, sessions: provider, audit: { record: async () => {} }, runId: 'dictionary-live' });
		const result = await tools.find(t => t.name === 'get_source')!.execute('source', { target: target.name, ...params });
		expect(result.details.view).toBe('DBA_SOURCE');
		expect(result.details.rows.length).toBeGreaterThan(0);
		if (prod) {
			expect(result.details.rows.map((row: unknown[]) => row[1])).toEqual([24, 25, 26, 27, 28, 29]);
			expect(result.details.rows.find((row: unknown[]) => row[1] === 27)?.[2]).toMatch(/DELETE/i);
		} else expect(result.details.rows.map((row: unknown[]) => row[2]).join('')).toMatch(/secure_dml/i);
		const listed = await tools.find(t => t.name === 'list_objects')!.execute('objects', { target: target.name, schema: params.schema, pattern: params.name, type: params.type });
		expect(listed.details.view).toBe('DBA_OBJECTS');
		expect(listed.details.rows.some((row: unknown[]) => row[1] === params.name)).toBe(true);
	} finally { await provider.closeAll(); }
}, 60000);
