import { readDatabaseRole } from './role.js';
import { markdownTable } from './markdown.js';
import type { OracleSession } from '../contracts.js';
import { SQL } from './sql.js';
export { SQL } from './sql.js';
export class BackupUsageError extends Error { constructor(message: string) { super(message); this.name = 'BackupUsageError'; } }
export type EvidenceId = keyof typeof SQL;
export interface Evidence {
	view: string; sql: string; status: 'ok' | 'unavailable'; columns: string[];
	rows: Record<string, unknown>[]; truncated: boolean; note?: string;
}
export interface Finding { id: string; severity: 'high' | 'medium'; detail: string; evidence: EvidenceId[]; advice: string }
export interface FileBackup { file: number; level0: string | null; incremental: string | null; checkpointScn: number | null }
export interface ArchiveGap { thread: number; resetlogsScn: number; fromSequence: number; toSequence: number }
export interface BackupReport {
	target: string; capturedAt: string; scope: string; status: 'ok' | 'partial';
	evidence: Record<EvidenceId, Evidence>; findings: Finding[]; files: FileBackup[]; gaps: ArchiveGap[];
	restoreEstimate: { status: 'not-verifiable' | 'candidate'; from: string | null; through: string | null; detail: string; evidence: EvidenceId[] };
	recoveryArea: { limitBytes: number; usedBytes: number; reclaimableBytes: number; nonReclaimableBytes: number; availableAfterReclaimBytes: number }[];
}
const n = (v: unknown) => Number(v ?? 0);
const date = (v: unknown): string | null => { if (v == null) return null; const d = v instanceof Date ? v : new Date(String(v)); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
// Invalid completion times sort after every valid Oracle date, without NaN comparators.
const time = (v: unknown) => { const d = date(v); return d ? Date.parse(d) : Number.MIN_SAFE_INTEGER; };
const sameIdentifier = (a: unknown, b: unknown) => a != null && b != null && Number.isSafeInteger(n(a)) && Number.isSafeInteger(n(b)) && n(a) === n(b);
export async function readBackup(session: OracleSession, now = new Date()): Promise<BackupReport> {
	const role = await readDatabaseRole(session);
	const evidence = {} as BackupReport['evidence'];
	for (const id of Object.keys(SQL) as EvidenceId[]) {
		const sql = SQL[id], view = /FROM\s+(\S+)/i.exec(sql)![1]!;
		const e: Evidence = { view, sql, status: 'ok', columns: [], rows: [], truncated: false }; evidence[id] = e;
		try {
			if (id === 'archiveGap' && !role.standby) { e.note = 'Standby apply-gap view not applicable to primary backup-chain analysis.'; continue; }
			const result = await session.query(sql);
			e.columns = result.columns; e.truncated = result.truncated;
			e.rows = result.rows.map(row => Object.fromEntries(result.columns.map((c, i) => [c.toUpperCase(), row[i]])));
			if (e.truncated) e.note = 'Row cap reached; incomplete evidence.';
			if (id === 'configuration' && !e.rows.some(r => String(r.NAME).toUpperCase() === 'CONTROLFILE AUTOBACKUP')) e.note = 'No explicit control-file autobackup setting visible; effective default not inferred (depends on database configuration).';
			if (id === 'jobs' && !e.rows.length && session.identity.isCdb) e.note = 'RMAN job details hidden/empty in PDB; use visible per-datafile full/level-0 completion metadata for backup age.';
			if (!e.rows.length && session.identity.isCdb && id !== 'jobs') e.note = 'No rows visible in this PDB; absence cannot be inferred.';
		} catch (error) {
			const code = /ORA-\d{5}/.exec(String(error))?.[0];
			if (!code || !['ORA-00942', 'ORA-01031', 'ORA-65040'].includes(code)) throw error;
			e.status = 'unavailable'; e.note = `Not available in a PDB / not granted (${code}).`;
		}
	}
	const report = analyzeBackup(session.target.name, session.identity.isCdb, evidence, now, role.standby);
	report.scope = role.label + '. ' + report.scope;
	if (role.standby) report.scope += ' Backups are normally taken on the primary; visible control-file metadata may be copied by duplicate/redo and does not prove a standby backup.';
	return report;
}
export function analyzeBackup(target: string, pdb: boolean, evidence: BackupReport['evidence'], now = new Date(), standby = false): BackupReport {
	const good = (...ids: EvidenceId[]) => ids.every(id => evidence[id]?.status === 'ok' && !evidence[id].truncated);
	const rows = (id: EvidenceId) => evidence[id].rows;
	const findings: Finding[] = [];
	const add = (id: string, severity: Finding['severity'], detail: string, ids: EvidenceId[]) => findings.push({ id, severity, detail, evidence: ids, advice: 'For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.' });
	const reset = n(rows('database')[0]?.['RESETLOGS_CHANGE#']);
	const usable = rows('backups').filter(b => {
		const set = rows('sets').find(s => sameIdentifier(s.SET_STAMP, b.SET_STAMP) && sameIdentifier(s.SET_COUNT, b.SET_COUNT));
		const pieces = rows('pieces').filter(p => sameIdentifier(p.SET_STAMP, b.SET_STAMP) && sameIdentifier(p.SET_COUNT, b.SET_COUNT) && p.STATUS === 'A' && p.DELETED === 'NO');
		return set && new Set(pieces.map(p => p['PIECE#'])).size >= n(set.PIECES) && n(set.PIECES) > 0 && n(b['RESETLOGS_CHANGE#']) === reset;
	});
	const files = rows('datafiles').map(f => {
		const backups = usable.filter(b => n(b['FILE#']) === n(f['FILE#']) && n(b['CREATION_CHANGE#']) === n(f['CREATION_CHANGE#'])).sort((a,b) => time(b.COMPLETION_TIME)-time(a.COMPLETION_TIME));
		const full = backups.find(b => b.INCREMENTAL_LEVEL === null || n(b.INCREMENTAL_LEVEL) === 0);
		const inc = backups.find(b => b.INCREMENTAL_LEVEL != null && n(b.INCREMENTAL_LEVEL) > 0);
		return { file: n(f['FILE#']), level0: date(full?.COMPLETION_TIME), incremental: date(inc?.COMPLETION_TIME), checkpointScn: full ? n(full['CHECKPOINT_CHANGE#']) : null };
	});
	const core: EvidenceId[] = ['database','datafiles','backups','sets','pieces'];
	if (!good(...core) || !good('jobs')) add('no-backups', 'high', 'Backup history is not verifiable from ' + 'this database: required views are unreadable or incomplete.', [...core,'jobs']);
	else if (!rows('backups').length && !rows('jobs').length && !rows('sets').length) add('no-backups', 'high', pdb ? 'Backups are not verifiable from ' + 'this database: no rows visible in this PDB.' : 'No backups recorded at all in the visible control-file history; external catalogs and aged-out records are not checked.', ['backups','jobs','sets']);
	if (!findings.some(f => f.id === 'no-backups') && good(...core) && (!pdb || rows('backups').length)) {
		const overdue = files.filter(f => (!pdb && !f.level0) || (f.level0 && now.getTime() - Date.parse(f.level0) > 7 * 86400000)).map(f => f.file).sort((a, b) => a - b);
		if (overdue.length) add('level0', 'high', `${overdue.length} datafile${overdue.length === 1 ? ' has' : 's have'} no available full / level 0 backup completed in 7 days: ${overdue.join(', ')}.`, core);
	}
	const checkpoint = files.length && files.every(f => f.checkpointScn != null) ? Math.min(...files.map(f => f.checkpointScn!)) : null;
	const gaps: ArchiveGap[] = [];
	if (!standby && checkpoint !== null && good('archives','history','database')) {
		const groups = new Map<number, Set<number>>();
		for (const r of [...rows('archives'), ...rows('history')]) if (n(r['RESETLOGS_CHANGE#']) === reset && n(r['NEXT_CHANGE#'])>checkpoint) {
			const thread = n(r['THREAD#']); if (!groups.has(thread)) groups.set(thread,new Set()); groups.get(thread)!.add(n(r['SEQUENCE#']));
		}
		for (const [thread, expected] of groups) {
			const seq = [...expected].sort((a,b)=>a-b), available = new Set(rows('archives').filter(r => n(r['THREAD#'])===thread && n(r['RESETLOGS_CHANGE#'])===reset && r.STATUS==='A' && r.DELETED==='NO' && r.NAME).map(r=>n(r['SEQUENCE#'])));
			let cursor = seq[0]!;
			for (const s of [...available].filter(s=>s>=cursor && s<=seq.at(-1)!).sort((a,b)=>a-b)) {
				if (s>cursor) gaps.push({thread,resetlogsScn:reset,fromSequence:cursor,toSequence:s-1});
				cursor=s+1;
			}
			if(cursor<=seq.at(-1)!) gaps.push({thread,resetlogsScn:reset,fromSequence:cursor,toSequence:seq.at(-1)!});
		}
	}
	if (standby && good('database','archiveGap')) {
		for (const row of rows('archiveGap')) gaps.push({thread:n(row['THREAD#']),resetlogsScn:reset,fromSequence:n(row['LOW_SEQUENCE#']),toSequence:n(row['HIGH_SEQUENCE#'])});
	}
	if (standby && good('archives','database')) {
		// RMAN duplicate copies pre-creation history (SRMN). Only RFS received redo
		// establishes a standby sequence baseline, regardless of later file deletion.
		const threads = new Map<number, Set<number>>();
		for (const row of rows('archives').filter(r => r.REGISTRAR === 'RFS' && n(r['RESETLOGS_CHANGE#']) === reset)) {
			const thread = n(row['THREAD#']);
			if (!threads.has(thread)) threads.set(thread, new Set());
			threads.get(thread)!.add(n(row['SEQUENCE#']));
		}
		for (const [thread, sequences] of threads) {
			const seq = [...sequences].sort((a,b) => a-b);
			for (let i=1;i<seq.length;i++) if (seq[i]! > seq[i-1]!+1 && !gaps.some(g => g.thread === thread && g.fromSequence <= seq[i-1]!+1 && g.toSequence >= seq[i]!-1)) gaps.push({thread,resetlogsScn:reset,fromSequence:seq[i-1]!+1,toSequence:seq[i]!-1});
		}
	}
	if(gaps.length) add('archive-gap','high', standby ? `${gaps.length} standby apply / received-log sequence gap(s); duplicate history excluded.` : `${gaps.length} archived-log sequence gap(s) after the full backup checkpoint; availability is control-file metadata only.`, standby ? ['archiveGap','archives'] : ['archives','history','backups']);
	if(good('configuration') && rows('configuration').some(r=>String(r.NAME).toUpperCase()==='CONTROLFILE AUTOBACKUP' && /\bOFF\b/i.test(String(r.VALUE)))) add('autobackup-off','medium','Control-file autobackup is OFF.', ['configuration']);
	for(const [id,label] of [['corruption','Corrupt block(s) listed'],['recoverFiles','Datafile(s) needing recovery']] as const) if(good(id)&&rows(id).length) add(id,'high',`${label}: ${rows(id).length} row(s).`,[id]);
	const complete = !standby && !pdb && rows('database')[0]?.LOG_MODE === 'ARCHIVELOG' && good(...Object.keys(evidence) as EvidenceId[]) && files.length>0 && files.every(f=>f.level0) && !gaps.length && !rows('corruption').length && !rows('recoverFiles').length;
	const archives=rows('archives').filter(r=>n(r['RESETLOGS_CHANGE#'])===reset&&r.STATUS==='A'&&r.DELETED==='NO'&&r.NAME);
	// Conservative candidate bound: each thread must cover the oldest full checkpoint continuously.
	const threads=[...new Set(rows('history').filter(r=>n(r['RESETLOGS_CHANGE#'])===reset).map(r=>n(r['THREAD#'])))];
	const ends=threads.map(thread=> {
		let scn=checkpoint??Infinity, end: string|null=null;
		for(const r of archives.filter(r=>n(r['THREAD#'])===thread).sort((a,b)=>n(a['FIRST_CHANGE#'])-n(b['FIRST_CHANGE#']))) if(n(r['FIRST_CHANGE#'])<=scn&&n(r['NEXT_CHANGE#'])>scn) {scn=n(r['NEXT_CHANGE#']);end=date(r.NEXT_TIME);}
		return end;
	});
	const through=complete && ends.length && ends.every(Boolean) ? ends.sort()[0]! : null;
	const from=files.length&&files.every(f=>f.level0)?files.map(f=>f.level0!).sort().at(-1)!:null;
	return {target,capturedAt:now.toISOString(),scope:pdb?'CDB-wide (shared by all PDBs). Current PDB visibility only; empty rows do not establish absence.':'Database-wide (non-CDB).',status:good(...Object.keys(evidence) as EvidenceId[])?'ok':'partial',evidence,findings,files,gaps,
		restoreEstimate:{status:through&&from&&through>=from?'candidate':'not-verifiable',from,through,detail:(rows('database')[0]?.LOG_MODE === 'NOARCHIVELOG' ? 'The database is in NOARCHIVELOG mode: point-in-time recovery is not possible. Only consistent (cold/mounted) backups can be restored. ' : '') + 'Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.',evidence:[...core,'archives','history','corruption','recoverFiles']},
		recoveryArea:rows('recoveryArea').map(r=>({limitBytes:n(r.SPACE_LIMIT),usedBytes:n(r.SPACE_USED),reclaimableBytes:n(r.SPACE_RECLAIMABLE),nonReclaimableBytes:Math.max(0,n(r.SPACE_USED)-n(r.SPACE_RECLAIMABLE)),availableAfterReclaimBytes:Math.max(0,n(r.SPACE_LIMIT)-n(r.SPACE_USED)+n(r.SPACE_RECLAIMABLE))}))};
}
export function renderBackupMarkdown(r: BackupReport): string {
	return [`# Backup — ${r.target}`,r.scope,`Captured ${r.capturedAt}. Sequential bounded SELECT snapshots.`, `## Restore-to-time estimate\nStatus: ${r.restoreEstimate.status === 'candidate' ? 'Candidate recovery window' : 'Not verifiable with the available evidence'}.\n\n- From: ${r.restoreEstimate.from ?? 'not established'}.\n- Through: ${r.restoreEstimate.through ?? 'not established'}.\n- Evidence: ${r.restoreEstimate.evidence.join(', ')}.\n\n${r.restoreEstimate.detail}`,
		...r.findings.map(f=>`${f.severity}: ${f.detail} Evidence: ${f.evidence.join(', ')}. ${f.advice}`),
		`## Per-datafile backups\n\n${markdownTable(r.files)}`,`## Archive gaps\n\n${markdownTable(r.gaps)}`,`## Recovery-area balance (bytes)\n\n${markdownTable(r.recoveryArea)}`,
		...Object.entries(r.evidence).map(([id,e])=>`## Evidence ${id} (${e.view}): ${e.status}${e.note?' — '+e.note:''}\n\n${markdownTable(e.rows)}${e.truncated ? '\n\nRow cap reached; evidence incomplete; use --json.' : ''}`)].join('\n\n')+'\n';
}
