import { requireConfiguredTarget } from '../config/targetUsage.js';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { JobsUsageError, readJobs, renderJobs, type JobsOptions } from './index.js';
export async function runJobs(options: JobsOptions & { target: string; json?: boolean }): Promise<void> {
	const config = loadConfig();
	requireConfiguredTarget(options.target, config.targets, JobsUsageError);
	const sessions = createSessionProvider(config);
	try {
		const result = await readJobs({ config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() }, options.target, options);
		console.log(options.json ? JSON.stringify(result) : renderJobs(result));
	} finally { await sessions.closeAll(); }
}
