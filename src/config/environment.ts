import { constants, chmodSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { agentHome, PACKAGE_ROOT } from "./paths.js";

export function ensureAgentHome(env: NodeJS.ProcessEnv = process.env): string {
	const home = agentHome(env);
	mkdirSync(home, { recursive: true, mode: 0o700 });
	chmodSync(home, 0o700);
	return home;
}
export function loadEnvironment(env: NodeJS.ProcessEnv = process.env): void {
	const file = env.PIAGENT_ENV_FILE ?? join(agentHome(env), ".env");
	let fd: number;
	try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw new Error("Cannot open private environment file");
	}
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("Environment file must be a private regular file (0600)");
		let parsed: ReturnType<typeof parseEnv>;
		try { parsed = parseEnv(readFileSync(fd, "utf8")); }
		catch { throw new Error("Cannot parse environment file"); }
		for (const [key, value] of Object.entries(parsed)) if (env[key] === undefined) env[key] = value;
	} finally { closeSync(fd); }
}
export function initializeHome(env: NodeJS.ProcessEnv = process.env): boolean {
	const home = ensureAgentHome(env);
	const template = readFileSync(join(PACKAGE_ROOT, ".env.example"), "utf8")
		.replace(/^PIAGENT_LLM_API_KEY_FILE=.*$/m, "PIAGENT_LLM_API_KEY_FILE=/absolute/path/to/strata-api-key")
		.replace(/^PIAGENT_SECRET_DIR=.*$/m, "PIAGENT_SECRET_DIR=/absolute/path/to/db-secrets")
		.replace(/^PIAGENT_TARGETS_FILE=.*$/m, "# PIAGENT_TARGETS_FILE=/absolute/path/to/targets.json")
		.replace(/^PIAGENT_AUDIT_FILE=.*$/m, "# PIAGENT_AUDIT_FILE=/absolute/path/to/audit.jsonl")
		.replace(/^# Copy to.*$/m, "# Private piagent settings. Edit paths below; never put credentials here.");
	try { writeFileSync(join(home, ".env"), template, { flag: "wx", mode: 0o600 }); return true; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw new Error("Cannot initialize private environment file"); }
}
