import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolContext } from '../contracts.js';
import { runChecks, redact, loadCheckConfig, thresholdsFor, type CheckRun, collectors } from '../check/index.js';

const measures: Record<string, string> = {
	tablespaces: 'percent used of maximum tablespace allocation',
	tablespace: 'percent used of maximum tablespace allocation',
	temp: 'active temp percent used of maximum allocation',
	undo: 'active plus unexpired undo percent used of maximum allocation',
	recovery: 'recovery area percent used after reclaimable space',
	blocking: 'longest blocked session wait in seconds',
	backupAge: 'hours since oldest latest full/level-0 backup across visible datafiles',
	archiveGaps: 'missing archived-log sequence ranges',
	failedJobs: 'failed scheduler runs in the lookback window',
	alertErrors: 'ORA- error occurrences in the alert log lookback window',
	incidents: 'diagnostic incidents in the lookback window',
	maintenance: 'invalid objects plus unusable index/partition/subpartition units (non-Oracle-maintained owners)',
	expiry: 'days until nearest unlocked application-account password expiry',
	defaultPasswords: 'open accounts using default passwords',
};
/** Names come only from existing collector rows; never query extra evidence. */
export async function healthChecksWithNames(ctx: ToolContext, targets: readonly string[], settings: Parameters<typeof runChecks>[2], readers = collectors): Promise<CheckRun> {
	const jobs = new Map<string, Awaited<ReturnType<typeof collectors.jobs>>>();
	const owners = new Map<string, Set<string>>();
	const defaults = new Map<string, string[]>();
	const run = await runChecks(ctx, targets, settings, { ...readers,
		jobs: async (context, target, options) => {
			const result = await readers.jobs(context, target, options);
			jobs.set(target, result); return result;
		},
		security: async (session, options) => {
			const result = await readers.security(session, options);
			const defaultCheck = result.checks.find(c => c.id === 'default-passwords');
			if (defaultCheck?.status === 'ok') defaults.set(session.target.name, defaultCheck.findings.map(f => f.subject));
			const users = result.checks.find(c => c.id === 'accounts')?.evidence.find(e => e.label === 'users');
			if (users?.status === 'ok') owners.set(session.target.name, new Set(users.rows.filter(r => r[1] === 'N').map(r => String(r[0]))));
			return result;
		},
	});
	for (const target of run.targets) for (const check of target.checks) {
		if (check.status === 'OK' && check.observedStatus !== 'UNKNOWN') continue;
		const sections = jobs.get(target.target)?.sections;
		let names: string[] = [];
		if (check.id === 'defaultPasswords') {
			names = defaults.get(target.target) ?? [];
			if (check.note.startsWith('Accounts: ')) check.note = '';
		}
		if (check.id === 'failedJobs') names = (sections?.runs?.rows ?? []).filter(r => r.STATUS === 'FAILED').map(r => `${r.OWNER}.${r.JOB_NAME}`);
		if (check.id === 'maintenance') names = ['indexes', 'indexPartitions', 'indexSubpartitions'].flatMap(id => (sections?.[id as keyof typeof sections]?.rows ?? []).filter(r => owners.get(target.target)?.has(String(r.OWNER ?? r.INDEX_OWNER))).map(r => [r.OWNER ?? r.INDEX_OWNER, r.INDEX_NAME, r.PARTITION_NAME, r.SUBPARTITION_NAME].filter(x => x != null).join('.')));
		const safe = [...new Set(names.filter(n => n.split('.').every(part => /^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(part))))].slice(0, 5);
		if (safe.length) check.note += `${check.note ? ' ' : ''}Names (up to 5): ${safe.join(', ')}.`;
	}
	return redact(run);
}

/** Stop before/after native calls; never abandon an in-flight query. */
export async function checkedHealth(ctx: ToolContext, targets: readonly string[], signal?: AbortSignal, runner = healthChecksWithNames): Promise<CheckRun> {
	signal?.throwIfAborted();
	const config = loadCheckConfig(ctx.config.targets.map(t => t.name));
	const sessions: ToolContext['sessions'] = {
		get: async target => {
			signal?.throwIfAborted();
			const raw = await ctx.sessions.get(target);
			signal?.throwIfAborted();
			return { target: raw.target, identity: raw.identity, close: async () => {}, query: async (sql, binds, options) => {
				signal?.throwIfAborted();
				const result = await raw.query(sql, binds, options);
				signal?.throwIfAborted();
				return result;
			} };
		}, closeAll: async () => {},
	};
	const result = await runner({ ...ctx, sessions }, targets, target => thresholdsFor(config, target));
	signal?.throwIfAborted();
	return redact(result);
}
export function healthText(run: CheckRun): string {
	const checks = run.targets.flatMap(t => t.checks);
	const counts = ['CRIT', 'WARN', 'UNKNOWN', 'OK'].map(s => `${checks.filter(c => c.status === s).length} ${s}`).join(', ');
	// Avoid rendering the fixed password-check label as a credential assignment.
	const label = (id: string) => id === 'defaultPasswords' ? id : `${id}:`;
	const line = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
	return redact([`Health ${run.status}: ${counts} (${run.targets.map(t => t.target).join(', ')}); point-in-time and windowed probes at ${run.capturedAt}.`, ...run.targets.flatMap(t => t.checks.filter(c => c.status !== 'OK' || c.observedStatus === 'UNKNOWN').map(c => line(`${t.target} ${label(c.id)} ${c.status} ${c.display}; measures: ${measures[c.id.split(':')[0]!] ?? 'unavailable (unknown check type)'}; ${c.scope}; ${c.command}; ${c.note}`)))].join('\n'));
}
/** Keep complete check lines where possible and bound the entire serialized result. */
export function boundedHealthResult(run: CheckRun, cap: number) {
	const lines = healthText(run).split('\n');
	let truncated = false;
	const output = () => ({ content: [{ type: 'text' as const, text: lines.join('\n') + (truncated ? '\n[truncated]' : '') }], details: { status: run.status, truncated } });
	while (Buffer.byteLength(JSON.stringify(output())) > cap && lines.length > 1) { lines.pop(); truncated = true; }
	while (Buffer.byteLength(JSON.stringify(output())) > cap && lines[0]) {
		lines[0] = Array.from(lines[0]).slice(0, -1).join(''); truncated = true;
	}
	return output();
}
export function createHealthCheckTool(ctx: ToolContext): AgentTool<any> {
	return {
		name: 'health_check', label: 'Health check',
		description: 'Check database health against configured thresholds. Returns a summary and non-OK checks from read-only point-in-time and windowed probes.',
		parameters: Type.Object({ target: Type.Optional(Type.String()) }, { additionalProperties: false }),
		async execute(_id, p, signal) {
			const target = p.target ?? ctx.pinnedTarget ?? ctx.config.defaultTarget;
			const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'health_check' };
			try {
				if (ctx.pinnedTarget && target !== ctx.pinnedTarget) throw new Error('Health check target differs from pinned target');
				const run = await checkedHealth(ctx, [target], signal);
				const output = boundedHealthResult(run, ctx.config.limits.maxToolResultBytes);
				await ctx.audit.record({ ...event, kind: 'tool_call', truncated: output.details.truncated });
				return output;
			} catch (error) {
				await ctx.audit.record({ ...event, kind: 'tool_error', detail: error instanceof Error ? error.name : 'Error' });
				throw error;
			}
		},
	};
}
