import type { OracleSession, QueryResult } from '../contracts.js';
export const TOP_SQL = 'SELECT sql_id, elapsed_time, cpu_time, buffer_gets, disk_reads, executions FROM V$SQLSTATS ORDER BY sql_id';
const snapshots = new WeakMap<OracleSession, () => Promise<QueryResult>>();
/** Provider-private capability for one fixed, bounded collector query. */
export function registerTopSnapshot(session: OracleSession, read: () => Promise<QueryResult>): void { snapshots.set(session, read); }
export function readTopSnapshot(session: OracleSession): Promise<QueryResult> {
	return snapshots.get(session)?.() ?? session.query(TOP_SQL);
}
