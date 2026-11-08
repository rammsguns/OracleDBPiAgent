import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { agentHome } from '../config/paths.js';
export class CheckUsageError extends Error {}
export const CHECK_NAMES = ['tablespaces','temp','undo','recovery','blocking','backupAge','archiveGaps','dgLag','failedJobs','alertErrors','incidents','maintenance','expiry','defaultPasswords'] as const;
export type CheckName = typeof CHECK_NAMES[number];
export type UnknownAs = 'ok' | 'warn' | 'crit' | 'unknown';
export interface CheckPolicy { unknownAs: UnknownAs }
export interface Threshold { warn: number; crit: number | null }
export interface Thresholds { space: Threshold; recovery: Threshold; blocking: Threshold; backupAge: Threshold; dgLag: Threshold; failedJobs: Threshold; alertErrors: Threshold; maintenance: Threshold; expiry: Threshold; windowHours: number; disable: CheckName[]; checks: Partial<Record<CheckName, CheckPolicy>> }
export const DEFAULTS: Thresholds = {
	space: { warn: 85, crit: 95 }, recovery: { warn: 80, crit: 90 }, blocking: { warn: 60, crit: 300 },
	dgLag: { warn: 300, crit: 1800 }, backupAge: { warn: 26, crit: 50 }, failedJobs: { warn: 1, crit: 3 }, alertErrors: { warn: 1, crit: null },
	maintenance: { warn: 1, crit: 20 }, expiry: { warn: 14, crit: 3 }, windowHours: 1, disable: [], checks: {},
};
export interface CheckConfig { defaults?: Partial<Thresholds>; targets?: Record<string, Partial<Thresholds>> }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function validate(v: unknown): asserts v is Partial<Thresholds> {
	if (!object(v)) throw new CheckUsageError('check.json: expected thresholds object');
	for (const [k, value] of Object.entries(v)) {
		if (!Object.hasOwn(DEFAULTS, k)) throw new CheckUsageError('check.json: unknown threshold key');
		if (k === 'disable') {
			if (!Array.isArray(value) || value.some(name => !(CHECK_NAMES as readonly unknown[]).includes(name)) || new Set(value).size !== value.length) throw new CheckUsageError('check.json: disable requires unique known check names');
			continue;
		}
		if (k === 'checks') {
			if (!object(value)) throw new CheckUsageError('check.json: checks requires an object');
			for (const [name, policy] of Object.entries(value)) {
				if (!(CHECK_NAMES as readonly string[]).includes(name) || !object(policy) || Object.keys(policy).join(',') !== 'unknownAs' || (typeof policy.unknownAs !== 'string' || !['ok','warn','crit','unknown'].includes(policy.unknownAs))) throw new CheckUsageError('check.json: checks require known names and unknownAs: ok|warn|crit|unknown');
			}
			continue;
		}
		if (k === 'windowHours') { if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 720) throw new CheckUsageError('check.json: windowHours must be 1–720'); continue; }
		const max = ['space','recovery'].includes(k) ? 100 : 1000000;
		if (!object(value) || Object.keys(value).sort().join(',') !== 'crit,warn' || !['warn','crit'].every(x => (k === 'alertErrors' && x === 'crit' && value[x] === null) || typeof value[x] === 'number' && Number.isFinite(value[x]) && Number(value[x]) >= 0 && Number(value[x]) <= max) || (value.crit !== null && (k === 'expiry' ? Number(value.crit) >= Number(value.warn) : Number(value.warn) >= Number(value.crit)))) throw new CheckUsageError('check.json: invalid threshold pair');
	}
}
export function parseCheckConfig(raw: unknown, targets: readonly string[]): CheckConfig {
	if (!object(raw) || raw.version !== 1 || Object.keys(raw).some(k => !['version','defaults','targets'].includes(k))) throw new CheckUsageError('check.json: expected version 1 and known keys');
	if (raw.defaults !== undefined) validate(raw.defaults);
	if (raw.targets !== undefined) {
		if (!object(raw.targets) || Object.keys(raw.targets).some(k => !targets.includes(k))) throw new CheckUsageError('check.json: unknown target override');
		for (const value of Object.values(raw.targets)) validate(value);
	}
	return raw as CheckConfig;
}
export function loadCheckConfig(targets: readonly string[], env = process.env): CheckConfig {
	let fd: number;
	try { fd = openSync(join(agentHome(env), 'check.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
	catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw new CheckUsageError('check.json: cannot open private regular file'); }
	try {
		const s = fstatSync(fd);
		if (!s.isFile() || ![0o600,0o400].includes(s.mode & 0o777) || s.uid !== process.getuid?.() || s.size > 131072) throw new CheckUsageError('check.json: requires owner-owned regular file mode 0600 or 0400, at most 128 KiB');
		let raw: unknown; try { raw = JSON.parse(readFileSync(fd, 'utf8')); } catch { throw new CheckUsageError('check.json: invalid JSON'); }
		return parseCheckConfig(raw, targets);
	} finally { closeSync(fd); }
}
export function thresholdsFor(config: CheckConfig, target: string): Thresholds { return { ...DEFAULTS, ...config.defaults, ...config.targets?.[target], checks: { ...config.defaults?.checks, ...config.targets?.[target]?.checks } }; }
