import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSessionActivity } from '../sessions/index.js';
import { blockingNodes } from '../triage/sessions.js';
import type { ReportSection } from './index.js';

/** Reuse the sessions reader, auditing SELECTs without binds or driver text. */
export async function readReportSessions(ctx: ToolContext, target: string): Promise<ReportSection> {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = {
		target: raw.target, identity: raw.identity, close: () => raw.close(),
		query: async (sql, binds, options) => {
			const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool: 'report:sessions', sqlSha256: createHash('sha256').update(sql).digest('hex') };
			try {
				const data = await raw.query(sql, binds, options);
				await ctx.audit.record({ ...base, kind: 'tool_call', rows: data.rows.length, truncated: data.truncated, elapsedMs: data.elapsedMs });
				return data;
			} catch (error) { await ctx.audit.record({ ...base, kind: 'tool_error', detail: 'SessionsReadError' }); throw error; }
		},
	};
	try {
		const a = await readSessionActivity(session, { sections: ['blocking', 'waits', 'transactions'] });
		let startup: string | null = null;
		try { const r = await session.query("SELECT TO_CHAR(STARTUP_TIME, 'YYYY-MM-DD HH24:MI:SS') FROM V$INSTANCE"); startup = r.rows[0]?.[0] == null ? null : String(r.rows[0][0]); } catch { /* Missing identity is a trend gap. */ }
		const rows: unknown[][] = [];
		for (const w of a.sections.waits.rows) rows.push(['wait_seconds', w.waitClass, w.seconds, a.sections.waits.status, startup]);
		if (!a.sections.waits.rows.length) rows.push(['wait_seconds', null, null, a.sections.waits.status, startup]);
		const blockers = new Set(blockingNodes(a.sections.blocking.rows).filter(n => n.children.length).map(n => n.sid));
		rows.push(['blockers', null, blockers.size, a.sections.blocking.status, startup], ['long_transactions', null, a.sections.transactions.rows.length, a.sections.transactions.status, startup]);
		// Scalar rows retain the tree and diagnostic details in history's existing schema.
		for (const row of rows) row.push(null, null, null, null);
		function tree(nodes: import('../sessions/index.js').BlockingNode[], path: number[] = []) {
			for (const n of nodes) {
				rows.push(['blocking', null, n.children.length, a.sections.blocking.status, startup, n.sid, n.session?.username ?? null, n.session?.sqlId ?? null,
					`${[...path, n.sid].join(' → ')}${n.cycle ? ' [DEADLOCK CYCLE]' : ''}${n.vanished ? ' [vanished blocker]' : ''}${n.depthLimited ? ' [depth limit]' : ''}; ${n.session?.status ?? ''}; ${n.session?.event ?? ''}; ${n.session?.object ?? ''}; ${n.session?.lockType ?? ''} ${n.session?.lockMode ?? ''}`]);
				tree(n.children, [...path, n.sid]);
			}
		}
		tree(a.sections.blocking.rows);
		for (const w of a.sections.waits.rows) for (const e of w.events) rows.push(['wait_event', w.waitClass, e.seconds, a.sections.waits.status, startup, null, null, null, `${e.event}; ${e.totalWaits} waits; average ${e.averageMs.toFixed(2)} ms; ${e.percent.toFixed(1)}% non-idle`]);
		for (const t of a.sections.transactions.rows) rows.push(['transaction', null, t.ageSeconds, a.sections.transactions.status, startup, t.sid, t.username, t.sqlId, `Started ${t.startTime} UTC; undo blocks ${t.undoBlocks}; records ${t.undoRecords}`]);
		for (const f of a.findings) rows.push([`finding:${f.severity}`, null, null, 'ok', startup, null, null, f.sqlId ?? null, `${f.subject}: ${f.detail} ${f.advice}`]);
		return { name: 'sessions', status: a.status === 'failed' ? 'unavailable' : 'ok', source: 'readSessionActivity', columns: ['METRIC', 'WAIT_CLASS', 'VALUE', 'STATUS', 'STARTUP_TIME', 'SID', 'USERNAME', 'SQL_ID', 'DETAIL'], rows,
			note: (raw.identity?.isCdb ? 'STARTUP_TIME is CDB instance-wide, not PDB open time. ' : '') + 'Snapshot is a short sequence of queries, not one consistent read. Wait seconds are non-idle cumulative totals since startup; trends use deltas only across unchanged startup times. Long transactions exceed 300 seconds. ' + Object.entries(a.sections).filter(([, s]) => s.status !== 'skipped').map(([id, s]) => `${id}: ${s.status}${s.note ? '; ' + s.note : ''}${s.evidence.truncated || s.supportingEvidence.some(e => e.truncated) ? '; row limit reached' : ''}.`).join(' ') };
	} finally { await session.close(); }
}

/** Validate saved scalar metrics; partial snapshots are gaps, never apparent recovery. */
export function sessionMetrics(section: ReportSection | undefined) {
	if (section?.status !== 'ok' || /row limit/i.test(section.note) || !['METRIC', 'WAIT_CLASS', 'VALUE', 'STATUS', 'STARTUP_TIME'].every(c => section.columns.includes(c))) return [];
	return section.rows.map(row => Object.fromEntries(section.columns.map((c, i) => [c, row[i]]))).filter(r => r.STATUS === 'ok' && typeof r.VALUE === 'number' && Number.isFinite(r.VALUE) && r.VALUE >= 0);
}
