import { loadTargets } from './targets.js';
import { SafeConfigError } from "./safeErrors.js";
import { agentHome, PACKAGE_ROOT } from "./paths.js";
import { join } from "node:path";
import { loadTunables, type TunableAppConfig } from "./tunables.js";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AppConfig } from "../contracts.js";

import { validateLogTables } from "./logTables.js";

export function assertLoopbackUrl(value: string): URL {
	const url = new URL(value);
	if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || url.username || url.password || url.search || url.hash)
		throw new SafeConfigError("LLM URL must be an HTTP loopback URL without credentials, query or fragment");
	return url;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TunableAppConfig {
	const get = (key: string, fallback: string) => env[`PIAGENT_${key}`] ?? fallback;
	const path = (value: string) => resolve(value.startsWith("~/") ? `${homedir()}/${value.slice(2)}` : value);
	const numericErrors = {
		MAX_TOOL_RESULT_BYTES: "Invalid PIAGENT_MAX_TOOL_RESULT_BYTES",
		LLM_CONTEXT_WINDOW: "Invalid PIAGENT_LLM_CONTEXT_WINDOW",
		LLM_MAX_OUTPUT_TOKENS: "Invalid PIAGENT_LLM_MAX_OUTPUT_TOKENS",
		LLM_REQUEST_TIMEOUT_SECONDS: "Invalid PIAGENT_LLM_REQUEST_TIMEOUT_SECONDS",
		MAX_ROWS: "Invalid PIAGENT_MAX_ROWS",
		STATEMENT_TIMEOUT_SECONDS: "Invalid PIAGENT_STATEMENT_TIMEOUT_SECONDS",
		MAX_TOOL_CALLS: "Invalid PIAGENT_MAX_TOOL_CALLS",
		MAX_WALL_SECONDS: "Invalid PIAGENT_MAX_WALL_SECONDS",
	} as const;
	const num = (key: keyof typeof numericErrors, fallback: number) => {
		const n = Number(get(key, String(fallback)));
		if (!Number.isSafeInteger(n) || n < 1) throw new SafeConfigError(numericErrors[key]);
		return n;
	};
	const baseUrl = get("LLM_BASE_URL", "http://127.0.0.1:8080/v1");
	const llmUrl = assertLoopbackUrl(baseUrl);
	if (llmUrl.port !== "8080" || llmUrl.pathname.replace(/\/$/, "") !== "/v1") throw new SafeConfigError("Only Strata on port 8080 at /v1 is supported");
	const targets = loadTargets(env);
	const defaultTarget = get("DEFAULT_TARGET", targets[0]!.name);
	if (!targets.some(t => t.name === defaultTarget)) throw new SafeConfigError("Unknown default target");
	const thinking = get("LLM_THINKING", "low") as AppConfig["llm"]["thinking"];
	if (!["off", "minimal", "low", "medium", "high"].includes(thinking)) throw new SafeConfigError("Invalid thinking level");
	if (num("MAX_TOOL_RESULT_BYTES", 16384) < 128) throw new SafeConfigError("Tool result budget must be at least 128 bytes");
	const contextWindow = num("LLM_CONTEXT_WINDOW", 131072);
	const maxOutputTokens = num("LLM_MAX_OUTPUT_TOKENS", 8000);
	if (maxOutputTokens >= contextWindow) throw new SafeConfigError("Output token limit must be smaller than context window");
	return {
		llm: { ...loadTunables(env), baseUrl, model: get("LLM_MODEL", "qwen3.8-flash-next-iq3_s"), apiKeyFile: path(get("LLM_API_KEY_FILE", "~/llm-rig/strata/.config/strata/api-key")), contextWindow, maxOutputTokens, thinking, requestTimeoutSeconds: num("LLM_REQUEST_TIMEOUT_SECONDS", 600) },
		targets, defaultTarget, secretDir: path(get("SECRET_DIR", "/home/kiwi/OracleDBHarness/databases/secrets")),
		limits: { maxRows: num("MAX_ROWS", 200), statementTimeoutSeconds: num("STATEMENT_TIMEOUT_SECONDS", 30), maxToolResultBytes: num("MAX_TOOL_RESULT_BYTES", 16384), maxToolCalls: num("MAX_TOOL_CALLS", 20), maxWallSeconds: num("MAX_WALL_SECONDS", 300) },
		auditFile: path(get("AUDIT_FILE", join(agentHome(env), "audit.jsonl"))),
	};
}
