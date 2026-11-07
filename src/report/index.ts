import { validateReportSections } from './arguments.js';
export { sectionNames } from './arguments.js';
import { readFeatureReport } from './features.js';
import { formatBytes } from '../space/index.js';
import { readReportSpace } from './space.js';
import { readReportSessions } from './sessions.js';
import { createHash } from 'node:crypto';
import { UnsupportedVersionError } from '../contracts.js';
import type { ToolContext } from '../contracts.js';
import { classifySql } from '../oracle/sqlPolicy.js';
import { readReportSecurity, securitySection } from './security.js';
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
export interface ReportOptions { target?: string; owner?: string; sections?: string[]; historyDirectory?: string }
const groups: Record<string, string[]> = { backups: ['backups', 'archive_switches'], scheduler_jobs: ['scheduler_jobs', 'scheduler_failures'], index_health: ['index_health', 'index_partitions', 'index_subpartitions'] };
/** Deliberately allowlisted diagnostics, matching the CLI's suppression of raw driver errors. */
function safeReason(error: unknown, grant: string): string {
	const text = String(error);
	if (/ORA-65040/.test(text)) return `operation not supported in a PDB (${grant})`;
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
	validateReportSections(options.sections);
	const selected = options.sections ? new Set(options.sections.flatMap(n => groups[n] ?? [n])) : undefined;
	const report: DatabaseReport = { target, generatedAt: new Date().toISOString(), sections: [] };
	for (const definition of reportQueries.filter(q => !selected || selected.has(q.name))) {
		let query = { sql: definition.sql, source: definition.source, grant: definition.grant, note: definition.note };
		const section: ReportSection = { name: definition.name, status: 'unavailable', source: query.source, columns: [], rows: [], note: '' };
		let session;
		const deadline = performance.now() + Math.min(2, ctx.config.limits.statementTimeoutSeconds) * 1000;
		try {
			session = await ctx.sessions.get(target);
			if (session.identity?.isCdb) {
				const container = session.identity.containerName ?? 'current PDB';
				query.note = [query.note, `Container: ${container}.`, /V\$(?:RMAN|ARCHIVED_LOG|LOG_HISTORY)/i.test(query.source) ? 'CDB-wide backup/redo metadata; not evidence of PDB recoverability. Empty rows do not establish absence.' : 'Evidence visible in the current PDB; does not describe other containers.'].filter(Boolean).join(' ');
			}
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
				if (!/ORA-00942|ORA-01031/.test(String(error)) || !definition.fallback) throw error;
				query = { ...definition.fallback, note: [definition.fallback.note, session!.identity?.isCdb ? 'Current PDB visibility; backup/redo metadata is CDB-wide where available; empty rows do not establish absence.' : ''].filter(Boolean).join(' ') };
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
	if (selected?.has('security')) {
		try { report.sections.push(securitySection(await readReportSecurity(ctx, target, 'report:security'))); }
		catch (error) {
			if (error instanceof UnsupportedVersionError) throw error;
			report.sections.push({ name: 'security', status: 'unavailable', source: 'readSecurityPosture', columns: [], rows: [], note: `not available: ${safeReason(error, 'security metadata')}` });
		}
	}
	if (selected?.has('sessions')) {
		try { report.sections.push(await readReportSessions(ctx, target)); }
		catch (error) {
			if (error instanceof UnsupportedVersionError) throw error;
			report.sections.push({ name: 'sessions', status: 'unavailable', source: 'readSessionActivity', columns: [], rows: [], note: `not available: ${safeReason(error, 'sessions metadata')}` });
		}
	}
	if (selected?.has('space')) {
		try {
			const { loadReportHistory, reportDirectory } = await import('./history.js');
			const history = await loadReportHistory(options.historyDirectory ?? reportDirectory(), target, ctx.config.targets);
			report.sections.push(await readReportSpace(ctx, target, history.reports));
		} catch (error) {
			if (error instanceof UnsupportedVersionError) throw error;
			report.sections.push({ name: 'space', status: 'unavailable', source: 'readSpaceUsage', columns: [], rows: [], note: `not available: ${safeReason(error, 'space metadata or saved history')}` });
		}
	}
	for (const name of ['backup', 'jobs'] as const) if (selected?.has(name)) {
		try { report.sections.push(await readFeatureReport(ctx, target, name)); }
		catch (error) {
			if (error instanceof UnsupportedVersionError) throw error;
			report.sections.push({ name, status: 'unavailable', source: name === 'backup' ? 'readBackup' : 'readJobs', columns: [], rows: [], note: `not available: ${safeReason(error, name + ' metadata')}` });
		}
	}
	return report;
}
const cell = (value: unknown): string => String(value === null || value === undefined ? 'NULL' : value instanceof Date ? value.toISOString() : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
export function renderMarkdown(report: DatabaseReport): string {
	const sections = report.sections.map(s => {
		const blocks = [`## ${s.name}`, `Source: ${s.source}`, s.note];
		if (s.status === 'ok' || ['security', 'backup', 'jobs'].includes(s.name) && s.rows.length > 0) {
			if (s.rows.length) {
				const lines = [
					`| ${s.columns.map(cell).join(' | ')} |`,
					`| ${s.columns.map(() => '---').join(' | ')} |`,
					...s.rows.map(r => `| ${r.map((v, i) => cell(s.name === 'space' && ['VALUE', 'MAX_BYTES', 'BYTES_PER_DAY'].includes(s.columns[i]!) && typeof v === 'number' ? formatBytes(v) + (s.columns[i] === 'BYTES_PER_DAY' ? '/day' : '') : v)).join(' | ')} |`),
				];
				// A table is one Markdown block; only paragraphs get blank lines.
				blocks.push(lines.join('\n'));
			} else blocks.push('No matching rows.');
		}
		return blocks.filter(Boolean).join('\n\n');
	});
	return [`# Oracle 19c report: ${cell(report.target)}`, `Generated: ${report.generatedAt}`, ...sections].join('\n\n') + '\n';
}
