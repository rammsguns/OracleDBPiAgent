/** Reviewed fixed guidance only: never pass runtime input as a message. */
export const SAFE_CONFIG_MESSAGES = Object.freeze([
	"Set PIAGENT_LLM_API_KEY_FILE to your private Strata API-key file; the init placeholder is still configured. Edit your private .env or export PIAGENT_LLM_API_KEY_FILE.",
	"LLM URL must be an HTTP loopback URL without credentials, query or fragment",
	"Only Strata on port 8080 at /v1 is supported",
	"Expected the two approved 19c targets",
	"Invalid or unapproved target configuration",
	"Unknown default target",
	"Invalid thinking level",
	"Tool result budget must be at least 128 bytes",
	"Output token limit must be smaller than context window",
	"Tunable file must be a regular file of at most 8192 bytes",
	"Tunable file exceeds 8192 bytes",
	"Invalid PIAGENT_GROUNDING_CHECK",
	"Invalid PIAGENT_LLM_REASONING_BUDGET",
	"Invalid PIAGENT_LLM_TEMPERATURE",
	"Invalid PIAGENT_DROP_PRIOR_THINKING",
	"Tool notes must be an object of strings",
	"Unknown tool name in tool notes",
	"PIAGENT_HOME must be a real directory, not a symlink",
	"PIAGENT_HOME must be owned by the current user",
	"PIAGENT_HOME must be private (mode 0700)",
	"Cannot create or inspect PIAGENT_HOME private directory",
	"Cannot open private environment file",
	"Environment file must be a private regular file (0600)",
	"Cannot parse environment file",
	"Cannot initialize private environment file",
	"Invalid logTables configuration",
	"Invalid logTables entry",
	"logTables requires OWNER.TABLE and simple uppercase columns (1–8)",
	"Invalid eval endpoint",
	"Secondary eval URL must be http://127.0.0.1:18080/v1 exactly",
	"Secondary eval API key file is required",
	"Invalid secondary context window",
	"Invalid port",
	"Report requires --target",
	"Choose --json or --md",
	"--diff-only cannot summarize",
	"Schedule requires --target and --every",
	"Unknown target",
	"Invalid PIAGENT_MAX_TOOL_RESULT_BYTES",
	"Invalid PIAGENT_LLM_CONTEXT_WINDOW",
	"Invalid PIAGENT_LLM_MAX_OUTPUT_TOKENS",
	"Invalid PIAGENT_LLM_REQUEST_TIMEOUT_SECONDS",
	"Invalid PIAGENT_MAX_ROWS",
	"Invalid PIAGENT_STATEMENT_TIMEOUT_SECONDS",
	"Invalid PIAGENT_MAX_TOOL_CALLS",
	"Invalid PIAGENT_MAX_WALL_SECONDS",
	"Set PIAGENT_SECRET_DIR to the same private secret directory configured for this process.",
	"Account is not approved",
	"Invalid schema",
	"Invalid password file",
	"Target endpoint is not approved",
	"Only thin mode is supported",
	"Invalid query limits"
] as const);
export type SafeConfigMessage = typeof SAFE_CONFIG_MESSAGES[number];

export class SafeConfigError extends Error {
	constructor(message: SafeConfigMessage = SAFE_CONFIG_MESSAGES[0]) {
		// Enforce the catalog even for untyped callers.
		if (!SAFE_CONFIG_MESSAGES.includes(message)) throw new Error("Unreviewed configuration message");
		super(message);
		this.name = "SafeConfigError";
	}
}
