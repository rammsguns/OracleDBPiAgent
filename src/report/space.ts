import { createHash } from 'node:crypto';
import type { OracleSession, ToolContext } from '../contracts.js';
import { readSpaceUsage, type SpaceOptions } from '../space/index.js';
import type { DatabaseReport, ReportSection } from './index.js';

/** Audit the existing reader without introducing SQL or exposing driver errors. */
export async function readAuditedSpace(ctx: ToolContext, target: string, options: SpaceOptions = {}, tool = 'report:space') {
	const raw = await ctx.sessions.get(target);
	const session: OracleSession = { ...raw, target: raw.target, identity: raw.identity, close: () => raw.close(), query: async (sql, binds, limits) => {
		const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool, sqlSha256: createHash('sha256').update(sql).digest('hex') };
		try {
			const result = await raw.query(sql, binds, limits);
			await ctx.audit.record({ ...base, kind: 'tool_call', rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
			return result;
		} catch (error) { await ctx.audit.record({ ...base, kind: 'tool_error', detail: 'SpaceReadError' }); throw error; }
	} };
	try { return await readSpaceUsage(session, options); } finally { await raw.close(); }
}
export interface SpacePoint { generatedAt: string; value: number }
export interface SpaceFit { status: 'not enough history' | 'not growing' | 'growing'; bytesPerDay: number | null; daysToFull: number | null }
/** Centered least squares in days. Space gauges remain comparable across instance restarts. */
export function fitSpaceGrowth(points: SpacePoint[], maxBytes: number): SpaceFit {
	const insufficient: SpaceFit = { status: 'not enough history', bytesPerDay: null, daysToFull: null };
	if (!Number.isFinite(maxBytes) || maxBytes <= 0 || points.some(p => !Number.isFinite(Date.parse(p.generatedAt)) || !Number.isFinite(p.value) || p.value < 0)) return insufficient;
	const sorted = [...points].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
	if (sorted.length < 3 || new Set(sorted.map(p => Date.parse(p.generatedAt))).size !== sorted.length) return insufficient;
	const origin = Date.parse(sorted[0]!.generatedAt), xs = sorted.map(p => (Date.parse(p.generatedAt) - origin) / 86400000);
	if (xs.at(-1)! < 1) return insufficient;
	const meanX = xs.reduce((a, b) => a + b, 0) / xs.length, meanY = sorted.reduce((a, p) => a + p.value, 0) / sorted.length;
	const slope = xs.reduce((sum, x, i) => sum + (x - meanX) * (sorted[i]!.value - meanY), 0) / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
	if (!Number.isFinite(slope)) return insufficient;
	return slope <= 0 ? { status: 'not growing', bytesPerDay: slope, daysToFull: null } : { status: 'growing', bytesPerDay: slope, daysToFull: Math.max(0, maxBytes - sorted.at(-1)!.value) / slope };
}
export function spaceMetrics(section: ReportSection | undefined) {
	if (section?.status !== 'ok' || section.source !== 'readSpaceUsage' || !['METRIC', 'NAME', 'VALUE', 'MAX_BYTES', 'STATUS'].every(c => section.columns.includes(c))) return [];
	return section.rows.map(row => Object.fromEntries(section.columns.map((c, i) => [c, row[i]]))).filter(r => r.STATUS === 'ok' && typeof r.VALUE === 'number' && Number.isFinite(r.VALUE) && r.VALUE >= 0);
}
export function spaceHistoryPoints(reports: DatabaseReport[], metric: string, name: string, maxBytes?: number): SpacePoint[] {
	// Use only the latest contiguous compatible observations; missing or changed capacity is a boundary.
	const points: SpacePoint[] = [];
	for (const report of [...reports].sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))) {
		const row = spaceMetrics(report.sections.find(s => s.name === 'space')).find(r => r.METRIC === metric && r.NAME === name);
		if (!row || maxBytes !== undefined && row.MAX_BYTES !== maxBytes) break;
		points.unshift({ generatedAt: report.generatedAt, value: Number(row.VALUE) });
	}
	return points;
}
export async function readReportSpace(ctx: ToolContext, target: string, history: DatabaseReport[] = []): Promise<ReportSection> {
	const data = await readAuditedSpace(ctx, target);
	const rows: unknown[][] = [];
	for (const [id, section] of Object.entries(data.sections)) {
		const complete = section.status === 'ok' && ![section.evidence, ...section.supportingEvidence].some(e => e.truncated || e.status !== 'ok');
		const status = complete ? 'ok' : 'unavailable';
		if (id === 'tablespaces') for (const t of data.sections.tablespaces.rows) rows.push(['tablespace', t.name, t.usedBytes, t.maxBytes, status, null, null, 'not enough history']);
		if (id === 'temp') for (const t of section.rows) if ('kind' in t && t.kind === 'Usage') rows.push(['temp', t.tablespace, t.usedBytes, null, status, null, null, null]);
		if (id === 'recovery') for (const t of section.rows) if ('kind' in t && t.kind === 'Area') rows.push(['fra', 'FRA', t.usedBytes, t.limitBytes, status, null, null, null]);
		if (!complete || !section.rows.length) rows.push([id, null, null, null, status, null, null, section.note ?? null]);
	}
	const result: ReportSection = { name: 'space', status: data.status === 'failed' ? 'unavailable' : 'ok', source: 'readSpaceUsage', columns: ['METRIC', 'NAME', 'VALUE', 'MAX_BYTES', 'STATUS', 'BYTES_PER_DAY', 'DAYS_TO_FULL', 'FORECAST'], rows, note: 'JSON values are raw bytes; Markdown uses binary units (KiB, MiB, GiB, TiB). Days to autoextend maximum use a linear least-squares fit over at least 3 observations spanning 24 hours. Space gauges do not reset on instance restart. Snapshot is a sequence of reads. ' + data.findings.map(f => `${f.severity}: ${f.subject}: ${f.detail} ${f.advice}`).join(' ') };
	const current: DatabaseReport = { target, generatedAt: data.capturedAt, sections: [result] };
	for (const row of rows) if (row[0] === 'tablespace' && row[4] === 'ok') {
		const fit = fitSpaceGrowth(spaceHistoryPoints([...history.filter(r => Date.parse(r.generatedAt) < Date.parse(current.generatedAt)), current], 'tablespace', String(row[1]), Number(row[3])), Number(row[3]));
		row[5] = fit.bytesPerDay; row[6] = fit.daysToFull; row[7] = fit.status;
	}
	return result;
}
