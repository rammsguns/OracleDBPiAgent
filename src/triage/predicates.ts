import { identifier, type SourceRow } from '../plsql/dictionary.js';
import { mask } from '../plsql/analysis.js';
export interface Mutation { table: string; operation: 'DELETE' | 'UPDATE'; predicate: string; line: number; text: string; assigned: string[] }
/** Bounded lexical statements; comments/literals cannot introduce mutation tokens. */
export function mutations(rows: SourceRow[]): Mutation[] {
	const text = rows.map(r => r.text.replace(/\n$/, '')).join('\n'), clean = mask(text), result: Mutation[] = [];
	for (const m of clean.matchAll(/\b(DELETE\s+FROM|UPDATE)\s+([A-Z][\w$#]*(?:\s*\.\s*[A-Z][\w$#]*)?)/gi)) {
		const end = clean.indexOf(';', m.index); if (end < 0) continue;
		const statement = text.slice(m.index, end + 1), where = /\bWHERE\b/i.exec(mask(statement)); if (!where) continue;
		const line = rows[text.slice(0, m.index).split('\n').length - 1]?.line; if (!line) continue;
		const assigned = [...(mask(statement).slice(0, where.index).matchAll(/\b([A-Z][\w$#]*)\s*=/gi))].map(a => identifier(a[1]!));
		result.push({ table: m[2]!.replace(/\s/g, '').toUpperCase(), operation: /^DELETE/i.test(m[1]!) ? 'DELETE' : 'UPDATE', predicate: statement.slice(where.index + 5, -1).trim(), line, text: statement, assigned });
	}
	return result;
}
export function parentPredicate(child: Mutation, parentTable: string): string | undefined {
	// A child cleanup of the form FK IN (SELECT key FROM parent WHERE predicate).
	const m = /\bIN\s*\(\s*SELECT\s+[A-Z][\w$#]*(?:\s*,\s*[A-Z][\w$#]*)*\s+FROM\s+([A-Z][\w$#]*(?:\.[A-Z][\w$#]*)?)\s+WHERE\s+([\s\S]*)\)\s*$/i.exec(child.predicate);
	return m && sameTable(m[1]!, parentTable) ? m[2]!.trim() : undefined;
}
export const sameTable = (left: string, right: string) => left.toUpperCase() === right.toUpperCase() || (!left.includes('.') && left.toUpperCase() === right.split('.').at(-1)?.toUpperCase());
export function predicateRisk(child: Mutation, parent: Mutation, parentTable: string) {
	const predicate = parentPredicate(child, parentTable);
	if (!predicate) return { risk: true, reason: 'The child predicate is not an identical parent-key selection; equivalence is unproven.' };
	const relative = /\b(?:SYSDATE|SYSTIMESTAMP|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP)\b/i;
	if (relative.test(mask(predicate)) && relative.test(mask(parent.predicate))) return { risk: true, reason: 'Both statements evaluate a time-relative cutoff separately; the later statement can include parents that crossed the boundary.' };
	const normalize = (value: string) => [...value.matchAll(/'(?:''|[^'])*'|[^']+/g)].map(m => m[0].startsWith("'") ? m[0] : m[0].replace(/\s/g, '').toUpperCase()).join('');
	return { risk: normalize(predicate) !== normalize(parent.predicate), reason: 'The parent-selection predicates differ; the child cleanup may cover a different parent key set.' };
}
/** Deliberately small safe SQL grammar: no functions, subqueries, binds or arbitrary executable expressions. */
export function aggregateSql(parent: Mutation, childTable: string, parentTable: string, childColumns: string[], parentColumns: string[]): string | undefined {
	if (!childColumns.length || childColumns.length !== parentColumns.length) return;
	const comparison = /^([A-Z][\w$#]*)\s*(<=|>=|<>|=|<|>)\s*((?:SYSDATE|SYSTIMESTAMP|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP)(?:\s*[-+]\s*(?:\d+(?:\.\d+)?|INTERVAL\s+'\d+(?:\.\d+)?'\s+(?:DAY|HOUR|MINUTE|SECOND)))?|\d+(?:\.\d+)?|'(?:''|[^'])*')$/i.exec(parent.predicate);
	if (!comparison || /\[REDACTED\]/.test(parent.predicate)) return;
	const qualified = (value: string) => value.split('.').map(identifier).join('.');
	const predicate = `p.${identifier(comparison[1]!)} ${comparison[2]} ${comparison[3]}`;
	return `SELECT COUNT(*) AS CHILD_ROWS FROM ${qualified(childTable)} c WHERE EXISTS (SELECT 1 FROM ${qualified(parentTable)} p WHERE ${childColumns.map((column, i) => `c.${identifier(column)} = p.${identifier(parentColumns[i]!)}`).join(' AND ')} AND ${predicate})`;
}
