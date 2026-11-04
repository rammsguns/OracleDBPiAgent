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
const section = { rows: [], status: 'ok', view: 'DBA_SOURCE', truncated: false, attempts: [] };
export const insightFakes: Partial<WebServerOptions> = {
	plsqlList: async () => ({ ...section, target: 'd1-19c-lab', rows: [{ owner: 'SHOPAPP', name: 'WORKLOAD', type: 'PACKAGE', status: evil }] } as any),
	plsqlDoc: async () => ({ owner: 'SHOPAPP', name: evil, complete: false, graph, signatures: [{ signature: evil, comments: evil, tables: [] }], objects: section, errors: section, tables: [], callers: section, jobs: section, source: { ...section, rows: [{ line: 27, text: evil }] }, dependencies: section, arguments: section } as any),
	triage: async (_ctx, options) => ({ target: options.target, scan: null, issues: [{ issue: { text: options.issue }, since: options.since, codes: ['ORA-02292'], times: [], hypotheses: [{ rank: 1, title: evil, evidence: ['Foreign key child rows'] }], suggestions: ['Review retention policy'], concurrency: [], limitations: ['Incomplete evidence'], excerpts: [], checks: [{ ...section, label: 'Constraint evidence', sql: 'SELECT * FROM DBA_CONSTRAINTS', binds: {}, columns: ['CONSTRAINT_NAME'], rows: [[evil]] }], guide: [], graph, mermaid: 'flowchart LR' }] } as any),
};
