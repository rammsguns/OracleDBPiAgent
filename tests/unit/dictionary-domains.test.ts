import { expect, it, vi } from 'vitest';
import { dictionaryDomainHint, dictionaryDomains } from '../../src/tools/dictionaryDomains.js';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';

for (const [table, columns] of Object.entries(dictionaryDomains)) for (const [column, values] of Object.entries(columns)) {
	it(`${table}.${column} rejects an invalid literal and accepts every reviewed value`, () => {
		expect(dictionaryDomainHint(`SELECT * FROM ${table} WHERE ${column}='wrong'`, 0)).toContain(`${table}.${column}`);
		for (const value of values) expect(dictionaryDomainHint(`SELECT * FROM ${table} WHERE ${column}='${value}'`, 0)).toBeUndefined();
	});
}
for (const sql of [
	"select * from sys.dba_users u where u.oracle_maintained='NO'",
	"select * from DBA_USERS where (oracle_maintained IN ('NO', 'YES'))",
	"select * from dba_users where username='SH' AND oracle_maintained /* domain */ = 'NO' order by username",
	"select * from dba_users u where (u.oracle_maintained='no')",
]) it(`hints simple predicate: ${sql}`, () => expect(dictionaryDomainHint(sql, 0)).toContain('DBA_USERS.ORACLE_MAINTAINED'));

for (const sql of [
	"select * from app_users where oracle_maintained='NO'",
	"select * from app.dba_users where oracle_maintained='NO'",
	"select * from dba_users where oracle_maintained=:flag",
	"select * from dba_users where oracle_maintained LIKE 'NO'",
	"select * from dba_users where oracle_maintained != 'NO'",
	"select * from dba_users where oracle_maintained IN ('N', 'NO')",
	"select * from dba_users where oracle_maintained IN (:flag, 'NO')",
	"select * from dba_users where oracle_maintained='N'",
	"select * from dba_users where oracle_maintained='NO'||'x'",
	"select * from dba_users where upper(oracle_maintained)='NO'",
	"select * from dba_users where not (oracle_maintained='NO')",
	"select * from dba_users where f(oracle_maintained='NO')=1",
	"select * from dba_users u where other.oracle_maintained='NO'",
	"select * from dba_users u join other o on u.username=o.username where oracle_maintained='NO'",
	"select * from dba_users u, other o where oracle_maintained='NO'",
	"with dba_users as (select * from app_users) select * from dba_users where oracle_maintained='NO'",
	"select * from (select * from dba_users) where oracle_maintained='NO'",
	"select * from dba_users where username IN (select username from app_users where oracle_maintained='NO')",
	`select * from dba_users where "oracle_maintained"='NO'`,
	"select * from dba_users where oracle_maintained=q'[NO]'",
	"select * from dba_users where oracle_maintained=N'NO'",
	"select * from dba_users where username='oracle_maintained=''NO'''",
	"select * from dba_users -- where oracle_maintained='NO'\nwhere username='SH'",
]) it(`declines uncertain or valid predicate: ${sql}`, () => expect(dictionaryDomainHint(sql, 0)).toBeUndefined());

it('appends the hint only to empty run_query results without another database call', async () => {
	for (const rows of [[], [['N']]]) {
		const query = vi.fn().mockResolvedValue({ columns: ['ORACLE_MAINTAINED'], rows, truncated: false, elapsedMs: 1 });
		const close = vi.fn();
		const ctx = { config: { defaultTarget: 'lab', targets: [{ name: 'lab', defaultSchema: 'SH' }], limits: { maxRows: 10, maxToolResultBytes: 4000 } }, sessions: { get: async () => ({ query, close }) }, audit: { record: vi.fn() }, runId: 'test' } as unknown as ToolContext;
		const result = await createDbTools(ctx).find(t => t.name === 'run_query')!.execute('1', { sql: "SELECT oracle_maintained FROM dba_users WHERE oracle_maintained='NO'" });
		expect(JSON.stringify(result).includes('Hint:')).toBe(!rows.length);
		expect(query).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	}
});
