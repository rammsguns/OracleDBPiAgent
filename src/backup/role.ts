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
const applyingStates = ['APPLYING_LOG','WAIT_FOR_LOG'];
function timestamp(value: unknown): number | null {
	const text = String(value ?? '').trim();
	if (!text) return null;
	const oracle = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(text);
	if (oracle) return Date.UTC(Number(oracle[3]),Number(oracle[1])-1,Number(oracle[2]),Number(oracle[4]),Number(oracle[5]),Number(oracle[6]));
	const parsed = Date.parse(text);
	if (Number.isFinite(parsed)) return parsed;
	const m = /^(\d{2})-(\w{3})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(text);
	if (!m) return null;
	const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
	const month = months.indexOf(m[2]!.toUpperCase());
	if (month < 0) return null;
	const year = Number(m[3]) + (Number(m[3]) < 50 ? 2000 : 1900);
	return Date.UTC(year,month,Number(m[1]),Number(m[4]),Number(m[5]),Number(m[6]));
}
export async function readDgLag(session: OracleSession): Promise<{value: number | null; note: string}> {
	const role = await readDatabaseRole(session);
	if (role.role === 'PRIMARY') return {value: null, note: 'Not applicable (primary); standby transport/apply lag is not measured here.'};
	if (!role.standby) return {value: null, note: 'Database role unknown; Data Guard lag cannot be established.'};
	try {
		const stats = await session.query("SELECT NAME, VALUE, TIME_COMPUTED, DATUM_TIME FROM V$DATAGUARD_STATS WHERE NAME IN ('transport lag', 'apply lag')");
		if (stats.truncated) return {value:null,note:'V$DATAGUARD_STATS rows capped; lag evidence incomplete.'};
		const transport = stats.rows.find(r => r[0] === 'transport lag');
		const apply = stats.rows.find(r => r[0] === 'apply lag');
		const applySeconds = lagSeconds(apply?.[1]);
		const transportSeconds = lagSeconds(transport?.[1]);
		if (applySeconds !== null) {
			const mrp = await session.query("SELECT PROCESS, STATUS FROM V$MANAGED_STANDBY WHERE PROCESS = 'MRP0'");
			if (mrp.truncated || !mrp.rows.some(r => r[0] === 'MRP0' && applyingStates.includes(String(r[1])))) return {value:null,note:'MRP not running or not visible; apply health unknown.'};
			if (transportSeconds === null) return {value:null,note:'Transport lag is hidden, empty or invalid in V$DATAGUARD_STATS.'};
			return {value:Math.max(transportSeconds,applySeconds),note:`Transport lag ${transportSeconds} s; apply lag ${applySeconds} s. MRP running; sequential snapshots.`};
		}
		if (!apply) return {value:null,note:'PDB apply lag is hidden; requirement failed: apply lag row is missing from V$DATAGUARD_STATS.'};
		if (apply?.[1] != null && String(apply[1]).trim() !== '') return {value:null,note:'Apply lag is invalid in V$DATAGUARD_STATS; fallback is only for hidden NULL apply lag.'};
		if (transportSeconds === null) return {value:null,note:'PDB apply lag is hidden and transport lag is missing or invalid; fallback requires valid transport lag.'};
		const computed = timestamp(transport?.[2]), datum = timestamp(transport?.[3]);
		const now = Date.now();
		if (computed === null || datum === null || Math.abs(now-computed)>120000 || Math.abs(computed-datum)>120000) return {value:null,note:'PDB apply lag is hidden; fallback requires TIME_COMPUTED and DATUM_TIME both within 120 seconds of now and each other.'};
		const mrp = await session.query("SELECT PROCESS, STATUS, THREAD#, SEQUENCE#, BLOCK# FROM V$MANAGED_STANDBY WHERE PROCESS IN ('MRP0','RFS')");
		if (mrp.truncated) return {value:null,note:'PDB apply lag is hidden; V$MANAGED_STANDBY rows capped, so MRP/received-redo position is incomplete.'};
		const applying = mrp.rows.filter(r => r[0] === 'MRP0' && applyingStates.includes(String(r[1])));
		if (!applying.length) return {value:null,note:'PDB apply lag is hidden; requirement failed: no visible MRP0 row in an applying state.'};
		const received = mrp.rows.filter(r => r[0] === 'RFS' && Number(r[2]) > 0 && Number(r[3]) >= 0 && Number(r[4]) >= 0);
		if (!received.length) return {value:null,note:'PDB apply lag is hidden; requirement failed: no visible RFS received-redo position.'};
		const archived = await session.query("SELECT THREAD#, SEQUENCE#, BLOCKS FROM V$ARCHIVED_LOG WHERE REGISTRAR = 'RFS' AND APPLIED IN ('NO','IN-MEMORY')");
		if (archived.truncated) return {value:null,note:'PDB apply lag is hidden; V$ARCHIVED_LOG rows capped, so unapplied received redo cannot be bounded.'};
		for (const rfs of received) {
			const thread=Number(rfs[2]), seq=Number(rfs[3]), block=Number(rfs[4]);
			const mrpRow=applying.filter(r=>Number(r[2])===thread).sort((a,b)=>Number(b[3])-Number(a[3])||Number(b[4])-Number(a[4]))[0];
			if (!mrpRow || Number(mrpRow[3])<seq || (Number(mrpRow[3])===seq && Number(mrpRow[4])<block)) return {value:null,note:`PDB apply lag is hidden; requirement failed: MRP0 is behind received redo on thread ${thread} (RFS seq/block ${seq}/${block}).`};
		}
		const unappliedBeyond = archived.rows.filter(r => {
			const applied = applying.filter(x => Number(x[2])===Number(r[0])).sort((a,b)=>Number(b[3])-Number(a[3]))[0];
			return !!applied && Number(r[1]) > Number(applied[3]);
		});
		if (unappliedBeyond.length > 1) return {value:null,note:`PDB apply lag is hidden; requirement failed: ${unappliedBeyond.length} received archived logs remain unapplied beyond the small tolerance of 1.`};
		const last = received.reduce((best,r) => Number(r[3])>Number(best[3]) || (Number(r[3])===Number(best[3]) && Number(r[4])>Number(best[4])) ? r : best);
		return {value:transportSeconds,note:`PDB hides apply lag; MRP0 applying at/after last received redo (seq/block ${Number(last[3])}/${Number(last[4])}); apply lag bounded by transport lag (${transportSeconds} s).`};
	} catch { return {value: null, note: 'V$DATAGUARD_STATS / V$MANAGED_STANDBY unavailable; missing grant or PDB-hidden evidence.'}; }
}
