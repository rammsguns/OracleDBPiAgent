export const TARGET_FIELDS = ['name','host','port','serviceName','username','passwordFile','defaultSchema','environment','description','logTables','protocol','wallet'] as const;
export type TargetIssue =
	| { kind: 'file' | 'size' | 'json' | 'version' | 'count' | 'shape' | 'pin' }
	| { kind: 'invalid'; field: typeof TARGET_FIELDS[number]; index?: number; name?: string }
	| { kind: 'unknown'; property: string; index?: number; name?: string }
	| { kind: 'duplicate'; index?: number; name?: string }
	| { kind: 'denied'; username: string; index?: number; name?: string };
export function targetErrorMessage(issue: TargetIssue): string {
	const fixed = {
		file: 'targets.json must be a regular file owned by you and not group/other-writable (chmod 600 <path>); check the file exists and is not a symlink',
		size: 'targets.json must not exceed 131072 bytes',
		json: 'targets.json must contain valid JSON',
		version: 'targets.json version must be 1',
		count: 'targets.json must contain 1–20 targets',
		shape: 'targets.json must be an object with version and targets',
		pin: 'targets.json packaged lab values must match the pinned lab configuration',
	} as const;
	if (Object.hasOwn(fixed, issue.kind)) return fixed[issue.kind as keyof typeof fixed];
	const location = 'index' in issue && Number.isSafeInteger(issue.index) && issue.index! > 0 ? ` target ${issue.index}` : '';
	const name = 'name' in issue && typeof issue.name === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(issue.name) ? ` (${issue.name})` : '';
	const prefix = `targets.json${location}${name}: `;
	if (issue.kind === 'invalid' && TARGET_FIELDS.includes(issue.field)) return prefix + `${issue.field} is invalid`;
	if (issue.kind === 'unknown' && typeof issue.property === 'string') return prefix + `unknown property ${JSON.stringify(issue.property)} (passwords belong in PIAGENT_SECRET_DIR files)`;
	if (issue.kind === 'duplicate') return prefix + 'duplicate target name';
	if (issue.kind === 'denied' && /^(?:C##)?(?:SYS|SYSTEM|SYSBACKUP|SYSDG|SYSKM|SYSRAC|AUDSYS|DBSNMP|XDB|GSMADMIN_INTERNAL|OUTLN|LBACSYS|DVSYS|MDSYS|CTXSYS|ORDSYS|WMSYS|OJVMSYS|APPQOSSYS|ANONYMOUS|HARNESS_APP|SHOPAPP)$/.test(issue.username)) return prefix + `username ${issue.username} is not allowed (system account)`;
	throw new Error('Unreviewed target error template');
}
