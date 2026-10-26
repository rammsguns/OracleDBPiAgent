// Shared interfaces between the work packages in PLAN.md (WP-A agent/LLM/CLI,
// WP-B Oracle/tools, WP-C evals/tests). Change this file only through the
// coordinator; every package codes against it.

import type { AgentTool } from "@earendil-works/pi-agent-core";

// ---------------------------------------------------------------------------
// Configuration (WP-A implements loadConfig in src/config/)

export type TargetEnvironment = "development" | "production-like";

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
	currentUser: string;
	currentSchema: string;
}

export interface QueryOptions {
	maxRows?: number;
	timeoutSeconds?: number;
}

export interface QueryResult {
	columns: string[];
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
}

export type CreateDbTools = (ctx: ToolContext) => AgentTool<any>[];
