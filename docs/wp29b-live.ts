/** Read-only reproduction of Phase 29B premises, without importing the LLM runtime. */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.js';
import { createSessionProvider } from '../src/oracle/index.js';
import { groundTruth, targets } from '../evals/ground-truth.js';
import { loadHardCases } from '../evals/validate-hard.js';
import { validateP25 } from '../evals/validate-p25.js';

const cases = (await loadHardCases()).filter(test => test.id.startsWith('hard-p19-') || ['hard-orders-plan', 'hard-lines-plan', 'hard-price-plan', 'hard-p21-public-directory', 'hard-p21-schema-directory-grants', 'hard-p25-grant-component-inventory', 'hard-p25-grant-pool-inventory'].includes(test.id));
const labTargets = await targets();
const records = [];
for (const test of cases) {
	const rows = await groundTruth(labTargets.find(target => target.name === test.target)!, test.groundTruth!.sql, test.groundTruth!.setupSql);
	if (!rows.length || rows.some(row => row.some(cell => cell == null))) throw new Error(`Invalid independent truth: ${test.id}`);
	records.push({ id: test.id, target: test.target, rows });
}
const sessions = createSessionProvider(loadConfig({ ...process.env, PIAGENT_TARGETS_FILE: fileURLToPath(new URL('../config/targets.json', import.meta.url)) }));
const labs = [];
try {
	for (const target of labTargets) {
		const session = await sessions.get(target.name);
		try {
			const directoryGrants = await session.query("SELECT grantee, privilege, COUNT(*) FROM dba_tab_privs WHERE type='DIRECTORY' GROUP BY grantee,privilege ORDER BY grantee,privilege");
			const cursors = await session.query("SELECT s.parsing_schema_name, u.username AS parsing_login, NVL(s.module,'UNSET') AS module, NVL(s.action,'UNSET') AS action, COUNT(*) FROM v$sql s JOIN all_users u ON u.user_id=s.parsing_user_id WHERE s.command_type=3 AND (UPPER(s.sql_text) LIKE 'SELECT COUNT(%FROM SHOPAPP.ORDERS%' OR UPPER(s.sql_text) LIKE 'SELECT PRICE FROM PRODUCTS WHERE PRODUCT_ID%') GROUP BY s.parsing_schema_name,u.username,s.module,s.action ORDER BY s.parsing_schema_name,u.username,s.module,s.action");
			const access = [];
			for (const view of ['V$SGA_DYNAMIC_COMPONENTS', 'V$SGASTAT']) {
				try { await session.query(`SELECT 1 FROM SYS.${view.replace('V$', 'V_$')} WHERE ROWNUM=1`); access.push({ view, status: 'readable' }); }
				catch (error) {
					const code = (error as { code?: string }).code;
					if (!['ORA-00942', 'ORA-01031'].includes(code ?? '')) throw error;
					access.push({ view, status: 'unavailable', code });
				}
			}
			labs.push({ target: target.name, directoryGrants: directoryGrants.rows, cursors: cursors.rows, access, backupValidator: await validateP25(target.name) });
		} finally { await session.close(); }
	}
} finally { await sessions.closeAll(); }
await writeFile(new URL('./wp29b-live.json', import.meta.url), JSON.stringify({ validatedAt: new Date().toISOString(), records, labs }, null, '\t') + '\n');
console.log(`Independent reader: ${records.length} changed cases; directory, cursor, memory-access and p25 validators checked on both labs.`);
