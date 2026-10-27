import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import driver from 'oracledb';
import { createSessionProvider, gate19c } from '../../src/oracle/index.js';
import { createDbTools } from '../../src/tools/index.js';
import type { AppConfig } from '../../src/contracts.js';
const targets = JSON.parse(await readFile(new URL('../../config/targets.json', import.meta.url),'utf8')).targets;
const config = { targets, defaultTarget: targets[0].name, secretDir: process.env.PIAGENT_SECRET_DIR, limits: {maxRows: 100, statementTimeoutSeconds: 15, maxToolResultBytes: 16000} } as AppConfig;
for (const target of targets) it(`19c tools and refusal: ${target.name}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const provider = createSessionProvider(config);
	let session;
	try { session = await provider.get(target.name); }
	catch (e) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('Oracle listener unavailable'); return; } throw e; }
	try {
		expect(session.identity.versionFull).toMatch(/^19\./);
		expect(session.identity.currentSchema).toBe(target.defaultSchema);
		await expect(session.query('INSERT INTO forbidden VALUES(1)')).rejects.toThrow('Statement rejected');
		const q = await session.query('SELECT level n FROM dual CONNECT BY level<=3', {}, {maxRows:2}); expect(q.rows.length).toBe(2); expect(q.truncated).toBe(true);
		const lob = await session.query("SELECT TO_CLOB(RPAD('x',4000,'x')) FROM dual"); expect(typeof lob.rows[0]?.[0]).toBe('string');
		const tools = createDbTools({config, sessions:provider, audit:{record:async()=>{}},runId:'db-test'});
		for (const tool of tools) {
			if (tool.name === 'get_source') { const r = await tool.execute('source',{target:target.name,name:'NO_SUCH_OBJECT',type:'VIEW'}); expect(r.content.length).toBeGreaterThan(0); continue; }
			const params = {target:target.name, name:target.defaultSchema==='HR'?'EMPLOYEES':'ORDERS', sql:'SELECT 1 FROM dual'};
			const result = await tool.execute('test',params);
			expect(result.content.length).toBeGreaterThan(0);
			// The DBA grants (docs/grants-request-2026-10-26.sql, applied 2026-10-27) give p1 the
			// primary DBA_/V$ path; fallbacks for accounts without them are unit-tested.
			if (target.name === 'p1-19c-prod' && ['db_overview','list_schemas','tablespace_usage','top_sql','wait_events'].includes(tool.name)) {
				expect(result.details.sourceNote).toBeUndefined();
				expect(result.details.rows.length).toBeGreaterThan(0);
				const value = (column: string) => result.details.rows[0][result.details.columns.indexOf(column)];
				if (tool.name === 'db_overview') {
					expect(value('VERSION_FULL')).toMatch(/^19\./);
					for (const column of ['CDB','STARTUP_TIME','DATAFILE_BYTES','SGA_BYTES','PGA_BYTES']) expect(value(column)).not.toBeNull();
				}
				if (tool.name === 'list_schemas') expect(result.details.columns).toContain('SEGMENT_BYTES');
			}
			if (tool.name === 'explain_plan') expect(result.details.columns).toContain('PLAN_TABLE_OUTPUT');
		}
	} finally { await provider.closeAll(); }
}, 120000);

it('rejects the out-of-scope database at the gate only', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	let c;
	try {
		const password = (await readFile(`${process.env.PIAGENT_SECRET_DIR}/d2_lab.pw`, 'utf8')).trim();
		c = await driver.getConnection({user:'HARNESS_LAB', password, connectString:'localhost:1521/FREEPDB1'});
	} catch(e) { if (/NJS-511|ECONNREFUSED|ORA-12541|ENOENT/.test(String(e))) { context.skip('Gate-test dependency unavailable'); return; } throw e; }
	try {
		const r = await c.execute("SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%'");
		expect(() => gate19c('gate-test-only',r.rows[0][0])).toThrow('only Oracle Database 19c');
	} finally { await c.close(); }
},30000);

for (const target of targets) it(`full LONG view source page 2: ${target.name}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const provider = createSessionProvider(config);
	try {
		let session;
		try { session = await provider.get(target.name); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		// A SYS dictionary view visible to both approved accounts; no fixture DDL.
		const source = await session.query("SELECT text_length, text FROM all_views WHERE owner='SYS' AND view_name='ALL_CUBE_DEPENDENCIES' AND text_length<=1048576", {}, { maxRows: 1 });
		const [length, text] = source.rows[0]!;
		expect(typeof text).toBe('string');
		expect(Number(length)).toBeGreaterThan(4000);
		expect(Buffer.byteLength(text as string)).toBe(Number(length));
		const lines = (text as string).split(/\r\n|\n|\r/);
		expect(lines.slice(0, 200).join('\n').length).toBeGreaterThan(4000);
		await session.close();
		const tool = createDbTools({ config, sessions: provider, audit: { record: async () => {} }, runId: 'view-pages' }).find(t => t.name === 'get_source')!;
		const first = await tool.execute('1', { target: target.name, schema: 'SYS', name: 'ALL_CUBE_DEPENDENCIES', type: 'VIEW', lines: 200 });
		expect(first.details.totalLines).toBe(lines.length);
		expect(first.details.hasMore).toBe(true);
		const start = first.details.nextStartLine;
		const second = await tool.execute('2', { target: target.name, schema: 'SYS', name: 'ALL_CUBE_DEPENDENCIES', type: 'VIEW', startLine: start, lines: 200 });
		expect(second.details.rows.length).toBeGreaterThan(0);
		expect(second.details.rows).toEqual(lines.slice(start - 1, start - 1 + second.details.rows.length).map((line, i) => [start + i, line]));
		const beyondPreview = await tool.execute('3', { target: target.name, schema: 'SYS', name: 'ALL_CUBE_DEPENDENCIES', type: 'VIEW', startLine: 201, lines: 2 });
		expect(beyondPreview.details.rows).toEqual([[201, lines[200]], [202, lines[201]]]);
	} finally { await provider.closeAll(); }
}, 30000);
