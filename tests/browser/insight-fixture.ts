import type { WebServerOptions } from '../../src/web/server.js';
export const evil = '<script>"&$#';
const graph = {
	nodes: [
		{ id: "job", kind: "job", label: evil },
		{ id: "object", kind: "object", label: "SHOPAPP.WORKLOAD" },
		{ id: "program", kind: "subprogram", label: "PLACE_ORDERS" },
		{ id: "table:SHOPAPP.ORDERS", kind: "table", label: "SHOPAPP.ORDERS" },
		{ id: "table:SHOPAPP.PRODUCTS", kind: "table", label: "SHOPAPP.PRODUCTS" },
		{ id: "object:SYS.STANDARD", kind: "object", label: "SYS.STANDARD" },
		{ id: "object:PUBLIC.DBMS_RANDOM", kind: "object", label: "PUBLIC.DBMS_RANDOM" },
		{ id: "object:SYS.HOSTILE", kind: "object", label: "SYS." + evil },
	],
	edges: [
		{ from: "job", to: "program", kind: "references", heuristic: true, label: evil },
		{ from: "object", to: "program", kind: "contains", heuristic: false },
		{ from: "program", to: "table:SHOPAPP.ORDERS", kind: "may-use", label: "INSERT", heuristic: true },
		{ from: "program", to: "table:SHOPAPP.PRODUCTS", kind: "may-use", label: "SELECT", heuristic: true },
		{ from: "program", to: "table:SHOPAPP.ORDERS", kind: "may-use", label: "SELECT", heuristic: true },
		{ from: "object", to: "object:SYS.STANDARD", kind: "depends-on", heuristic: false },
		{ from: "object", to: "object:PUBLIC.DBMS_RANDOM", kind: "depends-on", heuristic: false },
		{ from: "object", to: "object:SYS.HOSTILE", kind: "depends-on", heuristic: false },
	],
};
export const workloadGraph = {
	nodes: [
		{ id: "package", kind: "object", label: "SHOPAPP.WORKLOAD", displayKind: "PACKAGE" },
		...["NIGHTLY_PURGE", "PLACE_ORDERS", "SHIP_ORDERS"].flatMap(name => [
			{ id: "job:" + name, kind: "job", label: "SHOPAPP." + name + "_JOB" },
			{ id: name, kind: "subprogram", label: name },
		]),
		...["ORDER_LINES", "ORDERS", "PRODUCTS"].map(name => ({
			id: name, kind: "table", label: "SHOPAPP." + name,
		})),
		...["PUBLIC.DBMS_RANDOM", "SYS.DBMS_RANDOM", "SYS.STANDARD"].map(name => ({
			id: name, kind: "object", label: name,
		})),
	],
	edges: [
		...["NIGHTLY_PURGE", "PLACE_ORDERS", "SHIP_ORDERS"].flatMap(name => [
			{ from: "job:" + name, to: name, kind: "references", heuristic: true },
			{ from: "package", to: name, kind: "contains", heuristic: false },
		]),
		...["PUBLIC.DBMS_RANDOM", "SYS.DBMS_RANDOM", "SYS.STANDARD"].map(name => ({
			from: "package", to: name, kind: "depends-on", heuristic: false,
		})),
		...[
			["PLACE_ORDERS", "ORDER_LINES", "INSERT"], ["PLACE_ORDERS", "ORDERS", "INSERT"],
			["PLACE_ORDERS", "ORDERS", "UPDATE"], ["PLACE_ORDERS", "PRODUCTS", "SELECT"],
			["PLACE_ORDERS", "PRODUCTS", "UPDATE"], ["SHIP_ORDERS", "ORDERS", "UPDATE"],
			["NIGHTLY_PURGE", "ORDER_LINES", "DELETE"], ["NIGHTLY_PURGE", "ORDERS", "DELETE"],
			["NIGHTLY_PURGE", "ORDERS", "SELECT"],
		].map(([from, to, label]) => ({ from, to, label, kind: "may-use", heuristic: true })),
	],
};
const section = { rows: [], status: 'ok', view: 'DBA_SOURCE', truncated: false, attempts: [] };
export const insightFakes: Partial<WebServerOptions> = {
	plsqlList: async (_ctx, _target, owner) => ({ ...section, target: 'd1-19c-lab', rows: [{ owner: 'SHOPAPP', name: owner === 'WORKLOAD_FIXTURE' ? 'WORKLOAD_EXAMPLE' : 'WORKLOAD', type: 'PACKAGE', status: evil }] } as any),
	plsqlDoc: async (_ctx, _target, object) => ({ owner: 'SHOPAPP', name: object.endsWith('WORKLOAD_EXAMPLE') ? 'WORKLOAD' : evil, complete: false, graph: object.endsWith('WORKLOAD_EXAMPLE') ? workloadGraph : graph, signatures: [{ signature: evil, comments: evil, tables: [] }], objects: section, errors: section, tables: [], callers: section, jobs: section, source: { ...section, rows: [{ line: 27, text: evil }] }, dependencies: section, arguments: section } as any),
	triage: async (_ctx, options) => ({ target: options.target, scan: null, issues: [{ issue: { text: options.issue }, since: options.since, codes: ['ORA-02292'], times: [], hypotheses: [{ rank: 1, title: evil, evidence: ['Foreign key child rows'] }], suggestions: ['Review retention policy'], concurrency: [], limitations: ['Incomplete evidence'], excerpts: [], checks: [{ ...section, label: 'Constraint evidence', sql: 'SELECT * FROM DBA_CONSTRAINTS', binds: {}, columns: ['CONSTRAINT_NAME'], rows: [[evil]] }], guide: [], graph, mermaid: 'flowchart LR' }] } as any),
};
