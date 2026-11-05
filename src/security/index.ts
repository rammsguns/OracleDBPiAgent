import type { OracleSession } from '../contracts.js';
import type { Check } from '../triage/read.js';
import { SQL } from './sql.js';
export class SecurityUsageError extends Error {
	constructor(message: string) { super(message); this.name = 'SecurityUsageError'; }
}
export interface SecurityCheck {
	id: string; title: string; severity: 'high' | 'medium' | 'low' | 'info'; status: 'ok' | 'unavailable' | 'skipped';
	findings: { subject: string; detail: string; evidence: Check }[]; advice: string;
	/** All reads, including empty results and unavailable views. */
	evidence: Check[]; notes: string[];
}
export interface PrivilegePath { subject: string; privilege: string; path: string[]; object: string; source: 'owner' | 'direct' | 'role' | 'PUBLIC' | 'ANY'; evidence: Check }
export interface SecurityPosture { status: 'ok' | 'unavailable'; target: string; checks: SecurityCheck[]; whoCan?: PrivilegePath[] }
export const CHECK_IDS = ['default-passwords', 'powerful-privileges', 'public-grants', 'profiles', 'accounts', 'audit', 'parameters', 'who-can'] as const;
export interface SecurityOptions { checks?: string[]; whoCan?: string }
export function validateSecurityOptions(options: SecurityOptions): void {
	if (options.checks?.some(id => !CHECK_IDS.includes(id as typeof CHECK_IDS[number]))) throw new SecurityUsageError('Unknown check; choose ' + CHECK_IDS.join(', '));
	if (options.whoCan !== undefined && !/^[A-Za-z][A-Za-z0-9_$#]{0,127}\.[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(options.whoCan)) throw new SecurityUsageError('who-can must be OWNER.OBJECT (unquoted identifiers)');
	if (options.checks?.includes('who-can') && !options.whoCan) throw new SecurityUsageError('who-can check requires --who-can OWNER.OBJECT');
}
/** Enumerate effective role paths; cycles never recur and at most ten role edges are followed. */
export function rolePaths(subject: string, grants: unknown[][], incomplete: () => void = () => {}): string[][] {
	const paths: string[][] = [[subject]];
	function walk(path: string[]) {
		if (path.length > 10) { if (grants.some(r => r[0] === path.at(-1) && !path.includes(String(r[1])))) incomplete(); return; }
		for (const row of grants) if (row[0] === path.at(-1)) {
			const role = String(row[1]);
			if (path.includes(role)) continue;
			if (paths.length >= 10000) { incomplete(); return; }
			const next = [...path, role]; paths.push(next); walk(next);
		}
	}
	walk([subject]); return paths;
}
const s = (v: unknown) => v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
/** ANY privileges are object-type specific; dictionary objects have extra Oracle restrictions. */
export function anyPrivileges(type: string): string[] {
	const map: Record<string, string[]> = {
		TABLE: ['SELECT ANY TABLE', 'READ ANY TABLE', 'INSERT ANY TABLE', 'UPDATE ANY TABLE', 'DELETE ANY TABLE', 'ALTER ANY TABLE', 'DROP ANY TABLE', 'INDEX ANY TABLE', 'LOCK ANY TABLE'],
		VIEW: ['SELECT ANY TABLE', 'READ ANY TABLE', 'INSERT ANY TABLE', 'UPDATE ANY TABLE', 'DELETE ANY TABLE', 'DROP ANY VIEW'],
		'MATERIALIZED VIEW': ['SELECT ANY TABLE', 'READ ANY TABLE', 'DROP ANY MATERIALIZED VIEW', 'ALTER ANY MATERIALIZED VIEW'],
		SEQUENCE: ['SELECT ANY SEQUENCE', 'ALTER ANY SEQUENCE', 'DROP ANY SEQUENCE'],
		PROCEDURE: ['EXECUTE ANY PROCEDURE', 'ALTER ANY PROCEDURE', 'DROP ANY PROCEDURE'],
		FUNCTION: ['EXECUTE ANY PROCEDURE', 'ALTER ANY PROCEDURE', 'DROP ANY PROCEDURE'],
		PACKAGE: ['EXECUTE ANY PROCEDURE', 'ALTER ANY PROCEDURE', 'DROP ANY PROCEDURE'],
		TYPE: ['EXECUTE ANY TYPE', 'ALTER ANY TYPE', 'DROP ANY TYPE', 'UNDER ANY TYPE'],
		INDEX: ['ALTER ANY INDEX', 'DROP ANY INDEX'], TRIGGER: ['ALTER ANY TRIGGER', 'DROP ANY TRIGGER'],
	}; return map[type] ?? [];
}
export async function readSecurityPosture(session: OracleSession, options: SecurityOptions = {}): Promise<SecurityPosture> {
	validateSecurityOptions(options);
	const result: SecurityPosture = { status: 'ok', target: session.target.name, checks: [] };
	const cache = new Map<string, Check>();
	async function read(key: keyof typeof SQL, binds: Record<string, unknown> = {}): Promise<Check> {
		if (cache.has(key)) return cache.get(key)!;
		const sql = SQL[key], view = [...sql.matchAll(/(?:FROM|JOIN)\s+([A-Z][A-Z0-9_$]*)/g)].map(m => m[1]).join(', ');
		const check: Check = { label: key, sql, binds, status: 'ok', view, columns: [], rows: [], truncated: false, attempts: [] };
		try {
			Object.assign(check, await session.query(sql, binds));
			if (check.rows.length > 10000) { check.rows = check.rows.slice(0, 10000); check.truncated = true; }
			// Respect the configured session cap while paging bounded metadata results.
			while (check.truncated && check.rows.length < 10000) {
				const offset = check.rows.length;
				const page = await session.query(sql + ' OFFSET :securityOffset ROWS', { ...binds, securityOffset: offset });
				check.rows.push(...page.rows.slice(0, 10000 - offset)); check.truncated = page.truncated || offset + page.rows.length > 10000;
				if (!page.rows.length) break;
			}
		}
		catch (error) {
			const code = /ORA-\d{5}/.exec(String(error))?.[0];
			if (!code || !['ORA-00942', 'ORA-01031'].includes(code)) throw error;
			check.status = 'unavailable'; check.attempts.push({ view, code });
		}
		cache.set(key, check); return check;
	}
	for (const id of CHECK_IDS) {
		if (options.checks && !options.checks.includes(id) && !(id === 'who-can' && options.whoCan)) continue;
		const c: SecurityCheck = { id, title: '', severity: 'info', status: 'ok', findings: [], advice: 'For a human DBA: review available evidence before planning changes.', evidence: [], notes: [] };
		result.checks.push(c);
		async function use(key: keyof typeof SQL, binds?: Record<string, unknown>): Promise<Check> {
			const e = await read(key, binds); c.evidence.push(e);
			if (e.status === 'unavailable' || e.truncated) { c.status = 'unavailable'; result.status = 'unavailable'; }
			if (e.truncated) c.notes.push(`${e.view}: row cap reached; evidence is partial.`);
			return e;
		}
		function add(subject: unknown, detail: string, evidence: Check) { c.findings.push({ subject: s(subject), detail, evidence }); }
		if (id === 'default-passwords') {
			Object.assign(c, { title: 'Open Accounts with Default Passwords', severity: 'high', advice: 'For a human DBA: rotate default credentials and review whether these accounts need to remain open.' });
			const e = await use('defaults'); for (const r of e.rows) add(r[0], `${r[1]}; default credential listed by DBA_USERS_WITH_DEFPWD`, e);
		} else if (id === 'powerful-privileges' || id === 'who-can') {
			c.title = id === 'who-can' ? 'Who Can Access ' + (options.whoCan?.toUpperCase() ?? 'an Object') : 'Powerful Privileges';
			c.severity = id === 'who-can' ? 'info' : 'high';
			c.advice = 'For a human DBA: review privilege paths with the account owner and retain only privileges required for their duties.';
			if (id === 'who-can' && !options.whoCan) { c.status = 'skipped'; c.notes.push('Supply --who-can OWNER.OBJECT.'); continue; }
			const users = await use('users'), roles = await use('roles'), grants = await use('roleGrants'), sys = await use('systemGrants');
			c.notes.push('Role reachability includes grants regardless of default/enabled role state; roles may require activation. Expansion stops at ten role edges.');
			const subjects = users.rows.filter(r => r[1] === 'N').map(r => s(r[0]));
			const customRoles = roles.rows.filter(r => r[1] === 'N').map(r => s(r[0]));
			const paths = (subject: string) => rolePaths(subject, grants.rows, () => {
				c.status = 'unavailable'; result.status = 'unavailable';
				const note = 'Role expansion cap reached; privilege paths are partial.';
				if (!c.notes.includes(note)) c.notes.push(note);
			});
			if (id === 'powerful-privileges') {
				for (const subject of [...subjects, ...customRoles, 'PUBLIC']) for (const path of paths(subject)) {
					if (path.at(-1) === 'DBA') add(subject, 'DBA via ' + path.join(' → '), grants);
					for (const r of sys.rows) if (r[0] === path.at(-1) && /\bANY\b/.test(s(r[1]))) add(subject, `${r[1]} via ${path.join(' → ')}`, sys);
				}
				const pw = await use('pwfile'); for (const r of pw.rows) if (subjects.includes(s(r[0]))) add(r[0], `Password-file administrative access: SYSDBA=${r[1]}, SYSOPER=${r[2]}`, pw);
			} else {
				const [owner, name] = options.whoCan!.toUpperCase().split('.') as [string, string], object = owner + '.' + name;
				const obj = await use('object', { owner, name }), direct = await use('objectGrants', { owner, name });
				result.whoCan = [];
				if (!obj.rows.length) { c.notes.push(obj.status === 'ok' ? 'Object not found in DBA_OBJECTS; no paths inferred.' : 'Object metadata unavailable; no paths inferred.'); continue; }
				const types = obj.rows.map(r => s(r[2])), matching = new Set(types.flatMap(anyPrivileges));
				function path(subject: string, privilege: string, route: string[], source: PrivilegePath['source'], evidence: Check) { result.whoCan!.push({ subject, privilege, path: [...route, object], object, source, evidence }); }
				path(owner, 'OWNER', [owner], 'owner', obj);
				for (const subject of [...new Set([...subjects, ...customRoles, 'PUBLIC', owner])]) for (const route of paths(subject)) {
					for (const r of direct.rows) if (r[0] === route.at(-1)) path(subject, s(r[1]), route, subject === 'PUBLIC' ? 'PUBLIC' : route.length > 1 ? 'role' : 'direct', direct);
					for (const r of sys.rows) if (r[0] === route.at(-1) && matching.has(s(r[1])) && owner !== 'SYS') path(subject, s(r[1]), route, 'ANY', sys);
				}
				c.notes.push('PUBLIC paths apply to all users. These are grant reachability paths, not a guarantee that a locked account can log in or a view is writable. SYS dictionary ANY access is not inferred. Column-level grants are outside this object-grant review. Password-file administrator sessions bypass ordinary object grants and are reviewed separately.');
				for (const p of result.whoCan) add(p.subject, `${p.privilege}: ${p.path.join(' → ')} (${p.source})`, p.evidence);
			}
		} else if (id === 'public-grants') {
			Object.assign(c, { title: 'PUBLIC Grants', severity: 'medium', advice: 'For a human DBA: review PUBLIC access to network, file and dynamic SQL packages and application data; prefer narrowly scoped access where practical.' });
			const e = await use('public'); for (const r of e.rows) add(`${r[0]}.${r[1]}`, `PUBLIC ${r[2]} (${r[3] ?? 'package'})`, e);
		} else if (id === 'profiles') {
			Object.assign(c, { title: 'Password Profiles for Open Users', severity: 'medium', advice: 'For a human DBA: review effective profile limits, password verification and application authentication requirements with a DBA.' });
			const profiles = await use('profiles'), users = await use('users');
			const groups = new Map<string, { profile: string; resource: string; value: string; users: Set<string> }>();
			for (const u of users.rows.filter(r => r[1] === 'N' && s(r[2]).startsWith('OPEN'))) for (const resource of ['FAILED_LOGIN_ATTEMPTS', 'PASSWORD_LIFE_TIME', 'PASSWORD_VERIFY_FUNCTION']) {
				let value = profiles.rows.find(r => r[0] === u[3] && r[1] === resource)?.[2];
				if (value === 'DEFAULT') value = profiles.rows.find(r => r[0] === 'DEFAULT' && r[1] === resource)?.[2];
				if (profiles.status !== 'ok') continue;
				if (value === undefined) { c.status = 'unavailable'; result.status = 'unavailable'; if (!c.notes.includes('Effective profile metadata incomplete.')) c.notes.push('Effective profile metadata incomplete.'); continue; }
				if (value === 'UNLIMITED' || (resource === 'PASSWORD_VERIFY_FUNCTION' && (value === 'NULL' || value === null))) {
					const profile = s(u[3]), effective = value === null ? 'NULL' : s(value), key = JSON.stringify([profile, resource, effective]);
					let group = groups.get(key);
					if (!group) { group = { profile, resource, value: effective, users: new Set() }; groups.set(key, group); }
					group.users.add(s(u[0]));
				}
			}
			for (const group of [...groups.values()].sort((a, b) => a.profile.localeCompare(b.profile) || a.resource.localeCompare(b.resource))) {
				const affected = [...group.users].sort();
				add(`Profile ${group.profile}`, `${group.resource}=${group.value}; Affected Open Users (${affected.length}): ${affected.join(', ')}`, profiles);
			}
		} else if (id === 'accounts') {
			Object.assign(c, { title: 'Account Lifecycle', severity: 'info', advice: 'For a human DBA: confirm unused accounts and retained object ownership with application owners before planning account lifecycle changes.' });
			const users = await use('users'), owned = await use('owned');
			for (const u of users.rows.filter(r => r[1] === 'N')) {
				if (!s(u[2]).includes('LOCKED') && (s(u[2]).includes('EXPIRED') || u[5] == null || (u[4] != null && new Date(s(u[4])).getTime() < Date.now()))) add(u[0], `${u[2]}; expiry=${s(u[4]) || 'none'}; last login=${s(u[5]) || 'not recorded (does not prove the password was never used)'}`, users);
				const count = owned.rows.find(r => r[0] === u[0])?.[1];
				if (s(u[2]).includes('LOCKED') && Number(count) > 0) add(u[0], `${u[2]}; owns ${count} objects`, owned);
			}
		} else if (id === 'audit') {
			Object.assign(c, { title: 'Audit Configuration', severity: 'info', advice: 'For a human DBA: validate logon and privilege-use coverage for every relevant principal, including success and failure, policy conditions and the active audit mode. Policy configuration does not prove events are being collected.' });
			const enabled = await use('auditEnabled'), policies = await use('auditPolicies'), traditional = await use('auditTraditional');
			for (const r of enabled.rows) {
				const definitions = policies.rows.filter(p => p[0] === r[0]);
				const conditional = definitions.some(p => p[3] && p[3] !== 'NONE');
				add(r[0], `Enabled ${r[1]} ${r[2]} (${r[3]}); success=${r[4]}, failure=${r[5]}; ${definitions.length} configured options${conditional ? '; conditional (see evidence)' : '; no condition observed'}`, enabled);
			}
			const definitions = policies.rows.filter(p => enabled.rows.some(e => e[0] === p[0]));
			const logons = enabled.rows.filter(e => definitions.some(p => p[0] === e[0] && /^(LOGON|CREATE SESSION)$/.test(s(p[1]))));
			add('Logon coverage', logons.length ? logons.map(r => `${r[0]}: success=${r[4]}, failure=${r[5]}, scope=${r[1]} ${r[2]}`).join('; ') + '; policy scope and conditions require review.' : 'No enabled unified logon option observed in available evidence.', policies);
			const privileges = [...new Set(definitions.filter(p => /PRIVILEGE/.test(s(p[2]))).map(p => s(p[1])))];
			add('Privilege-use coverage', `${privileges.length} distinct system privilege options in enabled policies${privileges.length ? ': ' + privileges.slice(0, 4).join(', ') + (privileges.length > 4 ? ', … (complete list in JSON evidence)' : '') : ''}. This does not establish coverage of all privilege use.`, policies);
			if (!traditional.rows.length) c.notes.push('No traditional statement audit options observed in available evidence.');
			for (const r of traditional.rows) add(r[0] ?? 'All users', `Traditional ${r[2]}: success=${r[3]}, failure=${r[4]}; proxy=${r[1] ?? 'none'}`, traditional);
		} else if (id === 'parameters') {
			Object.assign(c, { title: 'Security Parameters', severity: 'low', advice: 'For a human DBA: review password-file administration, case-sensitive authentication and audit mode with a DBA against the site security policy.' });
			const e = await use('parameters'); for (const r of e.rows) add(r[0], s(r[1]), e);
			if (!e.rows.some(r => r[0] === 'o7_dictionary_accessibility') && e.status === 'ok') c.notes.push('O7_DICTIONARY_ACCESSIBILITY: N/A (not exposed on this Oracle 19c target).');
		}
	}
	return result;
}
const escape = (value: unknown) => s(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]/g, ' ');
export function renderSecurityMarkdown(result: SecurityPosture): string {
	const lines = [`# Security Posture: ${escape(result.target)}`, '', `Status: ${result.status}. Read-only findings; no database changes.`, ''];
	for (const severity of ['high', 'medium', 'low', 'info'] as const) {
		const checks = result.checks.filter(c => c.severity === severity && c.findings.length);
		if (!checks.length) continue;
		lines.push(`## ${severity[0]!.toUpperCase() + severity.slice(1)} Severity`, '');
		for (const c of checks) {
			lines.push(`### ${escape(c.title)} (${c.status})`, '', '| Subject | Finding | Evidence |', '| --- | --- | --- |');
			for (const f of c.findings) lines.push(`| ${escape(f.subject)} | ${escape(f.detail)} | ${escape(f.evidence.view)}${f.evidence.truncated ? ' (partial)' : ''} |`);
			lines.push('', escape(c.advice), '');
		}
	}
	lines.push('## Check Status', '');
	for (const c of result.checks) {
		const missing = c.evidence.filter(e => e.status === 'unavailable').map(e => e.view).join('; ');
		lines.push(`- ${escape(c.title)} [${c.id}]: ${c.status}${missing ? '; unavailable: ' + escape(missing) : ''}${!c.findings.length && c.status === 'ok' ? '; no findings in available evidence' : ''}.`);
		for (const note of c.notes) lines.push('  ' + escape(note));
	}
	return lines.join('\n') + '\n';
}
