import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import { createSessionProvider } from '../../src/oracle/index.js';
import { createDbTools } from '../../src/tools/index.js';
import type { AppConfig } from '../../src/contracts.js';
const targets = JSON.parse(await readFile(new URL('../../config/targets.json', import.meta.url),'utf8')).targets;
for (const target of targets) for (const [view, sql, column] of [
	['V$SQL', 'SELECT sql_fulltext_x FROM v$sql WHERE ROWNUM=1', 'SQL_FULLTEXT'],
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
