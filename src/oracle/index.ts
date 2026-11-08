import { oracleAction } from './observability.js';
import { recordConnectionFailure, PasswordFileError } from './connectionErrors.js';
import { validateTarget, usesPackagedTargets } from '../config/targets.js';
import { checkAccount } from './account.js';
import { SafeConfigError } from "../config/safeErrors.js";
import { APPROVED_ENDPOINTS, APPROVED_TARGETS, type ApprovedEndpoint } from "../config/approvedTargets.js";
export { APPROVED_ENDPOINTS, type ApprovedEndpoint } from "../config/approvedTargets.js";
import oracledb from "oracledb";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, basename } from "node:path";
import { UnsupportedVersionError, type AppConfig, type OracleSession, type SessionProvider, type QueryOptions, type QueryResult, type DatabaseIdentity } from "../contracts.js";
import { classifySql } from "./sqlPolicy.js";

export function gate19c(target: string, version: string): void {
	if (!/^19\./.test(version)) throw new UnsupportedVersionError(target, version);
}
export async function previewValue(value: any): Promise<unknown> {
	if (!value || typeof value.getData !== "function") return value;
	try {
		const data = await value.getData(1, 1024);
		return Buffer.isBuffer(data) ? data.subarray(0, 4096).toString("hex").slice(0, 4096) : Buffer.from(String(data)).subarray(0, 4096).toString("utf8");
	} finally { await value.destroy(); }
}

/** approvedEndpoints is overridable only so the gate integration test can reach a non-19c DB. */
export function createSessionProvider(config: AppConfig, approvedEndpoints?: readonly ApprovedEndpoint[], instrumentation?: { tag: string; statement: (sql: string, elapsedMs: number, error?: string) => void }): SessionProvider {
	const sessions = new Set<OracleSession>();
	return {
		async get(targetName = config.defaultTarget) {
			const target = config.targets.find(t => t.name === targetName);
			if (!target) throw new SafeConfigError("Unknown target");
			validateTarget(target);
			if (usesPackagedTargets(config.targets) && !APPROVED_TARGETS.some(e => Object.entries(e).every(([k,v]) => (target as any)[k] === v))) throw new SafeConfigError("Target endpoint is not approved");
			if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(target.defaultSchema)) throw new SafeConfigError("Invalid schema");
			const secretDir = process.env.PIAGENT_SECRET_DIR;
			if (!secretDir || resolve(secretDir) !== resolve(config.secretDir)) throw recordConnectionFailure(new SafeConfigError("Set PIAGENT_SECRET_DIR to the same private secret directory configured for this process."));
			if (basename(target.passwordFile) !== target.passwordFile) throw new SafeConfigError("Invalid password file");
			if (approvedEndpoints && !approvedEndpoints.some(e => e.name === target.name && e.host === target.host && e.port === target.port && e.serviceName === target.serviceName && e.username === target.username)) throw new SafeConfigError("Target endpoint is not approved");
			if (!oracledb.thin) throw new SafeConfigError("Only thin mode is supported");
			let password: string;
			try {
				// Use nonblocking open for FIFOs; inspect the opened file before reading.
				const file = await open(resolve(secretDir, target.passwordFile), constants.O_RDONLY | constants.O_NONBLOCK);
				try {
					const info = await file.stat();
					if (!info.isFile() || !(info.mode & 0o444)) throw new Error();
					password = (await file.readFile("utf8")).trim();
					if (!password) throw new Error();
				} finally { await file.close(); }
			} catch { throw recordConnectionFailure(new PasswordFileError(target.name, basename(target.passwordFile))); }
			const connection = await oracledb.getConnection({ user: target.username, password, connectString: `${target.host}:${target.port}/${target.serviceName}` }).catch((error: unknown) => { throw recordConnectionFailure(error); });
			connection.module = 'piagent';
			const sessionAction = oracleAction();
			connection.action = sessionAction;
			if (instrumentation) {
				if (!/^[a-zA-Z0-9_]+$/.test(instrumentation.tag)) { await connection.close(); throw new Error('Invalid measurement tag'); }
				const execute = connection.execute.bind(connection);
				connection.execute = async (sql: string, ...args: any[]) => {
					const start = performance.now(); let error: string | undefined;
					try { return await execute(`/* ${instrumentation.tag} */ ${sql}`, ...args); }
					catch (e) { error = /ORA-\d+/.exec(String(e))?.[0] ?? 'execute failed'; throw e; }
					finally { instrumentation.statement(sql, performance.now() - start, error); }
				};
			}
			let closed = false; let busy = false;
			try {
				connection.callTimeout = config.limits.statementTimeoutSeconds * 1000;
				const v = await connection.execute("SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%'", {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				const version = String(v.rows?.[0]?.[0] ?? "unknown"); gate19c(target.name, version);
				await checkAccount(connection, target.username, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${target.defaultSchema}"`);
				await connection.execute("ALTER SESSION SET TIME_ZONE = '+00:00'");
				const id = await connection.execute("SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER_HOST'), CASE WHEN SYS_CONTEXT('USERENV','CON_ID')='0' THEN 'NO' ELSE 'YES' END, SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','CURRENT_SCHEMA'), SYS_CONTEXT('USERENV','CON_NAME'), TO_CHAR(SYSTIMESTAMP, 'TZH:TZM') FROM dual", {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				const r = id.rows[0];
				const databaseOffset = r[7];
				await connection.execute(`ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS' NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF9'`);
				// Request server-formatted text before the driver constructs any host-local Date.
				// Consumers still receive normalized Date instants, preserving their existing API.
				const fetchTypeHandler = (metadata: any) => {
					if ([oracledb.DB_TYPE_DATE, oracledb.DB_TYPE_TIMESTAMP].includes(metadata.dbType)) return {
						type: oracledb.STRING,
						converter: (value: string | null) => oracleWallTime(value, databaseOffset),
					};
				};
				const identity: DatabaseIdentity = { target: target.name, versionFull: version, dbName: r[0], instanceName: r[1], hostName: r[2], isCdb: r[3] === "YES", currentUser: r[4], currentSchema: r[5], containerName: r[6] };
				await connection.rollback();
				const session: OracleSession = {
					target, identity,
					async query(sql: string, binds = {}, options: QueryOptions = {}): Promise<QueryResult> {
						const statement = classifySql(sql);
						if (closed || busy) throw new Error("Session is closed or busy");
						const maxRows = options.maxRows ?? config.limits.maxRows;
						const timeout = options.timeoutSeconds ?? config.limits.statementTimeoutSeconds;
						if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > config.limits.maxRows || !Number.isFinite(timeout) || timeout <= 0 || timeout > config.limits.statementTimeoutSeconds) throw new SafeConfigError("Invalid query limits");
						busy = true; const start = performance.now(); let resultSet: any;
						try {
							connection.action = oracleAction() === 'query' ? sessionAction : oracleAction();
							connection.callTimeout = timeout * 1000;
							await connection.execute("SET TRANSACTION READ ONLY");
							// Read execute metadata without fetching values: STRING alone still passes
							// dates through a host-local Date in this thin driver. Only wall-clock
							// queries need a second execute with server-side TO_CHAR projections.
							const executeOptions = { resultSet: true, outFormat: oracledb.OUT_FORMAT_ARRAY, prefetchRows: 0, fetchArraySize: Math.min(maxRows + 1, 100), fetchTypeHandler };
							let result = await connection.execute(statement, binds, executeOptions);
							resultSet = result.resultSet;
							const metadata = result.metaData;
							const wallColumns = metadata.map((c: any) => [oracledb.DB_TYPE_DATE, oracledb.DB_TYPE_TIMESTAMP].includes(c.dbType));
							if (wallColumns.some(Boolean)) {
								await resultSet.close(); resultSet = undefined;
								let wallQueryName = 'PIAGENT_WALL_QUERY';
								while (statement.toUpperCase().includes(wallQueryName)) wallQueryName += '_';
								const aliases = metadata.map((_: any, i: number) => 'PIAGENT_COL_' + i);
								const wallStatement = `${wallQueryPrefix(statement, aliases, wallQueryName)} SELECT ${metadata.map((c: any, i: number) =>
									(wallColumns[i] ? `TO_CHAR(${aliases[i]}, 'YYYY-MM-DD"T"HH24:MI:SS${c.dbType === oracledb.DB_TYPE_TIMESTAMP ? '.FF9' : ''}')` : aliases[i]) +
									' AS "' + c.name.replace(/"/g, '""') + '"').join(',')} FROM ${wallQueryName}`;
								// Formatted wall columns are VARCHAR now, so normal prefetch is safe.
								result = await connection.execute(wallStatement, binds, { ...executeOptions, prefetchRows: 2 });
								resultSet = result.resultSet;
							}
							const fetched = await resultSet.getRows(maxRows + 1);
							const rows: unknown[][] = [];
							for (const row of fetched) { const values = []; for (const [i, value] of row.entries()) values.push(wallColumns[i] ? oracleWallTime(value as string | null, databaseOffset) : await previewValue(value)); rows.push(values); }
							return { columns: (metadata.length ? metadata : result.metaData).map((c: any) => c.name), columnTypes: (metadata.length ? metadata : result.metaData).map((c: any) => c.dbTypeName), rows: rows.slice(0, maxRows), truncated: rows.length > maxRows, elapsedMs: performance.now() - start };
						} finally { try { await resultSet?.close(); } finally { try { await connection.rollback(); } finally { busy = false; } } }
					},
					async close() { if (!closed) { closed = true; sessions.delete(session); await connection.close(); } },
				};
				sessions.add(session); return session;
			} catch (error) { await connection.close(); throw error; }
		},
		async closeAll() { await Promise.all([...sessions].map(s => s.close())); },
	};
}

/** Convert database wall time without consulting the host TZ. */
export function oracleWallTime(value: string | null, offset: string): Date | null {
	if (value === null) return null;
	if (!/^[+-]\d{2}:\d{2}$/.test(offset)) throw new Error("Database time-zone offset unavailable");
	const date = new Date(value.replace(/(\.\d{3})\d+$/, '$1') + offset);
	if (!Number.isFinite(date.getTime())) throw new Error("Invalid Oracle wall time");
	return date;
}

// Oracle 19c forbids nested WITH clauses. Hoist existing CTEs before our wrapper.
// Lex only structural tokens; literals, quoted identifiers and comments stay intact.
function wallQueryPrefix(statement: string, aliases: string[], name: string): string {
	let depth = 0, first = true, withClause = false;
	const tokens = /--[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|'(?:[^']|'')*'|[()]|\b(?:WITH|SELECT)\b/gi;
	for (const token of statement.matchAll(tokens)) {
		const text = token[0];
		if (/^(?:--|\/\*|"|')/.test(text)) continue;
		if (first) { withClause = text.toUpperCase() === 'WITH'; first = false; }
		if (text === '(') depth++;
		else if (text === ')') depth--;
		else if (text.toUpperCase() === 'SELECT' && depth === 0) {
			const at = token.index!;
			return (withClause ? statement.slice(0, at) + ', ' : 'WITH ') +
				`${name} (${aliases.join(',')}) AS (${withClause ? statement.slice(at) : statement})`;
		}
	}
	throw new Error('Cannot format Oracle wall-clock columns');
}
