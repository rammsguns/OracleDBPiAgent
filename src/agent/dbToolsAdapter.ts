import { Type } from "typebox";
import type { CreateDbTools, ToolContext, SessionProvider } from "../contracts.js";

async function optionalModule(path: string) {
	try { return await import(path); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" && (error as Error).message.includes(path.replace("..", ""))) return undefined;
		throw error;
	}
}
export async function createDbTools(ctx: ToolContext) {
	const module = await optionalModule("../tools/index.js");
	if (module) return (module.createDbTools as CreateDbTools)(ctx);
	return [{ name: "list_targets", label: "List targets", description: "List configured Oracle 19c targets. Database tools are not installed yet.", parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text" as const, text: JSON.stringify(ctx.config.targets.map(({ name, description, environment }) => ({ name, description, environment }))) }], details: { stub: true } }) }];
}
export async function createSessions(config: ToolContext["config"]): Promise<SessionProvider> {
	const module = await optionalModule("../oracle/index.js");
	if (module?.createSessionProvider) return module.createSessionProvider(config);
	return { get: async () => { throw new Error("WP-B session provider is unavailable"); }, closeAll: async () => {} };
}
