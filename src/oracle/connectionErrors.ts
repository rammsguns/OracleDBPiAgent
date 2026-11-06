import { AsyncLocalStorage } from 'node:async_hooks';
const GUIDANCE = {
	'ORA-01017': 'invalid username/password; check the password file name and its contents in PIAGENT_SECRET_DIR',
	'ORA-28000': 'account locked; ask the DBA to unlock the read-only account',
	'ORA-12514': 'unknown service name; use the PDB service name',
	'ORA-12505': 'unknown service name; use the PDB service name',
	'ORA-12541': 'listener unreachable; check the host, port and listener availability',
	'ORA-12170': 'connection timeout; check the host, port, network and listener availability',
	'NJS-503': 'listener unreachable or connection timeout; check the host, port, network and listener availability',
	'ORA-01045': 'missing CREATE SESSION; ask the DBA to grant CREATE SESSION to the read-only account',
	'ORA-28001': 'expired password; ask the DBA to renew the read-only account password and update its password file',
} as const;
export function connectionGuidance(error: unknown): string | undefined {
	const value = error instanceof Error ? error.message : '';
	const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
	for (const [key, guidance] of Object.entries(GUIDANCE)) if (code === key || new RegExp(`\\b${key}\\b`).test(value)) return `${key}: ${guidance}`;
	return undefined;
}
const failures = new AsyncLocalStorage<{ error?: Error }>();
export function recordConnectionFailure(error: unknown): Error {
	const safe = new Error(connectionGuidance(error) ?? 'Database connection failed; check local configuration and service availability');
	const current = failures.getStore();
	if (current) current.error ??= safe;
	return safe;
}
export function clearConnectionFailure(): void { const current = failures.getStore(); if (current) delete current.error; }
/** Preserve guidance even when a feature reader converts connection failures into unavailable sections. */
export async function withConnectionFailures(action: () => Promise<void>): Promise<void> {
	return failures.run({}, async () => {
		await action();
		const error = failures.getStore()?.error;
		if (error) throw error;
	});
}

/** Long-running handlers must not retain failures beyond the operation that handled them. */
export function withoutConnectionFailures<T>(action: () => T): T {
	return failures.exit(action);
}
