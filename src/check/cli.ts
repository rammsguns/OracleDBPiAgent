import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config/index.js';
import { withoutConnectionFailures } from '../oracle/connectionErrors.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { CheckUsageError, loadCheckConfig, thresholdsFor, runChecks, exitCode, renderCheckMarkdown, redact, type CheckRun } from './index.js';
export async function appendCheckRun(directory: string, run: CheckRun): Promise<void> {
	await mkdir(directory,{recursive:true,mode:0o700});
	const fd = await open(join(directory,'check.jsonl'),constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);
	try {
		const stat = await fd.stat();
		if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.()) throw new CheckUsageError('check output requires owner-owned regular file mode 0600');
		await fd.writeFile(JSON.stringify(redact(run))+'\n');
	} finally { await fd.close(); }
}
export async function runCheck(options: { target?: string; allTargets?: boolean; json?: boolean; failOn?: string; out?: string }): Promise<void> {
	if ((!options.target && !options.allTargets) || (options.target && options.allTargets)) throw new CheckUsageError('Usage: check requires either --target T or --all-targets');
	if (options.failOn !== undefined && !['warn','crit'].includes(options.failOn)) throw new CheckUsageError('Usage: --fail-on must be warn or crit');
	const config = loadConfig();
	const names = config.targets.map(t => t.name);
	if (options.target && !names.includes(options.target)) throw new CheckUsageError(`Usage: unknown check target; configured targets: ${names.join(', ')}`);
	const settings = loadCheckConfig(names), sessions = createSessionProvider(config);
	try {
		const result = await withoutConnectionFailures(() => runChecks({config,sessions,audit:new JsonlAuditSink(config.auditFile),runId:randomUUID()},options.allTargets ? names : [options.target!],target => thresholdsFor(settings,target)));
		if (options.out) await appendCheckRun(options.out,result);
		console.log(options.json ? JSON.stringify(result) : renderCheckMarkdown(result));
		process.exitCode = exitCode(result.status,options.failOn as 'warn'|'crit'|undefined);
	} finally { await sessions.closeAll(); }
}
