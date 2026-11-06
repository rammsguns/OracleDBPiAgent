import { TARGET_FIELDS } from './targetErrors.js';
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
export function validateTarget(t: any, index?: number): asserts t is TargetConfig {
	const context = { index, name: typeof t?.name === 'string' ? t.name : undefined };
	const invalid = (field: typeof TARGET_FIELDS[number]): never => { throw new SafeConfigError({kind:'invalid',field,...context}); };
	if (!t || typeof t !== 'object' || Array.isArray(t)) invalid('name');
	for (const property of Object.keys(t)) if (!(TARGET_FIELDS as readonly string[]).includes(property)) throw new SafeConfigError({kind:'unknown',property,...context});
	if (typeof t.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(t.name)) invalid('name');
	const host = typeof t.host === 'string' ? t.host : '';
	const validHost = host.startsWith('[') ? host.endsWith(']') && isIP(host.slice(1,-1)) === 6 : host.length <= 253 && host.split('.').every((s: string) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(s));
	if (!validHost) invalid('host');
	if (!Number.isInteger(t.port) || t.port < 1 || t.port > 65535) invalid('port');
	if (typeof t.serviceName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.$#-]{0,127}$/.test(t.serviceName)) invalid('serviceName');
	if (typeof t.username !== 'string' || !identifier.test(t.username) || t.username.length > 128) invalid('username');
	if (DENIED_USERS.has(t.username.toUpperCase().replace(/^C##/, ''))) throw new SafeConfigError({kind:'denied',username:t.username.toUpperCase(),...context});
	if (typeof t.defaultSchema !== 'string' || !identifier.test(t.defaultSchema) || t.defaultSchema.length > 128) invalid('defaultSchema');
	if (typeof t.passwordFile !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(t.passwordFile)) invalid('passwordFile');
	if (!['development','production-like','production'].includes(t.environment)) invalid('environment');
	if (typeof t.description !== 'string' || !t.description.trim()) invalid('description');
	if (t.logTables !== undefined) try { validateLogTables(t.logTables); } catch { invalid('logTables'); }
}
export function targetsSource(env: NodeJS.ProcessEnv = process.env): string {
	if (env.PIAGENT_TARGETS_FILE !== undefined) return resolve(env.PIAGENT_TARGETS_FILE);
	const homeFile = join(agentHome(env), 'targets.json');
	try { lstatSync(homeFile); return homeFile; }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new SafeConfigError({kind:'file'}); }
	return resolve(PACKAGE_ROOT, 'config/targets.json');
}
export function validatePrivateTargetsStat(stat: Pick<Stats, 'isFile' | 'mode' | 'uid' | 'size'>, uid = process.getuid?.()): void {
	if (stat.size > 131072) throw new SafeConfigError({kind:'size'});
	if (!stat.isFile() || (stat.mode & 0o022) !== 0 || (uid !== undefined && stat.uid !== uid)) throw new SafeConfigError({kind:'file'});
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
			if (!stat.isFile()) throw new SafeConfigError({kind:'file'});
			if (stat.size > 131072) throw new SafeConfigError({kind:'size'});
			if (!packaged) validatePrivateTargetsStat(stat);
			const text = readFileSync(fd, 'utf8');
			try { raw = JSON.parse(text); } catch { throw new SafeConfigError({kind:'json'}); }
		} finally { closeSync(fd); }
	} catch (error) { if (error instanceof SafeConfigError) throw error; throw new SafeConfigError({kind:'file'}); }
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SafeConfigError({kind:'shape'});
	for (const property of Object.keys(raw)) if (!['version','targets'].includes(property)) throw new SafeConfigError({kind:'unknown',property});
	if (raw.version !== 1) throw new SafeConfigError({kind:'version'});
	if (!Array.isArray(raw.targets) || raw.targets.length < 1 || raw.targets.length > 20) throw new SafeConfigError({kind:'count'});
	const seen = new Set<string>();
	for (const [offset, t] of raw.targets.entries()) {
		validateTarget(t, offset + 1);
		if (seen.has(t.name)) throw new SafeConfigError({kind:'duplicate',index:offset+1,name:t.name});
		seen.add(t.name);
		if (packaged && !APPROVED_TARGETS.some(e => Object.entries(e).every(([k,v]) => (t as any)[k] === v))) throw new SafeConfigError({kind:'pin'});
	}
	if (packaged && raw.targets.length !== 2) throw new SafeConfigError('Expected the two approved 19c targets');
	if (packaged) packagedTargets.add(raw.targets);
	return raw.targets;
}
