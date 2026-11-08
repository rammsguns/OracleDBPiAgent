import { TOP_SQL, readTopSnapshot } from '../oracle/topSnapshot.js';
import { withOracleAction } from '../oracle/observability.js';
import { formatBytes } from '../space/index.js';
import { markdownTable, markdownNumber } from '../backup/markdown.js';
import { setTimeout } from 'node:timers/promises';
import type { OracleSession } from '../contracts.js';
export const SQL = {
	sql: TOP_SQL,
	load: "SELECT name, value FROM V$SYSSTAT WHERE name IN ('user calls', 'session logical reads', 'physical reads', 'redo size', 'parse count (hard)', 'parse count (total)', 'user commits') ORDER BY name",
	host: 'SELECT stat_name, value, cumulative FROM V$OSSTAT ORDER BY stat_name',
};
export const METRICS = ['elapsedUs', 'cpuUs', 'bufferGets', 'physicalReads', 'executions'] as const;
export type Metric = typeof METRICS[number];
export interface Snapshot { rows: unknown[][]; truncated: boolean; at: number; note?: string }
export interface Delta { name: string; delta: number | null; perSecond: number | null; state: 'measured' | 'new' | 'reset' | 'aged-out' }
export class TopUsageError extends Error {
	constructor(message: string) { super(message); this.name = 'TopUsageError'; }
}
export function validateSeconds(seconds: number): void {
	if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new TopUsageError('seconds must be an integer from 5 to 120');
}
export function deltas(before: unknown[][], after: unknown[][], column: number, seconds: number): Delta[] {
	const a = new Map(before.map(r => [String(r[0]), Number(r[column])])), b = new Map(after.map(r => [String(r[0]), Number(r[column])]));
	return [...new Set([...a.keys(), ...b.keys()])].map(name => {
		const x = a.get(name), y = b.get(name);
		const state = y === undefined ? 'aged-out' : x === undefined ? 'new' : !Number.isFinite(x) || !Number.isFinite(y) || y < x ? 'reset' : 'measured';
		const delta = state === 'measured' ? y! - x! : null;
		return { name, delta, perSecond: delta === null ? null : delta / seconds, state };
	});
}
async function sampleTopImpl(session: OracleSession, seconds = 15, runtime = { now: () => performance.now(), sleep: async (ms: number) => { await setTimeout(ms); } }) {
	validateSeconds(seconds);
	async function snapshot(key: keyof typeof SQL): Promise<Snapshot> {
		try {
			const result = key === 'sql' ? await readTopSnapshot(session) : await session.query(SQL[key]);
			// Page within a bounded snapshot so an alphabetical row cap cannot hide most SQL.
			if (key === 'sql') while (result.truncated && result.rows.length > 0 && result.rows.length < 10000) {
				const offset = result.rows.length;
				const page = await session.query(SQL[key] + ' OFFSET :topOffset ROWS', { topOffset: offset });
				result.rows.push(...page.rows.slice(0, 10000 - offset));
				result.truncated = page.truncated || offset + page.rows.length > 10000;
				if (!page.rows.length) break;
			}
			return { rows: result.rows, truncated: result.truncated, at: runtime.now() };
		}
		catch (e) {
			const code = /ORA-\d{5}/.exec(String(e))?.[0];
			if (!code || !['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) throw e;
			return { rows: [], truncated: false, at: runtime.now(), note: `${key}: not granted / not available in a PDB (${code}).` };
		}
	}
	const capturedAt = new Date().toISOString();
	const first = { sql: await snapshot('sql'), load: await snapshot('load'), host: await snapshot('host') };
	await runtime.sleep(seconds * 1000);
	const second = { sql: await snapshot('sql'), load: await snapshot('load'), host: await snapshot('host') };
	function section(key: keyof typeof SQL) {
		const a = first[key], b = second[key], intervalSeconds = (b.at - a.at) / 1000;
		if (!(intervalSeconds > 0)) throw new Error('Sample clock did not advance');
		return { status: a.note || b.note ? 'unavailable' : a.truncated || b.truncated ? 'partial' : 'ok', intervalSeconds,
			notes: [...new Set([a.note, b.note, a.truncated || b.truncated ? 'Row cap reached; coverage incomplete and missing rows do not prove cursor aging.' : undefined].filter((v): v is string => !!v))],
			rows: a.note || b.note ? [] : deltas(a.rows, b.rows, 1, intervalSeconds) };
	}
	const sql = section('sql'), load = section('load'), host = section('host');
	const rankings = Object.fromEntries(METRICS.map((metric, i) => [metric, sql.status === 'unavailable' ? [] : deltas(first.sql.rows, second.sql.rows, i + 1, sql.intervalSeconds).filter(r => r.delta !== null && r.delta > 0).sort((a,b) => b.delta! - a.delta!).slice(0,10).map(r => ({ ...r, command: `piagent sql --target ${session.target.name} --sql-id ${r.name}` }))])) as Record<Metric, (Delta & { command: string })[]>;
	const gauges = new Set(second.host.rows.filter(r => String(r[2]) === 'NO' || ['NUM_CPUS', 'NUM_CPU_CORES', 'NUM_CPU_SOCKETS', 'LOAD', 'PHYSICAL_MEMORY_BYTES'].includes(String(r[0]))).map(r => String(r[0])));
	const hostGauges = host.status === 'unavailable' ? [] : second.host.rows.filter(r => gauges.has(String(r[0]))).map(r => ({ name: String(r[0]), value: Number(r[1]) }));
	host.rows = host.rows.filter(r => !gauges.has(r.name));
	const busy = host.rows.find(r => r.name === 'BUSY_TIME')?.delta, idle = host.rows.find(r => r.name === 'IDLE_TIME')?.delta;
	const cpuPercent = busy != null && idle != null && busy + idle > 0 ? busy / (busy + idle) * 100 : null;
	return { target: session.target.name, containerName: session.identity.containerName, capturedAt, requestedSeconds: seconds,
		status: [sql,load,host].every(s => s.status === 'unavailable') ? 'failed' : [sql,load,host].some(s => s.status !== 'ok') ? 'partial' : 'ok',
		scope: { sql: session.identity.isCdb ? 'Current PDB visibility; empty rows do not prove absence.' : 'Current instance cursor cache', load: session.identity.isCdb ? 'CDB-wide (shared by all PDBs)' : 'Database-wide (non-CDB)', host: session.identity.isCdb ? 'CDB-wide (shared by all PDBs)' : 'Database-wide (non-CDB)' },
		sql: { ...sql, rankings, counters: Object.fromEntries(METRICS.map((metric, i) => [metric, sql.status === 'unavailable' ? [] : deltas(first.sql.rows, second.sql.rows, i + 1, sql.intervalSeconds)])) }, load, host: { ...host, gauges: hostGauges, cpuPercent },
		note: 'Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.' };
}
export function renderTop(result: Awaited<ReturnType<typeof sampleTop>>): string {
	const lines = [`# Top — ${result.target}: ${result.status}; requested ${result.requestedSeconds}s`, result.scope.load, result.note];
	for (const key of ['sql','load','host'] as const) {
		const section = result[key];
		lines.push(`## ${key}: ${section.status}; ${section.intervalSeconds.toFixed(3)}s`, result.scope[key], ...section.notes);
		if (key === 'sql') {
			for (const metric of METRICS) {
				const rows = result.sql.rankings[metric];
				lines.push(`### ${metric}`, rows.length ? markdownTable(rows.map(r => ({ SQL_ID: r.name, delta: r.delta, perSecond: r.perSecond, state: r.state, command: r.command }))) : 'none in this interval');
			}
			for (const state of ['new','aged-out','reset']) {
				const names = new Set(Object.values(result.sql.counters).flatMap(rows => rows.filter(r => r.state === state).map(r => r.name)));
				lines.push(`${state}: ${names.size}`);
			}
		} else {
			lines.push(markdownTable(section.rows.map(r => ({ statistic: r.name, delta: r.delta === null ? 'unknown' : /bytes/i.test(r.name) ? formatBytes(r.delta) : r.delta, perSecond: r.perSecond === null ? 'unknown' : /bytes/i.test(r.name) ? formatBytes(r.perSecond) + '/s' : markdownNumber(r.perSecond), state: r.state }))));
		}
	}
	lines.push(`Host CPU busy: ${result.host.cpuPercent === null ? 'unavailable' : result.host.cpuPercent.toFixed(2) + '%'}`,
		markdownTable(result.host.gauges.map(r => ({ statistic: r.name, value: /bytes/i.test(r.name) ? formatBytes(r.value) : r.value }))),
		'SQL drill-down: piagent sql --target ' + result.target + ' --sql-id <SQL_ID>');
	return lines.join('\n\n') + '\n';
}

export const sampleTop = (...args: Parameters<typeof sampleTopImpl>) => withOracleAction('top', () => sampleTopImpl(...args));
