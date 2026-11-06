import { buildBlockingTree, type SessionActivity, type SessionRow } from '../../src/sessions/index.js';
const session = (sid: number, blockerSid: number | null): SessionRow => ({ sid, blockerSid, finalBlockerSid: blockerSid, serial: 1, username: 'APP', osuser: '', machine: '', program: '', type: 'USER', status: sid === 1 ? 'INACTIVE' : 'ACTIVE', sqlId: '0123456789abc', event: 'enq: TX - row lock contention', waitClass: 'Application', state: 'WAITING', secondsInWait: 90, lastCallSeconds: 100, logonTime: '', objectId: 2, object: 'APP.ORDERS', lockType: 'Transaction', lockMode: 'Exclusive' });
const evidence = { label: 'fixture', sql: 'SELECT 1 FROM dual', binds: {}, view: 'V$SESSION', status: 'ok' as const, columns: [], rows: [], truncated: false, attempts: [] };
const section = <T>(rows: T[]) => ({ status: 'ok' as const, rows, evidence, supportingEvidence: [] });
export function dbSessionsFixture(cycle = false): SessionActivity {
	const rows = cycle ? [session(1, 3), session(2, 1), session(3, 2)] : [session(1, null), session(2, 1), session(3, 2)];
	return { status: 'ok', target: 'd1-19c-lab', capturedAt: '2026-11-06T12:00:00.000Z', self: { sid: 99 }, findings: [{ id: 'blocked', severity: 'high', subject: 'Blocker SID 1', detail: '<img src=x onerror=alert(1)>', advice: 'Inspect transaction owner.', sqlId: '0123456789abc' }], sections: {
		active: section(rows), blocking: section(buildBlockingTree(rows)), waits: section([{ waitClass: 'Application', seconds: 100, percent: 100, events: [{ event: 'enq: TX - row lock contention', waitClass: 'Application', totalWaits: 10, seconds: 100, percent: 100, averageMs: 10000 }] }]), timeModel: section([{ name: 'DB CPU', seconds: 20 }]), transactions: section([{ sid: 1, username: 'APP', sqlId: '0123456789abc', startTime: '2026-11-06T11:00:00Z', ageSeconds: 3600, undoBlocks: 10, undoRecords: 20 }]),
	} };
}
