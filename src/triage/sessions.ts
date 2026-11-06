import type { OracleSession, ToolContext } from '../contracts.js';
import { UnsupportedVersionError } from '../contracts.js';
import { readSessionActivity, type BlockingNode, type SessionActivity } from '../sessions/index.js';
import { TriageReader } from './read.js';
import { issueSqlId } from './sqlperf.js';
import type { Hypothesis } from './index.js';

export function needsSessions(issue: string): boolean {
	return /\b(hang|hangs|hanging|hung|lock|locks|locked|blocked|blocking|waiting|enqueue|deadlock|stuck)\b/i.test(issue) || (!issueSqlId(issue) && /\b(slow|slowness|takes\s+long)\b/i.test(issue));
}
export function blockingNodes(roots: BlockingNode[]): BlockingNode[] {
	return roots.flatMap(n => [n, ...blockingNodes(n.children)]);
}
export async function collectSessions(ctx: ToolContext, target: string) {
	let raw: OracleSession | undefined;
	const reader = new TriageReader({ ...ctx, sessions: { ...ctx.sessions, get: async () => {
		if (!raw) raw = await ctx.sessions.get(target);
		return { target: raw.target, identity: raw.identity, query: raw.query.bind(raw), close: async () => {} };
	} } }, target);
	try {
		const session = { target: ctx.config.targets.find(t => t.name === target)!, async query(sql: string, binds = {}) {
			const view = /\bFROM\s+([\w$]+)/i.exec(sql)?.[1] ?? 'sessions';
			const check = await reader.query(`Sessions: ${view}`, [{ view, sql }], binds, 10000);
			if (check.status === 'unavailable') throw new Error(check.attempts.at(-1)?.code ?? 'QUERY_FAILED');
			return { columns: check.columns, rows: check.rows, truncated: check.truncated, elapsedMs: 0 };
		} } as OracleSession;
		const activity = await readSessionActivity(session, { sections: ['blocking', 'waits', 'transactions'] });
		const sqlIds = [...new Set(blockingNodes(activity.sections.blocking.rows).filter(n => n.children.length).map(n => n.session?.sqlId).filter((id): id is string => !!id && issueSqlId(id) === id))].slice(0, 2);
		return { status: activity.status, activity, sqlIds, checks: reader.checks };
	} catch (error) {
		if (error instanceof UnsupportedVersionError) throw error;
		return { status: 'unavailable' as const, sqlIds: [], checks: reader.checks, reason: 'Session evidence could not be read; check view access and local service availability.' };
	} finally { await raw?.close().catch(() => {}); }
}
export function sessionHypotheses(activity?: SessionActivity): Hypothesis[] {
	if (!activity) return [];
	const nodes = blockingNodes(activity.sections.blocking.rows);
	const leads: Hypothesis[] = [];
	if (nodes.some(n => n.cycle)) leads.push({ rank: 0, title: 'A blocking cycle indicates a deadlock in progress.', evidence: ['Live session snapshot; sessions may vanish between queries.'] });
	for (const n of nodes.filter(n => n.children.length && n.session?.status === 'INACTIVE')) leads.push({ rank: 0, title: `Idle-in-transaction blocker SID ${n.sid} (${n.session!.username}) is a likely cause.`, evidence: [`SID ${n.sid} blocks ${n.children.map(c => c.sid).join(', ')}; SQL_ID ${n.session!.sqlId || 'unavailable'}.`] });
	if (nodes.length && !leads.length) leads.push({ rank: 0, title: 'A live blocking chain is a likely cause.', evidence: activity.sections.blocking.rows.map(n => `Root blocker SID ${n.sid}${n.vanished ? ' vanished between queries' : ''}.`) });
	if (!leads.length && activity.sections.waits.rows[0]) {
		const w = activity.sections.waits.rows[0];
		leads.push({ rank: 0, title: `Dominant non-idle wait class: ${w.waitClass} (context).`, evidence: [`${w.percent.toFixed(1)}% of non-idle wait time since startup; cumulative context does not establish the current cause.`] });
	}
	return leads;
}
