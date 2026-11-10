// Shared interfaces between the work packages in PLAN.md (WP-A agent/LLM/CLI,
// WP-B Oracle/tools, WP-C evals/tests). Change this file only through the
// coordinator; every package codes against it.

import type { AgentTool } from "@earendil-works/pi-agent-core";

// ---------------------------------------------------------------------------
// Configuration (WP-A implements loadConfig in src/config/)

export type TargetEnvironment = "development" | "production-like" | "production";

export interface TargetConfig {
	name: string;
	description: string;
	host: string;
	port: number;
	serviceName: string;
	username: string;
	/** File name inside AppConfig.secretDir; the password never lives in config. */
	passwordFile: string;
	/** Schema set with ALTER SESSION SET CURRENT_SCHEMA after connect. */
	defaultSchema: string;
	environment: TargetEnvironment;
	/** Application log tables that `triage` may read (phase 16). Optional; validated by loadConfig. */
	logTables?: LogTableConfig[];
	/**
	 * Network protocol (phase 37). Default "tcp". "tcps" uses TLS: with `wallet`, mutual TLS
	 * (Oracle Cloud Autonomous Database wallets); without it, one-way TLS against a server
	 * certificate trusted by the system CA store.
	 */
	protocol?: "tcp" | "tcps";
	/** Oracle wallet for TCPS/mTLS connections (phase 37). Implies protocol "tcps". */
	wallet?: WalletConfig;
}

/**
 * An Oracle wallet directory read by node-oracledb Thin mode (phase 37). Only
 * `tnsnames.ora` and `ewallet.pem` are used; `cwallet.sso` (auto-login) is not readable
 * in Thin mode. When `host`, `port` or `serviceName` are omitted from targets.json,
 * loadConfig fills them from the alias entry in `tnsnames.ora`, so TargetConfig always
 * carries the resolved endpoint.
 */
export interface WalletConfig {
	/** Absolute path to a private directory (0700, files 0600) holding tnsnames.ora and ewallet.pem. */
	directory: string;
	/** Net service alias in tnsnames.ora, e.g. "mydb_high"; used as the connect string. */
	tnsAlias: string;
	/** File name inside AppConfig.secretDir holding the wallet password, when ewallet.pem is encrypted. */
	passwordFile?: string;
}

/** One application log table for issue triage: read-only, newest rows first, row-capped. */
export interface LogTableConfig {
	/** OWNER.TABLE, simple uppercase identifiers only. */
	table: string;
	/** DATE or TIMESTAMP column used for the time window and ordering. */
	timestampColumn: string;
	/** Columns shown in the evidence (message, level, module...). At most 8. */
	columns: string[];
}

export interface LlmConfig {
	/** Must be a loopback URL (127.0.0.1, ::1 or localhost); loadConfig refuses anything else. */
	baseUrl: string;
	model: string;
	apiKeyFile: string;
	contextWindow: number;
	maxOutputTokens: number;
	thinking: "off" | "minimal" | "low" | "medium" | "high";
	requestTimeoutSeconds: number;
	/** Optional harness tunables (PLAN.md "Model optimization loop"); unset keeps defaults. */
	temperature?: number;
	/** Appended after the fixed safety rules; never replaces them. */
	promptAppendix?: string;
	/** Extra text appended to known tools' descriptions. */
	toolNotes?: Record<string, string>;
}

export interface Limits {
	maxRows: number;
	statementTimeoutSeconds: number;
	maxToolResultBytes: number;
	maxToolCalls: number;
	maxWallSeconds: number;
}

export interface AppConfig {
	llm: LlmConfig;
	targets: TargetConfig[];
	defaultTarget: string;
	secretDir: string;
	limits: Limits;
	auditFile: string;
}

// ---------------------------------------------------------------------------
// Oracle access (WP-B implements in src/oracle/)

/** Thrown when a target is not Oracle Database 19c. The MVP supports 19c only. */
export class UnsupportedVersionError extends Error {
	constructor(
		readonly target: string,
		readonly versionFull: string,
	) {
		super(`Target ${target} runs Oracle ${versionFull}; only Oracle Database 19c is supported`);
		this.name = "UnsupportedVersionError";
	}
}

/** Thrown when a statement is not allowed by the read-only policy. */
export class StatementRejectedError extends Error {
	constructor(readonly reason: string) {
		super(`Statement rejected: ${reason}`);
		this.name = "StatementRejectedError";
	}
}

export interface DatabaseIdentity {
	target: string;
	versionFull: string; // e.g. "19.9.1.0.0"
	dbName: string;
	instanceName: string;
	hostName: string;
	isCdb: boolean;
	/** SYS_CONTEXT('USERENV','CON_NAME'); undefined for older test doubles (phase 28). */
	containerName?: string;
	currentUser: string;
	currentSchema: string;
}

export interface QueryOptions {
	maxRows?: number;
	timeoutSeconds?: number;
}

export interface QueryResult {
	columns: string[];
	columnTypes?: string[];
	rows: unknown[][];
	/** True when more rows existed than maxRows. */
	truncated: boolean;
	elapsedMs: number;
}

export interface OracleSession {
	readonly target: TargetConfig;
	/** Filled by the 19c gate on open. */
	readonly identity: DatabaseIdentity;
	/** Runs one read-only statement (see PLAN.md "Read-only policy"). */
	query(sql: string, binds?: Record<string, unknown>, options?: QueryOptions): Promise<QueryResult>;
	close(): Promise<void>;
}

export interface SessionProvider {
	/** Opens (or reuses) a session; runs the 19c gate first. Unknown name -> Error. */
	get(targetName?: string): Promise<OracleSession>;
	closeAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Audit (WP-A implements a JSONL sink in src/audit/)

export interface AuditEvent {
	unverifiedCount?: number;
	at: string; // ISO timestamp
	runId: string;
	kind: "run_start" | "tool_call" | "tool_blocked" | "tool_error" | "run_end";
	target?: string;
	tool?: string;
	/** SHA-256 of the SQL text; the SQL itself is recorded only in sqlText when short. */
	sqlSha256?: string;
	sqlText?: string;
	rows?: number;
	truncated?: boolean;
	elapsedMs?: number;
	detail?: string;
}

export interface AuditSink {
	record(event: AuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tools (WP-B implements createDbTools in src/tools/index.ts)

export interface ToolContext {
	config: AppConfig;
	sessions: SessionProvider;
	audit: AuditSink;
	runId: string;
	/** When set, tool calls for any other target are blocked (the user asked about this one). */
	pinnedTarget?: string;
}

export type CreateDbTools = (ctx: ToolContext) => AgentTool<any>[];
