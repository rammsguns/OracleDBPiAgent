#!/usr/bin/env node
import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/index.js";
import { checkStrataHealth } from "../llm/index.js";
import { JsonlAuditSink } from "../audit/index.js";
import { createOracleAgent } from "../agent/index.js";
import { createSessions } from "../agent/dbToolsAdapter.js";
import type { AppConfig } from "../contracts.js";

export async function doctor(config: AppConfig): Promise<boolean> {
	let ok = true;
	try { await checkStrataHealth(config.llm); console.log("Strata: loaded (loopback)"); }
	catch { console.error("Strata: unavailable or unloaded; no configuration changes made"); return false; }
	const sessions = await createSessions(config);
	try {
		for (const target of config.targets) {
			try {
				const session = await sessions.get(target.name);
				if (session.identity.versionFull.split(".")[0] !== "19" || session.identity.currentUser.toUpperCase() !== target.username) throw new Error("Identity mismatch");
				const privileges = await session.query("SELECT PRIVILEGE FROM SESSION_PRIVS");
				const roles = await session.query("SELECT ROLE FROM SESSION_ROLES");
				const objectGrants = await session.query("SELECT PRIVILEGE FROM USER_TAB_PRIVS_RECD UNION SELECT PRIVILEGE FROM ROLE_TAB_PRIVS WHERE ROLE IN (SELECT ROLE FROM SESSION_ROLES)");
				if (objectGrants.rows.some(r => !["SELECT", "READ", "REFERENCES"].includes(String(r[0])))) throw new Error("Unexpected object privileges");
				const safe = new Set(["CREATE SESSION", "SELECT ANY DICTIONARY"]);
				if (privileges.rows.some(r => !safe.has(String(r[0]))) || roles.rows.some(r => ["DBA", "RESOURCE", "IMP_FULL_DATABASE", "EXP_FULL_DATABASE"].includes(String(r[0])))) throw new Error("Unexpected privileges");
				console.log(`${target.name}: Oracle ${session.identity.versionFull}, ${session.identity.currentUser}; session privileges: ${privileges.rows.map(r => r[0]).join(", ")}`);
			} catch { ok = false; console.error(`${target.name}: connection, 19c gate, or read-only privilege check failed (WP-B required)`); }
		}
	} finally { await sessions.closeAll(); }
	return ok;
}
export async function main(argv = process.argv) {
	const program = new Command().name("piagent").description("Read-only Oracle 19c assistant using local Strata");
	program.command("targets").action(() => {
		const cfg = loadConfig();
		for (const target of cfg.targets) console.log(`${target.name}\t${target.environment}\t${target.description}`);
	});
	program.command("doctor").action(async () => { if (!await doctor(loadConfig())) process.exitCode = 1; });
	async function run(question: string | undefined, options: { target?: string; json?: boolean }) {
		const config = loadConfig();
		let pinnedTarget: string | undefined;
		if (options.target) {
			if (!config.targets.some(t => t.name === options.target)) throw new Error("Unknown target");
			config.defaultTarget = options.target;
			pinnedTarget = options.target;
		}
		await checkStrataHealth(config.llm);
		const sessions = await createSessions(config);
		const ctx = { config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID(), pinnedTarget };
		try {
			const agent = await createOracleAgent(ctx);
			let toolCalls: { name: string; id: string }[] = [];
			agent.subscribe(event => {
				if (event.type === "tool_execution_start") toolCalls.push({ name: event.toolName, id: event.toolCallId });
				if (!options.json && event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") process.stdout.write(event.assistantMessageEvent.delta);
			});
			const ask = async (q: string) => {
				toolCalls = [];
				const offset = agent.state.messages.length;
				await agent.prompt(q);
				if (agent.state.errorMessage) throw new Error("Local model request failed");
				const replies = agent.state.messages.slice(offset).filter(m => m.role === "assistant");
				const last = replies.at(-1);
				const answer = last?.content.filter(c => c.type === "text").map(c => c.text).join("") ?? "";
				if (options.json) console.log(JSON.stringify({ answer, toolCalls, usage: replies.map(m => m.usage) }));
				else process.stdout.write("\n");
			};
			if (question !== undefined) await ask(question);
			else {
				const rl = createInterface({ input: process.stdin, output: process.stdout });
				try { while (true) { let q: string; try { q = await rl.question("piagent> "); } catch { break; } if (["exit", "quit", "/exit"].includes(q.trim())) break; if (q.trim()) await ask(q); } }
				finally { rl.close(); }
			}
		} finally { await sessions.closeAll(); }
	}
	program.command("ask <question>").option("--target <target>").option("--json").action(run);
	program.command("chat").option("--target <target>").action(options => run(undefined, options));
	await program.parseAsync(argv);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("piagent failed; check local configuration and service availability"); process.exitCode = 1; });
