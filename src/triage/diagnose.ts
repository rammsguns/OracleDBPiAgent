import { Dictionary, type SourceRow } from '../plsql/dictionary.js';
import { routines, mask } from '../plsql/analysis.js';
import type { Excerpt, Hypothesis } from './index.js';
import { aggregateSql, mutations, predicateRisk, sameTable } from './predicates.js';
import { TriageReader, type Check } from './read.js';
const str = (v: unknown) => String(v ?? '');
export async function diagnosePredicates(excerpts: Excerpt[], sources: Map<string, Awaited<ReturnType<Dictionary['source']>>>, constraints: Check[], reader: TriageReader, dictionary: Dictionary) {
	const hypotheses: Hypothesis[] = [], suggestions: string[] = [], concurrency: string[] = [];
	const examined = new Set<string>(), jobsRead = new Set<string>();
	for (const excerpt of excerpts) {
		const source = sources.get(excerpt.object); if (!source) continue;
		const routine = routines(source.rows).find(r => r.name === excerpt.subprogram && r.range && r.range.startLine <= excerpt.line && r.range.endLine >= excerpt.line);
		if (!routine?.range) continue;
		const scoped = source.rows.filter(r => r.type === routine.type && r.line >= routine.range!.startLine && r.line <= routine.range!.endLine);
		const statements = mutations(scoped);
		for (const constraint of constraints) for (const row of constraint.rows.filter(r => r[2] === 'R')) {
			const childTable = `${row[0]}.${row[3]}`;
			const parent = reader.checks.find(c => c.label === `Parent/key table for ${row[0]}.${row[1]}`)?.rows[0]; if (!parent) continue;
			const parentTable = `${parent[0]}.${parent[2]}`;
			const parentCols = reader.checks.find(c => c.label === `Columns for ${parent[0]}.${parent[1]}`)?.rows.map(r => str(r[3])) ?? [];
			const childCols = reader.checks.find(c => c.label === `Columns for ${row[0]}.${row[1]}`)?.rows.map(r => str(r[3])) ?? [];
			const mutation = statements.filter(s => s.line <= excerpt.line && sameTable(s.table, parentTable) && (s.operation === 'DELETE' || s.assigned.some(c => parentCols.includes(c)))).at(-1);
			if (!mutation) continue;
			const key = `${excerpt.object}:${mutation.line}:${childTable}`; if (examined.has(key)) continue; examined.add(key);
			const cleanup = statements.filter(s => s.operation === 'DELETE' && s.line < mutation.line && sameTable(s.table, childTable)).at(-1);
			if (cleanup) {
				const risk = predicateRisk(cleanup, mutation, parentTable);
				if (risk.risk) {
					hypotheses.push({ rank: 0, title: 'Cutoff evaluated twice / predicate mismatch: rows crossing the boundary between statements keep child rows.', evidence: [`${excerpt.object}.${excerpt.subprogram}, line ${cleanup.line}: ${cleanup.text}`, `${excerpt.object}.${excerpt.subprogram}, line ${mutation.line}: ${mutation.text}`, risk.reason, 'This is a source-based hypothesis; current aggregates cannot reconstruct the failing transaction.'] });
					suggestions.push(`For ${excerpt.object}.${excerpt.subprogram} lines ${cleanup.line} and ${mutation.line}, capture the cutoff once in a variable and use it in both statements; make the predicates identical.`, `For ${childTable} → ${parentTable}, collect the intended parent key set first and delete children using that same key set before ${mutation.operation === 'DELETE' ? 'deleting parents' : 'updating parent keys'}.`);
				}
			}
			const sql = aggregateSql(mutation, childTable, parentTable, childCols, parentCols);
			if (sql) {
				const count = await reader.query(`Current child references matching parent predicate (${childTable} → ${parentTable})`, [{ view: `${childTable}, ${parentTable}`, sql }], {}, 1);
				if (hypotheses.length) hypotheses.at(-1)!.evidence.push(count.status === 'ok' ? `Current matching child row count: ${count.rows[0]?.[0] ?? 'unavailable'} (a new read-only snapshot, not proof of the historical cause).` : `Current matching child row count unavailable: ${count.attempts.map(a => a.code).join(', ')}.`);
			} else concurrency.push(`Aggregate check for ${childTable} → ${parentTable} was not executed: the parent predicate is outside the safe comparison grammar or FK columns are unavailable.`);
			if (!jobsRead.has(excerpt.object)) {
				jobsRead.add(excerpt.object);
				const [owner, name] = excerpt.object.split('.');
				const jobs = await dictionary.jobs(owner!, name!);
				reader.checks.push({ label: `Other jobs referencing ${excerpt.object} (concurrency review)`, sql: `SELECT OWNER, JOB_NAME, JOB_ACTION FROM ${jobs.view} WHERE INSTR(UPPER(JOB_ACTION), :name) > 0 ORDER BY OWNER, JOB_NAME`, binds: { name }, status: jobs.status, view: jobs.view, columns: ['OWNER', 'JOB_NAME', 'JOB_ACTION'], rows: jobs.rows.map(j => [j.owner, j.name, j.action]), truncated: jobs.truncated, attempts: jobs.attempts });
				for (const other of routines(source.rows).filter(r => r.range && r.name !== excerpt.subprogram)) {
					const active = jobs.rows.filter(j => mask(j.action).toUpperCase().includes(`.${other.name}`)); if (!active.length) continue;
					const body = source.rows.filter(r => r.type === other.type && r.line >= other.range!.startLine && r.line <= other.range!.endLine);
					concurrency.push(...insertionEvidence(body, childTable, parentTable, parentCols, `${excerpt.object}.${other.name}`, active.map(j => `${j.owner}.${j.name}`).join(', ')));
				}
			}
		}
	}
	if (constraints.some(c => c.rows.some(r => r[2] === 'R'))) suggestions.push('Consider ON DELETE CASCADE only as a schema design choice after reviewing ownership, retention rules and all dependent tables.', 'Add exception logging that records the error stack, backtrace, captured cutoff and operation context without credentials.');
	return { hypotheses, suggestions: [...new Set(suggestions)], concurrency: [...new Set(concurrency)] };
}
function insertionEvidence(rows: SourceRow[], child: string, parent: string, keys: string[], program: string, jobs: string): string[] {
	const clean = mask(rows.map(r => r.text.replace(/\n$/, '')).join('\n'));
	const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const table = (s: string) => `(?:${escape(s.split('.')[0]!)}\\s*\\.\\s*)?${escape(s.split('.')[1]!)}\\b`;
	const insert = new RegExp(`INSERT\\s+INTO\\s+${table(child)}`, 'i').exec(clean); if (!insert) return [];
	const newParent = new RegExp(`INSERT\\s+INTO\\s+${table(parent)}[^;]*RETURNING\\s+(${keys.map(escape).join('|')})\\s+INTO\\s+([A-Z][\\w$#]*)`, 'i').exec(clean);
	const line = (offset: number) => rows[clean.slice(0, offset).split('\n').length - 1]?.line;
	if (newParent && new RegExp(`^INSERT\\s+INTO\\s+${table(child)}\\s+VALUES\\s*\\(\\s*${escape(newParent[2]!)}\\s*[,)]`, 'i').test(clean.slice(insert.index))) {
		return [`${jobs} calls ${program}: line ${line(newParent.index)} inserts a new parent and RETURNING ${newParent[1]} INTO ${newParent[2]}; line ${line(insert.index)} inserts child rows using that new key. This shown path cannot explain child rows for old parents selected by the purge; it does not support that concurrency explanation.`];
	}
	return [`${jobs} calls ${program}, which inserts into ${child} at line ${line(insert.index)}. Concurrent inserts are a candidate to investigate; whether they use the same parent keys is unverified.`];
}
