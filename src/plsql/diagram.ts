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
/** Rendering only: the dictionary graph stays complete. */
function collapseOracleNodes(graph: PlsqlGraph) {
	const supplied = graph.nodes.filter(node =>
		(node.kind === "object" || node.kind === "table") && /^(SYS|PUBLIC)\./.test(node.label));
	if (!supplied.length) return { ...graph, supplied: [], collapsedId: "" };
	const hidden = new Set(supplied.map(node => node.id));
	let collapsedId = "oracle-supplied";
	while (graph.nodes.some(node => node.id === collapsedId)) collapsedId += "_";
	const nodes: GraphNode[] = graph.nodes.filter(node => !hidden.has(node.id));
	nodes.push({ id: collapsedId, kind: "object", label: `Oracle-supplied (${supplied.length})` });
	const edges = graph.edges.map(edge => ({
		...edge,
		from: hidden.has(edge.from) ? collapsedId : edge.from,
		to: hidden.has(edge.to) ? collapsedId : edge.to,
	})).filter(edge => edge.from !== edge.to);
	return {
		nodes,
		edges: [...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()],
		supplied,
		collapsedId,
	};
}

export function renderMermaid(graph: PlsqlGraph): string {
	const view = collapseOracleNodes(graph);
	const ids = new Map(view.nodes.map((node, i) => [node.id, `n${i}`]));
	const label = (text: string) => text.replace(/[^A-Za-z0-9_.$# :()-]/g, "_");
	const lines = [
		"flowchart LR",
		...view.nodes.map(node => `  ${ids.get(node.id)}["${label(node.label)}"]`),
		...view.edges.map(edge =>
			`  ${ids.get(edge.from)} ${edge.heuristic ? "-.->" : "-->"}` +
			`|${label(edge.label ?? edge.kind)}| ${ids.get(edge.to)}`),
	];
	if (view.supplied.length) {
		const names = view.supplied.map(node => label(node.label)).join(", ");
		lines.push(`  click ${ids.get(view.collapsedId)} href "#" "${names}"`);
	}
	return lines.join("\n");
}
