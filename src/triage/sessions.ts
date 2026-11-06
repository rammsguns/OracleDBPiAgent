import type { OracleSession, ToolContext } from '../contracts.js';
import { UnsupportedVersionError } from '../contracts.js';
import { readSessionActivity, type BlockingNode, type SessionActivity } from '../sessions/index.js';
import { TriageReader } from './read.js';
import { issueSqlId } from './sqlperf.js';
import type { Hypothesis } from './index.js';

export function needsSessions(issue: string): boolean {
	// Authentication lockout/expiry is not row or session blocking, even when
	// the description also says that the user is waiting or the login is stuck.
	if (/\bORA-2800[012]\b/i.test(issue)
		|| /\b(?:account|password|login|logon|authentication)\s+(?:(?:is|was|has(?:\s+been)?|will\s+be)\s+)?(?:lock(?:ed|out)?|blocked|expir\w*)\b/i.test(issue)
		|| /\b(?:lock(?:ed|out)?|blocked|expir\w*)\s+(?:user\s+)?(?:account|password|login|logon|authentication)\b/i.test(issue)
		|| /\baccount\s+[a-z][a-z0-9_$#]*\s+(?:(?:is|was)\s+)?(?:locked|blocked)\b/i.test(issue)
		|| /\buser\s+(?:(?:is|was|has\s+been)\s+)?blocked\b/i.test(issue)) return false;
	const locking = /\b(?:row|table|transaction|session|query|queries|request|requests|update|updates)\b[^.!?\n]{0,40}\b(?:lock|locks|locked|blocked|blocking)\b/i.test(issue)
		|| /\b(?:lock|locks|locked|blocked|blocking)\b[^.!?\n]{0,40}\b(?:row|table|transaction|session|query|queries|request|requests|update|updates|wait|waits|contention)\b/i.test(issue)
		|| /\benq\s*:|\b(?:TX|TM)\s+(?:lock|enqueue|contention|wait)/i.test(issue);
	return locking || /\b(hang|hangs|hanging|hung|waiting|enqueue|deadlock|stuck)\b/i.test(issue)
		|| (!issueSqlId(issue) && /\b(slow|slowness|takes\s+long)\b/i.test(issue));
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
	if (nodes.some(n => n.children.length) && !leads.length) leads.push({ rank: 0, title: 'A live blocking chain is a likely cause.', evidence: activity.sections.blocking.rows.map(n => `Root blocker SID ${n.sid}${n.vanished ? ' vanished between queries' : ''}.`) });
	return leads;
}
/** Cumulative startup waits are context, never a cause to promote. */
export function sessionWaitContext(activity?: SessionActivity): Hypothesis[] {
	const w = activity?.sections.waits.rows[0];
	return w ? [{ rank: 0, title: `Dominant non-idle wait class: ${w.waitClass} (context).`, evidence: [`${w.percent.toFixed(1)}% of non-idle wait time since startup; cumulative context does not establish the current cause.`] }] : [];
}
