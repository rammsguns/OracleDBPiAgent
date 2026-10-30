// Imported only by the eval runner; product loadConfig never reads eval variables.
import { resolve } from "node:path";
import type { LlmConfig } from "../contracts.js";
export type EvalEndpoint = "primary" | "secondary";
export const SECONDARY_BASE_URL = "http://127.0.0.1:18080/v1";
export function evalLlmConfig(primary: LlmConfig, endpoint: EvalEndpoint, env: NodeJS.ProcessEnv = process.env): LlmConfig {
	if (endpoint === "primary") return primary;
	if (endpoint !== "secondary") throw new Error("Invalid eval endpoint");
	if (env.PIAGENT_EVAL_SECONDARY_BASE_URL !== SECONDARY_BASE_URL) throw new Error("Secondary eval URL must be http://127.0.0.1:18080/v1 exactly");
	const keyFile = env.PIAGENT_EVAL_SECONDARY_API_KEY_FILE;
	if (!keyFile) throw new Error("Secondary eval API key file is required");
	const contextWindow = Number(env.PIAGENT_EVAL_SECONDARY_CONTEXT_WINDOW ?? 32768);
	if (!Number.isSafeInteger(contextWindow) || contextWindow <= primary.maxOutputTokens) throw new Error("Invalid secondary context window");
	return { ...primary, baseUrl: SECONDARY_BASE_URL, apiKeyFile: resolve(keyFile), contextWindow };
}
