import type { ToolContext } from '../contracts.js';
import { Dictionary, objectName, identifier, redact, type SourceRow, type DependencyRow } from './dictionary.js';
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
	const dependencies = await dictionary.dependencies(owner, name), callers = await dictionary.dependencies(owner, name, true);
	const errors = await dictionary.errors(owner, name), jobs = await dictionary.jobs(owner, name);
	const spec = source.rows.filter(s => !s.type.includes('BODY')).map(s => s.text).join('');
	const signatures = procedures.rows.filter(p => p.subprogramId > 0).map(p => {
		const arguments_ = args.rows.filter(a => a.subprogramId === p.subprogramId && a.overload === p.overload);
		const declarations = [...spec.matchAll(/((?:(?:--[^\n]*\n)|(?:\/\*[\s\S]*?\*\/)\s*)*)\s*(?:PROCEDURE|FUNCTION)\s+([A-Za-z][\w$#]*)\b([^;]*;)/gi)].filter(m => m[2]!.toUpperCase() === p.name);
		const ordinal = procedures.rows.filter(x => x.name === p.name && x.subprogramId < p.subprogramId).length;
		return { ...p, arguments: arguments_, comments: declarations[ordinal]?.[1]?.trim() ?? '', declaration: declarations[ordinal]?.[0]?.trim() ?? '', signature: `${p.name}${p.overload ? ` [overload ${p.overload}]` : ''}(${arguments_.filter(a => a.position > 0 && a.level === 0).map(a => `${a.name} ${a.mode} ${a.type}${a.defaulted === 'Y' ? ' DEFAULT (see declaration; dictionary default expression unavailable)' : ''}`).join(', ')})${arguments_.find(a => a.position === 0) ? ` RETURN ${arguments_.find(a => a.position === 0)!.type}` : ''}` };
	});
	const tables = tableUses(source.rows, dependencies.rows);
	const graph = buildGraph(`${owner}.${name}`, signatures, dependencies.rows, jobs.rows, tables);
	return { schemaVersion: 1 as const, target, owner, name, complete: [objects, source, procedures, args, dependencies, callers, errors, jobs].every(s => s.status === 'ok' && !s.truncated), objects, source, procedures, arguments: args, dependencies, callers, errors, jobs, signatures, tables, graph, mermaid: renderMermaid(graph) };
}
export type PlsqlDocument = Awaited<ReturnType<typeof documentPlsql>>;
const cell = (v: unknown) => redact(String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;');
export function renderPlsqlMarkdown(doc: PlsqlDocument): string {
	const evidence = ['objects', 'source', 'procedures', 'arguments', 'dependencies', 'callers', 'errors', 'jobs'] as const;
	return [`# PL/SQL: ${cell(doc.owner)}.${cell(doc.name)}`, `Target: ${cell(doc.target)}. ${doc.complete ? 'Complete' : 'Incomplete'} dictionary evidence.`,
		'## Overview', ...doc.objects.rows.map(o => `- ${cell(o.type)}: ${cell(o.status)}; last DDL ${cell(o.lastDdl)}`), ...(doc.objects.rows.length ? [] : ['No visible PL/SQL object.']),
		'## Evidence', ...evidence.map(key => { const s = doc[key]; return `- ${key}: ${s.status}; ${s.view}${s.truncated ? '; cap reached (partial)' : ''}${s.attempts.map(a => `; ${a.view} ${a.code}`).join('')}`; }),
		'## Compile errors', ...(doc.errors.rows.length ? doc.errors.rows.map(e => `- ${cell(e.type)} ${e.line}:${e.position} ${cell(e.attribute)} ${cell(e.text)}`) : ['None returned.']),
		'## Subprograms', ...doc.signatures.map(s => `### ${cell(s.signature)}\n\n${cell(s.comments)}\n\n${cell(s.declaration)}`),
		'## Tables used (heuristic static scan)', 'Dictionary table dependencies; operations are lexical hints, not runtime proof. Dynamic SQL, synonyms and quoted identifiers may be missed.', ...doc.tables.map(t => `- ${cell(t.owner)}.${cell(t.name)}: ${t.operations.join(', ') || 'operation unknown'}`),
		'## Callers', ...doc.callers.rows.map(d => `- ${cell(d.owner)}.${cell(d.name)} (${cell(d.type)})`),
		'## Scheduler jobs (text references, heuristic)', ...doc.jobs.rows.map(j => `- ${cell(j.owner)}.${cell(j.name)}: ${cell(j.state)}; ${cell(j.action)}`),
		'## Dependency diagram', 'Subprogram dependency edges are object-level candidates; dictionary views do not establish individual subprogram calls.', '```mermaid\n' + doc.mermaid + '\n```',
		'## Source appendix (redacted; maximum 2,000 lines across spec and body)', ...doc.source.rows.map(s => `${cell(s.type)} ${s.line}: ${cell(s.text).trimEnd()}  `)].join('\n\n') + '\n';
}
