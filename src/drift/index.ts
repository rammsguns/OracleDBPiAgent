import { createHash } from 'node:crypto';
import { UnsupportedVersionError, type ToolContext } from '../contracts.js';
import { classifySql } from '../oracle/sqlPolicy.js';
import { parameterQuery, objectQueries, schemaQueries, type DriftQuery } from './queries.js';
export interface DriftOptions { left: string; right: string; scope: string }
export interface DriftEntry { key: string; values: unknown[] }
export interface DriftSection {
	name: string; source: string; status: 'ok' | 'unavailable'; notes: string[];
	onlyLeft: DriftEntry[]; onlyRight: DriftEntry[];
	different: { key: string; left: unknown[]; right: unknown[] }[];
}
export interface DriftResult extends DriftOptions { generatedAt: string; complete: boolean; hasDrift: boolean; sections: DriftSection[] }
export function parseScope(scope: string): { kind: 'parameters' | 'schema' | 'objects'; owner?: string } {
	if (scope === 'parameters') return { kind: 'parameters' };
	const match = /^(schema|objects):([A-Za-z][A-Za-z0-9_$#]{0,127})$/.exec(scope);
	if (!match) throw new Error('Scope must be parameters, schema:OWNER or objects:OWNER');
	return { kind: match[1] as 'schema' | 'objects', owner: match[2]!.toUpperCase() };
}
/** Collapse whitespace outside quoted SQL literals/identifiers only. Never erase literal differences. */
export function normalize(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	return value.split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g).map((part, i) => i % 2 ? part : part.replace(/\s+/g, ' ')).join('').trim();
}
export function entries(definition: DriftQuery, rows: unknown[][]): DriftEntry[] {
	const groups = new Map<string, unknown[][]>();
	for (const row of rows) {
		const key = JSON.stringify(row.slice(0, definition.keys));
		const group = groups.get(key) ?? []; group.push(row.map(normalize)); groups.set(key, group);
	}
	const output: DriftEntry[] = [];
	for (const [key, group] of groups) {
		if (!definition.grouped) { output.push({ key, values: group[0]!.slice(definition.keys) }); continue; }
		const generated = group[0]![2] === 'GENERATED NAME';
		const values = group.map(row => row.slice(3));
		// Generated identifiers match by their complete structure, retaining multiplicity.
		const base = generated ? JSON.stringify([group[0]![0], 'generated', values]) : key;
		const ordinal = output.filter(e => e.key.startsWith(base + '#')).length;
		output.push({ key: generated ? `${base}#${ordinal}` : base, values });
	}
	return output.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
export function compareEntries(left: DriftEntry[], right: DriftEntry[]): Pick<DriftSection, 'onlyLeft' | 'onlyRight' | 'different'> {
	const l = new Map(left.map(e => [e.key, e])), r = new Map(right.map(e => [e.key, e]));
	return { onlyLeft: left.filter(e => !r.has(e.key)), onlyRight: right.filter(e => !l.has(e.key)), different: left.filter(e => r.has(e.key) && JSON.stringify(e.values) !== JSON.stringify(r.get(e.key)!.values)).map(e => ({ key: e.key, left: e.values, right: r.get(e.key)!.values })) };
}
export async function compareTargets(ctx: ToolContext, options: DriftOptions): Promise<DriftResult> {
	const scope = parseScope(options.scope);
	for (const target of [options.left, options.right]) if (!ctx.config.targets.some(t => t.name === target) || (ctx.pinnedTarget && ctx.pinnedTarget !== target)) throw new Error('Unknown or unpinned drift target');
	const definitions = scope.kind === 'parameters' ? [parameterQuery] : scope.kind === 'schema' ? schemaQueries : objectQueries;
	const result: DriftResult = { ...options, scope: scope.owner ? `${scope.kind}:${scope.owner}` : scope.kind, generatedAt: new Date().toISOString(), complete: true, hasDrift: false, sections: [] };
	for (const definition of definitions) {
		const section: DriftSection = { name: definition.name, source: definition.source, status: 'ok', notes: [], onlyLeft: [], onlyRight: [], different: [] };
		const sides: DriftEntry[][] = [];
		for (const target of [options.left, options.right]) {
			let session;
			const sql = classifySql(definition.sql);
			const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool: `drift:${definition.name}`, sqlSha256: createHash('sha256').update(sql).digest('hex') };
			try {
				session = await ctx.sessions.get(target);
				const query = await session.query(sql, scope.owner ? { owner: scope.owner } : {}, { maxRows: ctx.config.limits.maxRows, timeoutSeconds: ctx.config.limits.statementTimeoutSeconds });
				await ctx.audit.record({ ...base, kind: 'tool_call', rows: query.rows.length, truncated: query.truncated, elapsedMs: query.elapsedMs });
				if (query.truncated) { section.status = 'unavailable'; section.notes.push(`${target}: row cap reached; comparison withheld`); }
				// SEARCH_CONDITION_VC can silently truncate Oracle check expressions to 4000 bytes.
				if (definition.name === 'constraints' && query.rows.some(r => typeof r[12] === 'string' && Buffer.byteLength(r[12]) >= 4000)) { section.status = 'unavailable'; section.notes.push(`${target}: check expression may be truncated; comparison withheld`); }
				sides.push(entries(definition, query.rows));
			} catch (error) {
				await ctx.audit.record({ ...base, kind: 'tool_error', detail: 'DriftQueryError' });
				if (error instanceof UnsupportedVersionError) throw error;
				section.status = 'unavailable';
				section.notes.push(`${target}: ${/ORA-00942|ORA-01031/.test(String(error)) ? `needs SELECT on ${definition.source}` : 'query failed; check local service availability'}`);
			} finally { await session?.close(); }
		}
		if (section.status === 'ok') Object.assign(section, compareEntries(sides[0]!, sides[1]!));
		else result.complete = false;
		if (section.onlyLeft.length || section.onlyRight.length || section.different.length) result.hasDrift = true;
		result.sections.push(section);
	}
	return result;
}
const cell = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
export function renderDriftMarkdown(result: DriftResult): string {
	return [`# Drift: ${cell(result.left)} → ${cell(result.right)}`, `Scope: ${cell(result.scope)}. ${result.complete ? 'Complete' : 'Incomplete'} comparison.`, ...result.sections.map(s => [`## ${s.name}`, `Source: ${s.source}`, ...s.notes, ...(s.status === 'unavailable' ? ['Unavailable.'] : [
		...(['onlyLeft', 'onlyRight', 'different'] as const).map(group => `### ${group}\n\n${s[group].length ? s[group].map(e => `- ${cell(JSON.stringify(e))}`).join('\n') : 'None.'}`),
	])].join('\n\n'))].join('\n\n') + '\n';
}
