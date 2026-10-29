import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export function agentHome(env: NodeJS.ProcessEnv = process.env): string {
	return resolve(env.PIAGENT_HOME ?? join(env.HOME ?? homedir(), ".piagent"));
}
export function reportDirectory(env: NodeJS.ProcessEnv = process.env): string {
	return resolve(env.PIAGENT_REPORT_DIRECTORY ?? join(agentHome(env), "reports"));
}
