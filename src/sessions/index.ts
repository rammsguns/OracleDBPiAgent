import type { OracleSession } from '../contracts.js';
import type { Check } from '../triage/read.js';
import { SQL } from './sql.js';
export class SessionsUsageError extends Error {
	constructor(message: string) { super(message); this.name = 'SessionsUsageError'; }
}
export const SECTION_IDS = ['active', 'blocking', 'waits', 'timeModel', 'transactions'] as const;
export type SectionId = typeof SECTION_IDS[number];
export interface SessionsOptions { sections?: string[]; includeBackground?: boolean; minTxSeconds?: number; topWaits?: number }
export interface SessionRow {
	sid: number; serial: number; username: string; osuser: string; machine: string; program: string; type: string;
	status: string; sqlId: string; event: string; waitClass: string; state: string; secondsInWait: number;
	lastCallSeconds: number; logonTime: string; blockerSid: number | null; finalBlockerSid: number | null; objectId: number | null;
	object?: string; lockType?: string; lockMode?: string;
}
export interface BlockingNode { sid: number; session?: SessionRow; children: BlockingNode[]; cycle: boolean; depthLimited: boolean; vanished: boolean }
export interface WaitRow { event: string; waitClass: string; totalWaits: number; seconds: number; percent: number; averageMs: number }
export interface WaitClass { waitClass: string; seconds: number; percent: number; events: WaitRow[] }
export interface TransactionRow { sid: number; username: string; sqlId: string; startTime: string; ageSeconds: number; undoBlocks: number; undoRecords: number }
export interface SessionFinding { id: string; severity: 'high'|'medium'|'low'|'info'; subject: string; detail: string; sqlId?: string; advice: string }
export interface SessionSection<T> { status: 'ok'|'unavailable'|'skipped'; rows: T[]; evidence: Check; note?: string; supportingEvidence: Check[] }
export interface SessionActivity {
	status: 'ok'|'partial'|'failed'; target: string; capturedAt: string; self: { sid: number };
	sections: { active: SessionSection<SessionRow>; blocking: SessionSection<BlockingNode>; waits: SessionSection<WaitClass>; timeModel: SessionSection<{ name: string; seconds: number }>; transactions: SessionSection<TransactionRow> };
	findings: SessionFinding[];
}
const str = (v: unknown) => v == null ? '' : String(v);
const num = (v: unknown) => Number(v ?? 0);
const nullable = (v: unknown) => v == null ? null : num(v);
export function validateSessionsOptions(o: SessionsOptions): void {
	if (o.sections && (!o.sections.length || o.sections.some(s => !SECTION_IDS.includes(s as SectionId)))) throw new SessionsUsageError('section must be active, blocking, waits, timeModel or transactions');
	if (o.minTxSeconds !== undefined && (!Number.isInteger(o.minTxSeconds) || o.minTxSeconds < 0 || o.minTxSeconds > 86400)) throw new SessionsUsageError('min-tx-seconds must be an integer from 0 to 86400');
	if (o.topWaits !== undefined && (!Number.isInteger(o.topWaits) || o.topWaits < 1 || o.topWaits > 50)) throw new SessionsUsageError('top must be an integer from 1 to 50');
}
/** Edges point from blocker to waiter. Missing blockers remain visible as placeholders. */
export function buildBlockingTree(rows: SessionRow[]): BlockingNode[] {
	const bySid = new Map(rows.map(r => [r.sid, r]));
	const children = new Map<number, Set<number>>();
	for (const r of rows) {
		const parent = r.blockerSid ?? r.finalBlockerSid;
		if (parent != null) {
			if (!children.has(parent)) children.set(parent, new Set());
			children.get(parent)!.add(r.sid);
			// Preserve the final root even when an intermediate blocker disappeared.
			if (!bySid.has(parent) && r.finalBlockerSid != null && r.finalBlockerSid !== parent && r.finalBlockerSid !== r.sid) {
				if (!children.has(r.finalBlockerSid)) children.set(r.finalBlockerSid, new Set());
				children.get(r.finalBlockerSid)!.add(parent);
			}
		}
	}
	const hasParent = new Set([...children.values()].flatMap(ids => [...ids]));
	const visited = new Set<number>();
	function node(sid: number, path: number[]): BlockingNode {
		const cycle = path.includes(sid), depthLimited = path.length >= 10 && (children.get(sid)?.size ?? 0) > 0;
		if (depthLimited) {
			const pending = [...(children.get(sid) ?? [])], seen = new Set<number>([sid]);
			while (pending.length) {
				const next = pending.pop()!;
				if (seen.has(next)) continue;
				seen.add(next); visited.add(next); pending.push(...(children.get(next) ?? []));
			}
		}
		visited.add(sid);
		return { sid, session: bySid.get(sid), cycle, depthLimited, vanished: !bySid.has(sid),
			children: cycle || depthLimited ? [] : [...(children.get(sid) ?? [])].map(id => node(id, [...path, sid])) };
	}
	const roots: BlockingNode[] = [];
	for (const sid of children.keys()) {
		if (!hasParent.has(sid)) roots.push(node(sid, []));
	}
	for (const sid of children.keys()) if (!visited.has(sid)) roots.push(node(sid, []));
	return roots;
}
/** Percentages always use all non-idle events, before display limits. */
export function classifyWaits(rows: WaitRow[]): WaitClass[] {
	const nonIdle = rows.filter(r => r.waitClass !== 'Idle');
	const total = nonIdle.reduce((n, r) => n + r.seconds, 0), groups = new Map<string, WaitClass>();
	for (const row of nonIdle) {
		const g = groups.get(row.waitClass) ?? { waitClass: row.waitClass, seconds: 0, percent: 0, events: [] };
		g.seconds += row.seconds; g.events.push({ ...row, percent: total ? row.seconds / total * 100 : 0 }); groups.set(row.waitClass, g);
	}
	return [...groups.values()].map(g => ({ ...g, percent: total ? g.seconds / total * 100 : 0, events: g.events.sort((a,b) => b.seconds-a.seconds) })).sort((a,b) => b.seconds-a.seconds);
}
function emptyCheck(label: string): Check { return { label, sql: '', binds: {}, view: '', status: 'ok', columns: [], rows: [], truncated: false, attempts: [] }; }
function section<T>(label: string): SessionSection<T> { return { status: 'skipped', rows: [], evidence: emptyCheck(label), supportingEvidence: [] }; }
export async function readSessionActivity(session: OracleSession, options: SessionsOptions = {}): Promise<SessionActivity> {
	validateSessionsOptions(options);
	const result: SessionActivity = { status: 'ok', target: session.target.name, capturedAt: new Date().toISOString(), self: { sid: 0 },
		sections: { active: section('active'), blocking: section('blocking'), waits: section('waits'), timeModel: section('timeModel'), transactions: section('transactions') }, findings: [] };
	async function read(key: keyof typeof SQL, binds: Record<string, unknown> = {}): Promise<Check> {
		const c = emptyCheck(key); c.sql = SQL[key]; c.binds = binds; c.view = [...c.sql.matchAll(/(?:FROM|JOIN)\s+([A-Z][A-Z0-9_$]*)/g)].map(m => m[1]).join(', ');
		try {
			Object.assign(c, await session.query(c.sql, binds));
			while (c.truncated && c.rows.length > 0 && c.rows.length < 10000) {
				const offset = c.rows.length;
				const page = await session.query(c.sql + ' OFFSET :sessionsOffset ROWS', { ...binds, sessionsOffset: offset });
				c.rows.push(...page.rows.slice(0, 10000 - offset));
				c.truncated = page.truncated || offset + page.rows.length > 10000;
				if (!page.rows.length) break;
			}
		}
		catch (e) { const code = /ORA-\d{5}/.exec(String(e))?.[0]; if (!code || !['ORA-00942','ORA-01031'].includes(code)) throw e; c.status = 'unavailable'; c.attempts.push({ view: c.view, code }); }
		return c;
	}
	function use<T>(s: SessionSection<T>, c: Check) {
		s.evidence = c; s.status = c.status;
		if (c.truncated) s.note = 'Row cap reached; snapshot is incomplete.';
	}
	const selected = (id: SectionId) => !options.sections || options.sections.includes(id);
	const self = await read('self'); result.self.sid = num(self.rows[0]?.[0]);
	const chainEvidence = (selected('blocking') || selected('active')) ? await read('chains') : undefined;
	let sessions: SessionRow[] = [], active: Check | undefined;
	if (selected('active') || selected('blocking')) {
		active = await read('active', { background: 1 });
		sessions = active.rows.map(r => ({ sid: num(r[0]), serial: num(r[1]), username: str(r[2]), osuser: str(r[3]), machine: str(r[4]), program: str(r[5]), type: str(r[6]), status: str(r[7]), sqlId: str(r[8] ?? r[9]), event: str(r[10]), waitClass: str(r[11]), state: str(r[12]), secondsInWait: num(r[13]), lastCallSeconds: num(r[14]), logonTime: str(r[15]), blockerSid: nullable(r[16]), finalBlockerSid: nullable(r[17]), objectId: nullable(r[18]) }));
		if (selected('active')) use(result.sections.active, active);
	}
	if (chainEvidence?.status === 'ok') {
		for (const r of chainEvidence.rows) { const waiter = sessions.find(s => s.sid === num(r[0])); if (waiter && num(r[1]) !== result.self.sid) waiter.blockerSid = num(r[1]); }
	}
	if (selected('active') && chainEvidence) result.sections.active.supportingEvidence.push(chainEvidence);
	const blockingSids = new Set(sessions.flatMap(r => [r.blockerSid, r.finalBlockerSid].filter((sid): sid is number => sid != null)));
	if (selected('active')) result.sections.active.rows = sessions.filter(r => blockingSids.has(r.sid) || (r.status === 'ACTIVE' && (options.includeBackground || (r.type === 'USER' && r.waitClass !== 'Idle'))));
	if (selected('blocking')) {
		const s = result.sections.blocking, chains = chainEvidence!; use(s, chains);
		s.supportingEvidence.push(active!);
		if (chains.status !== 'ok') { use(s, active!); s.supportingEvidence.push(chains); s.note = 'V$WAIT_CHAINS unavailable; using V$SESSION blocking and final blocking session.'; }
		const locks = await read('locks'), locked = await read('locked');
		let objects = await read('objects'); s.supportingEvidence.push(locks, locked, objects);
		if (objects.status === 'unavailable') { objects = await read('allObjects'); s.supportingEvidence.push(objects); }
		const modes = ['None','Null','Row share','Row exclusive','Share','Share row exclusive','Exclusive'];
		for (const r of sessions) {
			const held = locked.rows.find(x => num(x[0]) === r.sid), id = r.objectId && r.objectId > 0 ? r.objectId : num(held?.[1]);
			const obj = objects.rows.find(x => num(x[0]) === id);
			r.object = obj ? str(obj[1]) + '.' + str(obj[2]) : id > 0 ? 'Object #' + id : '';
			const lock = locks.rows.find(x => num(x[0]) === r.sid && (num(x[3]) > 0 || num(x[2]) > 1));
			if (lock) { r.lockType = ({ TX: 'Transaction', TM: 'DML enqueue', UL: 'User supplied' } as Record<string,string>)[str(lock[1])] ?? str(lock[1]); r.lockMode = modes[num(lock[3]) || num(lock[2])] ?? 'Unknown'; }
		}
		if (active!.status === 'unavailable' || locks.status === 'unavailable' || locked.status === 'unavailable' || objects.status === 'unavailable') { s.status = 'unavailable'; s.note = (s.note ?? '') + ' Blocking details incomplete: missing view access.'; }
		s.rows = buildBlockingTree(sessions);
	}
	if (selected('waits')) {
		const s = result.sections.waits, e = await read('waits'); use(s,e);
		s.rows = classifyWaits(e.rows.map(r => ({ event: str(r[0]), waitClass: str(r[1]), totalWaits: num(r[2]), seconds: num(r[3])/1e6, percent: 0, averageMs: num(r[2]) ? num(r[3])/num(r[2])/1000 : 0 })));
		const shown = new Set(s.rows.flatMap(g => g.events).sort((a,b) => b.seconds-a.seconds).slice(0, options.topWaits ?? 10));
		for (const g of s.rows) g.events = g.events.filter(e => shown.has(e));
	}
	if (selected('timeModel')) { const s = result.sections.timeModel, e = await read('timeModel'); use(s,e); s.rows = e.rows.map(r => ({ name: str(r[0]), seconds: num(r[1])/1e6 })); }
	if (selected('transactions')) {
		const s = result.sections.transactions, e = await read('transactions', { minTxSeconds: options.minTxSeconds ?? 300 }); use(s,e);
		s.rows = e.rows.map(r => ({ sid: num(r[0]), username: str(r[1]), sqlId: str(r[2]), startTime: str(r[3]), ageSeconds: num(r[4]), undoBlocks: num(r[5]), undoRecords: num(r[6]) }));
	}
	function finding(id: string, severity: SessionFinding['severity'], subject: string, detail: string, sqlId?: string, advice = '') {
		result.findings.push({ id, severity, subject, detail, ...(sqlId ? { sqlId } : {}), advice: 'For a human DBA: ' + advice + (sqlId ? ' Run piagent sql --target ' + result.target + ' --sql-id ' + sqlId : '') });
	}
	const blockers = new Set(sessions.flatMap(r => [r.blockerSid, r.finalBlockerSid].filter((sid): sid is number => sid != null)));
	for (const sid of blockers) {
		const b = sessions.find(r => r.sid === sid), waiters = sessions.filter(r => r.blockerSid === sid || r.finalBlockerSid === sid);
		if (waiters.some(w => w.secondsInWait > 60)) finding('blocking-over-60-' + sid, 'high', 'Blocker SID ' + sid, 'Waiters have waited more than 60 seconds.', b?.sqlId, 'Inspect the blocking chain and blocker SQL; contact the application transaction owner about the prolonged lock hold.');
		if (b?.status === 'INACTIVE') finding('idle-in-transaction-' + sid, 'high', 'Blocker SID ' + sid, 'Inactive blocker holding locks: idle in transaction.', b.sqlId, 'Contact the application transaction owner to review the idle open transaction and its commit or rollback handling.');
	}
	function cycles(nodes: BlockingNode[]) { for (const n of nodes) { if (n.cycle) finding('deadlock-' + n.sid, 'high', 'SID ' + n.sid, 'Blocking cycle: deadlock in progress.', n.session?.sqlId, 'Investigate the cycle and application lock acquisition order; review deadlock diagnostics.'); cycles(n.children); } }
	cycles(result.sections.blocking.rows);
	for (const t of result.sections.transactions.rows) if (t.ageSeconds > (options.minTxSeconds ?? 300)) finding('long-transaction-' + t.sid, 'medium', 'Transaction SID ' + t.sid, 'Transaction age ' + t.ageSeconds.toFixed(0) + ' seconds.', t.sqlId, 'Review the transaction scope, undo consumption and application commit frequency with its owner.');
	const waitAdvice: Record<string, string> = {
		'System I/O': 'Investigate redo/control file and DBWR storage latency.',
		'User I/O': 'Inspect top SQL by physical reads via piagent sql and review datafile read latency.',
		Concurrency: 'Investigate library cache or latch contention and hard parsing.',
		Commit: 'Review redo flush latency and application commit frequency.',
		Application: 'Investigate application lock contention and transaction scope.',
		Configuration: 'Review resource configuration and the leading wait events.',
		Network: 'Review network latency and client/server data transfer.',
		Cluster: 'Review interconnect latency and cross-instance block traffic.',
		Scheduler: 'Review CPU scheduling and resource manager limits.',
	};
	for (const g of result.sections.waits.rows) if (g.percent > 50) finding('wait-class-' + g.waitClass, 'info', g.waitClass, g.percent.toFixed(1) + '% of non-idle wait time since startup.', undefined, (waitAdvice[g.waitClass] ?? 'Investigate the leading events in this wait class.') + ' This figure is cumulative since startup, not current activity.');
	const sections = Object.values(result.sections).filter(s => s.status !== 'skipped');
	result.status = sections.every(s => s.status === 'unavailable') ? 'failed' : sections.some(s => s.status === 'unavailable' || s.evidence.truncated || s.supportingEvidence.some(e => e.truncated)) ? 'partial' : 'ok';
	return result;
}
const escape = (v: unknown): string => String(v ?? '').replace(/[&<>"|\r\n]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', '|':'&#124;', '\r':' ', '\n':' ' })[c]!);
export function renderSessionsMarkdown(a: SessionActivity): string {
	const lines = ['# Sessions — ' + escape(a.target), '', 'Captured at ' + a.capturedAt + ' (UTC). Status: ' + a.status + '.', '', 'Snapshot is a short sequence of queries, not one consistent read. Sessions may vanish between queries.', '', '## Findings', ''];
	for (const f of a.findings) lines.push('- **' + f.severity + ': ' + escape(f.subject) + '** — ' + escape(f.detail) + ' ' + escape(f.advice));
	if (!a.findings.length) lines.push('No findings.');
	for (const id of SECTION_IDS) {
		const s = a.sections[id], title = ({ active:'Active sessions', blocking:'Blocking tree', waits:'Waits since instance startup (cumulative, not current)', timeModel:'Time model since instance startup (cumulative, not current)', transactions:'Long transactions (UTC)' })[id];
		lines.push('', '## ' + title, '');
		if (s.status !== 'ok') lines.push('Status: ' + s.status + '.' + (s.note ? ' ' + escape(s.note) : ''));
		else if (s.note) lines.push(escape(s.note));
		if (!s.rows.length) { lines.push('None in this snapshot.'); continue; }
		if (id === 'blocking') {
			const walk = (nodes: BlockingNode[], depth: number) => { for (const n of nodes) { lines.push('  '.repeat(depth) + '- SID ' + n.sid + (n.vanished ? ' (vanished blocker)' : ' ' + escape(n.session?.username) + ' SQL_ID=' + escape(n.session?.sqlId) + ' ' + escape(n.session?.object) + ' ' + escape(n.session?.lockType) + ' ' + escape(n.session?.lockMode) + ' ' + escape(n.session?.event) + (n.session?.sqlId ? ' — Run piagent sql --target ' + escape(a.target) + ' --sql-id ' + escape(n.session.sqlId) : '')) + (n.cycle ? ' [DEADLOCK CYCLE]' : '') + (n.depthLimited ? ' [depth limit 10]' : '')); walk(n.children, depth+1); } }; walk(a.sections.blocking.rows, 0);
		} else if (id === 'waits') {
			for (const g of a.sections.waits.rows) { lines.push('', '**' + escape(g.waitClass) + '**: ' + g.seconds.toFixed(2) + ' s; ' + g.percent.toFixed(1) + '%', '', '| Event | Waits | Seconds | % non-idle | Average ms |', '| --- | --- | --- | --- | --- |'); for (const e of g.events) lines.push('| ' + [escape(e.event), e.totalWaits, e.seconds.toFixed(2), e.percent.toFixed(1), e.averageMs.toFixed(2)].join(' | ') + ' |'); }
		} else {
			const rows = s.rows as unknown as Record<string,unknown>[], keys = (id === 'active' ? ['sid', 'username', 'status', 'sqlId', 'event', 'waitClass', 'secondsInWait', 'blockerSid'] : Object.keys(rows[0]!)).filter(k => rows.some(r => r[k] != null && r[k] !== '' && !(k === 'objectId' && r[k] === -1)));
			const cell = (r: Record<string, unknown>, k: string) => k === 'objectId' && r[k] === -1 ? '' : r[k];
			const label = (key: string) => ({ sid: 'SID', sqlId: 'SQL_ID', waitClass: 'Wait class', blockerSid: 'Blocker', serial: 'Serial #', username: 'User', osuser: 'OS user', lastCallSeconds: 'Last call seconds', secondsInWait: 'Seconds in wait', undoBlocks: 'Undo blocks', undoRecords: 'Undo records', startTime: 'Start time UTC', logonTime: 'Logon time UTC' } as Record<string,string>)[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
			lines.push('', '| ' + keys.map(k => escape(label(k))).join(' | ') + ' |', '| ' + keys.map(() => '---').join(' | ') + ' |');
			for (const r of rows) lines.push('| ' + keys.map(k => escape(cell(r, k))).join(' | ') + ' |');
		}
		if (s.evidence.truncated || s.supportingEvidence.some(e => e.truncated)) lines.push('', 'Row cap reached; evidence is partial.');
	}
	return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
