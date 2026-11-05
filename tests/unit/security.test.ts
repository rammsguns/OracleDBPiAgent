import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { CHECK_IDS, SecurityUsageError, anyPrivileges, readSecurityPosture, renderSecurityMarkdown, rolePaths, validateSecurityOptions } from '../../src/security/index.js';
import { SQL } from '../../src/security/sql.js';
import type { OracleSession } from '../../src/contracts.js';
import { scanSecuritySource } from './security-sql-scan.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
function fixture(data: Partial<Record<keyof typeof SQL, unknown[][]>> = {}, unavailable: string[] = []): OracleSession {
	return { target: { name: 'fixture' }, query: async (sql: string) => {
		const key = (Object.keys(SQL) as (keyof typeof SQL)[]).find(k => SQL[k] === sql)!;
		if (unavailable.includes(key)) throw new Error('ORA-00942');
		return { rows: data[key] ?? [], columns: [], truncated: false, elapsedMs: 0 };
	} } as unknown as OracleSession;
}
it('scans every security SQL string and source for forbidden credential columns and objects', () => {
	for (const file of readdirSync('src/security', { recursive: true, encoding: 'utf8' }).filter(f => /\.[cm]?tsx?$/.test(f))) {
		expect(scanSecuritySource(readFileSync('src/security/' + file, 'utf8'), file), file).toEqual([]);
	}
	for (const sql of Object.values(SQL)) { expect(() => classifySql(sql)).not.toThrow(); expect(sql).not.toMatch(/SELECT\s+\*/i); }
});
it('validates options before reading', () => {
	for (const options of [{ checks: ['bad'] }, { checks: [''] }, { checks: ['who-can'] }, { whoCan: 'HR.EMPLOYEES;DELETE' }, { whoCan: 'HR.X@DB' }]) expect(() => validateSecurityOptions(options)).toThrow(SecurityUsageError);
});
it('expands nested roles without cycling and stops at ten edges', () => {
	expect(rolePaths('U', [['U', 'A'], ['A', 'B'], ['B', 'A']])).toEqual([['U'], ['U', 'A'], ['U', 'A', 'B']]);
	expect(Math.max(...rolePaths('R0', Array.from({ length: 20 }, (_, i) => ['R' + i, 'R' + (i + 1)])).map(p => p.length))).toBe(11);
});
it('finds nested DBA and ANY grants, excludes maintained users and roles', async () => {
	const result = await readSecurityPosture(fixture({ users: [['APP', 'N'], ['SYS', 'Y']], roles: [['A', 'N'], ['DBA', 'Y']], roleGrants: [['APP', 'A'], ['A', 'DBA'], ['DBA', 'A']], systemGrants: [['DBA', 'DROP ANY TABLE']], pwfile: [['APP', 'TRUE', 'FALSE'], ['SYS', 'TRUE', 'TRUE']] }), { checks: ['powerful-privileges'] });
	const findings = result.checks[0]!.findings;
	expect(findings.some(f => f.detail.includes('APP → A → DBA'))).toBe(true);
	expect(findings.some(f => f.detail.includes('DROP ANY TABLE'))).toBe(true);
	expect(findings.every(f => ['APP', 'A'].includes(f.subject))).toBe(true);
});
it('lists owner, direct, nested role, PUBLIC and type-matched ANY paths', async () => {
	const result = await readSecurityPosture(fixture({ users: [['U', 'N']], roles: [['R', 'N']], roleGrants: [['U', 'R']], systemGrants: [['R', 'SELECT ANY TABLE'], ['U', 'EXECUTE ANY PROCEDURE']], object: [['HR', 'EMPLOYEES', 'TABLE']], objectGrants: [['U', 'SELECT', 'NO'], ['R', 'DELETE', 'NO'], ['PUBLIC', 'READ', 'NO']] }), { checks: ['who-can'], whoCan: 'hr.employees' });
	expect(result.whoCan?.map(p => p.source)).toEqual(expect.arrayContaining(['owner', 'direct', 'role', 'PUBLIC', 'ANY']));
	expect(result.whoCan?.some(p => p.privilege === 'EXECUTE ANY PROCEDURE')).toBe(false);
	expect(anyPrivileges('SEQUENCE')).toContain('SELECT ANY SEQUENCE');
	expect(anyPrivileges('PACKAGE')).toContain('EXECUTE ANY PROCEDURE');
});
it('degrades each missing view and flags partial evidence', async () => {
	const result = await readSecurityPosture(fixture({}, ['defaults', 'auditEnabled']), {});
	expect(result.checks).toHaveLength(CHECK_IDS.length);
	expect(result.status).toBe('unavailable');
	expect(renderSecurityMarkdown(result)).toContain('DBA_USERS_WITH_DEFPWD');
	expect(result.checks.find(c => c.id === 'who-can')?.status).toBe('skipped');
});
it('resolves DEFAULT profile inheritance for open custom users', async () => {
	const result = await readSecurityPosture(fixture({ users: [['APP', 'N', 'OPEN', 'APP_PROFILE'], ['SYS', 'Y', 'OPEN', 'DEFAULT']], profiles: [['APP_PROFILE', 'PASSWORD_LIFE_TIME', 'DEFAULT'], ['DEFAULT', 'PASSWORD_LIFE_TIME', 'UNLIMITED'], ['APP_PROFILE', 'PASSWORD_VERIFY_FUNCTION', 'NULL']] }), { checks: ['profiles'] });
	expect(result.checks[0]!.findings).toHaveLength(2);
	expect(renderSecurityMarkdown(result)).not.toContain('"binds"');
});
it('does not turn unexpected SQL errors into missing-view success', async () => {
	const session = fixture(); session.query = async () => { throw new Error('ORA-00904'); };
	await expect(readSecurityPosture(session)).rejects.toThrow('ORA-00904');
});
it('never invents a missing verify function when profile access is denied', async () => {
	const result = await readSecurityPosture(fixture({ users: [['APP', 'N', 'OPEN', 'DEFAULT']] }, ['profiles']), { checks: ['profiles'] });
	expect(result.checks[0]!.status).toBe('unavailable');
	expect(result.checks[0]!.findings).toEqual([]);
});
it('reports expired unlocked accounts and locked owners without claiming missing last-login proves unused credentials', async () => {
	const result = await readSecurityPosture(fixture({ users: [['APP', 'N', 'EXPIRED', 'DEFAULT', null, null], ['OLD', 'N', 'LOCKED'], ['SYS', 'Y', 'LOCKED']], owned: [['OLD', 5], ['SYS', 20]] }), { checks: ['accounts'] });
	expect(result.checks[0]!.findings.map(f => f.subject)).toEqual(['APP', 'OLD']);
	expect(result.checks[0]!.findings[0]!.detail).toContain('does not prove');
});
it('shows failed-logon-only auditing and conditional privilege policy scope', async () => {
	const result = await readSecurityPosture(fixture({ auditEnabled: [['LOGIN', 'BY USER', 'ALL USERS', 'USER', 'NO', 'YES'], ['PRIV', 'BY USER', 'APP', 'USER', 'YES', 'YES']], auditPolicies: [['LOGIN', 'LOGON', 'STANDARD ACTION', 'NONE'], ['PRIV', 'DROP ANY TABLE', 'SYSTEM PRIVILEGE', 'condition']] }), { checks: ['audit'] });
	const text = renderSecurityMarkdown(result);
	expect(text).toContain('LOGIN: success=NO, failure=YES');
	expect(text).toContain('conditional (see evidence)');
	expect(text).toContain('does not establish coverage of all privilege use');
});
it('pages metadata within session limits and preserves evidence', async () => {
	const session = fixture(); const calls: string[] = [];
	session.query = async (sql, binds) => {
		calls.push(sql);
		return { rows: binds?.securityOffset ? [['B', 'OPEN', 'N']] : [['A', 'OPEN', 'N']], columns: ['USERNAME', 'ACCOUNT_STATUS', 'ORACLE_MAINTAINED'], truncated: !binds?.securityOffset, elapsedMs: 0 };
	};
	const result = await readSecurityPosture(session, { checks: ['default-passwords'] });
	expect(calls[1]).toContain('OFFSET :securityOffset ROWS');
	expect(result.checks[0]!.findings.map(f => f.subject)).toEqual(['A', 'B']);
	expect(result.status).toBe('ok');
});
it('marks a role depth cutoff as incomplete rather than a clean review', async () => {
	const result = await readSecurityPosture(fixture({ users: [['R0', 'N']], roleGrants: Array.from({ length: 12 }, (_, i) => ['R' + i, 'R' + (i + 1)]) }), { checks: ['powerful-privileges'] });
	expect(result.status).toBe('unavailable');
	expect(renderSecurityMarkdown(result)).toContain('Role expansion cap reached');
});
it('marks the 10k evidence cap as incomplete', async () => {
	const session = fixture();
	session.query = async () => ({ rows: Array.from({ length: 10001 }, () => ['A', 'OPEN', 'N']), columns: [], truncated: false, elapsedMs: 0 });
	const result = await readSecurityPosture(session, { checks: ['default-passwords'] });
	expect(result.status).toBe('unavailable');
	expect(result.checks[0]!.findings).toHaveLength(10000);
});
it('escapes database text and collapses empty checks in Markdown', async () => {
	const result = await readSecurityPosture(fixture({ defaults: [['<script>|\nx', 'OPEN']] }), { checks: ['default-passwords', 'public-grants'] });
	const text = renderSecurityMarkdown(result);
	expect(text).toContain('&lt;script&gt;&#124; x');
	expect(text).not.toContain('### PUBLIC Grants');
	expect(text).not.toContain('"sql"');
});

it('labels every check advice for a human DBA, including skipped and unavailable checks', async () => {
	for (const options of [{}, { whoCan: 'HR.EMPLOYEES' }]) {
		const result = await readSecurityPosture(fixture({}, ['defaults']), options);
		for (const check of result.checks) expect(check.advice, check.id).toMatch(/^For a human DBA:/);
	}
});
