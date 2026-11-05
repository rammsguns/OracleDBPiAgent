import { expect, it, vi } from "vitest";
import { SAFE_CONFIG_MESSAGES, SafeConfigError } from "../../src/config/safeErrors.js";
import { handleCliError } from "../../src/cli/index.js";

const expected = [
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
	"Invalid PIAGENT_MAX_WALL_SECONDS"
];

it("lists every reviewed safe configuration message", () => {
	expect(SAFE_CONFIG_MESSAGES).toEqual(expected);
	const previous = process.exitCode;
	const output = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		for (const message of SAFE_CONFIG_MESSAGES) {
			handleCliError(new SafeConfigError(message));
			expect(output).toHaveBeenLastCalledWith(message);
			expect(process.exitCode).toBe(1);
		}
	} finally { output.mockRestore(); process.exitCode = previous; }
});

it("rejects runtime messages outside the reviewed catalog", () => {
	expect(() => new SafeConfigError("sensitive runtime input" as never)).toThrow("Unreviewed configuration message");
});

it("keeps native errors generic even when their messages contain private input", async () => {
	const { loadConfig } = await import("../../src/config/index.js");
	const previous = process.exitCode;
	const output = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		for (const env of [
			{ PIAGENT_LLM_BASE_URL: "private-invalid-url" },
			{ PIAGENT_TARGETS_FILE: "/nonexistent/private-target-file" },
		]) {
			let failure: unknown;
			try { loadConfig(env); } catch (error) { failure = error; }
			expect(failure).toBeInstanceOf(Error);
			expect(failure).not.toBeInstanceOf(SafeConfigError);
			handleCliError(failure);
			expect(output).toHaveBeenLastCalledWith("piagent failed; check local configuration and service availability");
		}
	} finally { output.mockRestore(); process.exitCode = previous; }
});
