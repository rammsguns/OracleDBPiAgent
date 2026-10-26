import { APPROVED_ENDPOINTS, type ApprovedEndpoint } from "../config/approvedTargets.js";
export { APPROVED_ENDPOINTS, type ApprovedEndpoint } from "../config/approvedTargets.js";
import oracledb from "oracledb";
import { readFile } from "node:fs/promises";
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
export function createSessionProvider(config: AppConfig, approvedEndpoints: readonly ApprovedEndpoint[] = APPROVED_ENDPOINTS): SessionProvider {
	const sessions = new Set<OracleSession>();
	return {
		async get(targetName = config.defaultTarget) {
			const target = config.targets.find(t => t.name === targetName);
			if (!target) throw new Error(`Unknown target: ${targetName}`);
			if (!/^(HARNESS_LAB|HARNESS_RO)$/.test(target.username)) throw new Error("Account is not approved");
			if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(target.defaultSchema)) throw new Error("Invalid schema");
			const secretDir = process.env.PIAGENT_SECRET_DIR;
			if (!secretDir || resolve(secretDir) !== resolve(config.secretDir)) throw new Error("PIAGENT_SECRET_DIR must match config.secretDir");
			if (basename(target.passwordFile) !== target.passwordFile) throw new Error("Invalid password file");
			if (!approvedEndpoints.some(e => e.name === target.name && e.host === target.host && e.port === target.port && e.serviceName === target.serviceName && e.username === target.username)) throw new Error("Target endpoint is not approved");
			if (!oracledb.thin) throw new Error("Only thin mode is supported");
			const password = (await readFile(resolve(secretDir, target.passwordFile), "utf8")).trim();
			const connection = await oracledb.getConnection({ user: target.username, password, connectString: `${target.host}:${target.port}/${target.serviceName}` });
			let closed = false; let busy = false;
			try {
				connection.callTimeout = config.limits.statementTimeoutSeconds * 1000;
				const v = await connection.execute("SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%'", {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				const version = String(v.rows?.[0]?.[0] ?? "unknown"); gate19c(target.name, version);
				await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${target.defaultSchema}"`);
				const id = await connection.execute("SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER_HOST'), CASE WHEN SYS_CONTEXT('USERENV','CON_ID')='0' THEN 'NO' ELSE 'YES' END, SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM dual", {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
				const r = id.rows[0];
				const identity: DatabaseIdentity = { target: target.name, versionFull: version, dbName: r[0], instanceName: r[1], hostName: r[2], isCdb: r[3] === "YES", currentUser: r[4], currentSchema: r[5] };
				await connection.rollback();
				const session: OracleSession = {
					target, identity,
					async query(sql: string, binds = {}, options: QueryOptions = {}): Promise<QueryResult> {
						const statement = classifySql(sql);
						if (closed || busy) throw new Error("Session is closed or busy");
						const maxRows = options.maxRows ?? config.limits.maxRows;
						const timeout = options.timeoutSeconds ?? config.limits.statementTimeoutSeconds;
						if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > config.limits.maxRows || !Number.isFinite(timeout) || timeout <= 0 || timeout > config.limits.statementTimeoutSeconds) throw new Error("Invalid query limits");
						busy = true; const start = performance.now(); let resultSet: any;
						try {
							connection.callTimeout = timeout * 1000;
							await connection.execute("SET TRANSACTION READ ONLY");
							const result = await connection.execute(statement, binds, { resultSet: true, outFormat: oracledb.OUT_FORMAT_ARRAY, fetchArraySize: Math.min(maxRows + 1, 100) });
							resultSet = result.resultSet;
							const fetched = await resultSet.getRows(maxRows + 1);
							const rows: unknown[][] = [];
							for (const row of fetched) { const values = []; for (const value of row) values.push(await previewValue(value)); rows.push(values); }
							return { columns: result.metaData.map((c: any) => c.name), rows: rows.slice(0, maxRows), truncated: rows.length > maxRows, elapsedMs: performance.now() - start };
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
