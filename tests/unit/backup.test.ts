import { describe, it, expect } from 'vitest';
import { readBackup, renderBackupMarkdown, SQL, type EvidenceId } from '../../src/backup/index.js';
import type { OracleSession } from '../../src/contracts.js';
import { classifySql } from '../../src/oracle/sqlPolicy.js';
const now = new Date('2026-11-06T12:00:00Z');
function session(data: Partial<Record<EvidenceId, Record<string,unknown>[]>> = {}, pdb=false, error?:string, truncated=false): OracleSession {
	return {target:{name:'lab'},identity:{isCdb:pdb},close:async()=>{},query:async sql=>{
		if(error) throw new Error(error);
		const id=(Object.keys(SQL) as EvidenceId[]).find(k=>SQL[k]===sql)!;
		const records=data[id]??[], columns=Object.keys(records[0]??{});
		return {columns,rows:records.map(r=>columns.map(c=>r[c])),truncated,elapsedMs:1};
	}} as OracleSession;
}
const base = {
	database:[{'RESETLOGS_CHANGE#':1,LOG_MODE:'ARCHIVELOG'}],datafiles:[{'FILE#':1,'CREATION_CHANGE#':2}],
	backups:[{'FILE#':1,SET_STAMP:3,SET_COUNT:4,INCREMENTAL_LEVEL:0,'CHECKPOINT_CHANGE#':100,COMPLETION_TIME:'2026-11-05T00:00:00Z','RESETLOGS_CHANGE#':1,'CREATION_CHANGE#':2}],
	sets:[{SET_STAMP:3,SET_COUNT:4,PIECES:1}],pieces:[{SET_STAMP:3,SET_COUNT:4,'PIECE#':1,STATUS:'A',DELETED:'NO'}],
	history:[{'THREAD#':1,'SEQUENCE#':10,'RESETLOGS_CHANGE#':1,'FIRST_CHANGE#':90,'NEXT_CHANGE#':200}],
	archives:[{'THREAD#':1,'SEQUENCE#':10,'RESETLOGS_CHANGE#':1,'FIRST_CHANGE#':90,'NEXT_CHANGE#':200,NEXT_TIME:'2026-11-06T00:00:00Z',STATUS:'A',DELETED:'NO',NAME:'archive'}],
};
describe('backup evidence',()=>{
	it.each(["RMAN BACKUP DATABASE", "BEGIN DBMS_SCHEDULER.RUN_JOB('X'); END;", "SELECT DBMS_LOCK.SLEEP(1) FROM DUAL", "SELECT DBMS_WORKLOAD_REPOSITORY.CREATE_SNAPSHOT() FROM DUAL"])('blocks execution of %s', sql=>{expect(()=>classifySql(sql)).toThrow();});
	it('only issues read-only SQL',()=>{for(const sql of Object.values(SQL)) expect(()=>classifySql(sql)).not.toThrow();});
	it('reports no recorded backups with evidence',async()=>{const r=await readBackup(session(),now);expect(r.findings[0]?.id).toBe('no-backups');expect(r.restoreEstimate.status).toBe('not-verifiable');});
	for(const code of ['ORA-00942','ORA-01031','ORA-65040']) it('degrades per view '+code,async()=>{const r=await readBackup(session({},true,code),now);expect(r.status).toBe('partial');expect(r.findings[0]?.detail).toContain('not verifiable');expect(Object.values(r.evidence).every(e=>e.note?.includes(code))).toBe(true);});
	it('does not infer absence in a PDB',async()=>{const r=await readBackup(session({},true),now);expect(r.scope).toContain('CDB-wide (shared by all PDBs)');expect(r.findings[0]?.detail).toContain('not verifiable');expect(r.findings.some(f=>f.id.startsWith('level0'))).toBe(false);});
	it('retains a conservative candidate bound',async()=>{const r=await readBackup(session(base),now);expect(r.files[0]?.level0).toBe('2026-11-05T00:00:00.000Z');expect(r.restoreEstimate.status).toBe('candidate');});
	it('matches backup-set and piece identifiers across numeric representations',async()=>{
		const r=await readBackup(session({...base,sets:[{SET_STAMP:'3',SET_COUNT:4n,PIECES:1}],pieces:[{...base.pieces[0],SET_STAMP:3n,SET_COUNT:'4'}]}),now);
		expect(r.files[0]?.level0).toBe('2026-11-05T00:00:00.000Z'); expect(r.restoreEstimate.status).toBe('candidate');
	});
	it('does not match different or missing set identifiers',async()=>{
		for(const SET_STAMP of [null,undefined,'bad',5]) {
			const r=await readBackup(session({...base,sets:[{SET_STAMP,SET_COUNT:4,PIECES:1}]}),now);
			expect(r.files[0]?.level0).toBeNull();
		}
	});
	it.each([null,'not-a-date'])('sorts unparseable completion time %s after valid fulls and incrementals',async bad=>{
		const full=base.backups[0]!;
		const r=await readBackup(session({...base,backups:[{...full,COMPLETION_TIME:bad},{...full,INCREMENTAL_LEVEL:1,COMPLETION_TIME:bad},full,{...full,INCREMENTAL_LEVEL:1,COMPLETION_TIME:'2026-11-06T00:00:00Z'},{...full,COMPLETION_TIME:'2026-11-04T00:00:00Z'}]}),now);
		expect(r.files[0]).toMatchObject({level0:'2026-11-05T00:00:00.000Z',incremental:'2026-11-06T00:00:00.000Z'});
	});
	it('keeps wholly unparseable backup times unverifiable',async()=>{
		const r=await readBackup(session({...base,backups:[{...base.backups[0],COMPLETION_TIME:null},{...base.backups[0],COMPLETION_TIME:'bad'}]}),now);
		expect(r.files[0]?.level0).toBeNull(); expect(r.restoreEstimate.status).toBe('not-verifiable');
	});
	it('requires available pieces',async()=>{const r=await readBackup(session({...base,pieces:[]}),now);expect(r.files[0]?.level0).toBeNull();expect(r.restoreEstimate.status).toBe('not-verifiable');});
	it('withholds a candidate on truncation',async()=>{expect((await readBackup(session(base,false,undefined,true),now)).restoreEstimate.status).toBe('not-verifiable');});
	it('detects gaps, corruption, recovery, autobackup and stale fulls',async()=>{
		const r=await readBackup(session({...base,archives:[],configuration:[{NAME:'CONTROLFILE AUTOBACKUP',VALUE:'OFF'}],corruption:[{'FILE#':1}],recoverFiles:[{'FILE#':1}]}),new Date('2026-11-20'));
		expect(r.findings.map(f=>f.id)).toEqual(expect.arrayContaining(['archive-gap','corruption','recoverFiles','autobackup-off','level0']));
	});
	it('does not treat an omitted autobackup configuration as explicit OFF',async()=>{expect((await readBackup(session(base),now)).findings.some(f=>f.id==='autobackup-off')).toBe(false);});
	it('keeps duplicated archives and other incarnations separate',async()=>{
		const r=await readBackup(session({...base,archives:[...base.archives,...base.archives,{...base.archives[0], 'RESETLOGS_CHANGE#':99,'SEQUENCE#':999}]}),now);
		expect(r.gaps).toEqual([]); expect(r.restoreEstimate.status).toBe('candidate');
	});
	it('requires redo continuity for every thread',async()=>{
		const r=await readBackup(session({...base,history:[...base.history,{...base.history[0], 'THREAD#':2}]}),now);
		expect(r.gaps).toEqual([{thread:2,resetlogsScn:1,fromSequence:10,toSequence:10}]); expect(r.restoreEstimate.status).toBe('not-verifiable');
	});
	it('never asserts whole-CDB coverage from PDB-visible rows',async()=>{
		expect((await readBackup(session(base,true),now)).restoreEstimate.status).toBe('not-verifiable');
	});
	it('withholds missing-file backup claims under PDB visibility',async()=>{
		const r=await readBackup(session({...base,datafiles:[...base.datafiles,{'FILE#':2,'CREATION_CHANGE#':5}]},true),now);
		expect(r.findings.some(f=>f.id==='level0')).toBe(false);
	});
	it('reports incremental inventory and reclaimable balance separately',async()=>{
		const r=await readBackup(session({...base,backups:[...base.backups,{...base.backups[0],INCREMENTAL_LEVEL:1,COMPLETION_TIME:'2026-11-06T00:00:00Z'}],recoveryArea:[{SPACE_LIMIT:100,SPACE_USED:90,SPACE_RECLAIMABLE:30}]}),now);
		expect(r.files[0]?.incremental).toBe('2026-11-06T00:00:00.000Z');
		expect(r.recoveryArea[0]).toEqual({limitBytes:100,usedBytes:90,reclaimableBytes:30,nonReclaimableBytes:60,availableAfterReclaimBytes:40});
	});
	it('groups missing full backups and suppresses them when no backups are recorded', async () => {
		const datafiles = [7, 1, 5, 3, 4].map(file => ({ 'FILE#': file, 'CREATION_CHANGE#': 2 }));
		const r = await readBackup(session({ ...base, datafiles, pieces: [] }), now);
		expect(r.findings.filter(f => f.id === 'level0').map(f => f.detail)).toEqual(['5 datafiles have no available full / level 0 backup completed in 7 days: 1, 3, 4, 5, 7.']);
		const empty = await readBackup(session({ datafiles }), now);
		expect(empty.findings.map(f => f.id)).toEqual(['no-backups']);
		expect(empty.scope).toBe('Database-wide (non-CDB).');
	});
	it('renders readable restore bounds and explains NOARCHIVELOG recovery', async () => {
		const r = await readBackup(session({ ...base, database: [{ 'RESETLOGS_CHANGE#': 1, LOG_MODE: 'NOARCHIVELOG' }] }), now);
		const md = renderBackupMarkdown(r);
		expect(r.restoreEstimate.status).toBe('not-verifiable');
		expect(md).toContain('point-in-time recovery is not possible');
		expect(md).toContain('Only consistent (cold/mounted) backups can be restored');
		expect(md).toContain('- From: 2026-11-05T00:00:00.000Z');
		expect(md).not.toContain('"status":"not-verifiable"');
	});
	it('propagates unexpected errors',async()=>{await expect(readBackup(session({},false,'ORA-00600'))).rejects.toThrow('ORA-00600');});
});

it('renders all backup evidence as tables or None without changing the report', async () => {
	const report = await readBackup(session(base), now);
	const before = JSON.stringify(report);
	const md = renderBackupMarkdown(report);
	expect(md).toContain('## Evidence backups (V$BACKUP_DATAFILE): ok');
	expect(md).toContain('## Archive gaps:\n\nNone.');
	expect(md).toContain('| FILE# |');
	expect(md).not.toMatch(/\|\n\n\|/);
	expect(md).not.toContain('[{');
	expect(JSON.stringify(report)).toBe(before);
});
