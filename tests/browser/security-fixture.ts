import type { SecurityPosture } from '../../src/security/index.js';
const evidence = { status: 'ok' as const, label: 'Privileges', view: 'DBA_TAB_PRIVS', sql: 'SELECT GRANTEE FROM DBA_TAB_PRIVS', binds: {}, columns: ['GRANTEE'], rows: [['PUBLIC']], elapsedMs: 0, truncated: false };
export const securityFixture: SecurityPosture = { target: 'd1-19c-lab', status: 'unavailable', checks: [
	{ id: 'powerful-privileges', title: 'Powerful Privileges', severity: 'high', status: 'ok', findings: [{ subject: 'APP', detail: '<img src=x onerror=alert(1)> SELECT ANY TABLE via APP → ROLE_A → ROLE_B', evidence }], advice: 'For a human DBA: review privileges.', evidence: [evidence], notes: ['Roles may require activation.'] },
	{ id: 'profiles', title: 'Password Profiles', severity: 'medium', status: 'unavailable', findings: [], advice: 'For a human DBA: review profile access.', evidence: [{ ...evidence, status: 'unavailable', view: 'DBA_PROFILES', rows: [], attempts: [{ view: 'DBA_PROFILES', code: 'ORA-00942' }] }], notes: ['Partial evidence.'] },
	{ id: 'accounts', title: 'Account Lifecycle', severity: 'info', status: 'ok', findings: [], advice: 'For a human DBA: review accounts.', evidence: [], notes: [] },
], whoCan: [
	{ subject: 'APP', privilege: 'SELECT', path: ['APP', 'ROLE_A', 'ROLE_B', 'SYS.OBJECT'], object: 'SYS.OBJECT', source: 'role', evidence },
	{ subject: 'PUBLIC', privilege: 'EXECUTE', path: ['PUBLIC', 'SYS.OBJECT'], object: 'SYS.OBJECT', source: 'PUBLIC', evidence },
] };
