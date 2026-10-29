import { createHash } from 'node:crypto';
import { UnsupportedVersionError } from '../contracts.js';
import type { ToolContext } from '../contracts.js';
import { classifySql } from '../oracle/sqlPolicy.js';
import { reportQueries } from './queries.js';
export interface ReportSection {
	name: string;
	status: 'ok' | 'unavailable';
	source: string;
	columns: string[];
	rows: unknown[][];
	note: string;
}
export interface DatabaseReport { target: string; generatedAt: string; sections: ReportSection[] }
export interface ReportOptions { target?: string; owner?: string; sections?: string[] }
export const sectionNames = reportQueries.map(q => q.name);
const groups: Record<string, string[]> = { backups: ['backups', 'archive_switches'], scheduler_jobs: ['scheduler_jobs', 'scheduler_failures'], index_health: ['index_health', 'index_partitions', 'index_subpartitions'] };
/** Deliberately allowlisted diagnostics, matching the CLI's suppression of raw driver errors. */
function safeReason(error: unknown, grant: string): string {
	const text = String(error);
	if (/ORA-00942|ORA-01031/.test(text)) return `needs SELECT on ${grant}`;
	if (/NJS-040|NJS-560|DPI-1067|ORA-01013|call timeout|callTimeout/i.test(text)) return `query timed out (${grant})`;
	return `query failed (${grant}); check local service availability`;
}
export async function generateReport(ctx: ToolContext, options: ReportOptions = {}): Promise<DatabaseReport> {
	const target = options.target ?? ctx.config.defaultTarget;
	const cfg = ctx.config.targets.find(t => t.name === target);
	if (!cfg || (ctx.pinnedTarget && target !== ctx.pinnedTarget)) throw new Error('Unknown or unpinned target');
	const owner = options.owner ?? cfg.defaultSchema;
	if (!/^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(owner)) throw new Error('Invalid owner');
	if (options.sections?.some(n => !sectionNames.includes(n))) throw new Error(`Unknown report section; choose ${sectionNames.join(', ')}`);
	const selected = options.sections ? new Set(options.sections.flatMap(n => groups[n] ?? [n])) : undefined;
	const report: DatabaseReport = { target, generatedAt: new Date().toISOString(), sections: [] };
	for (const definition of reportQueries.filter(q => !selected || selected.has(q.name))) {
		let query = { sql: definition.sql, source: definition.source, grant: definition.grant, note: definition.note };
		const section: ReportSection = { name: definition.name, status: 'unavailable', source: query.source, columns: [], rows: [], note: '' };
		let session;
		const deadline = performance.now() + Math.min(2, ctx.config.limits.statementTimeoutSeconds) * 1000;
		try {
			session = await ctx.sessions.get(target);
			const execute = async () => {
				const sql = classifySql(query.sql);
				const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool: `report:${definition.name}`, sqlSha256: createHash('sha256').update(sql).digest('hex') };
				try {
					const timeoutSeconds = Math.min(ctx.config.limits.statementTimeoutSeconds, Math.max(1, Math.floor((deadline - performance.now()) / 1000)));
					if (performance.now() >= deadline) throw new Error('query call timeout');
					const n = Math.min(definition.limit ?? 100, ctx.config.limits.maxRows);
					const result = await session!.query(sql, { n, ...(definition.owner ? { owner: owner.toUpperCase() } : {}) }, { maxRows: n, timeoutSeconds });
					await ctx.audit.record({ ...base, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
					return result;
				} catch (error) {
					await ctx.audit.record({ ...base, kind: 'tool_error', detail: 'ReportQueryError' });
					throw error;
				}
			};
			let result;
			try { result = await execute(); }
			catch (error) {
				if (!/ORA-00942/.test(String(error)) || !definition.fallback) throw error;
				query = { ...definition.fallback, note: definition.fallback.note };
				result = await execute();
			}
			Object.assign(section, { status: 'ok', source: query.source, columns: result.columns, rows: result.rows, note: [query.note, definition.owner ? `Owner: ${owner.toUpperCase()}.` : '', result.truncated ? 'Row limit reached; more rows exist.' : result.rows.length >= Math.min(definition.limit ?? 100, ctx.config.limits.maxRows) && definition.name !== 'identity' ? 'Row limit reached; additional matching rows may exist.' : ''].filter(Boolean).join(' ') });
		} catch (error) { if (error instanceof UnsupportedVersionError) throw error; section.source = query.source; section.note = `not available: ${safeReason(error, query.grant)}`; }
		finally {
			try { await session?.close(); }
			catch { section.note += ' Session cleanup failed; check local service availability.'; }
		}
		report.sections.push(section);
	}
	return report;
}
const cell = (value: unknown): string => String(value === null || value === undefined ? 'NULL' : value instanceof Date ? value.toISOString() : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
export function renderMarkdown(report: DatabaseReport): string {
	return [`# Oracle 19c report: ${cell(report.target)}`, `Generated: ${report.generatedAt}`, ...report.sections.map(s => [`## ${s.name}`, `Source: ${s.source}`, s.note, ...(s.status === 'ok' ? s.rows.length ? [`| ${s.columns.map(cell).join(' | ')} |`, `| ${s.columns.map(() => '---').join(' | ')} |`, ...s.rows.map(r => `| ${r.map(cell).join(' | ')} |`)] : ['No matching rows.'] : [])].filter(Boolean).join('\n\n'))].join('\n\n') + '\n';
}
