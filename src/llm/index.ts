import type { TunableLlmConfig } from "../config/tunables.js";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { readFile } from "node:fs/promises";
import { createModels, createProvider } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { assertLoopbackUrl } from "../config/index.js";
import type { LlmConfig } from "../contracts.js";

export async function checkStrataHealth(cfg: LlmConfig): Promise<void> {
	const url = assertLoopbackUrl(cfg.baseUrl);
	if (url.port !== "8080" || url.pathname.replace(/\/$/, "") !== "/v1") throw new Error("Only Strata on port 8080 at /v1 is supported");
	const response = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(5000), redirect: "error" });
	if (!response.ok) throw new Error("Strata health check failed");
	const health = await response.json() as { status?: string; loaded?: boolean; model_loaded?: boolean };
	if (health.loaded === false || health.model_loaded === false || !["ok", "loaded", "healthy"].includes(health.status ?? "")) throw new Error("Strata is unloaded or not ready; do not restart or reconfigure it");
}
let streamQueue: Promise<void> = Promise.resolve();
export const strataFetch: typeof fetch = async (input, init) => {
	const url = assertLoopbackUrl(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
	if (url.port !== "8080" || !url.pathname.startsWith("/v1/")) throw new Error("Only the local Strata API is allowed");
	return fetch(input, { ...init, redirect: "error" });
};
export async function createStrataProvider(cfg: LlmConfig) {
	assertLoopbackUrl(cfg.baseUrl);
	await checkStrataHealth(cfg);
	const apiKey = (await readFile(cfg.apiKeyFile, "utf8")).trim();
	if (!apiKey) throw new Error("Empty Strata API key file");
	const model: Model<"openai-completions"> = { id: cfg.model, name: "Strata", api: "openai-completions", provider: "strata", baseUrl: cfg.baseUrl, reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: cfg.contextWindow, maxTokens: cfg.maxOutputTokens };
	const models = createModels();
	models.setProvider(createProvider({ id: "strata", name: "Strata", baseUrl: cfg.baseUrl, auth: { apiKey: { name: "Strata", resolve: async () => ({ auth: { apiKey } }) } }, models: [model], api: openAICompletionsApi() }));
	const streamFn: StreamFn = async (m, context, options) => {
		let release!: () => void;
		const previous = streamQueue;
		streamQueue = new Promise<void>(resolve => { release = resolve; });
		await previous;
		try {
			const reasoningBudget = (cfg as TunableLlmConfig).reasoningBudgetTokens;
			const stream = models.streamSimple(m, context, { ...options, ...((cfg as TunableLlmConfig).temperature === undefined ? {} : { temperature: (cfg as TunableLlmConfig).temperature }), ...(reasoningBudget === undefined ? {} : { samplingParams: { ...options?.samplingParams, reasoning_budget_tokens: reasoningBudget } }), fetch: strataFetch });
			void stream.result().then(release, release);
			return stream;
		} catch (error) { release(); throw error; }
	};
	return { model, streamFn };
}
