import { agentHome, PACKAGE_ROOT } from "./paths.js";
import { join } from "node:path";
import { loadTunables, type TunableAppConfig } from "./tunables.js";
import { APPROVED_TARGETS } from "./approvedTargets.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, basename } from "node:path";
import type { AppConfig, TargetConfig } from "../contracts.js";

export function assertLoopbackUrl(value: string): URL {
	const url = new URL(value);
	if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || url.username || url.password || url.search || url.hash)
		throw new Error("LLM URL must be an HTTP loopback URL without credentials, query or fragment");
	return url;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TunableAppConfig {
	const get = (key: string, fallback: string) => env[`PIAGENT_${key}`] ?? fallback;
	const path = (value: string) => resolve(value.startsWith("~/") ? `${homedir()}/${value.slice(2)}` : value);
	const num = (key: string, fallback: number) => {
		const n = Number(get(key, String(fallback)));
		if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid PIAGENT_${key}`);
		return n;
	};
	const baseUrl = get("LLM_BASE_URL", "http://127.0.0.1:8080/v1");
	const llmUrl = assertLoopbackUrl(baseUrl);
	if (llmUrl.port !== "8080" || llmUrl.pathname.replace(/\/$/, "") !== "/v1") throw new Error("Only Strata on port 8080 at /v1 is supported");
	const raw = JSON.parse(readFileSync(path(get("TARGETS_FILE", join(PACKAGE_ROOT, "config/targets.json"))), "utf8"));
	if (raw.version !== 1 || !Array.isArray(raw.targets) || raw.targets.length !== 2) throw new Error("Expected the two approved 19c targets");
	const seen = new Set<string>();
	for (const t of raw.targets) {
		const expected = APPROVED_TARGETS.find(expected => expected.name === t.name);
		if (!expected || seen.has(t.name) || typeof t.description !== "string" || !t.description || basename(t.passwordFile ?? "") !== t.passwordFile || Object.entries(expected).some(([key, value]) => t[key] !== value)) throw new Error("Invalid or unapproved target configuration");
		seen.add(t.name);
	}
	const targets = raw.targets as TargetConfig[];
	const defaultTarget = get("DEFAULT_TARGET", "d1-19c-lab");
	if (!seen.has(defaultTarget)) throw new Error("Unknown default target");
	const thinking = get("LLM_THINKING", "low") as AppConfig["llm"]["thinking"];
	if (!["off", "minimal", "low", "medium", "high"].includes(thinking)) throw new Error("Invalid thinking level");
	if (num("MAX_TOOL_RESULT_BYTES", 16384) < 128) throw new Error("Tool result budget must be at least 128 bytes");
	const contextWindow = num("LLM_CONTEXT_WINDOW", 131072);
	const maxOutputTokens = num("LLM_MAX_OUTPUT_TOKENS", 8000);
	if (maxOutputTokens >= contextWindow) throw new Error("Output token limit must be smaller than context window");
	return {
		llm: { ...loadTunables(env), baseUrl, model: get("LLM_MODEL", "qwen3.8-flash-next-iq3_s"), apiKeyFile: path(get("LLM_API_KEY_FILE", "~/llm-rig/strata/.config/strata/api-key")), contextWindow, maxOutputTokens, thinking, requestTimeoutSeconds: num("LLM_REQUEST_TIMEOUT_SECONDS", 600) },
		targets, defaultTarget, secretDir: path(get("SECRET_DIR", "/home/kiwi/OracleDBHarness/databases/secrets")),
		limits: { maxRows: num("MAX_ROWS", 200), statementTimeoutSeconds: num("STATEMENT_TIMEOUT_SECONDS", 30), maxToolResultBytes: num("MAX_TOOL_RESULT_BYTES", 16384), maxToolCalls: num("MAX_TOOL_CALLS", 20), maxWallSeconds: num("MAX_WALL_SECONDS", 300) },
		auditFile: path(get("AUDIT_FILE", join(agentHome(env), "audit.jsonl"))),
	};
}
