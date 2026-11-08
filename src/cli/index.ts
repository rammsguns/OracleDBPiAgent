#!/usr/bin/env node
import { parseTopCommand, runChatTop } from './chatTop.js';
import { connectionGuidance, throwConnectionFailure, withConnectionFailures, clearConnectionFailure, withoutConnectionFailures } from '../oracle/connectionErrors.js';
import { renderFeatureSummary } from '../preflight/render.js';
import { TargetUsageError, requireConfiguredTarget } from "../config/targetUsage.js";
import { ReportSectionUsageError, validateReportSections } from "../report/arguments.js";
import { targetsSource } from '../config/targets.js';
import { checkTarget } from '../preflight/index.js';
import { AccountCheckError } from '../oracle/account.js';
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, reportDirectory } from "../config/paths.js";
import { loadEnvironment, initializeHome, assertConfiguredLlmKeyFile, SafeConfigError } from "../config/environment.js";
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
import { parseTriageCommand, prepareChatQuestion } from "./chatTriage.js";

export interface DoctorDependencies {
	report?: (name: string, ok: boolean) => void;
	checkHealth?: typeof checkStrataHealth;
	createSessions?: (config: AppConfig) => SessionProvider | Promise<SessionProvider>;
}
export async function doctor(config: AppConfig, dependencies: DoctorDependencies = {}): Promise<boolean> {
	let ok = true;
	const report = dependencies.report;
	try { await (dependencies.checkHealth ?? checkStrataHealth)(config.llm); if (report) report("Strata", true); else console.log("Strata: loaded (loopback)"); }
	catch { if (report) report("Strata", false); else console.error("Strata: unavailable or unloaded; no configuration changes made"); ok = false; }
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
				if (session.identity.currentUser.toUpperCase() !== target.username.toUpperCase()) throw new Error("Identity mismatch");
				// sqlPolicy only sees the SQL text: a granted view could still run non-Oracle code
				// (for example an autonomous-transaction function) when selected.
				check = "view code dependencies";
				// Synonyms (including PUBLIC ones) are followed one level to the code they name.
				const code = "('FUNCTION', 'PROCEDURE', 'PACKAGE', 'TYPE', 'OPERATOR', 'LIBRARY', 'JAVA CLASS')";
				const oracleOwners = "(SELECT username FROM all_users WHERE oracle_maintained = 'Y')";
				const viewCode = await session.query(`SELECT d.owner, d.name FROM all_dependencies d WHERE d.type IN ('VIEW', 'MATERIALIZED VIEW') AND ((d.referenced_type IN ${code} AND d.referenced_owner <> 'PUBLIC' AND d.referenced_owner NOT IN ${oracleOwners}) OR (d.referenced_type = 'SYNONYM' AND EXISTS (SELECT 1 FROM all_synonyms s JOIN all_objects o ON o.owner = s.table_owner AND o.object_name = s.table_name WHERE s.owner = d.referenced_owner AND s.synonym_name = d.referenced_name AND o.object_type IN ${code} AND o.owner NOT IN ${oracleOwners})))`);
				if (viewCode.rows.length) throw new Error("Accessible views call non-Oracle code");
				if (report) report(target.name, true); else console.log(`${target.name}: Oracle ${session.identity.versionFull}, ${session.identity.currentUser}; account check passed`);
			} catch (error) {
				ok = false;
				if (error instanceof UnsupportedVersionError) check = "19c gate";
				if (error instanceof AccountCheckError) check = "account check";
				clearConnectionFailure();
				if (report) report(`${target.name}: ${connectionGuidance(error) ?? check}`, false); else console.error(`${target.name}: ${error instanceof AccountCheckError ? error.message : connectionGuidance(error) ?? `${check} check failed`}`);
			}
		}
	} finally {
		try { await sessions.closeAll(); }
		catch { if (report) report("Session cleanup", false); else console.error("Session cleanup: check failed"); ok = false; }
	}
	return ok;
}
export async function main(argv = process.argv, dependencies: DoctorDependencies = {}) {
	if (argv.slice(2, 5).join(" ") !== "report schedule run") loadEnvironment();
	const version = (JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }).version;
	const program = new Command().enablePositionalOptions().version(version).name("piagent").description("Read-only Oracle 19c assistant using local Strata");
	program.command("init").description("Create private local configuration").action(() => { console.log(initializeHome() ? "Created private configuration; edit the placeholder paths before use." : "Configuration already exists; left unchanged."); });
	program.command("web").description("Serve the local database dashboard").option("--port <port>", "Loopback port", "8765").action(async (options: { port: string }) => withoutConnectionFailures(async () => {
		const port = Number(options.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SafeConfigError("Invalid port");
		const { createWebServer } = await import("../web/server.js");
		const web = createWebServer({ port });
		try { console.log(await web.listen()); } catch (error) { await web.close(); throw error; }
	}));
	program.command("report").description("Collect a read-only database health report").enablePositionalOptions().option("--target <target>").option("--json").option("--md").option("--sections <sections>").option("--owner <owner>").option("--summarize").option("--out <dir>").option("--diff").option("--diff-only").action(async (options: { target: string; json?: boolean; md?: boolean; sections?: string; owner?: string; summarize?: boolean; out?: string; diff?: boolean; diffOnly?: boolean }) => {
		if (!options.target) throw new SafeConfigError("Report requires --target");
		if (options.json && options.md) throw new SafeConfigError("Choose --json or --md");
		if (options.diffOnly && options.summarize) throw new SafeConfigError("--diff-only cannot summarize");
		const config = loadConfig();
		requireConfiguredTarget(options.target, config.targets);
		const sections = options.sections?.split(",").map(s => s.trim());
		validateReportSections(sections);
		const { generateReport, renderMarkdown } = await import("../report/index.js");
		const { loadLatestReport, saveReport, validateReportTarget } = await import("../report/history.js");
		const { diff, renderDiffMarkdown } = await import("../report/diff.js");
		const compare = options.diff || options.diffOnly;
		const out = options.out ?? (compare ? reportDirectory() : undefined);
		validateReportTarget(options.target, config.targets);
		const previous = compare ? await loadLatestReport(out!, options.target, config.targets) : null;
		const sessions = await createSessions(config);
		try {
			const report = await generateReport({ config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID() }, { target: options.target, owner: options.owner, historyDirectory: out, sections });
			throwConnectionFailure();
			const markdown = renderMarkdown(report);
			const changes = compare ? diff(previous, report) : undefined;
			if (out) await saveReport(out, report, config.targets, options.out === undefined);
			if (options.diffOnly) {
				console.log(options.json ? JSON.stringify({ diff: changes }) : renderDiffMarkdown(changes!));
				process.exitCode = changes!.changes.length ? 3 : 0;
			} else console.log(options.json ? JSON.stringify(changes ? { ...report, diff: changes } : report) : markdown + (changes ? "\n" + renderDiffMarkdown(changes) : ""));
			if (options.summarize) {
				const { summarizeReport, checkReportSummary } = await import("../report/summarize.js");
				const summary = await summarizeReport(markdown, config.llm);
				const unverified = checkReportSummary(summary, markdown, config.llm);
				console.log(summary);
				if (unverified.length) console.log(`Unverified: ${unverified.join(", ")}`);
			}
		} finally { await sessions.closeAll(); }
	});
	program.commands.find(command => command.name() === "report")!.command("history").description("Trends from saved reports; no database connection").requiredOption("--target <target>").option("--last <N>", "Newest saved files, 1–30", "30").option("--json").action(async (options: { target: string; last: string; json?: boolean }) => {
		requireConfiguredTarget(options.target, loadConfig().targets);
		const { loadReportHistory } = await import("../report/history.js");
		const { buildReportTrends, renderTrends } = await import("../report/trends.js");
		const result = buildReportTrends(await loadReportHistory(reportDirectory(), options.target, loadConfig().targets, /^\d+$/.test(options.last) ? Number(options.last) : NaN));
		console.log(options.json ? JSON.stringify(result) : renderTrends(result));
	});
	program.command("triage").description("Read-only issue evidence and debug checklist").requiredOption("--target <target>").option("--issue <text>").option("--issue-file <file>").option("--since <duration>", "Recent window, at most 30d", "24h").option("--json").option("--out <dir>").option("--summarize").action(async options => {
		requireConfiguredTarget(options.target, loadConfig().targets);
		const { runTriage } = await import("../triage/cli.js"); await runTriage(options);
	});
	program.command("backup").exitOverride(error => { process.exit(error.code === "commander.helpDisplayed" ? 0 : 2); }).description("Read-only backup and recoverability metadata; no LLM").requiredOption("--target <target>").option("--json").action(async options => {
		const { runBackup } = await import("../backup/cli.js");
		const { BackupUsageError } = await import("../backup/index.js");
		try { await runBackup(options); }
		catch (error) {
			if (!(error instanceof BackupUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("check").exitOverride(error => { process.exit(error.code === "commander.helpDisplayed" ? 0 : 2); }).description("Threshold health checks; read-only, no LLM").option("--target <target>").option("--all-targets").option("--json").option("--fail-on <severity>", "warn or crit").option("--out <dir>").action(async options => {
		const { runCheck } = await import("../check/cli.js");
		const { CheckUsageError } = await import("../check/index.js");
		try { await runCheck(options); }
		catch (error) { if (!(error instanceof CheckUsageError)) throw error; console.error("Usage/config error: " + error.message); process.exitCode = 2; }
	});
	program.command("space").exitOverride(error => { process.exit(error.code === "commander.helpDisplayed" ? 0 : 2); }).description("Read-only space and capacity; no LLM").requiredOption("--target <target>").option("--section <ids>", "Comma-separated sections").option("--all", "Include Oracle-maintained owners").option("--owner <owner>", "Segment owner").option("--top <N>", "Top segments, 1–100").option("--json").option("--markdown").action(async options => {
		const { runSpace } = await import("../space/cli.js");
		const { SpaceUsageError } = await import("../space/index.js");
		try { await runSpace(options); }
		catch (error) {
			if (!(error instanceof SpaceUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("top").exitOverride(error => { process.exit(error.code === "commander.helpDisplayed" ? 0 : 2); }).description("Two-snapshot live SQL and load sample; no ASH or LLM").requiredOption("--target <target>").option("--seconds <N>", "Sample interval, 5–120 seconds", "15").option("--json").action(async options => {
		const { runTop } = await import("../top/cli.js");
		const { TopUsageError } = await import("../top/index.js");
		try { await runTop(options); }
		catch (error) {
			if (!(error instanceof TopUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("sessions").exitOverride(error => { process.exit(error.code === "commander.helpDisplayed" ? 0 : 2); }).description("Read-only live sessions, blocking and cumulative waits; no LLM").requiredOption("--target <target>").option("--section <ids>", "Comma-separated sections").option("--all", "Include background sessions").option("--min-tx-seconds <N>", "Transaction age threshold, 0–86400").option("--top <N>", "Top wait events, 1–50").option("--json").option("--markdown").action(async options => {
		const { runSessions } = await import("../sessions/cli.js");
		const { SessionsUsageError } = await import("../sessions/index.js");
		try { await runSessions(options); }
		catch (error) {
			if (!(error instanceof SessionsUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("security").description("Read-only security and privilege review; no LLM").requiredOption("--target <target>").option("--check <ids>", "Comma-separated check IDs").option("--who-can <object>", "OWNER.OBJECT privilege paths").option("--json").option("--markdown").action(async options => {
		const { runSecurity } = await import("../security/cli.js");
		const { SecurityUsageError } = await import("../security/index.js");
		try { await runSecurity(options); }
		catch (error) {
			if (!(error instanceof SecurityUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("sql").description("Read-only single-SQL cursor-cache insight; no LLM").requiredOption("--target <target>").option("--sql-id <id>").option("--text <fragment>").option("--child <number>").option("--json").option("--markdown").action(async options => {
		const { runSql } = await import("../sqlperf/cli.js");
		const { SqlUsageError } = await import("../sqlperf/index.js");
		try { await runSql(options); }
		catch (error) {
			if (!(error instanceof SqlUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	program.command("jobs").description("Read-only scheduler and maintenance health; no LLM").requiredOption("--target <target>").option("--since <duration>", "History window, default 24h, maximum 30d").option("--owner <owner>").option("--failed-only").option("--json").action(async options => {
		const { runJobs } = await import("../jobs/cli.js");
		const { JobsUsageError } = await import("../jobs/index.js");
		try { await runJobs(options); }
		catch (error) { if (!(error instanceof JobsUsageError)) throw error; console.error(error.message); process.exitCode = 2; }
	});
	program.command("alertlog").description("Read-only Oracle alert log and ADR incidents; no LLM").requiredOption("--target <target>").option("--since <duration>", "Recent window, default 24h, at most 30d").option("--from <timestamp>").option("--to <timestamp>").option("--code <code>", "ORA-/TNS- code (repeatable)", (value: string, previous: string[]) => [...previous, value], [] as string[]).option("--grep <text>").option("--level <level>", "default, all, or maximum numeric level").option("--limit <rows>").option("--incidents").option("--json").option("--markdown").action(async options => {
		const { runAlertLog } = await import("../alertlog/cli.js");
		const { AlertlogUsageError } = await import("../alertlog/index.js");
		try { await runAlertLog(options); }
		catch (error) {
			if (!(error instanceof AlertlogUsageError)) throw error;
			console.error(error.message); process.exitCode = 2;
		}
	});
	const plsql = program.command("plsql").description("Read-only PL/SQL documentation and dependency diagrams; no LLM");
	plsql.command("list").description("List visible PL/SQL objects").requiredOption("--target <target>").option("--owner <owner>").option("--json").action(async options => {
		const { runPlsql } = await import("../plsql/cli.js"); await runPlsql("list", options);
	});
	plsql.command("doc").description("Document a PL/SQL object").requiredOption("--target <target>").requiredOption("--object <OWNER.NAME>").option("--json").option("--out <dir>").action(async options => {
		const { runPlsql } = await import("../plsql/cli.js"); await runPlsql("doc", options);
	});
	program.command("drift").description("Compare two approved targets (parameters, schema, objects, security, space or backup); read-only, exit 3 on drift").requiredOption("--left <target>").requiredOption("--right <target>").requiredOption("--scope <scope>").option("--json").option("--out <dir>").action(async options => {
		const config = loadConfig();
		requireConfiguredTarget(options.left, config.targets);
		requireConfiguredTarget(options.right, config.targets);
		const { runDrift } = await import("../drift/cli.js");
		await runDrift(options);
	});
	const schedule = program.commands.find(command => command.name() === "report")!.command("schedule").description("Schedule saved database reports").enablePositionalOptions().option("--target <target>").option("--every <interval>").option("--out <dir>").action(async (options: { target: string; every: string; out?: string }) => {
		if (!options.target || !options.every) throw new SafeConfigError("Schedule requires --target and --every");
		requireConfiguredTarget(options.target, loadConfig().targets);
		const { generateSchedule, renderSchedule } = await import("../report/schedule.js");
		const { agentHome } = await import("../config/paths.js");
		console.log(renderSchedule(generateSchedule({ target: options.target, every: options.every, home: agentHome(), out: options.out ? (await import("node:path")).resolve(options.out) : reportDirectory(), node: process.execPath, cli: join(PACKAGE_ROOT, "dist/cli/index.js") }, loadConfig().targets)));
	});
	schedule.command("run").description("Run a scheduled database report").requiredOption("--target <target>").option("--home <dir>").option("--out <dir>").action(async (options: { target: string; home?: string; out?: string }) => {
		requireConfiguredTarget(options.target, loadConfig(options.home ? { ...process.env, PIAGENT_HOME: options.home } : process.env).targets);
		const { runSchedule } = await import("../report/schedule.js");
		process.exitCode = runSchedule({ ...options, cli: join(PACKAGE_ROOT, "dist/cli/index.js") });
	});
	const targets = program.command("targets").description("List configured Oracle 19c targets and their source file").action(() => {
		const cfg = loadConfig();
		console.log(`Source: ${targetsSource()}`);
		for (const target of cfg.targets) console.log(`${target.name}\t${target.environment}\t${target.description}`);
	});
	targets.command("check").description("Check account safety and feature view access; no LLM").requiredOption("--target <target>").option("--json").option("--all", "List every feature view").option("--grants-sql").action(async options => {
		requireConfiguredTarget(options.target, loadConfig().targets);
		const sessions = await (dependencies.createSessions ?? createSessions)(loadConfig());
		try {
			const result = await checkTarget(sessions, options.target);
			if (options.json) console.log(JSON.stringify(options.grantsSql ? result : { ...result, grantsSql: undefined }));
			else {
				console.log(`${result.identity.target}: Oracle ${result.identity.versionFull}; ${result.identity.isCdb ? 'CDB/PDB' : 'non-CDB'}; container ${result.identity.containerName}; user ${result.identity.currentUser}; account check passed`);
				if (options.all) for (const view of result.views) console.log(`${view.feature}\t${view.view}\t${view.status}`);
				else console.log(renderFeatureSummary(result.views));
				console.log("Use --grants-sql for suggested SELECT grants; --all lists every view.");
				if (options.grantsSql) console.log(result.grantsSql.join('\n'));
			}
		} catch (error) {
			clearConnectionFailure();
			const message = error instanceof AccountCheckError || error instanceof SafeConfigError ? error.message : connectionGuidance(error) ?? 'Target check failed; check local configuration and service availability';
			if (options.json) console.log(JSON.stringify({ target: options.target, accountCheck: 'failed', error: message }));
			console.error(message);
			process.exitCode = 1;
		} finally { await sessions.closeAll(); }
	});
	program.command("doctor").description("Check local configuration and service availability").action(async () => { if (!await doctor(loadConfig(), dependencies)) process.exitCode = 1; });
	async function run(question: string | undefined, options: { target?: string; json?: boolean }) {
		const config = loadConfig();
		let pinnedTarget: string | undefined;
		if (options.target !== undefined) {
			requireConfiguredTarget(options.target, config.targets);
			config.defaultTarget = options.target;
			pinnedTarget = options.target;
		}
		assertConfiguredLlmKeyFile(config.llm.apiKeyFile);
		await checkStrataHealth(config.llm);
		const sessions = await createSessions(config);
		const ctx = { config, sessions, audit: new JsonlAuditSink(config.auditFile), runId: randomUUID(), pinnedTarget };
		try {
			const agent = await createOracleAgent(ctx);
			let toolCalls: { name: string; id: string }[] = [];
			let activeTop: AbortController | undefined;
			agent.subscribe(event => {
				if (event.type === "tool_execution_start") toolCalls.push({ name: event.toolName, id: event.toolCallId });
				if (!options.json && event.type === "message_start" && agent.isCorrectionMessage(event.message)) process.stdout.write("\n\n--- Revised answer ---\n");
				if (!options.json && event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") process.stdout.write(event.assistantMessageEvent.delta);
			});
			const ask = async (q: string) => {
				toolCalls = [];
				const offset = agent.state.messages.length;
				let prepared = q;
				if (question === undefined) {
					try {
						if (parseTopCommand(q)) {
							const controller = new AbortController();
							activeTop = controller;
							const cancel = () => controller.abort();
							process.once('SIGINT', cancel);
							try { console.log(await runChatTop(ctx, q, controller.signal)); }
							finally { activeTop = undefined; process.removeListener('SIGINT', cancel); }
							return;
						}
					} catch (error) { console.error(error instanceof Error && error.name === 'AbortError' ? 'Top sample cancelled.' : 'Top: ' + (error instanceof Error && error.name === 'TopUsageError' || error instanceof Error && error.message.startsWith('Usage:') ? error.message : connectionGuidance(error) ?? 'failed; check local database availability')); return; }
					let command: ReturnType<typeof parseTriageCommand>;
					try {
						command = parseTriageCommand(q);
					} catch (error) {
						console.error((error as Error).message);
						return;
					}
					if (command !== undefined) {
						try {
							prepared = await prepareChatQuestion(ctx, q);
						} catch (error) {
							console.error(connectionGuidance(error) ?? "Triage failed; check local database availability");
							return;
						}
					}
				}
				await agent.prompt(prepared);
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
				// Terminal readline consumes Ctrl-C instead of emitting process SIGINT.
				rl.on('SIGINT', () => { if (activeTop) activeTop.abort(); else rl.close(); });
				try { while (true) { let q: string; try { q = await rl.question("piagent> "); } catch { break; } if (["exit", "quit", "/exit"].includes(q.trim())) break; if (q.trim()) await ask(q); } }
				finally { rl.close(); }
			}
		} finally { await sessions.closeAll(); }
	}
	program.command("ask <question>").description("Ask the local Strata assistant about a database").option("--target <target>").option("--json").action(run);
	program.command("chat").description("Start an interactive local Strata conversation").option("--target <target>").action(options => withoutConnectionFailures(() => run(undefined, options)));
	await withConnectionFailures(async () => { await program.parseAsync(argv); });
}
export function handleCliError(error: unknown): void {
	const usage = error instanceof TargetUsageError || error instanceof ReportSectionUsageError;
	console.error(usage || error instanceof SafeConfigError ? error.message : connectionGuidance(error) ?? "piagent failed; check local configuration and service availability");
	process.exitCode = usage ? 2 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main().catch(handleCliError);
