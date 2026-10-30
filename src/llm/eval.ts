// Eval-only entry point. Never imported by CLI, web, report, or the agent.
import { stat } from "node:fs/promises";
import type { LlmConfig } from "../contracts.js";
import { SECONDARY_BASE_URL } from "../config/eval.js";
import { createProviderInternal } from "./internal.js";
export interface EvalHealth { loaded: true; model: string }
export async function evalHealth(cfg: LlmConfig, request: typeof fetch = fetch): Promise<EvalHealth> {
	if (!["http://127.0.0.1:8080/v1", SECONDARY_BASE_URL].includes(cfg.baseUrl)) throw new Error("Invalid eval health endpoint");
	try {
		const response = await request(new URL("/health", cfg.baseUrl), { signal: AbortSignal.timeout(5000), redirect: "error" });
		if (!response.ok) throw new Error();
		const health = await response.json() as Record<string, unknown>;
		// Persist only these fields: never retain arbitrary health response content.
		const model = health.model;
		if (health.loaded !== true || health.model_loaded === false || typeof model !== "string" || model !== cfg.model) throw new Error();
		return { loaded: true, model };
	} catch { throw new Error("Eval Strata must be loaded and serve the primary model; stop without reconfiguring"); }
}
export async function createEvalStrataProvider(cfg: LlmConfig) {
	if (cfg.baseUrl !== SECONDARY_BASE_URL) throw new Error("Invalid secondary eval endpoint");
	const info = await stat(cfg.apiKeyFile);
	if (!info.isFile() || (info.mode & 0o777) !== 0o600) throw new Error("Secondary API key file must have mode 0600");
	await evalHealth(cfg);
	return createProviderInternal(cfg, true);
}
