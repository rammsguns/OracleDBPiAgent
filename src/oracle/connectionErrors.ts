import { SafeConfigError } from '../config/safeErrors.js';
import { AsyncLocalStorage } from 'node:async_hooks';
const GUIDANCE = {
	'ORA-01017': 'invalid username/password; check the password file name and its contents in PIAGENT_SECRET_DIR',
	'ORA-28000': 'account locked; ask the DBA to unlock the read-only account',
	'ORA-12514': 'unknown service name; use the PDB service name',
	'ORA-12505': 'unknown service name; use the PDB service name',
	'ORA-12541': 'listener unreachable; check the host, port and listener availability',
	'ORA-12170': 'connection timeout; check the host, port, network and listener availability',
	'NJS-503': 'listener unreachable or connection timeout; check the host, port, network and listener availability',
	'NJS-002': 'TCPS handshake failed; check the wallet, certificate and server TLS configuration',
	'NJS-040': 'TCPS handshake failed; check the wallet, certificate and server TLS configuration',
	'NJS-505': 'TLS initialization failed; check wallet credentials and TLS configuration',
	'NJS-506': 'TLS handshake failed; check the wallet, certificate and server TLS configuration',
	'NJS-507': 'TLS certificate distinguished name validation failed; check the configured server DN',
	'NJS-508': 'TLS certificate hostname validation failed; check the server certificate hostname',
	'ORA-29024': 'TLS certificate validation failed; check the server certificate chain and wallet',
	'ORA-28860': 'TLS connection failed; check the server and client wallet configuration',
	'ORA-28759': 'wallet file could not be opened; check the private wallet directory and PEM files',
	'NJS-517': 'unknown wallet alias; check tnsAlias in the wallet tnsnames.ora',
	'ORA-01045': 'missing CREATE SESSION; ask the DBA to grant CREATE SESSION to the read-only account',
	'ORA-28001': 'expired password; ask the DBA to renew the read-only account password and update its password file',
} as const;
export function connectionGuidance(error: unknown): string | undefined {
	if (error instanceof ConnectionFailure) return error.message;
	const value = error instanceof Error ? error.message : '';
	if (error instanceof SafeConfigError) return error.message;

	const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
	for (const [key, guidance] of Object.entries(GUIDANCE)) if (code === key || new RegExp(`\\b${key}\\b`).test(value)) return `${key}: ${guidance}`;
	return undefined;
}
class ConnectionFailure extends Error {
	constructor(guidance?: string) { super(guidance ?? 'Database connection failed; check local configuration and service availability'); }
}
const failures = new AsyncLocalStorage<{ error?: Error }>();
export function recordConnectionFailure(error: unknown): Error {
	const safe = error instanceof SafeConfigError ? error : new ConnectionFailure(connectionGuidance(error));
	const current = failures.getStore();
	if (current) current.error ??= safe;
	return safe;
}
export function throwConnectionFailure(): void {
	const error = failures.getStore()?.error;
	if (error) throw error;
}
export function clearConnectionFailure(): void { const current = failures.getStore(); if (current) delete current.error; }
/** Preserve guidance even when a feature reader converts connection failures into unavailable sections. */
export async function withConnectionFailures<T>(action: () => Promise<T>): Promise<T> {
	return failures.run({}, async () => {
		const result = await action();
		const error = failures.getStore()?.error;
		if (error) throw error;
		return result;
	});
}

/** Long-running handlers must not retain failures beyond the operation that handled them. */
export function withoutConnectionFailures<T>(action: () => T): T {
	return failures.exit(action);
}

/** Local adapter until the coordinator adds the password-file template to the config catalog. */
export class PasswordFileError extends SafeConfigError {
	constructor(target: string, file: string) {
		super('Invalid password file');
		if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(target) && /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(file)) {
			this.message = `Password file ${file} for target ${target} is missing, unreadable, non-regular or empty in PIAGENT_SECRET_DIR (chmod 600, owned by you)`;
		}
	}
}
