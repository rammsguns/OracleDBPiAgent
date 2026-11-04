import { identifier } from '../plsql/dictionary.js';
import { TriageReader } from './read.js';
export interface RunScope { owner?: string; name: string }
const select = 'OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO';
const matches = (scope: RunScope, row: unknown[]) => row[1] === scope.name && (!scope.owner || row[0] === scope.owner);
export const scopeName = (scope: RunScope) => scope.owner ? `${scope.owner}.${scope.name}` : `${scope.name} (all visible owners)`;
/** One latest-five lookup per named scope absent from the bounded window result. */
export async function collectRunHistory(reader: TriageReader, requested: RunScope[], hours: number, since: string) {
	const scopes = [...new Map(requested.map(s => { const scope = { name: identifier(s.name), ...(s.owner ? { owner: identifier(s.owner) } : {}) }; return [scopeName(scope), scope]; })).values()];
	const binds: Record<string, unknown> = { hours };
	const predicates = scopes.map((scope, i) => {
		binds[`job${i}`] = scope.name;
		if (!scope.owner) return `JOB_NAME = :job${i}`;
		binds[`owner${i}`] = scope.owner;
		return `(OWNER = :owner${i} AND JOB_NAME = :job${i})`;
	});
	const window = await reader.read('Scheduler run history in window', 'SCHEDULER_JOB_RUN_DETAILS', select, `WHERE ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR') AND (${predicates.join(' OR ') || '1 = 0'}) ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC`, binds, 30);
	const rows = [...window.rows], notes: string[] = [];
	for (const scope of scopes.filter(s => !window.rows.some(row => matches(s, row)))) {
		const latest = await reader.read(`Latest scheduler runs for ${scopeName(scope)} (regardless of window; max 5)`, 'SCHEDULER_JOB_RUN_DETAILS', `${select}, CASE WHEN ACTUAL_START_DATE < SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR') THEN 1 ELSE 0 END AS OUTSIDE_WINDOW`, `WHERE JOB_NAME = :name${scope.owner ? ' AND OWNER = :owner' : ''} ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC`, { hours, name: scope.name, ...(scope.owner ? { owner: scope.owner } : {}) }, 5);
		if (latest.rows.length) {
			const outside = latest.rows.every(row => Number(row[6]) === 1);
			const classification = `${outside ? 'outside the requested window' : 'latest runs after the empty or capped window search'} (last run ${String(latest.rows[0]?.[4] ?? 'time unavailable')})`;
			const note = `${scopeName(scope)}: ${classification}; using up to 5 most recent runs as ${outside ? 'historical' : 'additional'} evidence. Requested window: ${since}.`;
			latest.label = `Latest scheduler runs for ${scopeName(scope)}: ${classification}; max 5`; notes.push(note);
			for (const row of latest.rows) if (!rows.some(r => JSON.stringify(r.slice(0, 6)) === JSON.stringify(row.slice(0, 6)))) rows.push(row);
		}
	}
	return { rows, notes, scopes };
}
