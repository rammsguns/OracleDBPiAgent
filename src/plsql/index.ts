import type { ToolContext } from '../contracts.js';
import { Dictionary, objectName, identifier, redact, type SourceRow, type DependencyRow } from './dictionary.js';
import { routines, matchRoutine } from './analysis.js';
import { buildGraph, renderMermaid } from './diagram.js';
export interface TableUse { owner: string; name: string; operations: string[]; heuristic: true }
/** Strip comments and literals before scanning; dynamic SQL is deliberately not inferred. */
export function staticText(text: string): string { return text.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, match => match.replace(/[^\n]/g, ' ')); }
export function tableUses(source: SourceRow[], dependencies: DependencyRow[]): TableUse[] {
	const text = staticText(source.filter(s => /BODY|PROCEDURE|FUNCTION|TRIGGER/.test(s.type)).map(s => s.text).join('\n')).toUpperCase();
	return dependencies.filter(d => d.referencedType === 'TABLE').filter((d, i, all) => all.findIndex(x => x.referencedOwner === d.referencedOwner && x.referencedName === d.referencedName) === i).map(d => {
		const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const table = `(?:${escape(d.referencedOwner)}\\s*\\.\\s*)?${escape(d.referencedName)}(?![A-Z0-9_$#])`;
		const operations = Object.entries({ SELECT: `(?:FROM|JOIN)\\s+${table}`, INSERT: `INSERT\\s+INTO\\s+${table}`, UPDATE: `UPDATE\\s+${table}`, DELETE: `DELETE\\s+(?:FROM\\s+)?${table}`, MERGE: `MERGE\\s+INTO\\s+${table}` }).filter(([, pattern]) => new RegExp(`\\b${pattern}`, 'i').test(text)).map(([op]) => op);
		return { owner: d.referencedOwner, name: d.referencedName, operations, heuristic: true };
	});
}
export async function listPlsql(ctx: ToolContext, target: string, owner?: string) {
	const dictionary = new Dictionary(ctx, target), objects = await dictionary.objects(owner ? identifier(owner) : undefined);
	const counts = [];
	for (const object of objects.rows) {
		const source = await dictionary.source(object.owner, object.name);
		counts.push({ ...object, lines: source.rows.filter(s => s.type === object.type).length, sourceStatus: source.status, sourceTruncated: source.truncated, sourceView: source.view, sourceAttempts: source.attempts });
	}
	return { target, ...objects, rows: counts };
}
export async function documentPlsql(ctx: ToolContext, target: string, object: string) {
	const { owner, name } = objectName(object), dictionary = new Dictionary(ctx, target);
	const objects = await dictionary.objects(owner, name), source = await dictionary.source(owner, name);
	const procedures = await dictionary.procedures(owner, name), args = await dictionary.arguments(owner, name);
	const dependencies = await dictionary.dependencies(owner, name), allCallers = await dictionary.dependencies(owner, name, true);
	const callers = { ...allCallers, rows: allCallers.rows.filter(d => !(d.owner === owner && d.name === name && d.type === 'PACKAGE BODY' && d.referencedType === 'PACKAGE')) };
	const errors = await dictionary.errors(owner, name), jobs = await dictionary.jobs(owner, name);
	const parsed = routines(source.rows);
	const spec = parsed.filter(r => !r.range && !r.type.includes('BODY'));
	const bodies = parsed.filter(r => r.range);
	const signatures = procedures.rows.filter(p => p.subprogramId > 0).map(p => {
		const arguments_ = args.rows.filter(a => a.subprogramId === p.subprogramId && a.overload === p.overload);
		const single = procedures.rows.filter(other => other.name === p.name && other.subprogramId > 0).length === 1;
		const body = matchRoutine(bodies, p.name, arguments_, single);
		const declaration = matchRoutine(spec, p.name, arguments_, single) ?? body;
		const enriched = arguments_.map(a => ({ ...a, default: a.defaulted === 'Y' ? declaration?.parameters.find(param => param.name === a.name)?.default ?? null : null }));
		const tables = body ? tableUses(body.rows, dependencies.rows).filter(t => t.operations.length) : [];
		return { ...p, arguments: enriched, comments: declaration?.comments ?? '', declaration: declaration?.declaration ?? '', bodyRange: body?.range ?? null, tables,
			signature: `${p.name}${p.overload ? ` [overload ${p.overload}]` : ''}(${enriched.filter(a => a.position > 0 && a.level === 0).map(a => `${a.name} ${a.mode} ${a.type}${a.defaulted === 'Y' ? ` DEFAULT ${a.default ?? '(unavailable)'}` : ''}`).join(', ')})${enriched.find(a => a.position === 0) ? ` RETURN ${enriched.find(a => a.position === 0)!.type}` : ''}` };
	});
	const tables = tableUses(source.rows, dependencies.rows);
	const graph = buildGraph(`${owner}.${name}`, signatures, dependencies.rows, jobs.rows, tables);
	return { schemaVersion: 1 as const, target, owner, name, complete: [objects, source, procedures, args, dependencies, callers, errors, jobs].every(s => s.status === 'ok' && !s.truncated), objects, source, procedures, arguments: args, dependencies, callers, errors, jobs, signatures, tables, graph, mermaid: renderMermaid(graph) };
}
export type PlsqlDocument = Awaited<ReturnType<typeof documentPlsql>>;
const cell = (v: unknown) => redact(String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;');
export function renderPlsqlMarkdown(doc: PlsqlDocument): string {
	const evidence = ['objects', 'source', 'procedures', 'arguments', 'dependencies', 'callers', 'errors', 'jobs'] as const;
	const list = (items: string[], empty = 'None returned.') => items.length ? items.map(s => `- ${s}`).join('\n') : empty;
	const tableList = (tables: TableUse[]) => list(tables.map(t => `${cell(t.owner)}.${cell(t.name)}: ${t.operations.join(', ') || 'operation unknown'}`), 'No table operations identified.');
	const written = doc.tables.filter(t => t.operations.some(op => op !== 'SELECT')).length;
	const status = doc.objects.rows.length ? [...new Set(doc.objects.rows.map(o => o.status))].join(', ') : 'unavailable';
	const code = (text: string) => '```plsql\n' + redact(text).replace(/`/g, '\u02cb') + '\n```';
	return [`# PL/SQL: ${cell(doc.owner)}.${cell(doc.name)}`,
		`Summary: ${doc.signatures.length} subprograms, ${written} tables written, ${doc.jobs.rows.length} jobs; status: ${cell(status)}${doc.complete ? '' : ' (incomplete evidence)'}.`,
		`Target: ${cell(doc.target)}. ${doc.complete ? 'Complete' : 'Incomplete'} dictionary evidence.`,
		'## Overview', list(doc.objects.rows.map(o => `${cell(o.type)}: ${cell(o.status)}; last DDL ${cell(o.lastDdl)}`), 'No visible PL/SQL object.'),
		'## Evidence', list(evidence.map(key => { const s = doc[key]; return `${key}: ${s.status}; ${s.view}${s.truncated ? '; cap reached (partial)' : ''}${s.attempts.map(a => `; ${a.view} ${a.code}`).join('')}`; })),
		'## Compile errors', list(doc.errors.rows.map(e => `${cell(e.type)} ${e.line}:${e.position} ${cell(e.attribute)} ${cell(e.text)}`)),
		'## Subprograms', ...doc.signatures.map(s => [
			`### ${cell(s.signature)}`, s.comments ? cell(s.comments) : s.declaration ? code(s.declaration) : 'Declaration unavailable.',
			s.bodyRange ? `Body range (heuristic): ${cell(s.bodyRange.type)} lines ${s.bodyRange.startLine}–${s.bodyRange.endLine}.` : 'Body range unavailable (ambiguous or incomplete source).',
			'Table operations (heuristic):\n\n' + (s.bodyRange ? tableList(s.tables) : 'Unavailable; see object-level union below.'),
		].join('\n\n')),
		'## Tables used (package/object union; heuristic static scan)', 'Dictionary table dependencies; operations are lexical hints, not runtime proof. Dynamic SQL, synonyms and quoted identifiers may be missed.', tableList(doc.tables),
		'## Callers', list(doc.callers.rows.map(d => `${cell(d.owner)}.${cell(d.name)} (${cell(d.type)})`)),
		'## Scheduler jobs (text references, heuristic)', list(doc.jobs.rows.map(j => `${cell(j.owner)}.${cell(j.name)}: ${cell(j.state)}; ${cell(j.action)}`)),
		'## Dependency diagram', 'Operation edges use bounded subprogram scans (heuristic); unresolved ranges and non-table dependencies fall back to the object. Job entry points are lexical references, not runtime proof.', '```mermaid\n' + doc.mermaid + '\n```',
		'## Source appendix (redacted; maximum 2,000 lines across spec and body)', doc.source.rows.map(s => `${cell(s.type)} ${s.line}: ${cell(s.text).trimEnd()}  `).join('\n')].join('\n\n') + '\n';
}
