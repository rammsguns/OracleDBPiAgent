import type { LlmConfig } from "../contracts.js";
import { createProviderInternal } from "./internal.js";
export { checkStrataHealth, strataFetch } from "./internal.js";
export async function createStrataProvider(cfg: LlmConfig) {
	return createProviderInternal(cfg);
}
