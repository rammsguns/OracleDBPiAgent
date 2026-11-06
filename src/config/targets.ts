import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, type Stats } from 'node:fs';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';
import type { TargetConfig } from '../contracts.js';
import { agentHome, PACKAGE_ROOT } from './paths.js';
import { ensureAgentHome } from './environment.js';
import { APPROVED_TARGETS } from './approvedTargets.js';
import { SafeConfigError } from './safeErrors.js';
import { validateLogTables } from './logTables.js';
const packagedTargets = new WeakSet<object>();
export function usesPackagedTargets(targets: readonly TargetConfig[]): boolean { return packagedTargets.has(targets); }
export const DENIED_USERS = new Set('SYS SYSTEM SYSBACKUP SYSDG SYSKM SYSRAC AUDSYS DBSNMP XDB GSMADMIN_INTERNAL OUTLN LBACSYS DVSYS MDSYS CTXSYS ORDSYS WMSYS OJVMSYS APPQOSSYS ANONYMOUS HARNESS_APP SHOPAPP'.split(' '));
export const identifier = /^(?:C##)?[A-Za-z][A-Za-z0-9_$#]{0,127}$/;
export function validateTarget(t: any): asserts t is TargetConfig {
	const host = typeof t?.host === 'string' ? t.host : '';
	const validHost = host.startsWith('[') ? host.endsWith(']') && isIP(host.slice(1,-1)) === 6 : host.length <= 253 && host.split('.').every((s: string) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(s));
	if (!t || typeof t.name !== 'string' || typeof t.serviceName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(t.name ?? '') || !validHost || !Number.isInteger(t.port) || t.port < 1 || t.port > 65535 || !/^[A-Za-z0-9][A-Za-z0-9_.$#-]{0,127}$/.test(t.serviceName ?? '') || typeof t.username !== 'string' || (!identifier.test(t.username) || t.username.length > 128) || DENIED_USERS.has(t.username.toUpperCase()) || typeof t.defaultSchema !== 'string' || (!identifier.test(t.defaultSchema) || t.defaultSchema.length > 128) || typeof t.passwordFile !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(t.passwordFile) || !['development','production-like','production'].includes(t.environment) || typeof t.description !== 'string' || !t.description.trim() || Object.keys(t).some(k => !['name','host','port','serviceName','username','passwordFile','defaultSchema','environment','description','logTables'].includes(k))) throw new SafeConfigError('Invalid or unapproved target configuration');
	if (t.logTables !== undefined) validateLogTables(t.logTables);
}
export function targetsSource(env: NodeJS.ProcessEnv = process.env): string {
	if (env.PIAGENT_TARGETS_FILE !== undefined) return resolve(env.PIAGENT_TARGETS_FILE);
	const homeFile = join(agentHome(env), 'targets.json');
	try { lstatSync(homeFile); return homeFile; }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new SafeConfigError('Invalid or unapproved target configuration'); }
	return resolve(PACKAGE_ROOT, 'config/targets.json');
}
export function validatePrivateTargetsStat(stat: Pick<Stats, 'isFile' | 'mode' | 'uid' | 'size'>, uid = process.getuid?.()): void {
	if (!stat.isFile() || stat.size > 131072 || (stat.mode & 0o022) !== 0 || (uid !== undefined && stat.uid !== uid)) throw new SafeConfigError('Invalid or unapproved target configuration');
}
export function loadTargets(env: NodeJS.ProcessEnv): TargetConfig[] {
	const file = targetsSource(env);
	const packaged = file === resolve(PACKAGE_ROOT, 'config/targets.json');
	let raw: any;
	try {
		if (!packaged) ensureAgentHome(env);
		const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const stat = fstatSync(fd);
			if (!stat.isFile() || stat.size > 131072) throw new Error();
			if (!packaged) validatePrivateTargetsStat(stat);
			raw = JSON.parse(readFileSync(fd, 'utf8'));
		} finally { closeSync(fd); }
	} catch { throw new SafeConfigError('Invalid or unapproved target configuration'); }
	if (!raw || raw.version !== 1 || !Array.isArray(raw.targets) || raw.targets.length < 1 || raw.targets.length > 20 || Object.keys(raw).some(k => !['version','targets'].includes(k))) throw new SafeConfigError('Invalid or unapproved target configuration');
	const seen = new Set<string>();
	for (const t of raw.targets) {
		validateTarget(t);
		if (seen.has(t.name)) throw new SafeConfigError('Invalid or unapproved target configuration');
		seen.add(t.name);
		if (packaged && !APPROVED_TARGETS.some(e => Object.entries(e).every(([k,v]) => (t as any)[k] === v))) throw new SafeConfigError('Invalid or unapproved target configuration');
	}
	if (packaged && raw.targets.length !== 2) throw new SafeConfigError('Expected the two approved 19c targets');
	if (packaged) packagedTargets.add(raw.targets);
	return raw.targets;
}
