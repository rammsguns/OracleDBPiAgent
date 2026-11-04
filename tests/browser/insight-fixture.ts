import type { WebServerOptions } from '../../src/web/server.js';
export const evil = '<script>"&$#';
const graph = { nodes: [{ id: 'job', kind: 'job' as const, label: evil }, { id: 'object', kind: 'object' as const, label: 'SHOPAPP.WORKLOAD' }], edges: [{ from: 'job', to: 'object', kind: 'references' as const, heuristic: true, label: evil }] };
const section = { rows: [], status: 'ok', view: 'DBA_SOURCE', truncated: false, attempts: [] };
export const insightFakes: Partial<WebServerOptions> = {
	plsqlList: async () => ({ ...section, target: 'd1-19c-lab', rows: [{ owner: 'SHOPAPP', name: 'WORKLOAD', type: 'PACKAGE', status: evil }] } as any),
	plsqlDoc: async () => ({ owner: 'SHOPAPP', name: evil, complete: false, graph, signatures: [{ signature: evil, comments: evil, tables: [] }], objects: section, errors: section, tables: [], callers: section, jobs: section, source: { ...section, rows: [{ line: 27, text: evil }] }, dependencies: section, arguments: section } as any),
	triage: async (_ctx, options) => ({ target: options.target, scan: null, issues: [{ issue: { text: options.issue }, since: options.since, codes: ['ORA-02292'], times: [], hypotheses: [{ rank: 1, title: evil, evidence: ['Foreign key child rows'] }], suggestions: ['Review retention policy'], concurrency: [], limitations: ['Incomplete evidence'], excerpts: [], checks: [{ ...section, label: 'Constraint evidence', sql: 'SELECT * FROM DBA_CONSTRAINTS', binds: {}, columns: ['CONSTRAINT_NAME'], rows: [[evil]] }], guide: [], graph, mermaid: 'flowchart LR' }] } as any),
};
