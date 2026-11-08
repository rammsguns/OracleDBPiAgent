import type { OracleSession } from '../contracts.js';
export interface DatabaseRole { role: string; openMode: string; uniqueName: string; protectionMode: string; standby: boolean; label: string }
const cache = new WeakMap<object, Promise<DatabaseRole>>();
/** Identity is shared by audited wrappers; one detection per underlying session. */
export function readDatabaseRole(session: OracleSession): Promise<DatabaseRole> {
	let pending = cache.get(session.identity ?? session);
	if (!pending) {
		pending = (async () => {
			try {
				const r = await session.query('SELECT DATABASE_ROLE, OPEN_MODE, DB_UNIQUE_NAME, PROTECTION_MODE FROM V$DATABASE');
				if (r.truncated || !r.rows.length) throw new Error('Incomplete role');
				const row = Object.fromEntries(r.columns.map((c,i) => [c.toUpperCase(), String(r.rows[0]![i] ?? '')]));
				const role = row.DATABASE_ROLE ?? '', openMode = row.OPEN_MODE ?? '', uniqueName = row.DB_UNIQUE_NAME ?? '', protectionMode = row.PROTECTION_MODE ?? '';
				if (!role || !openMode || !uniqueName || !protectionMode) throw new Error('Missing role');
				return { role, openMode, uniqueName, protectionMode, standby: role.includes('STANDBY'), label: `${role.toLowerCase().replace(/^./, c => c.toUpperCase())} ${uniqueName} (${openMode.toLowerCase()}); protection: ${protectionMode.toLowerCase()}` };
			} catch { return { role: '', openMode: '', uniqueName: '', protectionMode: '', standby: false, label: 'Database role UNKNOWN (V$DATABASE unavailable or incomplete)' }; }
		})();
		cache.set(session.identity ?? session, pending);
	}
	return pending;
}
export function lagSeconds(value: unknown): number | null {
	const m = /^\+?(\d+) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(String(value ?? '').trim());
	return m && Number(m[2]) < 24 && Number(m[3]) < 60 && Number(m[4]) < 60 ? Number(m[1])*86400 + Number(m[2])*3600 + Number(m[3])*60 + Number(m[4]) : null;
}
export async function readDgLag(session: OracleSession): Promise<{value: number | null; note: string}> {
	const role = await readDatabaseRole(session);
	if (role.role === 'PRIMARY') return {value: 0, note: 'Not applicable on a primary; standby transport/apply lag is not measured here.'};
	if (!role.standby) return {value: null, note: 'Database role unknown; Data Guard lag cannot be established.'};
	try {
		const mrp = await session.query("SELECT PROCESS, STATUS FROM V$MANAGED_STANDBY WHERE PROCESS = 'MRP0'");
		if (mrp.truncated || !mrp.rows.some(r => r[0] === 'MRP0' && ['APPLYING_LOG','WAIT_FOR_LOG','WAIT_FOR_GAP'].includes(String(r[1])))) return {value: null, note: 'MRP not running or not visible; apply health unknown.'};
		const stats = await session.query("SELECT NAME, VALUE FROM V$DATAGUARD_STATS WHERE NAME IN ('transport lag', 'apply lag')");
		const values = ['transport lag','apply lag'].map(name => lagSeconds(stats.rows.find(r => r[0] === name)?.[1]));
		return stats.truncated || values.some(v => v === null) ? {value: null, note: 'Transport/apply lag hidden, empty or invalid in V$DATAGUARD_STATS.'} : {value: Math.max(...values as number[]), note: `Transport lag ${values[0]} s; apply lag ${values[1]} s. MRP running; sequential snapshots.`};
	} catch { return {value: null, note: 'V$DATAGUARD_STATS / V$MANAGED_STANDBY unavailable; missing grant or PDB-hidden evidence.'}; }
}
