import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { ToolContext, OracleSession } from '../contracts.js';
import { readBackup } from '../backup/index.js';
import { readJobs } from '../jobs/index.js';
import { sampleTop, validateSeconds } from '../top/index.js';
export function validateWebOperations(path: string, data: Record<string, unknown>): void {
	const allowed = path === '/api/top' ? ['target', 'seconds'] : ['target'];
	if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Invalid option');
	if (path === '/api/top') {
		if (data.seconds !== undefined && !/^\d+$/.test(String(data.seconds))) throw new Error('Invalid seconds');
		validateSeconds(Number(data.seconds ?? 15));
	}
}
export async function readWebOperations(ctx: ToolContext, target: string, path: string, data: Record<string, unknown>, signal: AbortSignal) {
	validateWebOperations(path, data);
	if (path === '/api/jobs') return { result: await readJobs(ctx, target) };
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, options) => {
		signal.throwIfAborted();
		const event = { at: new Date().toISOString(), runId: ctx.runId, target, tool: `web:${path.slice(5)}`, sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, options);
			await ctx.audit.record({ ...event, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
			return result;
		} catch (error) { await ctx.audit.record({ ...event, kind: 'tool_error', detail: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); throw error; }
	} };
	if (path === '/api/backup') return { result: await readBackup(session) };
	return { result: compactWebTop(await sampleTop(session, Number(data.seconds ?? 15), { now: () => performance.now(), sleep: async ms => { await setTimeout(ms, undefined, { signal }); } })) };
}
/** Rankings and counts retain the complete sampled evidence; bound drill-down payloads. */
export function compactWebTop(result: Awaited<ReturnType<typeof sampleTop>>) {
	const counterSummary = Object.entries(result.sql.counters).flatMap(([metric, rows]) => ['measured', 'new', 'aged-out', 'reset'].map(state => ({ metric, state, count: rows.filter(row => row.state === state).length })));
	const counters = Object.fromEntries(Object.entries(result.sql.counters).map(([metric, rows]) => [metric, rows.filter(row => row.state !== 'measured').slice(0, 100)]));
	return { ...result, sql: { ...result.sql, rows: [], counters, counterSummary, notes: [...result.sql.notes, 'Counter details show at most 100 unknown deltas per metric; state counts and rankings use all sampled rows. Measured counter details are omitted.'] } };
}
