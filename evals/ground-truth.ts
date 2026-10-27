import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TargetConfig } from '../src/contracts.js';

export async function targets(): Promise<TargetConfig[]> {
	return JSON.parse(await readFile('config/targets.json', 'utf8')).targets;
}

/** Direct SELECT-only validation, independent of the product under test. */
export async function groundTruth(target: TargetConfig, sql: string, setupSql?: string): Promise<unknown[][]> {
	for (const statement of [sql, ...(setupSql ? [setupSql] : [])]) {
		if (!/^SELECT\s/i.test(statement) || /;|@|\b(?:DBMS_|UTL_|FOR\s+UPDATE)/i.test(statement)) throw new Error('Ground truth must be a single plain SELECT');
	}
	if (setupSql && !/^[A-Z][A-Z0-9_$#]*$/.test(target.defaultSchema)) throw new Error('Invalid default schema');
	const dir = process.env.PIAGENT_SECRET_DIR;
	if (!dir) throw new Error('PIAGENT_SECRET_DIR is required');
	const moduleName = 'oracledb';
	const oracle = (await import(moduleName)).default;
	const connection = await oracle.getConnection({ user: target.username,
		password: (await readFile(resolve(dir, target.passwordFile), 'utf8')).trim(),
		connectString: `${target.host}:${target.port}/${target.serviceName}` });
	try {
		const gate = await connection.execute("SELECT version FROM product_component_version WHERE product LIKE 'Oracle Database%'");
		if (!String(gate.rows?.[0]?.[0]).startsWith('19.')) throw new Error('Ground truth refuses non-19c');
		// Session-only setting, as product sessions use; setup is a read-only SELECT.
		if (setupSql) await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${target.defaultSchema}"`);
		await connection.execute('SET TRANSACTION READ ONLY');
		if (setupSql) await connection.execute(setupSql, {}, { maxRows: 1 });
		const result = await connection.execute(sql, {}, { maxRows: 100, outFormat: oracle.OUT_FORMAT_ARRAY });
		return result.rows ?? [];
	} finally { await connection.rollback(); await connection.close(); }
}
