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
import { UnsupportedVersionError, type SessionProvider } from "../contracts.js";
import type { AppConfig } from "../contracts.js";

export interface DoctorDependencies {
	report?: (name: string, ok: boolean) => void;
	checkHealth?: typeof checkStrataHealth;
	createSessions?: (config: AppConfig) => SessionProvider | Promise<SessionProvider>;
}
export async function doctor(config: AppConfig, dependencies: DoctorDependencies = {}): Promise<boolean> {
	let ok = true;
	const report = dependencies.report;
	try { await (dependencies.checkHealth ?? checkStrataHealth)(config.llm); if (report) report("Strata", true); else console.log("Strata: loaded (loopback)"); }
	catch { if (report) report("Strata", false); else console.error("Strata: unavailable or unloaded; no configuration changes made"); return false; }
	let sessions: SessionProvider;
	try { sessions = await (dependencies.createSessions ?? createSessions)(config); }
	catch { if (report) report("Session provider", false); else console.error("Session provider: initialization check failed"); return false; }
	try {
		for (const target of config.targets) {
			let check = "connection";
			try {
				const session = await sessions.get(target.name);
				check = "19c gate";
				if (session.identity.versionFull.split(".")[0] !== "19") throw new Error("Identity mismatch");
				check = "account identity";
				if (session.identity.currentUser.toUpperCase() !== target.username) throw new Error("Identity mismatch");
				check = "read-only privileges";
				const privileges = await session.query("SELECT PRIVILEGE FROM SESSION_PRIVS");
				const roles = await session.query("SELECT ROLE FROM SESSION_ROLES");
				// Oracle's SELECT_CATALOG_ROLE also carries FLASHBACK on dictionary views and EXECUTE on
				// DBMS_ASH and Data Pump types; both are read-only, and sqlPolicy blocks DBMS_ calls.
				const objectGrants = await session.query("SELECT 'USER', PRIVILEGE FROM USER_TAB_PRIVS_RECD UNION SELECT ROLE, PRIVILEGE FROM ROLE_TAB_PRIVS WHERE ROLE IN (SELECT ROLE FROM SESSION_ROLES)");
				const unexpected = objectGrants.rows.filter(([role, privilege]) => !["SELECT", "READ", "REFERENCES"].includes(String(privilege)) && !(role === "SELECT_CATALOG_ROLE" && ["FLASHBACK", "EXECUTE"].includes(String(privilege))));
				if (unexpected.length) throw new Error("Unexpected object privileges");
				const safe = new Set(["CREATE SESSION", "SELECT ANY DICTIONARY"]);
				if (privileges.rows.some(r => !safe.has(String(r[0]))) || roles.rows.some(r => ["DBA", "RESOURCE", "IMP_FULL_DATABASE", "EXP_FULL_DATABASE"].includes(String(r[0])))) throw new Error("Unexpected privileges");
				// sqlPolicy only sees the SQL text: a granted view could still run non-Oracle code
				// (for example an autonomous-transaction function) when selected.
				check = "view code dependencies";
				// Synonyms (including PUBLIC ones) are followed one level to the code they name.
				const code = "('FUNCTION', 'PROCEDURE', 'PACKAGE', 'TYPE', 'OPERATOR', 'LIBRARY', 'JAVA CLASS')";
				const oracleOwners = "(SELECT username FROM all_users WHERE oracle_maintained = 'Y')";
				const viewCode = await session.query(`SELECT d.owner, d.name FROM all_dependencies d WHERE d.type IN ('VIEW', 'MATERIALIZED VIEW') AND ((d.referenced_type IN ${code} AND d.referenced_owner <> 'PUBLIC' AND d.referenced_owner NOT IN ${oracleOwners}) OR (d.referenced_type = 'SYNONYM' AND EXISTS (SELECT 1 FROM all_synonyms s JOIN all_objects o ON o.owner = s.table_owner AND o.object_name = s.table_name WHERE s.owner = d.referenced_owner AND s.synonym_name = d.referenced_name AND o.object_type IN ${code} AND o.owner NOT IN ${oracleOwners})))`);
				if (viewCode.rows.length) throw new Error("Accessible views call non-Oracle code");
				if (report) report(target.name, true); else console.log(`${target.name}: Oracle ${session.identity.versionFull}, ${session.identity.currentUser}; session privileges: ${privileges.rows.map(r => r[0]).join(", ")}`);
			} catch (error) {
				ok = false;
				if (error instanceof UnsupportedVersionError) check = "19c gate";
				if (report) report(`${target.name}: ${check}`, false); else console.error(`${target.name}: ${check} check failed`);
			}
		}
	} finally {
		try { await sessions.closeAll(); }
		catch { if (report) report("Session cleanup", false); else console.error("Session cleanup: check failed"); ok = false; }
	}
	return ok;
}
export async function main(argv = process.argv, dependencies: DoctorDependencies = {}) {
	const program = new Command().name("piagent").description("Read-only Oracle 19c assistant using local Strata");
	program.command("web").option("--port <port>", "Loopback port", "8765").action(async (options: { port: string }) => {
		const port = Number(options.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
		const { createWebServer } = await import("../web/server.js");
		const web = createWebServer({ port });
		try { console.log(await web.listen()); } catch (error) { await web.close(); throw error; }
	});
	program.command("report").requiredOption("--target <target>").option("--json").option("--md").option("--sections <sections>").option("--owner <owner>").option("--summarize").action(async (options: { target: string; json?: boolean; md?: boolean; sections?: string; owner?: string; summarize?: boolean }) => {
		if (options.json && options.md) throw new Error("Choose --json or --md");
		const config = loadConfig();
		const { generateReport, renderMarkdown } = await import("../report/index.js");
		const sessions = await createSessions(config);
		try {
			const report = await generateReport({ config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() }, { target: options.target, owner: options.owner, sections: options.sections?.split(",").map(s => s.trim()) });
			const markdown = renderMarkdown(report);
			console.log(options.json ? JSON.stringify(report) : markdown);
			if (options.summarize) {
				const { summarizeReport } = await import("../report/summarize.js");
				console.log(await summarizeReport(markdown, config.llm));
			}
		} finally { await sessions.closeAll(); }
	});
	program.command("targets").action(() => {
		const cfg = loadConfig();
		for (const target of cfg.targets) console.log(`${target.name}\t${target.environment}\t${target.description}`);
	});
	program.command("doctor").action(async () => { if (!await doctor(loadConfig(), dependencies)) process.exitCode = 1; });
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
				if (options.json) console.log(JSON.stringify({ answer, toolCalls, unverified: agent.unverified, usage: replies.map(m => m.usage) }));
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
