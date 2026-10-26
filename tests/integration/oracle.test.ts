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
			if (target.name === 'p1-19c-prod' && tool.name === 'wait_events') {
				await expect(tool.execute('test',params)).rejects.toThrow('SELECT on SYS.V_$SYSTEM_EVENT');
				continue;
			}
			const result = await tool.execute('test',params);
			expect(result.content.length).toBeGreaterThan(0);
			if (target.name === 'p1-19c-prod' && ['db_overview','list_schemas','tablespace_usage','top_sql'].includes(tool.name)) {
				expect(result.details.sourceNote).toMatch(/^Source:/);
				expect(result.content[0]).toMatchObject({type:'text',text:expect.stringContaining(result.details.sourceNote)});
				expect(result.details.rows.length).toBeGreaterThan(0);
				const value = (column: string) => result.details.rows[0][result.details.columns.indexOf(column)];
				if (tool.name === 'db_overview') {
					expect(value('VERSION_FULL')).toMatch(/^19\./);
					for (const column of ['CDB','STARTUP_TIME','DATAFILE_BYTES','SGA_BYTES','PGA_BYTES']) expect(value(column)).toBeNull();
				}
				if (tool.name === 'list_schemas') {
					expect(result.details.columns).toContain('VISIBLE_OBJECT_COUNT');
					expect(value('SEGMENT_BYTES')).toBeNull();
				}
				if (tool.name === 'tablespace_usage') {
					expect(value('CAPACITY_BYTES')).toBeGreaterThan(0);
					expect(value('USED_BYTES') + value('FREE_CAPACITY_BYTES')).toBe(value('CAPACITY_BYTES'));
				}
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
