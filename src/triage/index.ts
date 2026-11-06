import { collectSessions, needsSessions, sessionHypotheses, sessionWaitContext } from './sessions.js';
import { renderSessionsMarkdown } from '../sessions/index.js';
import { formatIncidentStatus } from '../alertlog/index.js';
import { collectSql, sqlHypotheses, type TriageSql } from './sqlperf.js';
import { renderSqlInsightMarkdown } from '../sqlperf/index.js';
import { collectAlerts, alertHypotheses, mergeAlerts, discoverAlertJobs, alertSuggestions } from './alerts.js';
export type { TriageAlertLog } from './alerts.js';
import { nameCandidates, lookupNames } from './names.js';
import { collectRunHistory, scopeName, type RunScope } from './history.js';
import { diagnosePredicates } from './diagnose.js';
import { redactCredentials } from './redact.js';
import { validateLogTables } from '../config/logTables.js';
import type { ToolContext } from '../contracts.js';
import { Dictionary, identifier, objectName, type SourceRow } from '../plsql/dictionary.js';
import { routines } from '../plsql/analysis.js';
import { renderMermaid, type PlsqlGraph } from '../plsql/diagram.js';
import { parseIssue, sinceHours, type Frame } from './parse.js';
import { errorGuide } from './guide.js';
import { TriageReader, displaySql, type Check } from './read.js';
export { parseIssue, sinceHours } from './parse.js';
export interface TriageOptions { target: string; issue?: string; since?: string }
export interface Excerpt { object: string; line: number; subprogram: string; statement: string; source: SourceRow[]; status: string; view: string; truncated: boolean; attempts: { view: string; code: string }[] }
export interface Hypothesis { rank: number; title: string; evidence: string[]; verifyNext?: { sql: string; binds: Record<string, unknown> } }
const asText = (v: unknown) => v == null ? '' : String(v);
const unique = <T>(items: T[]) => [...new Set(items)];
export async function triageIssue(ctx: ToolContext, options: TriageOptions) {
	const target = ctx.config.targets.find(t => t.name === options.target);
	if (!target || (ctx.pinnedTarget && ctx.pinnedTarget !== target.name)) throw new Error('Unknown or unpinned triage target');
	const hours = sinceHours(options.since), reader = new TriageReader(ctx, target.name), dictionary = new Dictionary(ctx, target.name, redactCredentials);
	const parsed = parseIssue(options.issue ?? '');
	const explicitObjects = [...parsed.objects], discoveredObjects: string[] = [];
	const candidates = nameCandidates(options.issue ?? '');
	const matches = await lookupNames(reader, candidates);
	for (const row of matches?.rows ?? []) {
		if (row[1] === 'JOB') parsed.jobs.push(asText(row[3]));
		if (row[1] === 'OBJECT') {
			const qualified = `${identifier(asText(row[2]))}.${identifier(asText(row[3]))}`;
			discoveredObjects.push(qualified);
			parsed.objects.push(qualified);
		}
	}
	const discovery = await discoverAlertJobs(ctx, target.name, hours, options.issue ?? '', !parsed.codes.length && !parsed.jobs.length && !parsed.objects.length && !matches?.rows.length);
	for (const job of discovery.jobs) {
		parsed.jobs.push(job.name);
		discoveredObjects.push(`${job.owner}.${job.name}`);
	}
	const missingNames = candidates.filter((candidate, i) => candidate.reportMissing &&
		!matches?.rows.some(row => Number(row[0]) === i));
	parsed.jobs = unique(parsed.jobs);
	parsed.objects = unique(parsed.objects);
	const jobNames = unique([...parsed.jobs, ...parsed.unqualifiedObjects, ...parsed.objects.map(o => objectName(o).name)]);
	const jobBinds: Record<string, unknown> = {};
	const jobPredicates = jobNames.map((name, i) => {
		jobBinds[`job${i}`] = name;
		const requestedOwners = unique([...explicitObjects, ...discoveredObjects].map(objectName).filter(o => o.name === name).map(o => o.owner));
		const owners = requestedOwners.map((owner, j) => { jobBinds[`namedOwner${i}_${j}`] = owner; return `OWNER = :namedOwner${i}_${j}`; });
		return owners.length ? `(JOB_NAME = :job${i} AND (${owners.join(' OR ')}))` : `JOB_NAME = :job${i}`;
	});
	// Look up named jobs first. For a source object, dictionary.jobs finds lexical job_action references.
	const namedJobs = await reader.read('Named scheduler job actions', 'SCHEDULER_JOBS', 'OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION', `WHERE ${jobPredicates.length ? '(' + jobPredicates.join(' OR ') + ')' : '1 = 0'} ORDER BY OWNER, JOB_NAME`, jobBinds, 16);
	const jobs = { ...namedJobs, rows: [...namedJobs.rows], attempts: [...namedJobs.attempts] };
	const implicatedObjects = new Set<string>();
	for (const object of parsed.objects) {
		const { owner, name } = objectName(object);
		const implicated = await dictionary.jobs(owner, name);
		if (implicated.rows.length) implicatedObjects.add(name);
		for (const job of implicated.rows) if (!jobs.rows.some(r => r[0] === job.owner && r[1] === job.name)) {
			if (jobs.rows.length < 16) jobs.rows.push([job.owner, job.name, job.type, job.action]); else jobs.truncated = true;
		}
		reader.checks.push({ label: `Jobs referencing ${owner}.${name} (lexical heuristic)`, sql: `SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM ${implicated.view} WHERE INSTR(UPPER(JOB_ACTION), :name) > 0 ORDER BY OWNER, JOB_NAME`, binds: { name }, status: implicated.status, view: implicated.view, columns: ['OWNER', 'JOB_NAME', 'JOB_TYPE', 'JOB_ACTION'], rows: implicated.rows.slice(0, 16).map(j => [j.owner, j.name, j.type, j.action]), truncated: implicated.truncated || implicated.rows.length > 16, attempts: implicated.attempts });
		if (implicated.status === 'unavailable') jobs.attempts.push(...implicated.attempts);
	}
	const scopes: RunScope[] = jobs.rows.map(r => ({ owner: asText(r[0]), name: asText(r[1]) }));
	for (const name of jobNames.filter(name => !jobs.rows.some(r => r[1] === name) && !implicatedObjects.has(name))) {
		const qualified = [...parsed.objects, ...discoveredObjects].map(objectName).find(o => o.name === name);
		scopes.push({ name, ...(qualified ? { owner: qualified.owner } : {}) });
	}
	const runs = await collectRunHistory(reader, scopes, hours, options.since ?? '24h');
	const combined = parseIssue([options.issue ?? '', discovery.matchedText, ...runs.rows.map(r => `${Number(r[3]) ? `ORA-${String(r[3]).padStart(5, '0')}` : ''} ${asText(r[5])}`)].join('\n'));
	const owners = unique([...[...explicitObjects, ...discoveredObjects].map(o => objectName(o).owner), ...combined.frames.flatMap(f => f.owner ? [f.owner] : []), ...jobs.rows.map(r => asText(r[0])), ...runs.rows.map(r => asText(r[0]))]);
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
		for (const match of [options.issue ?? '', discovery.matchedText, ...runs.rows.map(r => asText(r[5]))].join('\n').toUpperCase().matchAll(/\(([A-Z][A-Z0-9_$#]*)\.([A-Z][A-Z0-9_$#]*)\)/g)) {
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
	const alertLog = mergeAlerts([discovery.alert, await collectAlerts(ctx, target.name, hours, combined.codes, runs.rows)])!;
	reader.checks.push(...alertLog.checks);
	const sessions = needsSessions(options.issue ?? '') ? await collectSessions(ctx, target.name) : undefined;
	if (sessions) reader.checks.push(...sessions.checks);
	const blockerSql = [];
	for (const id of sessions?.sqlIds ?? []) {
		const evidence = await collectSql(ctx, target.name, id, hours, []);
		blockerSql.push(evidence); reader.checks.push(...evidence.checks);
	}
	const sql = await collectSql(ctx, target.name, options.issue ?? '', hours, parsed.objects);
	reader.checks.push(...sql.checks);
	const diagnosis = await diagnosePredicates(excerpts, sourceCache, constraints, reader, dictionary);
	diagnosis.suggestions.push(...alertSuggestions(alertLog));
	const hypotheses: Hypothesis[] = [...sqlHypotheses(sql), ...diagnosis.hypotheses, ...alertHypotheses(alertLog)];
	for (const constraint of constraints.filter(c => c.rows.length)) {
		const row = constraint.rows[0]!;
		hypotheses.unshift({ rank: 0, title: combined.codes.includes('ORA-02292') ? 'A child foreign key still references the parent rows being deleted.' : 'A key value violates the resolved constraint.', evidence: [`${constraint.binds.owner}.${constraint.binds.name}: table ${row[0]}.${row[3]}, type ${row[2]}.`, ...excerpts.map(e => `${e.object} line ${e.line} inside ${e.subprogram}: ${e.statement}`)] });
	}
	const limitations: string[] = [...runs.notes, ...discovery.jobs.map(j => `${j.owner}.${j.name}: discovered from alert log (ORA-12012).`), ...(discovery.alert.checks.some(c => c.label.startsWith('Recent errors')) ? ['Recent errors in the window, not matched to the issue; no causal association is established.'] : [])];
	for (const candidate of missingNames) {
		limitations.push(`not found: ${candidate.name} - check spelling, owner visibility, or whether it was dropped${matches?.status === 'unavailable' || matches?.truncated ? ' (lookup unavailable or partial)' : ''}`);
	}
	for (const excerpt of excerpts.filter(e => e.subprogram.includes('job_action unavailable'))) {
		limitations.push(`${excerpt.object} has run history but no row in ${jobs.view}: the job was dropped or auto-dropped, or is no longer visible. The exact job type/action, raising condition, source text and historical dependencies cannot be verified.`);
		if (combined.codes.includes('ORA-20001')) hypotheses.push({ rank: 0, title: 'ORA-20001 at anonymous line 1 indicates RAISE_APPLICATION_ERROR in the job’s own PLSQL_BLOCK.', evidence: [`${excerpt.object}: scheduler history reports ORA-20001 and ORA-06512 at line ${excerpt.line}.`, 'This is the anonymous job-block interpretation of the recorded stack; the dropped job_action is unavailable, so the exact call and guard cannot be inspected.'] });
	}
	for (const excerpt of excerpts.filter(e => /RAISE_APPLICATION_ERROR/i.test(e.statement))) hypotheses.push({ rank: 0, title: 'The application explicitly raises an error from its guard or failure path.', evidence: [`${excerpt.object} ${excerpt.subprogram} line ${excerpt.line}: ${excerpt.statement}`, ...combined.codes.filter(c => /^ORA-20/.test(c))] });
	for (const check of reader.checks.filter(c => /Compile errors|Invalid objects/.test(c.label) && c.rows.length)) hypotheses.push({ rank: 0, title: 'An invalid or uncompilable object may explain the failure; correlate it with the failing call.', evidence: [check.label, ...check.rows.slice(0, 3).map(r => r.join(' | '))] });
	if (!hypotheses.length) {
		const evidence = [...combined.codes, ...alertLog.entries.map(r => r.messageText), ...runs.rows.slice(0, 3).map(r => `${r[0]}.${r[1]} ${r[2]} ${r[4]}`), ...excerpts.map(e => `${e.object} line ${e.line}: ${e.statement}`)].filter(e => e.trim());
		if (evidence.length) hypotheses.push({ rank: 0, title: 'The recorded run or error is visible, but the cause is not yet established.', evidence });
		else {
			const searched = reader.checks.filter(c => /scheduler|Compile errors|Invalid objects|Identifier candidate lookup/i.test(c.label));
			const views = unique(searched.flatMap(c => [
				...c.view.split(', ').filter(Boolean),
				...c.attempts.flatMap(a => a.view.split(', ').map(view => `${view} (${a.code})`)),
			]));
			const names = unique([...parsed.jobs, ...parsed.unqualifiedObjects, ...parsed.objects, ...missingNames.map(c => c.name)]);
			hypotheses.push({ rank: 0, title: `No recorded failure was found${names.length ? ' for ' + names.join(', ') : '; no job or object name was recognized'}.`, evidence: [
				`Searched ${views.join(', ')} for ${runs.scopes.map(scopeName).join(', ') || names.join(', ') || 'no recognizable job name'}, in the requested ${options.since ?? '24h'} window and (for named jobs/objects) up to 5 latest runs without a time filter.`,
				`Owner scope for compile errors and invalid objects: ${owners.join(', ')}. No matching run history, compiler errors or invalid objects were returned; unavailable views and caps are listed in the evidence.`,
			] });
			diagnosis.suggestions.push('Try a wider window, for example --since 30d, to inspect more history; the latest-run lookup is limited to 5 rows.', 'Check the spelling and provide OWNER.JOB_NAME or OWNER.OBJECT_NAME to remove owner ambiguity.', 'The job may have been dropped or may belong to an owner this account cannot see; ask the DBA to confirm its owner and retained scheduler history.');
		}
	}
	const sessionLeads = sessionHypotheses(sessions?.activity);
	hypotheses.unshift(...sessionLeads);
	hypotheses.push(...blockerSql.flatMap(sqlHypotheses), ...(!sessionLeads.length ? sessionWaitContext(sessions?.activity) : []));
	for (const hypothesis of hypotheses) hypothesis.evidence = unique([...hypothesis.evidence, ...runs.notes, ...alertLog.correlations.filter(c => c.kind === 'code').flatMap(c => c.entryIndexes.map(i => { const r = alertLog.entries[i]!; return `Alert code match at ${r.timestamp}: ${r.messageText}`; }))]).filter(e => e.trim());
	hypotheses.forEach((h, i) => { h.rank = i + 1; });
	const graph: PlsqlGraph = { nodes: [], edges: [] };
	const node = (id: string, kind: PlsqlGraph['nodes'][number]['kind'], label: string) => { if (!graph.nodes.some(n => n.id === id)) graph.nodes.push({ id, kind, label }); return id; };
	const edge = (from: string, to: string, heuristic = true) => graph.edges.push({ from, to, kind: 'references', heuristic });
	for (const excerpt of excerpts) {
		const frame = node(`frame:${excerpt.object}:${excerpt.line}`, 'subprogram', `${excerpt.object}.${excerpt.subprogram} line ${excerpt.line}`);
		const statement = node(`statement:${excerpt.object}:${excerpt.line}`, 'object', excerpt.statement || 'Statement unavailable'); edge(frame, statement, false);
		const traceJobs = [...new Map([...jobs.rows, ...runs.rows].map(r => [`${r[0]}.${r[1]}`, r])).values()];
		for (const job of traceJobs) edge(node(`job:${job[0]}.${job[1]}`, 'job', `${job[0]}.${job[1]}${jobs.rows.some(j => j[0] === job[0] && j[1] === job[1]) ? '' : ' (historical; current job unavailable)'}`), frame);
		for (const c of constraints) for (const r of c.rows) {
			const table = node(`table:${r[0]}.${r[3]}`, 'table', `${r[0]}.${r[3]}`);
			const constraint = node(`constraint:${r[0]}.${r[1]}`, 'object', `${r[0]}.${r[1]}`);
			edge(table, constraint, false);
			const parent = reader.checks.find(check => check.label === `Parent/key table for ${r[0]}.${r[1]}`)?.rows[0];
			if (parent) { const parentTable = node(`table:${parent[0]}.${parent[2]}`, 'table', `${parent[0]}.${parent[2]}`); edge(statement, parentTable); edge(constraint, parentTable, false); }
			else edge(statement, table);
		}

	}
	for (const correlation of alertLog.correlations) {
		const alert = node('alertlog', 'object', 'Alert log: ' + correlation.label);
		for (const job of runs.rows.filter(r => correlation.kind === 'jobRun' && correlation.label.includes(`${r[0]}.${r[1]} `))) edge(node(`job:${job[0]}.${job[1]}`, 'job', `${job[0]}.${job[1]}`), alert);
	}
	graph.edges = [...new Map(graph.edges.map(e => [JSON.stringify(e), e])).values()];
	return { schemaVersion: 1 as const, target: target.name, since: options.since ?? '24h', issue: parsed, codes: combined.codes, times: unique([...parsed.times, ...combined.times]), hypotheses, suggestions: diagnosis.suggestions, concurrency: diagnosis.concurrency, limitations, excerpts, alertLog, sql, ...(sessions ? { sessions, blockerSql } : {}), checks: reader.checks, guide: combined.codes.flatMap(c => errorGuide(c) ?? []), graph, mermaid: renderMermaid(graph) };
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
	if (options.issue?.trim()) {
		const issue = await triageIssue(ctx, options);
		return { target: options.target, issues: [issue], alertLog: issue.alertLog, scan: null };
	}
	if (!ctx.config.targets.some(t => t.name === options.target) || (ctx.pinnedTarget && ctx.pinnedTarget !== options.target)) throw new Error('Unknown or unpinned triage target');
	const reader = new TriageReader(ctx, options.target), hours = sinceHours(options.since);
	const failures = await reader.read('Recent failed job runs', 'SCHEDULER_JOB_RUN_DETAILS', 'OWNER, JOB_NAME, ERROR#, ADDITIONAL_INFO, ACTUAL_START_DATE', "WHERE STATUS = 'FAILED' AND ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR') ORDER BY ACTUAL_START_DATE DESC", { hours }, 10);
	const errors = await reader.query('Recent compile errors', ['DBA', 'ALL'].map(p => ({ view: `${p}_ERRORS`, sql: `SELECT e.OWNER, e.NAME, e.LINE, e.TEXT FROM ${p}_ERRORS e WHERE EXISTS (SELECT 1 FROM ${p}_OBJECTS o WHERE o.OWNER = e.OWNER AND o.OBJECT_NAME = e.NAME AND o.LAST_DDL_TIME >= SYSDATE - :hours / 24) ORDER BY e.OWNER, e.NAME, e.SEQUENCE` })), { hours }, 10);
	const invalid = await reader.read('Recent invalid objects', 'OBJECTS', 'OWNER, OBJECT_NAME, OBJECT_TYPE', "WHERE STATUS = 'INVALID' AND LAST_DDL_TIME >= SYSDATE - :hours / 24 ORDER BY LAST_DDL_TIME DESC", { hours }, 10);
	const seeds = unique([...failures.rows.map(r => `${r[0]}.${r[1]} ORA-${String(r[2]).padStart(5, '0')} ${r[3]}`), ...errors.rows.map(r => `${r[0]}.${r[1]} ${r[3]}\nORA-06512: at "${r[0]}.${r[1]}", line ${r[2]}`), ...invalid.rows.map(r => `${r[0]}.${r[1]} invalid ${r[2]}`)]);
	const issues: TriageIssue[] = [];
	for (const issue of seeds.slice(0, 10)) issues.push(await triageIssue(ctx, { ...options, issue }));
	return { target: options.target, issues, alertLog: mergeAlerts(issues.map(i => i.alertLog)), scan: { checks: reader.checks, cap: 10, truncated: seeds.length > 10 || reader.checks.some(c => c.truncated) } };
}
export type TriageResult = Awaited<ReturnType<typeof triage>>;
const safe = (v: unknown) => asText(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, 'ˋ').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const inline = (value: string) => '`' + value.replace(/`/g, 'ˋ').replace(/\r?\n/g, ' ') + '`';
const evidenceText = (value: string) => { const m = /^([\s\S]*?:\s*)((?:DELETE|UPDATE|SELECT|INSERT|BEGIN)\b[\s\S]*)$/i.exec(value); return m ? safe(m[1]) + inline(m[2]!) : safe(value).replace(/\bIncident (\d+)\b/g, '[Incident $1](#incident-$1)'); };
const block = (language: string, value: string) => '```' + language + '\n' + value.replace(/`/g, 'ˋ') + '\n```';
export function renderTriageMarkdown(result: TriageResult): string {
	return [`# Issue triage: ${safe(result.target)}`, 'Read-only evidence. Hypotheses are ranked diagnostic leads, not proof. Credential-looking literals are redacted; ordinary business literals are preserved; graph call associations and statement ranges are heuristic.', ...(result.scan ? [`Scan cap: ${result.scan.cap}; ${result.scan.truncated ? 'partial' : 'complete within visible window'}.`, ...result.scan.checks.map(c => `${safe(c.label)}: ${c.status}; ${safe(c.view)} ${c.attempts.map(a => a.code).join(', ')} (${c.rows.length} rows)`)] : []), ...result.issues.map((issue, i) => [
		`## Issue ${i + 1}`, safe(issue.issue.text), `Window: ${safe(issue.since)}. Codes: ${issue.codes.join(', ') || 'none'}. Reported times: ${issue.times.map(safe).join(', ') || 'none'}.`,
		...(issue.alertLog ? ['### Alert log', renderTriageAlerts(issue.alertLog)] : []),
		...(issue.sql ? renderTriageSql(issue.sql) : []),
		...(issue.sessions ? ['### Sessions evidence', issue.sessions.activity ? renderSessionsMarkdown(issue.sessions.activity) : safe(issue.sessions.reason), ...(issue.blockerSql ?? []).flatMap(renderTriageSql)] : []),
		'### Ranked hypotheses', ...issue.hypotheses.map(h => `${h.rank}. ${safe(h.title)}\n\n${h.evidence.filter(e => e.trim()).map(e => '- ' + evidenceText(e)).join('\n')}${h.verifyNext ? '\n\nVerify next (not executed):\n\n' + block('sql', h.verifyNext.sql) + '\nBinds: ' + safe(JSON.stringify(h.verifyNext.binds)) : ''}`),
		'### Limitations', ...(issue.limitations.length ? issue.limitations.map(safe) : ['No additional limitations identified; view failures and caps are reported below.']), '### Concurrency review', ...(issue.concurrency.length ? issue.concurrency.map(safe) : ['No supported concurrent child-insert path identified from the available source and job evidence.']), '### Suggested fixes (not executed)', 'Suggestions for a developer; no changes were run.', ...(issue.suggestions.length ? issue.suggestions.map(s => '- ' + safe(s)) : ['Inspect the unavailable source and raising condition before choosing a remediation; preserve exception/backtrace logging without credentials.']), '### Frame excerpts', ...issue.excerpts.map(e => `${safe(e.object)} line ${e.line} inside ${safe(e.subprogram)}; ${e.status}; ${safe(e.view)}${e.truncated ? '; source cap reached' : ''}${e.attempts.map(a => `; ${a.view} ${a.code}`).join('')}.\n\nStatement (heuristic): ${inline(e.statement)}\n\n${e.source.length ? block('plsql', e.source.map(s => `${s.line}: ${s.text.trimEnd()}`).join('\n')) : 'Source unavailable; historical job_action and raising condition cannot be inspected.'}`),
		'### Evidence', ...issue.checks.map(c => `${safe(c.label)}: ${c.status}; ${safe(c.view)}${c.truncated ? '; row cap reached (partial)' : ''}${c.attempts.map(a => `; ${a.view} ${a.code}`).join('')}\n\n${c.rows.length ? '| ' + c.columns.map(safe).join(' | ') + ' |\n| ' + c.columns.map(() => '---').join(' | ') + ' |\n' + c.rows.map(r => '| ' + r.map(safe).join(' | ') + ' |').join('\n') : c.label.startsWith('Source around') ? 'See the redacted frame excerpt above; source was collected through the bounded dictionary reader.' : 'No rows returned; absence is limited to visible evidence.'}`),
		'### Local error guide', ...issue.guide.map(g => `${g.code}: ${g.meaning}. Typical causes: ${g.causes} Read-only checks: ${g.checks}`),
		'### Numbered debug checklist', ...issue.checks.map((c, n) => `${n + 1}. ${safe(c.label)}. ${lookFor(c)}\n\n${block('sql', displaySql(c))}`),
		...(issue.graph.nodes.length ? ['### Trace diagram', block('mermaid', issue.mermaid)] : []),
	].join('\n\n'))].join('\n\n') + '\n';
}
function lookFor(check: Check): string {
	if (/^(SQL insight:|Top SQL referencing)/.test(check.label)) return 'Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: ' + JSON.stringify(check.binds);
	if (check.view.includes('V$DIAG')) return 'Compare codes, incident metadata and timestamps; a ±10 minute match alone does not establish causation. SQL binds: ' + JSON.stringify(check.binds);
	if (check.label.startsWith('Current child')) return 'Look for a nonzero CHILD_ROWS count: children currently reference parents eligible for the parent operation; zero does not disprove a past boundary race.';
	if (check.label.startsWith('Latest scheduler runs')) return 'These are the latest retained runs without a time filter, capped at 5; check OUTSIDE_WINDOW and the last-run timestamp before treating an old failure as current.';
	if (check.label.startsWith('Owners for named object')) return 'Look for the named object in the returned owners; compile diagnostics follow those owners rather than the default schema.';
	if (check.label.includes('run history')) return 'Look for FAILED runs, their exact error stack and start time; compare repeated failures with the reported incident window.';
	if (check.label.startsWith('Source around')) return 'Look for the raising statement and the enclosing subprogram; compare the child and parent selection predicates and their evaluation times.';
	if (check.label.includes('concurrency')) return 'Look for job entry points that insert child rows, then verify whether their keys can refer to the same eligible parents.';
	if (check.label.includes('job actions') || check.label.startsWith('Jobs referencing')) return 'Look for the job type and entry point; an empty current dictionary result with retained history can mean a dropped or auto-dropped job.';
	if (check.label.startsWith('Compile errors')) return 'Look for compiler line/position and messages naming the failing object or its dependencies.';
	if (check.label.startsWith('Invalid objects')) return 'Look for INVALID status on the failing unit or a dependency and compare LAST_DDL_TIME with the incident.';
	if (check.label.startsWith('Candidate log')) return 'Look for plausible application log names; only explicitly configured log tables may be read.';
	if (check.label.startsWith('Constraint ')) return 'Look for constraint type, owning child table, referenced parent key, delete rule and enabled status.';
	if (check.label.startsWith('Columns for')) return 'Look for columns ordered by POSITION; pair child and parent key columns at the same position.';
	if (check.label.startsWith('Parent/key')) return 'Look for the parent table and primary/unique key referenced by the failing foreign key.';
	if (check.label.startsWith('All visible child')) return 'Look for every child foreign key to this parent key, including other owners; ALL visibility can hide additional children.';
	if (check.label.startsWith('Configured log')) return 'Look for messages matching the error code, job, module and incident time; a row cap makes this evidence partial.';
	return 'Look for failures or object diagnostics inside the requested time window; check visibility and cap markers before treating an empty result as absence.';
}

function renderTriageAlerts(alert: import('./alerts.js').TriageAlertLog): string {
	return [`${alert.status}; ${alert.window.from} to ${alert.window.to} (exclusive). Job-run queries use their own ±10 minute windows, including historical runs.`, ...(alert.reason ? [safe(alert.reason)] : []), ...(alert.grant ? ['Alert evidence unavailable (possibly partial). Required grants:', block('sql', alert.grant)] : []),
		...alert.entries.flatMap(r => r.incidentIds.filter(id => /^\d+$/.test(id) && !alert.incidents.some(i => i.incidentId === id)).map(id => `<a id="incident-${id}"></a>`)),
		['| Index | First / last | Count | Codes | Incident / problem / trace | Message |', '|---|---|---|---|---|---|',
		...alert.entries.map((r, i) => `| ${i} | ${safe(r.firstTime)} / ${safe(r.lastTime)} | ${r.count} | ${r.codes.join(', ')} | ${safe([...r.incidentIds, ...r.problemKeys, ...r.traceFiles].join('; '))} | ${safe(r.messageText)}${r.textTruncated ? ' [text capped]' : ''}${r.metadataTruncated ? ' [metadata capped]' : ''} |`)].join('\n'),
		...(!alert.entries.length ? ['No matching alert entries returned within the bounded queries.'] : []),
		...alert.correlations.map(c => `Correlation (${c.kind}): ${safe(c.label)}${c.at ? ' at ' + safe(c.at) : ''}; entry indexes ${c.entryIndexes.join(', ')}. Temporal matches are diagnostic leads.`),
		...alert.incidents.map(i => `<a id="incident-${/^\d+$/.test(i.incidentId) ? i.incidentId : 'unknown'}"></a>Incident ${safe(i.incidentId)}: ${safe(i.problemKey)}; ${safe(i.createTime)}; status ${formatIncidentStatus(i.status)}.`),
		...(alert.checks.some(c => c.truncated) ? ['Row cap reached; alert evidence is partial and folding covers fetched rows only.'] : []),
	].join('\n\n');
}

function renderTriageSql(sql: TriageSql): string[] {
	if (sql.status === 'skipped' && !sql.reason) return [];
	return ['### SQL Performance', safe(sql.status + (sql.reason ? ': ' + sql.reason : '')),
		...(sql.excluded !== undefined ? [`${sql.excluded} diagnostic statements excluded (session user).`] : []),
		...(sql.insight ? [renderSqlInsightMarkdown(sql.insight)] : []),
	];
}
