import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import oracle from 'oracledb';
it('C1 seed has exact read-only grants, deliberate states and root refusal', async ctx => {
	if (!process.env.PIAGENT_SECRET_DIR) { ctx.skip('PIAGENT_SECRET_DIR unset; C1 credentials unavailable'); return; }
	let password: string;
	try { password = (await readFile(`${process.env.PIAGENT_SECRET_DIR}/c1_piagent_ro.pw`, 'utf8')).trim(); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { ctx.skip('C1 secret unavailable'); return; } throw error; }
	let c;
	try { c = await oracle.getConnection({ user: 'PIAGENT_RO', password, connectString: 'localhost:1524/PIPDB1' }); }
	catch (error) { if (/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514/.test(String(error))) { ctx.skip('C1 listener/PDB unavailable'); return; } throw error; }
	try {
		const rows = async (sql: string) => (await c.execute<unknown[]>(sql)).rows;
		expect(await rows("select sys_context('USERENV','CON_NAME') from dual")).toEqual([['PIPDB1']]);
		expect(await rows("select privilege from dba_sys_privs where grantee='PIAGENT_RO'")).toEqual([['CREATE SESSION']]);
		expect(await rows("select granted_role from dba_role_privs where grantee='PIAGENT_RO'")).toEqual([]);
		const template = await readFile('docs/grants-template-pdb.sql', 'utf8');
		const expected = [...template.matchAll(/^GRANT SELECT ON SYS\.(\S+) TO /gm)].map(m => [`SYS.${m[1]}`, 'SELECT', 'NO']);
		for (const table of ['CUSTOMERS', 'PRODUCTS', 'ORDERS', 'ORDER_LINES', 'ORDER_HISTORY']) expected.push([`SHOPAPP.${table}`, 'SELECT', 'NO']);
		const actual = await rows("select owner||'.'||table_name,privilege,grantable from dba_tab_privs where grantee='PIAGENT_RO'");
		expect(actual).toHaveLength(expected.length);
		expect(actual).toEqual(expect.arrayContaining(expected));
		expect(await rows("select status from dba_objects where owner='SHOPAPP' and object_name='INVALID_CUSTOMER_VIEW'")).toEqual([['INVALID']]);
		expect(await rows("select status from dba_ind_partitions where index_owner='SHOPAPP' and index_name='HISTORY_ORDER_IX' and partition_name='P_202601'")).toEqual([['UNUSABLE']]);
		expect(await rows("select stale_stats from dba_tab_statistics where owner='SHOPAPP' and table_name='PRODUCTS'")).toEqual([['YES']]);
		expect((await rows("select count(*) from dba_scheduler_job_run_details where owner='SHOPAPP' and job_name='REPORT_EXPORT_JOB' and status='FAILED' and error#=20001"))?.[0]?.[0] as number).toBeGreaterThan(0);
		expect(await rows("select repeat_interval, enabled, logging_level from dba_scheduler_jobs where owner='SHOPAPP' and job_name='REPORT_EXPORT_JOB'")).toEqual([['FREQ=MINUTELY;INTERVAL=30', 'TRUE', 'FULL']]);
		expect((await rows("select count(*) from dba_scheduler_job_run_details where owner='SHOPAPP' and job_name='REPORT_EXPORT_JOB' and status='FAILED' and error#=20001 and log_date>=SYSTIMESTAMP-INTERVAL '1' HOUR"))?.[0]?.[0] as number).toBeGreaterThan(0);
		await expect(oracle.getConnection({ user: 'PIAGENT_RO', password, connectString: 'localhost:1524/CDB19' })).rejects.toMatchObject({ errorNum: 1017 });
	} finally { await c.close(); }
}, 30000);
