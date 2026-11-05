import type { OracleSession, ToolContext } from '../contracts.js';
import { readSqlInsight, validateSqlOptions, type SqlInsight } from '../sqlperf/index.js';
import { TriageReader, type Check } from './read.js';
import type { Hypothesis } from './index.js';

export interface TriageSql {
	status: 'ok' | 'unavailable' | 'skipped';
	reason?: string;
	candidates: Check | null;
	insight?: SqlInsight;
	checks: Check[];
	verifyNext: { label: string; sql: string; binds: Record<string, unknown> }[];
}
export function issueSqlId(issue: string): string | undefined {
	for (const token of issue.toLowerCase().match(/(?<![\w$#])[0-9a-z]{13}(?![\w$#])/g) ?? []) {
		try { validateSqlOptions({ sqlId: token }); return token; } catch { /* Not an Oracle SQL_ID. */ }
	}
	return undefined;
}
/** This optional evidence path never prevents the rest of issue triage. */
export async function collectSql(ctx: ToolContext, target: string, issue: string, hours: number, objects: string[]): Promise<TriageSql> {
	const result: TriageSql = { status: 'skipped', candidates: null, checks: [], verifyNext: [] };
	let sqlId = issueSqlId(issue);
	if (!sqlId && (!/\b(slow|slowness|timeout|takes\s+long)\b/i.test(issue) || !objects.length)) return result;
	const reader = new TriageReader(ctx, target);
	try {
		if (!sqlId) {
			const binds: Record<string, unknown> = { hours };
			const predicates = [...new Set(objects)].slice(0, 32).map((object, i) => {
				const [owner, name] = object.toUpperCase().split('.');
				binds[`owner${i}`] = owner; binds[`name${i}`] = name;
				return `(p.OBJECT_OWNER = :owner${i} AND p.OBJECT_NAME = :name${i})`;
			});
			result.candidates = await reader.query('Top SQL referencing issue objects (cursor-cache cumulative time per execution)', [{ view: 'V$SQL / V$SQL_PLAN', sql: `SELECT s.SQL_ID, MIN(s.SQL_TEXT) SQL_TEXT, SUM(s.ELAPSED_TIME) / SUM(s.EXECUTIONS) ELAPSED_PER_EXEC FROM V$SQL s WHERE s.EXECUTIONS > 0 AND s.LAST_ACTIVE_TIME >= SYSDATE - :hours / 24 AND s.LAST_ACTIVE_TIME <= SYSDATE AND EXISTS (SELECT 1 FROM V$SQL_PLAN p WHERE p.SQL_ID = s.SQL_ID AND p.CHILD_NUMBER = s.CHILD_NUMBER AND (${predicates.join(' OR ')})) GROUP BY s.SQL_ID ORDER BY ELAPSED_PER_EXEC DESC, s.SQL_ID FETCH FIRST 3 ROWS ONLY` }], binds, 3);
			if (result.candidates.status === 'unavailable') { result.status = 'unavailable'; return result; }
			sqlId = result.candidates.rows[0]?.[0] as string | undefined;
			if (!sqlId) { result.reason = 'SQL not in cursor cache'; return result; }
		}
		validateSqlOptions({ sqlId });
		// A local session adapter preserves exact SQL/binds and triage audit/redaction.
		// Failed views are read once, even if multiple plan objects need them.
		const unavailable = new Set<string>();
		const session = {
			target: ctx.config.targets.find(t => t.name === target)!,
			async query(sql: string, binds: Record<string, unknown> = {}) {
				const view = /\bFROM\s+([\w$]+)/i.exec(sql)?.[1] === 'TABLE' ? 'DBMS_XPLAN.DISPLAY_CURSOR' : /\bFROM\s+([\w$]+)/i.exec(sql)?.[1] ?? 'SQL insight';
				if (unavailable.has(view)) throw new Error('ORA-00942');
				const check = await reader.query(`SQL insight: ${view}`, [{ view, sql }], binds);
				if (check.status === 'unavailable') { unavailable.add(view); throw new Error('ORA-00942'); }
				return { columns: check.columns, rows: check.rows, truncated: check.truncated, elapsedMs: 0 };
			},
		} as OracleSession;
		result.insight = await readSqlInsight(session, { sqlId });
		result.status = reader.checks.some(c => c.status === 'unavailable') ? 'unavailable' : 'ok';
		if (!result.insight.children.length && result.insight.sections.children?.status === 'ok') result.reason = 'SQL not in cursor cache';
		for (const finding of result.insight.findings) {
			const sql = /statistics/i.test(finding.label)
				? `SELECT OWNER, ${finding.view.includes('IND_STATISTICS') ? 'INDEX_NAME' : 'TABLE_NAME'}, STALE_STATS, LAST_ANALYZED FROM ${finding.view} WHERE OWNER = :owner AND ${finding.view.includes('IND_STATISTICS') ? 'INDEX_NAME' : 'TABLE_NAME'} = :name`
				: /inner side/i.test(finding.label)
					? 'SELECT ID, PARENT_ID, OPERATION, OPTIONS, OBJECT_OWNER, OBJECT_NAME FROM V$SQL_PLAN WHERE SQL_ID = :id ORDER BY CHILD_NUMBER, ID'
				: /child/i.test(finding.label)
					? 'SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS FROM V$SQL WHERE SQL_ID = :id ORDER BY CHILD_NUMBER'
					: 'SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS, ELAPSED_TIME FROM V$SQL WHERE SQL_ID = :id ORDER BY CHILD_NUMBER';
			result.verifyNext.push({ label: finding.label, sql, binds: /statistics/i.test(finding.label) ? { owner: finding.rows[0]?.[0], name: finding.rows[0]?.[1] } : { id: sqlId } });
		}
	} catch {
		result.status = 'unavailable'; result.reason = 'SQL evidence could not be read; diagnostic query failed.';
	} finally { result.checks = reader.checks; }
	return result;
}
export function sqlHypotheses(sql: TriageSql): Hypothesis[] {
	return (sql.insight?.findings ?? []).map((f, i) => ({ rank: 0, verifyNext: sql.verifyNext[i],
		title: /instability/i.test(f.label) ? 'Possible plan regression: cached plans differ in elapsed time per execution.' : /child/i.test(f.label) ? 'Cursor sharing: high child-cursor count.' : f.label,
		evidence: [f.view + ': ' + f.columns.join(' | '), ...f.rows.map(r => r.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')).join(' | '))],
	}));
}
