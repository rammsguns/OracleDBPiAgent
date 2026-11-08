import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolContext } from '../contracts.js';
import { runChecks, redact, loadCheckConfig, thresholdsFor, type CheckRun } from '../check/index.js';

/** Stop before/after native calls; never abandon an in-flight query. */
export async function checkedHealth(ctx: ToolContext, targets: readonly string[], signal?: AbortSignal, runner = runChecks): Promise<CheckRun> {
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
	const line = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
	return redact([`Health ${run.status}: ${counts} (${run.targets.map(t => t.target).join(', ')}); point-in-time and windowed probes at ${run.capturedAt}.`, ...run.targets.flatMap(t => t.checks.filter(c => c.status !== 'OK' || c.observedStatus === 'UNKNOWN').map(c => line(`${t.target} ${c.id}: ${c.status} ${c.display}; ${c.scope}; ${c.command}; ${c.note}`)))].join('\n'));
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
