import type { DependencyRow, JobRow } from './dictionary.js';
import { mask, type BodyRange } from './analysis.js';
import type { TableUse } from './index.js';
export interface GraphNode { id: string; kind: 'object' | 'subprogram' | 'table' | 'job'; label: string }
export interface GraphEdge { from: string; to: string; kind: 'contains' | 'depends-on' | 'may-use' | 'references'; heuristic: boolean; label?: string }
export interface PlsqlGraph { nodes: GraphNode[]; edges: GraphEdge[] }
export function buildGraph(object: string, signatures: { name: string; subprogramId: number; overload: string | null; bodyRange?: BodyRange | null; tables?: TableUse[] }[], dependencies: DependencyRow[], jobs: JobRow[], tables: TableUse[]): PlsqlGraph {
	const nodes = new Map<string, GraphNode>(), edges: GraphEdge[] = [];
	const add = (id: string, kind: GraphNode['kind'], label: string) => { nodes.set(id, { id, kind, label }); return id; };
	const root = add(`object:${object}`, 'object', object);
	const programs = signatures.map(s => add(`subprogram:${object}:${s.subprogramId}:${s.overload ?? ''}`, 'subprogram', `${s.name}${s.overload ? ` #${s.overload}` : ''}`));
	for (const program of programs) edges.push({ from: root, to: program, kind: 'contains', heuristic: false });
	for (const d of dependencies) {
		if (`${d.referencedOwner}.${d.referencedName}` === object) continue;
		const table = tables.some(t => t.owner === d.referencedOwner && t.name === d.referencedName);
		const id = add(`${table ? 'table' : 'object'}:${d.referencedOwner}.${d.referencedName}`, table ? 'table' : 'object', `${d.referencedOwner}.${d.referencedName}`);
		let attributed = false;
		if (table) for (const [i, s] of signatures.entries()) {
			if (!s.bodyRange) continue;
			const use = s.tables?.find(t => t.owner === d.referencedOwner && t.name === d.referencedName);
			for (const operation of use?.operations ?? []) { edges.push({ from: programs[i]!, to: id, kind: 'may-use', heuristic: true, label: operation }); attributed = true; }
		}
		if (!attributed || signatures.some(s => !s.bodyRange)) edges.push({ from: root, to: id, kind: 'depends-on', heuristic: false });
	}
	const [owner, packageName] = object.split('.');
	for (const j of jobs) {
		const id = add(`job:${j.owner}.${j.name}`, 'job', `${j.owner}.${j.name}`);
		const entryNames = new Set<string>();
		for (const m of mask(j.action).toUpperCase().matchAll(/(?<![\w$#.])([A-Z][\w$#]*)\s*\.\s*([A-Z][\w$#]*)\s*\.\s*([A-Z][\w$#]*)(?![\w$#])/g)) {
			if (m[1] === owner && m[2] === packageName) entryNames.add(m[3]!);
		}
		const matches = signatures.filter(s => entryNames.has(s.name));
		for (const destination of matches.length ? matches.map(s => `subprogram:${object}:${s.subprogramId}:${s.overload ?? ''}`) : [root]) edges.push({ from: id, to: destination, kind: 'references', heuristic: true });
	}
	return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: [...new Map(edges.map(e => [JSON.stringify(e), e])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}
export function renderMermaid(graph: PlsqlGraph): string {
	const ids = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]));
	const label = (s: string) => s.replace(/[^A-Za-z0-9_.$# :()-]/g, '_');
	return ['flowchart LR', ...graph.nodes.map(n => `  ${ids.get(n.id)}["${label(n.label)}"]`), ...graph.edges.map(e => `  ${ids.get(e.from)} ${e.heuristic ? '-.->' : '-->'}|${label(e.label ?? e.kind)}| ${ids.get(e.to)}`)].join('\n');
}
