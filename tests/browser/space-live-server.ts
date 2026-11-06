// Capture-only SELECT provider: no ALTER SESSION or transaction statements.
import oracledb from 'oracledb';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWebServer } from '../../src/web/server.js';
import { APPROVED_ENDPOINTS, gate19c } from '../../src/oracle/index.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
import type { OracleSession } from '../../src/contracts.js';
const web = createWebServer({ port: 0,
	checkHealth: async () => {}, health: async () => [],
	agentFactory: async () => ({ state: { messages: [] } as any, subscribe: () => () => {}, abort: () => {}, waitForIdle: async () => {}, prompt: async () => { throw new Error('LLM forbidden for Space capture'); } }),
	sessionFactory: async config => {
		const open: OracleSession[] = [];
		return { get: async name => {
			const target = config.targets.find(t => t.name === name);
			if (!target || !APPROVED_ENDPOINTS.some(e => e.name === target.name && e.username === target.username && e.host === target.host && e.port === target.port && e.serviceName === target.serviceName)) throw new Error('Unapproved target');
			const dir = process.env.PIAGENT_SECRET_DIR; if (!dir || resolve(dir) !== resolve(config.secretDir)) throw new Error('Secret directory required');
			const password = (await readFile(resolve(dir, target.passwordFile), 'utf8')).trim();
			const connection = await oracledb.getConnection({ user: target.username, password, connectString: `${target.host}:${target.port}/${target.serviceName}` });
			connection.callTimeout = 15000;
			try {
				const v = await connection.execute("SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%'", {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				gate19c(target.name, String((v.rows?.[0] as unknown[])?.[0]));
			} catch (error) { await connection.close(); throw error; }
			const session: OracleSession = { target, identity: {} as OracleSession['identity'], close: async () => { await connection.close(); }, query: async (sql, binds = {}) => {
				const start = performance.now(), result = await connection.execute(classifySql(sql), binds, { outFormat: oracledb.OUT_FORMAT_ARRAY, maxRows: 10001 });
				const rows = (result.rows || []) as unknown[][];
				return { columns: (result.metaData || []).map(c => c.name), rows: rows.slice(0,10000), truncated: rows.length > 10000, elapsedMs: performance.now()-start };
			} }; open.push(session); return session;
		}, closeAll: async () => { for (const s of open.splice(0)) await s.close(); } };
	},
});
process.stdout.write(await web.listen());
