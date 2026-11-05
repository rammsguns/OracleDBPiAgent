import { expect, it, vi } from 'vitest';
import driver from 'oracledb';
import { loadConfig } from '../../src/config/index.js';
import { createSessionProvider } from '../../src/oracle/index.js';
import { boundedResult, createDbTools } from '../../src/tools/index.js';

it('reports live Oracle timestamp metadata and renders run_query text without ALTER SESSION', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config = loadConfig();
	const connect = driver.getConnection.bind(driver);
	// This SELECT-only probe needs no default schema. Suppress the existing
	// provider setup statement locally; never send ALTER SESSION to Oracle.
	const spy = vi.spyOn(driver, 'getConnection').mockImplementation(async (...args: any[]) => {
		const connection = await (connect as any)(...args);
		const execute = connection.execute.bind(connection);
		connection.execute = (sql: string, ...rest: any[]) => {
			if (sql.startsWith('ALTER SESSION SET CURRENT_SCHEMA')) return Promise.resolve({});
			return execute(sql, ...rest);
		};
		return connection;
	});
	const provider = createSessionProvider(config);
	try {
		let session;
		try { session = await provider.get('d1-19c-lab'); }
		catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(error))) { context.skip('Oracle listener unavailable'); return; } throw error; }
		const sql = 'SELECT SYSDATE D, LOCALTIMESTAMP T, SYSTIMESTAMP TZ, CURRENT_TIMESTAMP CT, CAST(SYSTIMESTAMP AS TIMESTAMP WITH LOCAL TIME ZONE) LTZ, TO_CHAR(SYSDATE, \'YYYY-MM-DD HH24:MI:SS\') D_TEXT, TO_CHAR(LOCALTIMESTAMP, \'YYYY-MM-DD HH24:MI:SS.FF3\') T_TEXT FROM dual';
		const result = await session.query(sql);
		expect(result.columnTypes).toEqual(['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH LOCAL TIME ZONE', 'VARCHAR2', 'VARCHAR2']);
		for (const value of result.rows[0]!.slice(0, 5)) expect(value).toBeInstanceOf(Date);
		console.info('Live dbTypeName:', result.columnTypes);
		console.info('Live rendered SELECT:', boundedResult(result, 16000).content[0]!.text);
		const alert = await session.query('SELECT originating_timestamp FROM v$diag_alert_ext WHERE originating_timestamp IS NOT NULL FETCH FIRST 1 ROWS ONLY');
		expect(alert.columnTypes).toEqual(['TIMESTAMP WITH TIME ZONE']);
		expect(alert.rows).toHaveLength(1);
		expect(boundedResult(alert, 16000).content[0]!.text.split('\n')[1]).toBe((alert.rows[0]![0] as Date).toISOString());
		console.info('Live alert:', boundedResult(alert, 16000).content[0]!.text);
		await session.close();
		const tool = createDbTools({ config, sessions: provider, audit: { record: async () => {} }, runId: 'timestamp-live' }).find(t => t.name === 'run_query')!;
		const output = await tool.execute('timestamp', { target: 'd1-19c-lab', sql });
		const cells = (output.content[0] as { text: string }).text.split('\n')[1]!.split(' | ');
		expect(cells[0]).toBe(output.details.rows[0][5]);
		expect(cells[1]).toBe(output.details.rows[0][6]);
		expect(cells[0]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
		expect(cells[1]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/);
		for (const index of [2, 3, 4]) expect(cells[index]).toBe((output.details.rows[0][index] as Date).toISOString());
		console.info('Live run_query:', (output.content[0] as { text: string }).text);
	} finally { await provider.closeAll(); spy.mockRestore(); }
}, 60000);
