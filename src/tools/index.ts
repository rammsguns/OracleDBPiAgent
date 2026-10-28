import { Type } from "typebox";
import { createHash } from "node:crypto";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext, QueryResult, OracleSession } from "../contracts.js";
import { classifySql } from "../oracle/sqlPolicy.js";

const MAX_VIEW_SOURCE_BYTES = 1024 * 1024;

const str = () => Type.Optional(Type.String());
const integer = (max: number) => Type.Optional(Type.Integer({ minimum: 1, maximum: max }));
const definitions = [
	["list_targets", "List configured database targets", {}],
	["db_overview", "Database identity, startup, character set, size and memory", {}],
	["list_schemas", "Application schemas with object counts and segment bytes", {}],
	["list_objects", "Page through schema objects", { schema: str(), type: str(), pattern: str(), page: integer(10000), pageSize: integer(100) }],
	["describe_object", "Columns, constraints, indexes and table statistics\n\nConstraint rows give constraint name, type and status only; they do NOT include the referenced (parent) table or column of a foreign key. Never infer a parent from a constraint's name: resolve it with run_query on ALL_CONSTRAINTS (R_OWNER, R_CONSTRAINT_NAME) joined to ALL_CONS_COLUMNS.", { schema: str(), name: Type.String() }],
	["get_source", "Read view or PL/SQL source, at most 200 lines", { schema: str(), name: Type.String(), type: str(), startLine: integer(1000000), lines: integer(200) }],
	["run_query", "Execute bounded read-only SQL\n\nUse only column names you have seen in a tool result in this conversation. If the question names a column you have not seen yet, confirm its exact name with describe_object first, and never substitute a similarly named column (for example ORDER_STATUS for STATUS, or a SUB-prefixed column for the one asked about).", { sql: Type.String(), maxRows: integer(10000) }],
	["explain_plan", "Display a cached plan by sql_id or matching read-only SQL; never executes EXPLAIN PLAN", { sql: str(), sql_id: Type.Optional(Type.String({ pattern: "^[a-z0-9]{13}$" })) }],
	["top_sql", "Top SQL by elapsed time, CPU, buffer gets or executions", { metric: Type.Optional(Type.Union([Type.Literal("elapsed_time"), Type.Literal("cpu_time"), Type.Literal("buffer_gets"), Type.Literal("executions")])), limit: integer(100) }],
	["session_activity", "Active sessions, waits, blocking sessions and lock counts", {}],
	["wait_events", "Non-idle system waits", { limit: integer(100) }],
	["tablespace_usage", "Tablespace allocation, free bytes and autoextend", {}],
] as const;

export function createDbTools(ctx: ToolContext): AgentTool<any>[] {
	return definitions.map(([name, description, properties]) => ({
		name, label: name, description,
		parameters: Type.Object({ target: str(), ...properties }, { additionalProperties: false }),
		async execute(_id: string, p: any, signal?: AbortSignal) {
			const target = p.target ?? ctx.config.defaultTarget;
			const base = { at: new Date().toISOString(), runId: ctx.runId, target, tool: name };
			let sql: string | undefined;
			let sourceNote: string | undefined;
			let viewFound = false;
			try {
				if (signal?.aborted) throw new Error("Tool aborted");
				if (!ctx.config.targets.some(t => t.name === target)) throw new Error(`Unknown target: ${target}`);
				let result: unknown;
				if (name === "list_targets") result = { columns: ["TARGET", "ENVIRONMENT", "DESCRIPTION"], rows: ctx.config.targets.map(t => [t.name, t.environment, t.description]), truncated: false, elapsedMs: 0 };
				else {
					const configured = ctx.config.targets.find(t => t.name === target)!;
					const binds: Record<string, unknown> = {};
					const schema = (p.schema ?? configured.defaultSchema).toUpperCase();
					if (name === "run_query") sql = classifySql(p.sql);
					if (name === "db_overview") sql = `SELECT d.name, d.cdb, i.version_full, i.instance_name, i.host_name, i.startup_time, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') character_set, (SELECT SUM(bytes) FROM dba_data_files) datafile_bytes, (SELECT SUM(value) FROM v$sga) sga_bytes, (SELECT value FROM v$pgastat WHERE name='total PGA allocated') pga_bytes FROM v$database d CROSS JOIN v$instance i`;
					if (name === "list_schemas") sql = `SELECT u.username, (SELECT COUNT(*) FROM dba_objects o WHERE o.owner=u.username) object_count, (SELECT SUM(bytes) FROM dba_segments s WHERE s.owner=u.username) segment_bytes FROM dba_users u WHERE u.oracle_maintained='N' ORDER BY u.username`;
					if (name === "list_objects") {
						Object.assign(binds, { owner: schema, object_type: p.type?.toUpperCase() ?? null, pattern: p.pattern?.toUpperCase() ?? "%", offset_rows: ((p.page ?? 1) - 1) * (p.pageSize ?? 50), page_size: p.pageSize ?? 50 });
						sql = `SELECT owner, object_name, object_type, status FROM all_objects WHERE owner=:owner AND (:object_type IS NULL OR object_type=:object_type) AND object_name LIKE :pattern ORDER BY object_name, object_type OFFSET :offset_rows ROWS FETCH NEXT :page_size ROWS ONLY`;
					}
					if (name === "describe_object") {
						Object.assign(binds, { owner: schema, name: p.name.toUpperCase() });
						// One tagged result preserves separate metadata sections without multiplying rows.
						sql = `SELECT 'COLUMN' kind, column_name name, data_type info, TO_CHAR(data_length) value, column_id position FROM all_tab_columns WHERE owner=:owner AND table_name=:name UNION ALL SELECT 'CONSTRAINT', constraint_name, constraint_type, status, NULL FROM all_constraints WHERE owner=:owner AND table_name=:name UNION ALL SELECT 'CONSTRAINT_COLUMN', constraint_name, column_name, NULL, position FROM all_cons_columns WHERE owner=:owner AND table_name=:name UNION ALL SELECT 'INDEX', index_name, uniqueness, status, NULL FROM all_indexes WHERE table_owner=:owner AND table_name=:name UNION ALL SELECT 'INDEX_COLUMN', index_name, column_name, NULL, column_position FROM all_ind_columns WHERE table_owner=:owner AND table_name=:name UNION ALL SELECT 'STATS', table_name, TO_CHAR(num_rows), TO_CHAR(last_analyzed,'YYYY-MM-DD HH24:MI:SS'), NULL FROM all_tables WHERE owner=:owner AND table_name=:name ORDER BY 1,5,2`;
					}
					if (name === "get_source") {
						const start = p.startLine ?? 1; const lines = p.lines ?? 200;
						if (!Number.isInteger(lines) || lines < 1 || lines > 200 || !Number.isInteger(start) || start < 1) throw new Error("Invalid source range");
						Object.assign(binds, { owner: schema, name: p.name.toUpperCase() });
						if (p.type?.toUpperCase() === "VIEW") {
							// Thin mode fetches LONG as a string by default. Bound it before transfer.
							binds.max_source_bytes = MAX_VIEW_SOURCE_BYTES;
							sql = `SELECT text_length, text, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') charset FROM all_views WHERE owner=:owner AND view_name=:name AND text_length<=:max_source_bytes`;
						} else {
							Object.assign(binds, { source_type: p.type?.toUpperCase() ?? null, start_line: start, end_line: start + lines });
							sql = `SELECT type, line, text FROM all_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:source_type) AND line>=:start_line AND line<:end_line ORDER BY type,line`;
						}
					}
					if (name === "explain_plan") {
						if (p.sql) classifySql(p.sql);
						if (!p.sql && !/^[a-z0-9]{13}$/.test(p.sql_id ?? "")) throw new Error("Provide read-only SQL already in the cursor cache, or an existing sql_id");
						if (p.sql_id && !/^[a-z0-9]{13}$/.test(p.sql_id)) throw new Error("Invalid sql_id");
						binds.sql_id = p.sql_id;
						sql = `SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'TYPICAL'))`;
					}
					if (name === "top_sql") {
						const metric = p.metric ?? "elapsed_time";
						if (!["elapsed_time", "cpu_time", "buffer_gets", "executions"].includes(metric)) throw new Error("Invalid top SQL metric");
						binds.n = p.limit ?? 10;
						sql = `SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstats ORDER BY ${metric} DESC FETCH FIRST :n ROWS ONLY`;
					}
					if (name === "session_activity") sql = `SELECT s.sid, s.serial#, s.username, s.status, s.sql_id, s.event, s.wait_class, s.seconds_in_wait, s.blocking_session, (SELECT COUNT(*) FROM v$lock l WHERE l.sid=s.sid) lock_count FROM v$session s WHERE s.type='USER' AND s.status='ACTIVE' ORDER BY s.sid`;
					if (name === "wait_events") { binds.n = p.limit ?? 10; sql = `SELECT event, wait_class, total_waits, time_waited_micro FROM v$system_event WHERE wait_class<>'Idle' ORDER BY time_waited_micro DESC FETCH FIRST :n ROWS ONLY`; }
					if (name === "tablespace_usage") sql = `SELECT d.tablespace_name, d.allocated_bytes, NVL(f.free_bytes,0) free_bytes, d.allocated_bytes-NVL(f.free_bytes,0) used_bytes, d.max_bytes, d.autoextend_files FROM (SELECT tablespace_name, SUM(bytes) allocated_bytes, SUM(CASE WHEN autoextensible='YES' THEN maxbytes ELSE bytes END) max_bytes, SUM(CASE WHEN autoextensible='YES' THEN 1 ELSE 0 END) autoextend_files FROM dba_data_files GROUP BY tablespace_name) d LEFT JOIN (SELECT tablespace_name,SUM(bytes) free_bytes FROM dba_free_space GROUP BY tablespace_name) f ON f.tablespace_name=d.tablespace_name ORDER BY d.tablespace_name`;
					if (!sql) throw new Error("Unknown tool");
					const session = await ctx.sessions.get(target);
					try {
						if (name === "explain_plan" && p.sql) {
							const statement = classifySql(p.sql);
							if (statement.length > 1000) throw new Error("For SQL longer than 1000 characters provide sql_id only");
							const cached = await session.query("SELECT sql_id FROM v$sql WHERE sql_text=:statement AND (:id IS NULL OR sql_id=:id) ORDER BY last_active_time DESC FETCH FIRST 1 ROWS ONLY", {statement, id:p.sql_id ?? null});
							if (!cached.rows.length) throw new Error("No matching cached cursor; EXPLAIN PLAN writes are prohibited");
							binds.sql_id = cached.rows[0]![0];
						}
						if (name === "get_source" && p.type?.toUpperCase() === "VIEW") {
							const size = await session.query("SELECT text_length FROM all_views WHERE owner=:owner AND view_name=:name", { owner: binds.owner, name: binds.name }, { maxRows: 1 });
							if (Number(size.rows[0]?.[0] ?? 0) > MAX_VIEW_SOURCE_BYTES) throw new Error("View source exceeds the 1 MiB limit; source was not fetched");
							viewFound = size.rows.length > 0;
						}
						const maxRows = Math.min(name === "get_source" ? (p.lines ?? 200) : (p.maxRows ?? ctx.config.limits.maxRows), ctx.config.limits.maxRows);
						try { result = await session.query(sql, binds, { maxRows }); }
						catch (error) {
							if (name === "run_query") throw await queryErrorHint(error, sql, session, ctx);
							if (!/ORA-00942/.test(String(error))) throw error;
							if (name === "wait_events") throw new Error("ORA-00942: wait_events requires SELECT on SYS.V_$SYSTEM_EVENT (V$SYSTEM_EVENT); no granted equivalent is available", { cause: error });
							if (name === "top_sql") {
								sql = `SELECT sql_id, SUM(executions) executions, SUM(elapsed_time) elapsed_time, SUM(cpu_time) cpu_time, SUM(buffer_gets) buffer_gets, MAX(SUBSTR(sql_text,1,300)) sql_text FROM v$sql GROUP BY sql_id ORDER BY ${p.metric ?? "elapsed_time"} DESC FETCH FIRST :n ROWS ONLY`;
								sourceNote = "Source: V$SQL, aggregated child cursors; V$SQLSTATS unavailable. Statistics cover currently cached cursors only.";
							} else if (name === "tablespace_usage") {
								sql = `SELECT m.tablespace_name, t.contents, m.tablespace_size*t.block_size capacity_bytes, m.used_space*t.block_size used_bytes, (m.tablespace_size-m.used_space)*t.block_size free_capacity_bytes, m.used_percent FROM dba_tablespace_usage_metrics m JOIN dba_tablespaces t ON t.tablespace_name=m.tablespace_name ORDER BY m.tablespace_name`;
								sourceNote = "Source: DBA_TABLESPACE_USAGE_METRICS joined to DBA_TABLESPACES; blocks converted to bytes using BLOCK_SIZE. Capacity includes possible autoextension; free capacity is not allocated-file free bytes. Allocated bytes, file max bytes and autoextend file counts unavailable (DBA_DATA_FILES/DBA_FREE_SPACE missing). Includes permanent, temporary and undo metrics.";
							} else if (name === "db_overview") {
								sql = `SELECT SYS_CONTEXT('USERENV','DB_NAME') name, p.version_full, SYS_CONTEXT('USERENV','INSTANCE_NAME') instance_name, SYS_CONTEXT('USERENV','SERVER_HOST') host_name, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') character_set, NULL cdb, NULL startup_time, NULL datafile_bytes, NULL sga_bytes, NULL pga_bytes FROM product_component_version p WHERE p.product LIKE 'Oracle%Database%'`;
								sourceNote = "Source: PRODUCT_COMPONENT_VERSION, SYS_CONTEXT('USERENV',...) and NLS_DATABASE_PARAMETERS. Unavailable (NULL): CDB status, startup time, datafile bytes, SGA bytes and PGA bytes; required V$DATABASE/V$INSTANCE/V$SGA/V$PGASTAT/DBA_DATA_FILES access missing.";
							} else if (name === "list_schemas") {
								sql = `SELECT u.username, (SELECT COUNT(*) FROM all_objects o WHERE o.owner=u.username) visible_object_count, NULL segment_bytes FROM all_users u WHERE u.oracle_maintained='N' ORDER BY u.username`;
								sourceNote = "Source: ALL_USERS with ALL_OBJECTS; counts cover only objects visible to this login, and zero does not prove an empty schema. Full object counts and segment bytes unavailable (DBA_USERS/DBA_OBJECTS/DBA_SEGMENTS missing); segment bytes are NULL.";
							} else throw error;
							result = await session.query(sql, binds, { maxRows });
						}
						if (name === "explain_plan" && (result as QueryResult).rows.some(r => /cannot fetch plan|ORA-\d+|error:/i.test(String(r[0])))) {
							// Some cursor/grant combinations return diagnostics instead of a plan.
							sql = "SELECT child_number, id, parent_id, operation, options, object_owner, object_name, cardinality, bytes, cost, access_predicates, filter_predicates FROM v$sql_plan WHERE sql_id=:sql_id ORDER BY child_number,id";
							result = await session.query(sql, binds);
							if (!(result as QueryResult).rows.length) throw new Error("No cached cursor plan found");
						}
					}
					finally { await session.close(); }
					if (name === "explain_plan" && (result as QueryResult).rows.some(r => /cannot fetch plan|ORA-\d+|error:/i.test(String(r[0])))) throw new Error("DISPLAY_CURSOR unavailable: required cursor plan grants or cached cursor are missing");
				}
				if (name === "get_source" && p.type?.toUpperCase() === "VIEW") {
					const source = result as QueryResult;
					const text = source.rows[0]?.[1] ?? "";
					// The view existed at the size probe, so no capped row means it changed or grew past the cap.
					if (viewFound && !source.rows.length) throw new Error("View source changed during fetch or exceeds the 1 MiB limit");
					if (typeof text !== "string" || Buffer.byteLength(text) > MAX_VIEW_SOURCE_BYTES) throw new Error("View source fetch is incomplete or exceeds the 1 MiB limit");
					if (source.rows.length) {
						// TEXT_LENGTH counts bytes in the database character set.
						const charset = String(source.rows[0]?.[2] ?? "");
						const bytes = charset === "AL32UTF8" || charset === "UTF8" ? Buffer.byteLength(text) : /^[A-Z]+[78][A-Z]/.test(charset) ? text.length : undefined;
						if (bytes === undefined) throw new Error(`View source completeness cannot be checked in database character set ${charset || "(unknown)"}`);
						if (bytes !== Number(source.rows[0]?.[0])) throw new Error("View source fetch is incomplete or exceeds the 1 MiB limit");
					}
					const lines = source.rows.length ? text.split(/\r\n|\n|\r/) : []; const start = p.startLine ?? 1;
					const count = Math.min(p.lines ?? 200, ctx.config.limits.maxRows);
					const rows = lines.slice(start - 1, start - 1 + count).map((text, i) => [start + i, text]);
					const hasMore = start - 1 + rows.length < lines.length;
					result = { ...source, columns: ["LINE", "TEXT"], rows, startLine: start, totalLines: lines.length, hasMore, nextStartLine: hasMore ? start + rows.length : null, truncated: hasMore };
				}
				if (sourceNote) result = { ...(result as QueryResult), sourceNote };
				const output = boundedResult(result, ctx.config.limits.maxToolResultBytes, name === "describe_object" ? renderDescribe : undefined);
				const q = output.details as QueryResult;
				await ctx.audit.record({ ...base, kind: "tool_call", ...((sql || typeof p.sql === "string") ? { sqlSha256: createHash("sha256").update(typeof p.sql === "string" ? p.sql : sql!).digest("hex") } : {}), rows: q.rows?.length, truncated: q.truncated, elapsedMs: q.elapsedMs });
				return output;
			} catch (error) {
				await ctx.audit.record({ ...base, kind: "tool_error", ...((sql || typeof p.sql === "string") ? { sqlSha256: createHash("sha256").update(typeof p.sql === "string" ? p.sql : sql!).digest("hex") } : {}), detail: error instanceof Error ? error.name : "Error" });
				throw error;
			}
		},
	}));
}

// Keep the tagged query intact: folding in JS avoids LISTAGG's
// VARCHAR2 limit, including for long identifier lists on Oracle 19c.
function describeSections(result: QueryResult) {
	const cell = (value: unknown) => value == null ? "NULL" : String(value).replace(/\s+/g, " ");
	const sectionsOutput: { header: string; entries: { text: string; rows: unknown[][] }[]; omitted: number }[] = [];
	const rows = result.rows;
	const sections = [
		["COLUMN", "Columns: position|name|type|length"],
		["CONSTRAINT", "Constraints: name|type|status|child_columns(position:name)"],
		["INDEX", "Indexes: name|uniqueness|status|columns(position:name)"],
		["STATS", "Stats: table|NUM_ROWS|LAST_ANALYZED"],
	];
	for (const [kind, header] of sections) {
		const parents = rows.filter(row => row[0] === kind);
		const children = rows.filter(row => row[0] === `${kind}_COLUMN`);
		if (!parents.length && !children.length) continue;
		const section = { header: header!, entries: [] as { text: string; rows: unknown[][] }[], omitted: 0 };
		sectionsOutput.push(section);
		for (const row of parents) {
			const values = kind === "COLUMN" ? [row[4], row[1], row[2], row[3]] : [row[1], row[2], row[3]];
			if (kind === "CONSTRAINT" || kind === "INDEX") {
				values.push(children.filter(child => child[1] === row[1]).sort((a, b) => Number(a[4]) - Number(b[4])).map(child => `${cell(child[4])}:${cell(child[2])}`).join(","));
			}
			section.entries.push({ text: values.map(cell).join("|"), rows: [row, ...children.filter(child => child[1] === row[1])] });
		}
		// Retain even orphan column rows (possible with unusual dictionary visibility).
		for (const child of children.filter(child => !parents.some(parent => parent[1] === child[1]))) {
			section.entries.push({ text: `${kind}_COLUMN|${cell(child[1])}|${cell(child[4])}:${cell(child[2])}`, rows: [child] });
		}
	}
	return sectionsOutput;
}

function renderDescribeSections(sections: ReturnType<typeof describeSections>, truncated: boolean): string {
	const lines = sections.flatMap(section => [
		section.entries.length ? section.header : `${section.header.split(":")[0]}: ${section.omitted} more not shown [truncated]`,
		...section.entries.map(entry => entry.text),
		...(section.entries.length && section.omitted ? [`${section.header.split(":")[0]}: ${section.omitted} more not shown [truncated]`] : []),
	]);
	if (truncated) lines.push("[truncated]");
	return lines.length ? lines.join("\n") : "No metadata rows.";
}

export function renderDescribe(result: QueryResult): string {
	return renderDescribeSections(describeSections(result), result.truncated);
}

// Render from complete entities before enforcing bytes. Raw details lose the same
// whole entities, so neither representation can imply a shortened composite key.
function boundedDescribe(result: QueryResult, cap: number) {
	const details = structuredClone(result);
	const sections = describeSections(details);
	const output = () => ({ content: [{ type: "text" as const, text: renderDescribeSections(sections, details.truncated) }], details });
	// A database row cap may have cut a child list: do not claim it is complete.
	if (result.truncated) {
		for (const section of sections.filter(section => /^(Constraints|Indexes):/.test(section.header))) {
			section.omitted += section.entries.length;
			section.entries = [];
		}
		details.rows = details.rows.filter(row => !/^(CONSTRAINT|INDEX)(_COLUMN)?$/.test(String(row[0])));
	}
	while (Buffer.byteLength(JSON.stringify(output())) > cap) {
		const section = sections.findLast(section => section.entries.length);
		if (!section) throw new Error("Tool result byte limit is too small to disclose omitted describe sections");
		const entry = section.entries.pop()!;
		section.omitted++;
		const removed = new Set(entry.rows);
		details.rows = details.rows.filter(row => !removed.has(row));
		details.truncated = true;
	}
	return output();
}

export function boundedResult(result: unknown, cap: number, renderTable?: (result: QueryResult) => string): { content: { type: "text"; text: string }[]; details: any } {
	if (renderTable === renderDescribe) return boundedDescribe(result as QueryResult, cap);
	let details: any = structuredClone(result);
	const updateSourcePage = () => {
		if (typeof details.totalLines !== "number") return;
		details.hasMore = details.startLine - 1 + details.rows.length < details.totalLines;
		details.nextStartLine = details.hasMore ? details.startLine + details.rows.length : null;
	};
	const render = () => renderTable && details.columns ? renderTable(details) : Array.isArray(details) ? JSON.stringify(details) : details.columns ? [...(details.sourceNote ? [details.sourceNote] : []), ...(typeof details.totalLines === "number" ? [`Total lines: ${details.totalLines}; more: ${details.hasMore}; next startLine: ${details.nextStartLine ?? "none"}`] : []), details.columns.join(" | "), ...details.rows.map((r: unknown[]) => r.map(v => v == null ? "NULL" : String(v).replace(/\s+/g, " ")).join(" | ")), ...(details.truncated ? ["[truncated]"] : [])].join("\n") : JSON.stringify(details);
	let output = { content: [{ type: "text" as const, text: render() }], details };
	while (Buffer.byteLength(JSON.stringify(output)) > cap) {
		if (details.rows?.length) { details.rows.pop(); details.truncated = true; updateSourcePage();
			if (typeof details.totalLines === "number" && !details.rows.length) throw new Error("Tool result byte limit cannot fit one source line; request cannot make progress"); }
		else if (Array.isArray(details) && details.length) details.pop();
		else if (typeof details.totalLines === "number") throw new Error("Tool result byte limit cannot retain source pagination metadata");
		else if (details.sourceNote) throw new Error("Tool result byte limit is too small to retain fallback source and limitations");
		else { details = { truncated: true }; output = { content: [{ type: "text", text: "[truncated]" }], details }; break; }
		output = { content: [{ type: "text", text: render() }], details };
	}
	if (Buffer.byteLength(JSON.stringify(output)) > cap) throw new Error("Tool result byte limit is too small");
	return output;
}

// Deliberately conservative: only plain dictionary names in FROM/JOIN lists.
// Literals, comments and quoted identifiers cannot introduce candidate views.
function dictionaryViews(sql: string): string[] {
	const tokens = (sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//g, token => token.startsWith("--") || token.startsWith("/*") ? " " : " ? ").toUpperCase()
		.match(/[A-Z][A-Z0-9_$#]*|[^\s]/g) ?? []);
	const from = new Map<number, boolean>();
	const views = new Set<string>();
	let depth = 0;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "(") { depth++; continue; }
		if (token === ")") { from.delete(depth); depth--; continue; }
		if (["WHERE", "GROUP", "ORDER", "HAVING", "UNION", "MINUS", "INTERSECT", "CONNECT", "START"].includes(token!)) from.delete(depth);
		if (token === "FROM") from.set(depth, true);
		if (token !== "FROM" && token !== "JOIN" && !(token === "," && from.get(depth))) continue;
		let name = tokens[i + 1];
		let end = i + 2;
		if (name === "SYS" && tokens[end] === ".") { name = tokens[end + 1]; end += 2; }
		if (tokens[end] === "." || tokens[end] === "@") continue;
		if (name && /^(?:ALL_|USER_|DBA_|G?V\$)[A-Z0-9_$#]+$/.test(name)) views.add(name);
	}
	return [...views].slice(0, 3);
}

async function queryErrorHint(error: unknown, sql: string, session: OracleSession, ctx: ToolContext): Promise<unknown> {
	if (!(error instanceof Error) || !/^ORA-(00904|01747|00942|00935):/.test(error.message)) return error;
	let hint = "";
	try {
		const lookup = async (statement: string, binds: Record<string, unknown>) => {
			const base = { at: new Date().toISOString(), runId: ctx.runId, target: session.target.name, tool: "run_query",
				sqlSha256: createHash("sha256").update(statement).digest("hex") };
			try {
				const result = await session.query(classifySql(statement), binds, {
					maxRows: Math.min(1000, ctx.config.limits.maxRows),
					timeoutSeconds: Math.min(2, ctx.config.limits.statementTimeoutSeconds),
				});
				await ctx.audit.record({ ...base, kind: "tool_call", rows: result.rows.length, truncated: result.truncated, elapsedMs: result.elapsedMs });
				return result;
			} catch (failure) {
				await ctx.audit.record({ ...base, kind: "tool_error", detail: failure instanceof Error ? failure.name : "Error" });
				throw failure;
			}
		};
		if (error.message.startsWith("ORA-00935:")) hint = "Hint: aggregates cannot nest in one SELECT level; aggregate in a subquery, then aggregate its result.";
		else {
			const views = dictionaryViews(sql);
			const parts: string[] = [];
			for (const view of views) {
				if (error.message.startsWith("ORA-00942:")) {
					if (!view.startsWith("DBA_")) continue;
					const alternative = view.replace(/^DBA_/, "ALL_");
					const result = await lookup("SELECT column_name FROM all_tab_columns WHERE owner=:owner AND table_name=:name AND ROWNUM=1", { owner: "SYS", name: alternative });
					parts.push(`${view} is not granted; ${alternative} is ${result.rows.length ? "available (shows only objects this login can see)" : "not visible to this login"}.`);
					break;
				}
				const result = await lookup("SELECT column_name, COUNT(*) OVER () total_columns FROM all_tab_columns WHERE owner=:owner AND table_name=:name ORDER BY column_id", { owner: "SYS", name: view.replace(/^(G?V)\$/, "$1_$") });
				if (!result.rows.length) continue;
				const columns = result.rows.map(row => String(row[0])).filter(column => /^[A-Z][A-Z0-9_$#]*$/.test(column));
				const used = new Set((sql.toUpperCase().match(/[A-Z][A-Z0-9_$#]*/g) ?? []).filter(word => !columns.includes(word)));
				const normalized = (word: string) => word.replace(/_/g, "");
				const matches = columns.filter(column => [...used].some(word => normalized(word) === normalized(column) || word === column + "_X" || word + "D" === column));
				const prefix = `${view}${matches.length ? ` close matches: ${matches.join(", ")};` : ""} columns: `;
				const total = Number(result.rows[0]![1]);
				const shown = [...columns];
				const render = () => prefix + shown.join(", ") + (total > shown.length ? `; ${total - shown.length} columns omitted` : "");
				const budget = Math.floor(1180 / Math.max(1, views.length));
				while (shown.length && render().length > budget) shown.pop();
				if (render().length <= budget) parts.push(render());
			}
			if (parts.length) hint = "Hint: " + parts.join("\n");
		}
	} catch { return error; }
	if (hint && hint.length <= 1200) error.message += "\n" + hint;
	return error;
}
