import { validateLogTables } from '../config/logTables.js';
import type { ToolContext } from '../contracts.js';
import { Dictionary, identifier, objectName, redact, type SourceRow } from '../plsql/dictionary.js';
import { routines } from '../plsql/analysis.js';
import { renderMermaid, type PlsqlGraph } from '../plsql/diagram.js';
import { parseIssue, sinceHours, type Frame } from './parse.js';
import { errorGuide } from './guide.js';
import { TriageReader, displaySql, type Check } from './read.js';
export { parseIssue, sinceHours } from './parse.js';
export interface TriageOptions { target: string; issue?: string; since?: string }
export interface Excerpt { object: string; line: number; subprogram: string; statement: string; source: SourceRow[]; status: string; view: string; truncated: boolean; attempts: { view: string; code: string }[] }
export interface Hypothesis { rank: number; title: string; evidence: string[] }
const asText = (v: unknown) => v == null ? '' : String(v);
const unique = <T>(items: T[]) => [...new Set(items)];
export async function triageIssue(ctx: ToolContext, options: TriageOptions) {
	const target = ctx.config.targets.find(t => t.name === options.target);
	if (!target || (ctx.pinnedTarget && ctx.pinnedTarget !== target.name)) throw new Error('Unknown or unpinned triage target');
	const hours = sinceHours(options.since), reader = new TriageReader(ctx, target.name), dictionary = new Dictionary(ctx, target.name);
	const parsed = parseIssue(options.issue ?? '');
	parsed.objects = unique([...parsed.objects, ...parsed.unqualifiedObjects.map(n => `${target.defaultSchema}.${n}`)]);
	const jobNames = unique([...parsed.jobs, ...parsed.objects.map(o => objectName(o).name)]);
	const jobPredicates = jobNames.map((_, i) => `JOB_NAME = :job${i}`);
	const jobBinds = Object.fromEntries(jobNames.map((name, i) => [`job${i}`, name]));
	// Look up named jobs first. For a source object, dictionary.jobs finds lexical job_action references.
	const namedJobs = await reader.read('Named scheduler job actions', 'SCHEDULER_JOBS', 'OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION', `WHERE ${jobPredicates.length ? '(' + jobPredicates.join(' OR ') + ')' : '1 = 0'} ORDER BY OWNER, JOB_NAME`, jobBinds, 16);
	const jobs = { ...namedJobs, rows: [...namedJobs.rows], attempts: [...namedJobs.attempts] };
	for (const object of parsed.objects) {
		const { owner, name } = objectName(object);
		const implicated = await dictionary.jobs(owner, name);
		for (const job of implicated.rows) if (!jobs.rows.some(r => r[0] === job.owner && r[1] === job.name)) {
			if (jobs.rows.length < 16) jobs.rows.push([job.owner, job.name, job.type, job.action]); else jobs.truncated = true;
		}
		reader.checks.push({ label: `Jobs referencing ${owner}.${name} (lexical heuristic)`, sql: `SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM ${implicated.view} WHERE INSTR(UPPER(JOB_ACTION), :name) > 0 ORDER BY OWNER, JOB_NAME`, binds: { name }, status: implicated.status, view: implicated.view, columns: ['OWNER', 'JOB_NAME', 'JOB_TYPE', 'JOB_ACTION'], rows: implicated.rows.slice(0, 16).map(j => [j.owner, j.name, j.type, j.action]), truncated: implicated.truncated || implicated.rows.length > 16, attempts: implicated.attempts });
		if (implicated.status === 'unavailable') jobs.attempts.push(...implicated.attempts);
	}
	const runPredicates = jobs.rows.map((_, i) => `(OWNER = :owner${i} AND JOB_NAME = :job${i})`);
	const runBinds: Record<string, unknown> = { hours };
	for (const [i, name] of jobNames.entries()) { runPredicates.push(`JOB_NAME = :namedJob${i}`); runBinds[`namedJob${i}`] = name; }
	jobs.rows.forEach((r, i) => { runBinds[`owner${i}`] = identifier(asText(r[0])); runBinds[`job${i}`] = identifier(asText(r[1])); });
	const runs = await reader.read('Scheduler run history in window', 'SCHEDULER_JOB_RUN_DETAILS', 'OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO', `WHERE ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')${runPredicates.length ? ' AND (' + runPredicates.join(' OR ') + ')' : options.issue ? ' AND 1 = 0' : " AND STATUS = 'FAILED'"} ORDER BY ACTUAL_START_DATE DESC`, runBinds, 30);
	const combined = parseIssue([options.issue ?? '', ...runs.rows.map(r => `${Number(r[3]) ? `ORA-${String(r[3]).padStart(5, '0')}` : ''} ${asText(r[5])}`)].join('\n'));
	const owners = unique([...parsed.objects.map(o => objectName(o).owner), ...combined.frames.flatMap(f => f.owner ? [f.owner] : []), ...jobs.rows.map(r => asText(r[0])), ...runs.rows.map(r => asText(r[0]))]);
	if (!owners.length) owners.push(target.defaultSchema);
	const excerpts: Excerpt[] = [];
	const sourceCache = new Map<string, Awaited<ReturnType<Dictionary['source']>>>();
	const frames = unique(combined.frames.map(f => JSON.stringify(f))).map(f => JSON.parse(f) as Frame);
	for (const frame of frames) {
		if (frame.owner && frame.name) {
			const key = `${frame.owner}.${frame.name}`;
			let source = sourceCache.get(key);
			if (!source) { source = await dictionary.source(frame.owner, frame.name); sourceCache.set(key, source); }
			const body = source.rows.filter(r => /BODY|PROCEDURE|FUNCTION|TRIGGER/.test(r.type));
			const candidates = body.length ? body : source.rows;
			const routine = routines(candidates).filter(r => r.range && r.range.startLine <= frame.line && r.range.endLine >= frame.line).sort((a, b) => (a.range!.endLine - a.range!.startLine) - (b.range!.endLine - b.range!.startLine))[0];
			const type = routine?.type ?? candidates.find(r => r.line === frame.line)?.type;
			const rows = candidates.filter(r => r.type === type);
			excerpts.push({ object: `${frame.owner}.${frame.name}`, line: frame.line, subprogram: routine?.name ?? 'unavailable (range unresolved)', statement: statementAt(rows, frame.line), source: rows.filter(r => Math.abs(r.line - frame.line) <= 8), status: source.status, view: source.view, truncated: source.truncated, attempts: source.attempts });
			reader.checks.push({ label: `Source around ${frame.owner}.${frame.name} line ${frame.line} (from bounded dictionary source)`, sql: `SELECT TYPE, LINE, TEXT FROM ${source.view} WHERE OWNER = :owner AND NAME = :name AND LINE BETWEEN :startLine AND :endLine ORDER BY TYPE, LINE`, binds: { owner: frame.owner, name: frame.name, startLine: Math.max(1, frame.line - 8), endLine: frame.line + 8 }, status: source.status, view: source.view, columns: ['TYPE', 'LINE', 'TEXT'], rows: [], truncated: source.truncated, attempts: source.attempts });
		} else {
			const anonymousJobs = jobs.rows.filter(r => asText(r[2]) === 'PLSQL_BLOCK');
			for (const run of runs.rows) if (!jobs.rows.some(j => j[0] === run[0] && j[1] === run[1]) && !excerpts.some(e => e.object === `${run[0]}.${run[1]}` && e.line === frame.line)) {
				excerpts.push({ object: `${run[0]}.${run[1]}`, line: frame.line, subprogram: 'anonymous stack frame (job_action unavailable)', statement: 'unavailable: job no longer visible in scheduler jobs', source: [], status: 'unavailable', view: jobs.view, truncated: false, attempts: jobs.attempts });
			}
			for (const job of anonymousJobs) {
				const lines = asText(job[3]).split(/\r?\n/).slice(0, 2000).map((text, i) => ({ type: 'JOB_ACTION', line: i + 1, text }));
				excerpts.push({ object: `${job[0]}.${job[1]}`, line: frame.line, subprogram: 'anonymous block (job_action)', statement: statementAt(lines, frame.line), source: lines.filter(r => Math.abs(r.line - frame.line) <= 8), status: 'ok', view: jobs.view, truncated: asText(job[3]).split('\n').length > 2000, attempts: jobs.attempts });
			}
		}
	}
	for (const owner of owners.slice(0, 16)) {
		await reader.read(`Compile errors in ${owner}`, 'ERRORS', 'OWNER, NAME, TYPE, LINE, POSITION, TEXT', 'WHERE OWNER = :owner ORDER BY NAME, TYPE, SEQUENCE', { owner: identifier(owner) });
		await reader.read(`Invalid objects in ${owner}`, 'OBJECTS', 'OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, LAST_DDL_TIME', "WHERE OWNER = :owner AND STATUS = 'INVALID' ORDER BY OBJECT_NAME, OBJECT_TYPE", { owner });
		await reader.read(`Candidate log tables in ${owner} (listed only)`, 'TABLES', 'OWNER, TABLE_NAME', "WHERE OWNER = :owner AND (TABLE_NAME LIKE '%LOG%' OR TABLE_NAME LIKE '%ERROR%') ORDER BY TABLE_NAME", { owner });
	}
	const constraints: Check[] = [];
	if (combined.codes.some(c => ['ORA-00001', 'ORA-02291', 'ORA-02292'].includes(c))) {
		for (const match of [options.issue ?? '', ...runs.rows.map(r => asText(r[5]))].join('\n').toUpperCase().matchAll(/\(([A-Z][A-Z0-9_$#]*)\.([A-Z][A-Z0-9_$#]*)\)/g)) {
			const owner = identifier(match[1]!), name = identifier(match[2]!);
			if (constraints.some(c => c.binds.owner === owner && c.binds.name === name)) continue;
			const constraint = await reader.read(`Constraint ${owner}.${name}`, 'CONSTRAINTS', 'OWNER, CONSTRAINT_NAME, CONSTRAINT_TYPE, TABLE_NAME, R_OWNER, R_CONSTRAINT_NAME, DELETE_RULE, STATUS', 'WHERE OWNER = :owner AND CONSTRAINT_NAME = :name', { owner, name });
			constraints.push(constraint);
			for (const row of constraint.rows) {
				await columns(reader, owner, name);
				const parentOwner = asText(row[4]) || owner, parentName = asText(row[5]) || name;
				await reader.read(`Parent/key table for ${owner}.${name}`, 'CONSTRAINTS', 'OWNER, CONSTRAINT_NAME, TABLE_NAME, CONSTRAINT_TYPE', 'WHERE OWNER = :owner AND CONSTRAINT_NAME = :name', { owner: parentOwner, name: parentName });
				await columns(reader, parentOwner, parentName);
				// Enumerate every visible child FK, across owners, rather than just the failing FK.
				let afterOwner = '', afterName = '', more = true, count = 0;
				while (more && count < 2000) {
					const children = await reader.read(`All visible child foreign keys referencing ${parentOwner}.${parentName}${afterOwner ? ' (continued)' : ''}`, 'CONSTRAINTS', 'OWNER, CONSTRAINT_NAME, TABLE_NAME, R_OWNER, R_CONSTRAINT_NAME, DELETE_RULE, STATUS', `WHERE CONSTRAINT_TYPE = 'R' AND R_OWNER = :owner AND R_CONSTRAINT_NAME = :name${afterOwner ? ' AND (OWNER > :afterOwner OR (OWNER = :afterOwner AND CONSTRAINT_NAME > :afterName))' : ''} ORDER BY OWNER, CONSTRAINT_NAME`, { owner: parentOwner, name: parentName, ...(afterOwner ? { afterOwner, afterName } : {}) }, Math.min(200, 2000 - count));
					for (const child of children.rows) await columns(reader, asText(child[0]), asText(child[1]));
					count += children.rows.length;
					const last = children.rows.at(-1); more = children.truncated && !!last;
					if (last) { afterOwner = asText(last[0]); afterName = asText(last[1]); }
				}
			}
		}
	}
	for (const log of target.logTables ?? []) {
		// Configuration is revalidated here for callers constructing AppConfig directly.
		validateLogTables([log]);
		await reader.query(`Configured log ${log.table}`, [{ view: log.table, sql: `SELECT ${unique([log.timestampColumn, ...log.columns]).join(', ')} FROM ${log.table} WHERE ${log.timestampColumn} >= SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR') ORDER BY ${log.timestampColumn} DESC` }], { hours }, 50);
	}
	const hypotheses: Hypothesis[] = [];
	for (const constraint of constraints.filter(c => c.rows.length)) {
		const row = constraint.rows[0]!;
		const deleting = combined.codes.includes('ORA-02292');
		const preceding = excerpts.flatMap(e => e.source.filter(s => s.line < e.line)).find(s => /DELETE\s+FROM\s+ORDER_LINES/i.test(s.text));
		hypotheses.push({ rank: 0, title: deleting ? 'A child foreign key still references the parent rows being deleted.' : 'A key value violates the resolved constraint.', evidence: [`${constraint.binds.owner}.${constraint.binds.name}: table ${row[0]}.${row[3]}, type ${row[2]}.`, ...excerpts.map(e => `${e.object} line ${e.line} inside ${e.subprogram}: ${e.statement}`), ...(preceding && asText(row[3]) !== 'ORDER_LINES' ? [`Line ${preceding.line} already clears ORDER_LINES; the failing child table ${row[3]} is another reference to old ORDERS rows. Matching row values have not been queried.`] : [])] });
	}
	const clearedExcerpt = excerpts.find(e => /DELETE\s+FROM\s+ORDERS\b/i.test(e.statement) && e.source.some(s => s.line < e.line && /DELETE\s+FROM\s+ORDER_LINES/i.test(s.text)));
	if (combined.codes.includes('ORA-02292') && clearedExcerpt) {
		const clearedLine = clearedExcerpt.source.find(s => s.line < clearedExcerpt.line && /DELETE\s+FROM\s+ORDER_LINES/i.test(s.text))!.line;
		hypotheses.push({ rank: 0, title: 'A child table other than ORDER_LINES may still reference old ORDERS rows (unconfirmed).', evidence: [`Line ${clearedLine} already deletes from ORDER_LINES before the ORDERS delete at line ${clearedExcerpt.line}.`, ...constraints.flatMap(c => c.rows.map(r => `The recorded constraint currently resolves to ${r[0]}.${r[3]}; this does not prove another child table.`)), 'Review all visible child foreign keys. ALL_ fallback can hide other owners; request DBA visibility if needed. Concurrent child inserts or differences between the two DELETE predicates also require investigation.'] });
	}
	for (const excerpt of excerpts.filter(e => /RAISE_APPLICATION_ERROR/i.test(e.statement))) hypotheses.push({ rank: 0, title: 'The application explicitly raises an error from its guard or failure path.', evidence: [`${excerpt.object} ${excerpt.subprogram} line ${excerpt.line}: ${excerpt.statement}`, ...combined.codes.filter(c => /^ORA-20/.test(c))] });
	for (const check of reader.checks.filter(c => /Compile errors|Invalid objects/.test(c.label) && c.rows.length)) hypotheses.push({ rank: 0, title: 'An invalid or uncompilable object may explain the failure; correlate it with the failing call.', evidence: [check.label, ...check.rows.slice(0, 3).map(r => r.join(' | '))] });
	if (!hypotheses.length) hypotheses.push({ rank: 0, title: 'The recorded failure needs correlation with the frame statement and error guide; root cause is unconfirmed.', evidence: [...combined.codes, ...runs.rows.slice(0, 3).map(r => `${r[0]}.${r[1]} ${r[2]} ${r[4]}`), ...excerpts.map(e => `${e.object} line ${e.line}: ${e.statement}`)] });
	hypotheses.forEach((h, i) => { h.rank = i + 1; });
	const graph: PlsqlGraph = { nodes: [], edges: [] };
	const node = (id: string, kind: PlsqlGraph['nodes'][number]['kind'], label: string) => { if (!graph.nodes.some(n => n.id === id)) graph.nodes.push({ id, kind, label }); return id; };
	const edge = (from: string, to: string, heuristic = true) => graph.edges.push({ from, to, kind: 'references', heuristic });
	for (const excerpt of excerpts) {
		const frame = node(`frame:${excerpt.object}:${excerpt.line}`, 'subprogram', `${excerpt.object}.${excerpt.subprogram} line ${excerpt.line}`);
		const statement = node(`statement:${excerpt.object}:${excerpt.line}`, 'object', excerpt.statement || 'Statement unavailable'); edge(frame, statement, false);
		for (const job of jobs.rows) edge(node(`job:${job[0]}.${job[1]}`, 'job', `${job[0]}.${job[1]}`), frame);
		for (const c of constraints) for (const r of c.rows) {
			const table = node(`table:${r[0]}.${r[3]}`, 'table', `${r[0]}.${r[3]}`);
			const constraint = node(`constraint:${r[0]}.${r[1]}`, 'object', `${r[0]}.${r[1]}`);
			edge(table, constraint, false);
			const parent = reader.checks.find(check => check.label === `Parent/key table for ${r[0]}.${r[1]}`)?.rows[0];
			if (parent) { const parentTable = node(`table:${parent[0]}.${parent[2]}`, 'table', `${parent[0]}.${parent[2]}`); edge(statement, parentTable); edge(constraint, parentTable, false); }
			else edge(statement, table);
		}

	}
	graph.edges = [...new Map(graph.edges.map(e => [JSON.stringify(e), e])).values()];
	return { schemaVersion: 1 as const, target: target.name, since: options.since ?? '24h', issue: parsed, codes: combined.codes, times: unique([...parsed.times, ...combined.times]), hypotheses, excerpts, checks: reader.checks, guide: combined.codes.flatMap(c => errorGuide(c) ?? []), graph, mermaid: renderMermaid(graph) };
}
async function columns(reader: TriageReader, owner: string, name: string) {
	const existing = reader.checks.find(c => c.label === `Columns for ${owner}.${name}`); if (existing) return existing;
	return reader.read(`Columns for ${owner}.${name}`, 'CONS_COLUMNS', 'OWNER, CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, POSITION', 'WHERE OWNER = :owner AND CONSTRAINT_NAME = :name ORDER BY POSITION', { owner: identifier(owner), name: identifier(name) });
}
/** Statement containing the frame, bounded by source and semicolons (lexical heuristic). */
export function statementAt(rows: SourceRow[], line: number): string {
	const index = rows.findIndex(r => r.line === line); if (index < 0) return 'unavailable';
	let start = index, end = index;
	while (start > 0 && !/[;]|\bBEGIN\b/i.test(rows[start - 1]!.text) && index - start < 8) start--;
	while (end < rows.length - 1 && !rows[end]!.text.includes(';') && end - index < 8) end++;
	return rows.slice(start, end + 1).map(r => r.text.trim()).join(' ').trim();
}
export type TriageIssue = Awaited<ReturnType<typeof triageIssue>>;
export async function triage(ctx: ToolContext, options: TriageOptions) {
	if (options.issue?.trim()) return { target: options.target, issues: [await triageIssue(ctx, options)], scan: null };
	if (!ctx.config.targets.some(t => t.name === options.target) || (ctx.pinnedTarget && ctx.pinnedTarget !== options.target)) throw new Error('Unknown or unpinned triage target');
	const reader = new TriageReader(ctx, options.target), hours = sinceHours(options.since);
	const failures = await reader.read('Recent failed job runs', 'SCHEDULER_JOB_RUN_DETAILS', 'OWNER, JOB_NAME, ERROR#, ADDITIONAL_INFO, ACTUAL_START_DATE', "WHERE STATUS = 'FAILED' AND ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR') ORDER BY ACTUAL_START_DATE DESC", { hours }, 10);
	const errors = await reader.query('Recent compile errors', ['DBA', 'ALL'].map(p => ({ view: `${p}_ERRORS`, sql: `SELECT e.OWNER, e.NAME, e.LINE, e.TEXT FROM ${p}_ERRORS e WHERE EXISTS (SELECT 1 FROM ${p}_OBJECTS o WHERE o.OWNER = e.OWNER AND o.OBJECT_NAME = e.NAME AND o.LAST_DDL_TIME >= SYSDATE - :hours / 24) ORDER BY e.OWNER, e.NAME, e.SEQUENCE` })), { hours }, 10);
	const invalid = await reader.read('Recent invalid objects', 'OBJECTS', 'OWNER, OBJECT_NAME, OBJECT_TYPE', "WHERE STATUS = 'INVALID' AND LAST_DDL_TIME >= SYSDATE - :hours / 24 ORDER BY LAST_DDL_TIME DESC", { hours }, 10);
	const seeds = unique([...failures.rows.map(r => `${r[0]}.${r[1]} ORA-${String(r[2]).padStart(5, '0')} ${r[3]}`), ...errors.rows.map(r => `${r[0]}.${r[1]} ${r[3]}\nORA-06512: at "${r[0]}.${r[1]}", line ${r[2]}`), ...invalid.rows.map(r => `${r[0]}.${r[1]} invalid ${r[2]}`)]);
	const issues: TriageIssue[] = [];
	for (const issue of seeds.slice(0, 10)) issues.push(await triageIssue(ctx, { ...options, issue }));
	return { target: options.target, issues, scan: { checks: reader.checks, cap: 10, truncated: seeds.length > 10 || reader.checks.some(c => c.truncated) } };
}
export type TriageResult = Awaited<ReturnType<typeof triage>>;
const safe = (v: unknown) => asText(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, 'ˋ').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const block = (language: string, value: string) => '```' + language + '\n' + value.replace(/`/g, 'ˋ') + '\n```';
export function renderTriageMarkdown(result: TriageResult): string {
	return [`# Issue triage: ${safe(result.target)}`, 'Read-only evidence. Hypotheses are ranked diagnostic leads, not proof. Source and job literals are redacted; graph call associations and statement ranges are heuristic.', ...(result.scan ? [`Scan cap: ${result.scan.cap}; ${result.scan.truncated ? 'partial' : 'complete within visible window'}.`, ...result.scan.checks.map(c => `${safe(c.label)}: ${c.status}; ${safe(c.view)} ${c.attempts.map(a => a.code).join(', ')} (${c.rows.length} rows)`)] : []), ...result.issues.map((issue, i) => [
		`## Issue ${i + 1}`, safe(issue.issue.text), `Window: ${safe(issue.since)}. Codes: ${issue.codes.join(', ')}. Reported times: ${issue.times.map(safe).join(', ') || 'none'}.`,
		'### Ranked hypotheses', ...issue.hypotheses.map(h => `${h.rank}. ${safe(h.title)}\n\n${h.evidence.map(e => '- ' + safe(e)).join('\n')}`),
		'### Frame excerpts', ...issue.excerpts.map(e => `${safe(e.object)} line ${e.line} inside ${safe(e.subprogram)}; ${e.status}; ${safe(e.view)}${e.truncated ? '; source cap reached' : ''}${e.attempts.map(a => `; ${a.view} ${a.code}`).join('')}.\n\nStatement (heuristic): ${safe(e.statement)}\n\n${block('plsql', e.source.map(s => `${s.line}: ${s.text.trimEnd()}`).join('\n'))}`),
		'### Evidence', ...issue.checks.map(c => `${safe(c.label)}: ${c.status}; ${safe(c.view)}${c.truncated ? '; row cap reached (partial)' : ''}${c.attempts.map(a => `; ${a.view} ${a.code}`).join('')}\n\n${c.rows.length ? '| ' + c.columns.map(safe).join(' | ') + ' |\n| ' + c.columns.map(() => '---').join(' | ') + ' |\n' + c.rows.map(r => '| ' + r.map(safe).join(' | ') + ' |').join('\n') : c.label.startsWith('Source around') ? 'See the redacted frame excerpt above; source was collected through the bounded dictionary reader.' : 'No rows returned; absence is limited to visible evidence.'}`),
		'### Local error guide', ...issue.guide.map(g => `${g.code}: ${g.meaning}. Typical causes: ${g.causes} Read-only checks: ${g.checks}`),
		'### Numbered debug checklist', ...issue.checks.map((c, n) => `${n + 1}. ${safe(c.label)}. Review the rows above and correlate keys and timestamps.\n\n${block('sql', displaySql(c))}`),
		'### Trace diagram', block('mermaid', issue.mermaid),
	].join('\n\n'))].join('\n\n') + '\n';
}
