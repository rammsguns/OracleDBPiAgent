import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createDbTools } from '../../src/tools/index.js';
import type { AppConfig } from '../../src/contracts.js';
const targets = JSON.parse(await readFile(new URL('../../config/targets.json', import.meta.url),'utf8')).targets;
const liveConfig = (targetName:string) => ({targets,defaultTarget:targetName,secretDir:process.env.PIAGENT_SECRET_DIR,limits:{maxRows:1000,statementTimeoutSeconds:15,maxToolResultBytes:16000}} as AppConfig);
for (const target of targets) for (const [view, sql, column] of [
	['V$SQL', 'SELECT sql_full_text FROM v$sql WHERE ROWNUM=1', 'SQL_FULLTEXT'],
	['V$SQL', 'SELECT parses FROM v$sql WHERE ROWNUM=1', 'PARSE_CALLS'],
	['ALL_CONSTRAINTS', 'SELECT c.validate FROM all_constraints c WHERE ROWNUM=1', 'VALIDATED'],
	['ALL_CONSTRAINTS', 'SELECT validate FROM all_constraints WHERE ROWNUM=1', ''],
]) it(`run_query error hint ${target.name} ${view}`, async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config = {targets,defaultTarget:target.name,secretDir:process.env.PIAGENT_SECRET_DIR,limits:{maxRows:1000,statementTimeoutSeconds:15,maxToolResultBytes:16000}} as AppConfig;
	const provider = createSessionProvider(config);
	try {
		try { const session=await provider.get(target.name); await session.query(`SELECT 1 FROM ${view} WHERE ROWNUM=1`); await session.close(); }
		catch (e) {
			if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('Oracle listener unavailable'); return; }
			if (/ORA-00942|ORA-01031/.test(String(e))) { context.skip(`${view} is not granted on ${target.name}`); return; }
			throw e;
		}
		const tool=createDbTools({config,sessions:provider,audit:{record:async()=>{}},runId:'hint-integration'}).find(t=>t.name==='run_query')!;
		const error=await tool.execute('hint',{sql}).then(()=>{throw new Error('Query unexpectedly succeeded');},e=>e as Error);
		if (!column) { expect(error.message).toMatch(/^ORA-00936:/); expect(error.message).not.toContain('Hint:'); return; }
		expect(error.message).toMatch(view==='V$SQL' ? /^ORA-00904:/ : /^ORA-01747:/);
		expect(error.message).toContain('Hint:'); expect(error.message).toContain(column);
		console.log(`${target.name}: ${error.message}`);
	} finally { await provider.closeAll(); }
},30000);

it('attributes the readable V$LOG and hidden V$LOGMEMBER view on d1-19c-lab', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config=liveConfig('d1-19c-lab'), provider=createSessionProvider(config);
	try {
		const tool=createDbTools({config,sessions:provider,audit:{record:async()=>{}},runId:'wp33a-d1'}).find(t=>t.name==='run_query')!;
		const error=await tool.execute('live',{sql:'SELECT l.group#, m.member FROM V$LOG l JOIN V$LOGMEMBER m ON m.group#=l.group#'}).then(()=>{throw new Error('Expected ORA-00942');},e=>e as Error);
		expect(error.message).toContain('Readable: V$LOG.');
		expect(error.message).toContain('Not visible to this account: V$LOGMEMBER.');
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('d1 Oracle listener unavailable'); return; }
		throw e;
	} finally { await provider.closeAll(); }
},30000);

it('fails closed on d1 when a CTE name matches a schema-qualified table', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config=liveConfig('d1-19c-lab'), provider=createSessionProvider(config), events:unknown[]=[];
	try {
		const verify=await provider.get('d1-19c-lab');
		await verify.query('SELECT * FROM HR.EMPLOYEES WHERE 1=0');
		await verify.close();
		const tool=createDbTools({config,sessions:provider,audit:{record:async event=>{events.push(event);}},runId:'wp33a-d1-cte'}).find(t=>t.name==='run_query')!;
		for (const sql of [
			'WITH employees AS (SELECT 1 AS id FROM DUAL) SELECT * FROM HR.EMPLOYEES e JOIN V$LOGMEMBER m ON 1=1',
			'WITH helper AS (SELECT 1 AS id FROM DUAL) SELECT * FROM helper h JOIN V$LOG l ON 1=1 JOIN V$LOGMEMBER m ON 1=1',
		]) {
			events.length=0;
			const error=await tool.execute('live',{sql}).then(()=>{throw new Error('Expected ORA-00942');},e=>e as Error);
			expect(error.message).toMatch(/^ORA-00942:/);
			expect(error.message).not.toContain('Source:');
			expect(events).toHaveLength(1);
		}
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('d1 Oracle listener unavailable'); return; }
		throw e;
	} finally { await provider.closeAll(); }
},30000);

it('notes Oracle-hidden NULL apply lag from wildcard V$DATAGUARD_STATS on c1s-19c-stby', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const config=liveConfig('c1s-19c-stby'), provider=createSessionProvider(config);
	try {
		const tool=createDbTools({config,sessions:provider,audit:{record:async()=>{}},runId:'wp33a-c1s'}).find(t=>t.name==='run_query')!;
		const result=await tool.execute('live',{sql:"SELECT * FROM V$DATAGUARD_STATS WHERE NAME IN ('apply lag', 'apply finish time')"});
		const details=result.details as {columns:string[];rows:unknown[][]};
		const name=details.columns.findIndex(column=>column.toUpperCase()==='NAME'), value=details.columns.findIndex(column=>column.toUpperCase()==='VALUE');
		const apply=details.rows.find(row=>String(row[name]).toLowerCase()==='apply lag');
		expect(apply).toBeDefined(); expect(apply?.[value]).toBeNull();
		expect(result.details.sourceNote).toContain('This does not mean zero lag');
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('c1s Oracle listener unavailable'); return; }
		throw e;
	} finally { await provider.closeAll(); }
},30000);

it('notes copied backup and scheduler provenance on c1s and none on c1', async context => {
	if (!process.env.PIAGENT_SECRET_DIR) { context.skip('PIAGENT_SECRET_DIR is unset'); return; }
	const provider=createSessionProvider(liveConfig('c1s-19c-stby'));
	try {
		const tool=createDbTools({config:liveConfig('c1s-19c-stby'),sessions:provider,audit:{record:async()=>{}},runId:'wp34a-c1s'}).find(t=>t.name==='run_query')!;
		const backup=await tool.execute('live',{sql:'SELECT COUNT(*) FROM V$BACKUP_SET'});
		const jobs=await tool.execute('live',{sql:'SELECT COUNT(*) FROM DBA_SCHEDULER_JOB_RUN_DETAILS'});
		expect(backup.details.sourceNote).toContain('copied from the primary');
		expect(backup.details.sourceNote).toContain('backup tool / piagent backup');
		expect(jobs.details.sourceNote).toContain('replicated by redo apply');
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('c1s Oracle listener unavailable'); return; }
		throw e;
	} finally { await provider.closeAll(); }
	const primary=createSessionProvider(liveConfig('c1-19c-prod'));
	try {
		const tool=createDbTools({config:liveConfig('c1-19c-prod'),sessions:primary,audit:{record:async()=>{}},runId:'wp34a-c1'}).find(t=>t.name==='run_query')!;
		for (const sql of ['SELECT COUNT(*) FROM V$BACKUP_SET','SELECT COUNT(*) FROM DBA_SCHEDULER_JOB_RUN_DETAILS']) {
			const result=await tool.execute('live',{sql});
			expect(result.details.sourceNote).toBeUndefined();
		}
	} catch (e) {
		if (/NJS-511|ECONNREFUSED|ORA-12541/.test(String(e))) { context.skip('c1 Oracle listener unavailable'); return; }
		throw e;
	} finally { await primary.closeAll(); }
},30000);
