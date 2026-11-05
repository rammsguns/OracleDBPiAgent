import type { OracleSession, QueryResult } from '../contracts.js';
import type { Check } from '../triage/read.js';

export class SqlUsageError extends Error {
	constructor(message: string) { super(message); this.name = 'SqlUsageError'; }
}
export interface Section { status: 'ok' | 'unavailable' | 'skipped'; view: string; truncated: boolean; attempts: { view: string; code: string }[] }
export interface ChildRow {
	child: number; planHashValue: number; execs: number; elapsed: number; cpu: number; bufferGets: number; diskReads: number;
	rowsProcessed: number; elapsedPerExec: number | null; cpuPerExec: number | null; bufferGetsPerExec: number | null;
	diskReadsPerExec: number | null; rowsPerExec: number | null; firstLoad: string; lastActive: string;
}
export interface PlanLine { id: number; parentId: number | null; operation: string; options: string; owner: string; name: string; objectType: string }
export interface ObjectStats { owner: string; name: string; stale: boolean | null; lastAnalyzed: string; numRows: number | null; status: Section['status']; view: string }
export interface SqlInsight {
	status: 'ok' | 'unavailable'; sqlId: string; target: string; text: string;
	children: ChildRow[]; plans: { planHashValue: number; lines: PlanLine[]; source: 'display_cursor' | 'v$sql_plan'; text?: string[] }[];
	planChanges: { planHashValue: number; firstLoad: string; lastActive: string; execs: number; elapsedPerExec: number | null }[];
	tables: ObjectStats[]; indexes: ObjectStats[]; baselines: Record<string, unknown>[]; profiles: Record<string, unknown>[];
	binds: Record<string, unknown>[]; mismatches: Record<string, unknown>[]; findings: Check[]; sections: Record<string, Section>;
}
const str = (v: unknown): string => v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
const num = (v: unknown): number => Number(v ?? 0);
const ratio = (n: number, d: number) => d > 0 ? n / d : null;
export function validateSqlOptions(options: { sqlId: string; child?: number; maxPlans?: number }): void {
	if (!/^[0-9abcdfghjkmnpqrstuvwxyz]{13}$/.test(options.sqlId)) throw new SqlUsageError('sql-id must be 13 Oracle base-32 characters');
	if (options.child !== undefined && (!Number.isInteger(options.child) || options.child < 0)) throw new SqlUsageError('child must be a nonnegative integer');
	if (options.maxPlans !== undefined && (!Number.isInteger(options.maxPlans) || options.maxPlans < 1 || options.maxPlans > 20)) throw new SqlUsageError('maxPlans must be 1–20');
}
export async function findSqlCandidates(session: OracleSession, text: string): Promise<QueryResult> {
	if (!text.trim() || text.length > 2048) throw new SqlUsageError('text must contain 1–2048 characters');
	return session.query("SELECT SQL_ID, MIN(SQL_TEXT) SQL_TEXT FROM V$SQL WHERE SQL_TEXT LIKE :fragment ESCAPE '\\' GROUP BY SQL_ID ORDER BY SQL_ID FETCH FIRST 11 ROWS ONLY", { fragment: '%' + text.replace(/[\\%_]/g, '\\$&') + '%' }, { maxRows: 11 });
}
export async function readSqlInsight(session: OracleSession, options: { sqlId: string; child?: number; maxPlans?: number }): Promise<SqlInsight> {
	validateSqlOptions(options);
	const { sqlId, child } = options, binds = { id: sqlId, ...(child === undefined ? {} : { child }) };
	const filter = 'SQL_ID = :id' + (child === undefined ? '' : ' AND CHILD_NUMBER = :child');
	const result: SqlInsight = { status: 'ok', sqlId, target: session.target.name, text: '', children: [], plans: [], planChanges: [], tables: [], indexes: [], baselines: [], profiles: [], binds: [], mismatches: [], findings: [], sections: {} };
	async function read(key: string, view: string, sql: string, args: Record<string, unknown> = binds): Promise<QueryResult | undefined> {
		const section: Section = result.sections[key] ??= { status: 'ok', view, truncated: false, attempts: [] };
		section.view = view;
		try { const data = await session.query(sql, args); section.status = 'ok'; section.truncated ||= data.truncated; return data; }
		catch (error) {
			const code = /ORA-\d{5}/.exec(String(error))?.[0];
			if (!code || !['ORA-00942', 'ORA-01031'].includes(code)) throw error;
			section.status = 'unavailable'; section.attempts.push({ view, code }); return undefined;
		}
	}
	const cursors = await read('children', 'V$SQL', `SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS, ELAPSED_TIME, CPU_TIME, BUFFER_GETS, DISK_READS, ROWS_PROCESSED, FIRST_LOAD_TIME, TO_CHAR(LAST_ACTIVE_TIME, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), SQL_TEXT, TO_CHAR(EXACT_MATCHING_SIGNATURE) FROM V$SQL WHERE ${filter} ORDER BY CHILD_NUMBER`);
	if (!cursors) result.status = 'unavailable';
	for (const r of cursors?.rows ?? []) {
		const execs = num(r[2]);
		result.text ||= str(r[10]);
		result.children.push({ child: num(r[0]), planHashValue: num(r[1]), execs, elapsed: num(r[3]), cpu: num(r[4]), bufferGets: num(r[5]), diskReads: num(r[6]), rowsProcessed: num(r[7]), elapsedPerExec: ratio(num(r[3]), execs), cpuPerExec: ratio(num(r[4]), execs), bufferGetsPerExec: ratio(num(r[5]), execs), diskReadsPerExec: ratio(num(r[6]), execs), rowsPerExec: ratio(num(r[7]), execs), firstLoad: str(r[8]).replace(/^(\d{4}-\d\d-\d\d)[ /]/, '$1T') + (r[8] ? 'Z' : ''), lastActive: str(r[9]) });
	}
	const hashes = [...new Set(result.children.map(r => r.planHashValue))];
	result.sections.plans = { status: 'skipped', view: 'DBMS_XPLAN.DISPLAY_CURSOR / V$SQL_PLAN', truncated: hashes.length > (options.maxPlans ?? 5), attempts: [] };
	for (const hash of hashes.slice(0, options.maxPlans ?? 5)) {
		const chosen = result.children.find(r => r.planHashValue === hash)!;
		const planBinds = { id: sqlId, child: chosen.child };
		const rows = await read('planObjects', 'V$SQL_PLAN', 'SELECT ID, PARENT_ID, OPERATION, OPTIONS, OBJECT_OWNER, OBJECT_NAME, OBJECT_TYPE FROM V$SQL_PLAN WHERE SQL_ID = :id AND CHILD_NUMBER = :child ORDER BY ID', planBinds);
		const lines: PlanLine[] = (rows?.rows ?? []).map(r => ({ id: num(r[0]), parentId: r[1] == null ? null : num(r[1]), operation: str(r[2]), options: str(r[3]), owner: str(r[4]), name: str(r[5]), objectType: str(r[6]) }));
		let display: QueryResult | undefined;
		try { display = await read('plans', 'DBMS_XPLAN.DISPLAY_CURSOR', "SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, :child, 'TYPICAL'))", planBinds); }
		catch (error) { result.sections.plans!.attempts.push({ view: 'DBMS_XPLAN.DISPLAY_CURSOR', code: /ORA-\d{5}/.exec(String(error))?.[0] ?? 'QUERY_FAILED' }); }
		const text = display?.rows.map(r => str(r[0])) ?? [];
		const usable = text.length > 0 && !text.some(t => /cannot fetch plan|error|please check/i.test(t));
		result.plans.push({ planHashValue: hash, lines, source: usable ? 'display_cursor' : 'v$sql_plan', ...(usable ? { text } : {}) });
		result.sections.plans!.status = usable || rows ? 'ok' : 'unavailable';
		result.sections.plans!.view = usable ? 'DBMS_XPLAN.DISPLAY_CURSOR' : 'V$SQL_PLAN';
	}
	for (const hash of hashes) {
		const rows = result.children.filter(r => r.planHashValue === hash), execs = rows.reduce((n, r) => n + r.execs, 0);
		result.planChanges.push({ planHashValue: hash, execs, firstLoad: rows.map(r => r.firstLoad).sort()[0]!, lastActive: rows.map(r => r.lastActive).sort().at(-1)!, elapsedPerExec: ratio(rows.reduce((n, r) => n + r.elapsed, 0), execs) });
	}
	result.sections.planChanges = { ...result.sections.children! };
	const objects = new Map<string, PlanLine>();
	for (const plan of result.plans) for (const line of plan.lines) if (line.owner && line.name && /TABLE|INDEX/.test(line.objectType + line.operation)) objects.set(line.owner + '.' + line.name, line);
	for (const line of objects.values()) {
		const index = /INDEX/.test(line.objectType + line.operation), key = index ? 'indexes' : 'tables', prefix = index ? 'IND' : 'TAB', column = index ? 'INDEX_NAME' : 'TABLE_NAME';
		const args = { owner: line.owner, name: line.name };
		const select = `SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM `;
		const where = ` WHERE OWNER = :owner AND ${column} = :name AND PARTITION_NAME IS NULL`;
		const objectKey = key + ':' + line.owner + '.' + line.name;
		let data = await read(objectKey, `DBA_${prefix}_STATISTICS`, select + `DBA_${prefix}_STATISTICS` + where, args);
		if (!data) data = await read(objectKey, `ALL_${prefix}_STATISTICS`, select + `ALL_${prefix}_STATISTICS` + where, args);
		const r = data?.rows[0], section = result.sections[objectKey]!;
		result[key].push({ owner: line.owner, name: line.name, stale: r?.[0] == null ? null : r[0] === 'YES', lastAnalyzed: str(r?.[1]), numRows: r?.[2] == null ? null : num(r[2]), status: section.status, view: section.view });
	}
	for (const key of ['tables', 'indexes']) {
		const sections = Object.entries(result.sections).filter(([k]) => k.startsWith(key + ':')).map(([, v]) => v);
		result.sections[key] = { status: !sections.length ? 'skipped' : sections.some(s => s.status === 'unavailable') ? 'unavailable' : 'ok', view: sections.map(s => s.view).join(', '), truncated: sections.some(s => s.truncated), attempts: sections.flatMap(s => s.attempts) };
	}
	const records = (data?: QueryResult) => data?.rows.map(r => Object.fromEntries(data.columns.map((c, i) => [c, r[i] instanceof Date ? str(r[i]) : r[i]]))) ?? [];
	const signature = str(cursors?.rows[0]?.[11]);
	for (const [key, view, columns] of [['baselines', 'DBA_SQL_PLAN_BASELINES', 'SQL_HANDLE, PLAN_NAME, ENABLED, ACCEPTED'], ['profiles', 'DBA_SQL_PROFILES', 'NAME, STATUS, TYPE']] as const) {
		if (!signature) { result.sections[key] = { status: 'skipped', view, truncated: false, attempts: [] }; continue; }
		result[key] = records(await read(key, view, `SELECT ${columns} FROM ${view} WHERE SIGNATURE = TO_NUMBER(:signature)`, { signature }));
	}
	result.binds = records(await read('binds', 'V$SQL_BIND_CAPTURE', `SELECT CHILD_NUMBER, NAME, POSITION, DATATYPE_STRING, WAS_CAPTURED FROM V$SQL_BIND_CAPTURE WHERE ${filter} ORDER BY CHILD_NUMBER, POSITION`));
	if (result.children.length > 3) {
		// Discover only flag columns; never fetch arbitrary view columns or captured values.
		const flags = await read('mismatches', 'ALL_TAB_COLUMNS', "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER = 'SYS' AND TABLE_NAME = 'V_$SQL_SHARED_CURSOR' AND DATA_TYPE = 'VARCHAR2' AND DATA_LENGTH = 1 ORDER BY COLUMN_ID", {});
		const names = (flags?.rows ?? []).map(r => str(r[0])).filter(n => /^[A-Z][A-Z0-9_]*$/.test(n) && !/PASSWORD|HASH|VALUE/.test(n));
		if (names.length) {
			const data = await read('mismatches', 'V$SQL_SHARED_CURSOR', `SELECT CHILD_NUMBER, ${names.join(', ')} FROM V$SQL_SHARED_CURSOR WHERE ${filter} ORDER BY CHILD_NUMBER`);
			result.mismatches = records(data).map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => k === 'CHILD_NUMBER' || v === 'Y')));
		}
	} else result.sections.mismatches = { status: 'skipped', view: 'V$SQL_SHARED_CURSOR', truncated: false, attempts: [] };
	function finding(label: string, view: string, columns: string[], rows: unknown[][]) {
		result.findings.push({ label, view, columns, rows, status: 'ok', sql: '', binds: {}, truncated: false, attempts: [] });
	}
	const times = result.planChanges.filter(p => p.elapsedPerExec !== null && p.elapsedPerExec > 0);
	if (times.length > 1 && Math.max(...times.map(p => p.elapsedPerExec!)) / Math.min(...times.map(p => p.elapsedPerExec!)) >= 2) finding('Plan instability: elapsed per execution differs by at least 2×', 'V$SQL', ['planHashValue', 'execs', 'elapsedPerExec'], times.map(p => [p.planHashValue, p.execs, p.elapsedPerExec]));
	for (const t of [...result.tables, ...result.indexes]) if (t.status === 'ok' && (t.stale || !t.lastAnalyzed)) finding('Stale or missing statistics', t.view, ['owner', 'name', 'stale', 'lastAnalyzed'], [[t.owner, t.name, t.stale, t.lastAnalyzed]]);
	for (const plan of result.plans) for (const line of plan.lines) {
		let branch = line, inner = false;
		const visited = new Set<number>();
		while (branch.parentId !== null && !visited.has(branch.id)) {
			visited.add(branch.id);
			const parent = plan.lines.find(p => p.id === branch.parentId);
			if (!parent) break;
			const siblings = plan.lines.filter(p => p.parentId === parent.id).sort((a, b) => a.id - b.id);
			if (parent.operation === 'NESTED LOOPS' && siblings[0]?.id !== branch.id) inner = true;
			branch = parent;
		}
		const table = result.tables.find(t => t.owner === line.owner && t.name === line.name);
		if (line.operation === 'TABLE ACCESS' && line.options === 'FULL' && inner && (table?.numRows ?? 0) > 100000) finding('Large full scan on nested-loop inner side', 'V$SQL_PLAN / ' + table!.view, ['planHashValue', 'id', 'parentId', 'owner', 'name', 'numRows'], [[plan.planHashValue, line.id, line.parentId, line.owner, line.name, table!.numRows]]);
	}
	if (result.children.length > 3) finding('High child-cursor count', 'V$SQL / V$SQL_SHARED_CURSOR', ['child', 'reasons'], result.children.map(c => [c.child, result.mismatches.find(r => r.CHILD_NUMBER === c.child) ?? {}]));
	return result;
}
const escape = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
export function renderSqlInsightMarkdown(result: SqlInsight): string {
	const lines = [`# SQL insight: ${escape(result.target)} / ${result.sqlId}`, '', `${result.status}; all times UTC; elapsed and CPU in microseconds.`, '', escape(result.text), ''];
	for (const [name, section] of Object.entries(result.sections)) lines.push(`- ${name}: ${section.status}; ${escape(section.view)}${section.truncated ? '; row/plan cap reached (partial)' : ''}${section.attempts.length ? '; ' + escape(section.attempts) : ''}`);
	for (const name of ['children', 'planChanges', 'tables', 'indexes', 'baselines', 'profiles', 'binds', 'mismatches', 'findings'] as const) {
		lines.push('', '## ' + name, '');
		const rows = result[name];
		if (!rows.length) { lines.push('No rows returned.'); continue; }
		const columns = Object.keys(rows[0]!);
		lines.push('| ' + columns.join(' | ') + ' |', '| ' + columns.map(() => '---').join(' | ') + ' |');
		for (const row of rows) lines.push('| ' + columns.map(c => escape((row as unknown as Record<string, unknown>)[c])).join(' | ') + ' |');
	}
	for (const plan of result.plans) lines.push('', `## Plan ${plan.planHashValue} (${plan.source})`, '', ...(plan.text ?? plan.lines.map(l => JSON.stringify(l))).map(escape));
	return lines.join('\n') + '\n';
}
