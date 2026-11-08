import type { DatabaseIdentity, OracleSession, QueryOptions, QueryResult } from '../contracts.js';
export const TOP_SQL = 'SELECT sql_id, elapsed_time, cpu_time, buffer_gets, disk_reads, executions FROM V$SQLSTATS ORDER BY sql_id';
const providers = new WeakSet<DatabaseIdentity>();
const capability = Symbol('fixed top snapshot');
/** Identity survives audited/cancellable session adapters; queries still traverse them. */
export function registerTopSnapshot(session: OracleSession): void { providers.add(session.identity); }
export function isTopSnapshot(sql: string, options: QueryOptions): boolean {
	return sql === TOP_SQL && (options as QueryOptions & { [capability]?: boolean })[capability] === true;
}
export function readTopSnapshot(session: OracleSession): Promise<QueryResult> {
	return providers.has(session.identity)
		? session.query(TOP_SQL, {}, { maxRows: 10000, [capability]: true } as QueryOptions)
		: session.query(TOP_SQL);
}
