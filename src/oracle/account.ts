export const SYSTEM_PRIVILEGES = new Set(['CREATE SESSION','ALTER SESSION','SET CONTAINER','SELECT ANY DICTIONARY','SELECT ANY TABLE','READ ANY TABLE','SELECT ANY SEQUENCE']);
export class AccountCheckError extends Error {}
export interface AccountConnection { execute(sql: string, binds: object, options: object): Promise<any> }
export async function checkAccount(connection: AccountConnection, username: string, options: object): Promise<void> {
	try {
		const identity = await connection.execute("SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USER'), SYS_CONTEXT('USERENV','CON_ID'), SYS_CONTEXT('USERENV','CON_NAME') FROM dual", {}, options);
		const r = identity.rows?.[0];
		if (!Array.isArray(r) || r.length < 5 || r[0] !== username.toUpperCase() || r[1] !== 'FALSE' || r[2]) throw new AccountCheckError('Account check failed: SESSION_USER / ISDBA / PROXY_USER');
		if (String(r[3]) === '1' || r[4] === 'CDB$ROOT') throw new AccountCheckError('CDB$ROOT refused; use the PDB service name');
		if (!/^(0|[1-9][0-9]*)$/.test(String(r[3])) || typeof r[4] !== 'string' || !r[4]) throw new AccountCheckError('Account check could not determine container; connection refused');
		const system = await connection.execute('SELECT PRIVILEGE FROM SESSION_PRIVS', {}, options);
		const objects = await connection.execute("SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grantee = SYS_CONTEXT('USERENV','SESSION_USER') UNION ALL SELECT privilege, owner FROM role_tab_privs WHERE role IN (SELECT role FROM session_roles)) p LEFT JOIN all_users u ON u.username=p.owner", {}, options);
		if (!Array.isArray(system.rows) || !Array.isArray(objects.rows)) throw new Error();
		const bad = [...system.rows.filter((r: any[]) => !SYSTEM_PRIVILEGES.has(r[0])).map((r: any[]) => String(r[0])), ...objects.rows.filter((r: any[]) => !['SELECT','READ'].includes(r[0]) && !(r[0] === 'EXECUTE' && r[2] === 'Y')).map((r: any[]) => `${r[0]} on ${r[1]}`)];
		if (bad.length) throw new AccountCheckError(`Account check failed: ${[...new Set(bad)].sort().join(', ')}`);
	} catch (error) {
		if (error instanceof AccountCheckError) throw error;
		throw new AccountCheckError('Account check could not run; connection refused');
	}
}
