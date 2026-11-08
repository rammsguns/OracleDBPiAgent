import { requireConfiguredTarget } from '../config/targetUsage.js';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/index.js';
import { createSessionProvider } from '../oracle/index.js';
import { JsonlAuditSink } from '../audit/index.js';
import { AlertlogUsageError, readAlertLog, readIncidents, renderAlertLogMarkdown, type AlertLogOptions } from './index.js';
export async function runAlertLog(options: { target: string; since?: string; from?: string; to?: string; code?: string[]; grep?: string; level?: string; limit?: string; incidents?: boolean; json?: boolean; markdown?: boolean }): Promise<void> {
	if (options.json && options.markdown) throw new AlertlogUsageError('Choose --json or --markdown');
	if (options.incidents && (options.code?.length || options.grep !== undefined || options.level !== undefined)) throw new AlertlogUsageError('Incident mode accepts window and limit options only');
	const config = loadConfig();
	requireConfiguredTarget(options.target, config.targets, AlertlogUsageError);
	const sessions = createSessionProvider(config);
	try {
		const ctx = { config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() };
		const filters: AlertLogOptions = { since: options.since, from: options.from, to: options.to, codes: options.code, text: options.grep, limit: options.limit === undefined ? undefined : Number(options.limit), level: options.level === undefined ? undefined : options.level === 'all' || options.level === 'default' ? options.level : Number(options.level) };
		const result = options.incidents ? await readIncidents(ctx, options.target, filters) : await readAlertLog(ctx, options.target, filters);
		console.log(options.json ? JSON.stringify(result) : renderAlertLogMarkdown(result));
	} finally { await sessions.closeAll(); }
}
