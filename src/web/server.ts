import { checkedHealth } from '../tools/healthCheck.js';
import type { SessionProvider } from '../contracts.js';
import { connectionGuidance, withConnectionFailures } from '../oracle/connectionErrors.js';
import { readWebOperations, validateWebOperations } from './operations.js';
import { readWebSpace, validateWebSpace } from './space.js';
import { readWebDbSessions, validateWebDbSessions } from './dbSessions.js';
import { readWebSecurity, validateWebSecurity } from './security.js';
import { readWebSql, validateWebSql } from './sql.js';
import { readAlertLog, readIncidents, renderAlertLogMarkdown, AlertlogUsageError } from '../alertlog/index.js';
import { parseTriageCommand } from '../cli/chatTriage.js';
import { listPlsql, documentPlsql } from '../plsql/index.js';
import { identifier, objectName } from '../plsql/dictionary.js';
import { triage, sinceHours, renderTriageMarkdown } from '../triage/index.js';
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager, WebError, acquireLlm, ask, type SessionOptions } from "./sessions.js";

import { generateReport, renderMarkdown, sectionNames } from "../report/index.js";
import { loadLatestReport, loadReportHistory, HISTORY_RETENTION, saveReport, reportDirectory, validateReportTarget } from "../report/history.js";
import { buildReportTrends } from "../report/trends.js";
import { compareTargets, parseScope } from "../drift/index.js";
import { webReportDiff } from "./reportDiff.js";
import { summarizeReport, checkReportSummary } from "../report/summarize.js";
import { createSessions } from "../agent/dbToolsAdapter.js";
import { JsonlAuditSink } from "../audit/index.js";

export interface WebServerOptions extends SessionOptions {
	runChecks?: typeof import('../check/index.js').runChecks;
	readSpaceUsage?: typeof import('../space/index.js').readSpaceUsage;
	readSessionActivity?: typeof import('../sessions/index.js').readSessionActivity;
	readSecurityPosture?: typeof import('../security/index.js').readSecurityPosture;
	readSqlInsight?: typeof import('../sqlperf/index.js').readSqlInsight;
	findSqlCandidates?: typeof import('../sqlperf/index.js').findSqlCandidates;
	readAlertLog?: typeof readAlertLog;
	readIncidents?: typeof readIncidents;
	plsqlList?: typeof listPlsql;
	plsqlDoc?: typeof documentPlsql;
	triage?: typeof triage;
	report?: typeof generateReport;
	drift?: typeof compareTargets;
	/** Local history seams; no shared configuration fields. */
	reportDirectory?: string;
	loadReport?: typeof loadLatestReport;
	loadHistory?: typeof loadReportHistory;
	saveReport?: typeof saveReport;
	summarize?: typeof summarizeReport;
	port?: number;
	token?: string;
	manager?: SessionManager;
	health?: () => Promise<{ name: string; status: "ok" | "fail" }[]>;
	/** Test seam; production always resolves static assets beside this module. */
	staticDir?: string;
}
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
async function body(req: IncomingMessage, cap = 64 * 1024): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > cap) throw new WebError(413, "Request too large");
		chunks.push(chunk);
	}
	try {
		const value = JSON.parse(Buffer.concat(chunks).toString());
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
		return value;
	} catch { throw new WebError(400, "Invalid request"); }
}
function json(res: ServerResponse, status: number, data: unknown) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(data));
}
function redactUsername(description: string, username: string): string {
	const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Oracle identifiers can contain $ and # as well as regex word characters.
	return description.replace(new RegExp(`(?<![\\w$#])${escaped}(?![\\w$#])`, 'gi'), 'read-only account');
}
export function createWebServer(options: WebServerOptions = {}) {
	const manager = options.manager ?? new SessionManager({ ...options, triageRunner: options.triage ?? options.triageRunner });
	const token = options.token ?? randomBytes(32).toString("hex");
	const digest = (value: string) => createHash("sha256").update(value).digest();
	const expected = digest(`Bearer ${token}`);
	const staticRoot = options.staticDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "static");
	let driftActive = false;
	let insightActive = false;
	const server = createServer((req, res) => {
		res.setHeader("Content-Security-Policy", "default-src 'self'");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Referrer-Policy", "no-referrer");
		void handle(req, res).catch(error => {
			if (res.destroyed) return;
			if (res.headersSent) { res.write(`event: error\ndata: ${JSON.stringify({ message: connectionGuidance(error) ?? "Request failed" })}\n\n`); res.end(); }
			else json(res, error instanceof WebError ? error.status : 500, { message: error instanceof WebError ? error.message : connectionGuidance(error) ?? "Request failed" });
		});
	});
	async function handle(req: IncomingMessage, res: ServerResponse) {
		const raw = (req.url ?? "/").split("?")[0]!;
		const api = raw === "/api" || raw.startsWith("/api/");
		if (api) res.setHeader("Cache-Control", "no-store");
		const address = server.address();
		const port = typeof address === "object" && address ? address.port : options.port ?? 8765;
		const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
		if (!hosts.includes(req.headers.host ?? "") || (req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`)) throw new WebError(403, "Forbidden");
		if (api) {
			if (!timingSafeEqual(expected, digest(req.headers.authorization ?? ""))) throw new WebError(401, "Unauthorized");
			if (raw === "/api/targets" && req.method === "GET") return json(res, 200, manager.config.targets.map(({ name, environment, description, username, protocol, wallet }) => ({ name, environment, protocol: protocol ?? "tcp", walletAlias: wallet?.tnsAlias, description: redactUsername(description, username) })));
			if (['/api/check', '/api/backup', '/api/jobs', '/api/top', '/api/plsql/list', '/api/plsql/doc', '/api/triage', '/api/alertlog', '/api/sql', '/api/security', '/api/db-sessions', '/api/space'].includes(raw)) {
				const isTriage = raw === '/api/triage';
				const isAlert = raw === '/api/alertlog';
				if (req.method !== (isTriage ? 'POST' : 'GET')) throw new WebError(405, 'Method not allowed');
				const data: Record<string, unknown> = isTriage ? await body(req, 400 * 1024) : Object.fromEntries(new URL(req.url!, 'http://localhost').searchParams);
				const target = data.target ?? manager.config.defaultTarget;
				const allChecks = raw === '/api/check' && target === '__all_targets__';
				if (typeof target !== 'string' || (!allChecks && !manager.config.targets.some(t => t.name === target))) throw new WebError(400, 'Invalid target');
				if (isTriage && typeof data.issue === 'string' && Buffer.byteLength(data.issue) > 65536) throw new WebError(413, 'Issue exceeds 64 KiB');
				try {
					if (['/api/check', '/api/backup', '/api/jobs', '/api/top'].includes(raw)) {
						validateWebOperations(raw, data);
					} else if (raw === '/api/space') {
						validateWebSpace(data);
					} else if (raw === '/api/db-sessions') {
						validateWebDbSessions(data);
					} else if (raw === '/api/security') {
						validateWebSecurity(data);
					} else if (raw === '/api/sql') {
						validateWebSql(data);
					} else if (isAlert) {
						sinceHours(data.since as string | undefined);
						if (data.text !== undefined && String(data.text).length > 2048) throw new Error();
						if (data.codes && (String(data.codes).split(',').length > 20 || String(data.codes).split(',').some(code => !/^(ORA|TNS)-\d{5}$/.test(code.trim().toUpperCase())))) throw new Error();
					} else if (isTriage) {
						if (typeof data.issue !== 'string' || !data.issue.trim() || (data.since !== undefined && typeof data.since !== 'string')) throw new Error();
						sinceHours(data.since as string | undefined);
					} else if (raw.endsWith('/doc')) {
						if (typeof data.object !== 'string') throw new Error(); objectName(data.object);
					} else if (data.owner !== undefined && data.owner !== '') {
						if (typeof data.owner !== 'string') throw new Error(); identifier(data.owner);
					}
				} catch { throw new WebError(400, 'Invalid insight input'); }
				if (insightActive) throw new WebError(429, 'An insight request is already running');
				insightActive = true;
				let sessions: SessionProvider | undefined;
				try {
					sessions = await (options.sessionFactory ?? createSessions)(manager.config);
					const ctx = { config: manager.config, sessions, audit: new JsonlAuditSink(manager.config.auditFile), runId: randomUUID(), pinnedTarget: target };
					if (['/api/check', '/api/backup', '/api/jobs', '/api/top'].includes(raw)) {
						const abort = new AbortController();
						const cancel = () => { if (!res.writableEnded) abort.abort(); };
						res.on('close', cancel);
						try {
							const checkTargets = allChecks ? manager.config.targets.map(t => t.name) : [target];
							const output = raw === '/api/check'
								? { result: await checkedHealth({ ...ctx, pinnedTarget: allChecks ? undefined : target }, checkTargets, abort.signal, options.runChecks) }
								: await readWebOperations(ctx, target, raw, data, abort.signal);
							if (Buffer.byteLength(JSON.stringify(output)) > 1024 * 1024) throw new WebError(413, 'Insight output exceeds 1 MiB');
							const finished = sessions; sessions = undefined; await finished.closeAll();
							if (!abort.signal.aborted) return json(res, 200, output);
							return;
						} finally { res.off('close', cancel); }
					}
					if (raw === '/api/sql' || raw === '/api/security' || raw === '/api/db-sessions' || raw === '/api/space') {
						const output = await (raw === '/api/space' ? readWebSpace : raw === '/api/db-sessions' ? readWebDbSessions : raw === '/api/security' ? readWebSecurity : readWebSql)(ctx, target, data, options);
						if (Buffer.byteLength(JSON.stringify(output)) > 1024 * 1024) throw new WebError(413, 'Insight output exceeds 1 MiB');
						const finished = sessions; sessions = undefined; await finished.closeAll();
						return json(res, 200, output);
					}
					if (isAlert) {
						try {
							const entries = await (options.readAlertLog ?? readAlertLog)(ctx, target, { since: data.since as string | undefined, codes: data.codes ? String(data.codes).split(',').map(code => code.trim().toUpperCase()) : [], text: data.text as string | undefined });
							const incidents = await (options.readIncidents ?? readIncidents)(ctx, target, { from: entries.window.from, to: entries.window.to });
							const output = { entries, incidents, markdown: renderAlertLogMarkdown(entries) + '\n' + renderAlertLogMarkdown(incidents) };
							if (Buffer.byteLength(JSON.stringify(output)) > 1024 * 1024) throw new WebError(413, 'Insight output exceeds 1 MiB');
							const finished = sessions; sessions = undefined; await finished.closeAll();
							return json(res, 200, output);
						} catch (error) { if (error instanceof AlertlogUsageError) throw new WebError(400, error.message); throw error; }
					}
					const result = isTriage ? await (options.triage ?? triage)(ctx, { target, issue: data.issue as string, since: data.since as string | undefined }) : raw.endsWith('/doc') ? await (options.plsqlDoc ?? documentPlsql)(ctx, target, data.object as string) : await (options.plsqlList ?? listPlsql)(ctx, target, data.owner as string || undefined);
					const output = isTriage ? { result, markdown: renderTriageMarkdown(result as Awaited<ReturnType<typeof triage>>) } : result;
					if (Buffer.byteLength(JSON.stringify(output)) > 1024 * 1024) throw new WebError(413, 'Insight output exceeds 1 MiB');
					const finished = sessions; sessions = undefined; await finished.closeAll();
					return json(res, 200, output);
				} finally { try { await sessions?.closeAll(); } finally { insightActive = false; } }
			}
			if (raw === "/api/drift") {
				if (req.method !== "POST") throw new WebError(405, "Method not allowed");
				const data = await body(req);
				for (const target of [data.left, data.right]) {
					if (typeof target !== "string" || !manager.config.targets.some(t => t.name === target)) throw new WebError(400, "Invalid target");
				}
				if (typeof data.scope !== "string" || data.scope.length > 136) throw new WebError(400, "Invalid scope");
				try { parseScope(data.scope); } catch { throw new WebError(400, "Invalid scope"); }
				if (driftActive) throw new WebError(429, "A drift comparison is already running");
				driftActive = true;
				let sessions: SessionProvider | undefined;
				try {
					sessions = await (options.sessionFactory ?? createSessions)(manager.config);
					const activeSessions = sessions;
					const result = await withConnectionFailures(async () => (options.drift ?? compareTargets)({ config: manager.config, sessions: activeSessions, audit: new JsonlAuditSink(manager.config.auditFile), runId: randomUUID() }, { left: data.left as string, right: data.right as string, scope: data.scope as string }));
					const output = JSON.stringify(result);
					if (Buffer.byteLength(output) > 1024 * 1024) throw new WebError(413, "Drift output exceeds 1 MiB; choose a narrower scope");
					const finished = sessions; sessions = undefined; await finished.closeAll();
					return json(res, 200, result);
				} catch (error) {
					if (error instanceof WebError) throw error;
					throw new WebError(500, connectionGuidance(error) ?? "Drift failed");
				} finally {
					try { await sessions?.closeAll(); } catch { throw new WebError(500, "Drift failed"); }
					finally { driftActive = false; }
				}
			}
			if (raw === "/api/report/history") {
				if (req.method !== "GET") throw new WebError(405, "Method not allowed");
				const params = new URL(req.url!, "http://localhost").searchParams;
				const target = params.get("target") ?? manager.config.defaultTarget;
				try { validateReportTarget(target, manager.config.targets); } catch { throw new WebError(400, "Invalid target"); }
				const rawLast = params.get("last");
				const last = rawLast === null ? HISTORY_RETENTION : Number(rawLast);
				if (rawLast !== null && !/^[1-9][0-9]*$/.test(rawLast) || !Number.isInteger(last) || last < 1 || last > HISTORY_RETENTION) throw new WebError(400, "Invalid history limit");
				try {
					return json(res, 200, buildReportTrends(await (options.loadHistory ?? loadReportHistory)(options.reportDirectory ?? reportDirectory(), target, manager.config.targets, last)));
				} catch { throw new WebError(500, "History unavailable"); }
			}
			if ((raw === "/api/report" && req.method === "GET") || (raw === "/api/report/save" && req.method === "POST")) {
				const saving = req.method === "POST";
				const params = new URL(req.url!, "http://localhost").searchParams;
				const target = params.get("target") ?? manager.config.defaultTarget;
				const sections = params.has("sections") ? params.get("sections")!.split(",") : undefined;
				try { validateReportTarget(target, manager.config.targets); } catch { throw new WebError(400, "Invalid target"); }
				if (sections?.some(name => !sectionNames.includes(name))) throw new WebError(400, "Invalid sections");
				if (params.has("summarize") && params.get("summarize") !== "1") throw new WebError(400, "Invalid summary option");
				const release = params.has("summarize") ? acquireLlm() : () => {};
				let sessions: SessionProvider | undefined;
				try {
					sessions = await (options.sessionFactory ?? createSessions)(manager.config);
					const activeSessions = sessions;
					const report = await withConnectionFailures(async () => (options.report ?? generateReport)({ config: manager.config, sessions: activeSessions, audit: new JsonlAuditSink(manager.config.auditFile), runId: randomUUID(), pinnedTarget: target }, { target, sections }));
					const directory = options.reportDirectory ?? reportDirectory();
					const previous = await (options.loadReport ?? loadLatestReport)(directory, target, manager.config.targets);
					const diff = webReportDiff(previous, report);
					if (!saving && !previous) diff.notes = ['No saved run yet.'];
					const markdown = renderMarkdown(report);
					const summary = params.has("summarize") ? await (options.summarize ?? summarizeReport)(markdown, manager.config.llm) : undefined;
					const unverified = summary === undefined ? [] : checkReportSummary(summary, markdown, manager.config.llm);
					const finished = sessions; sessions = undefined; await finished.closeAll();
					if (saving) await (options.saveReport ?? saveReport)(directory, report, manager.config.targets, options.reportDirectory === undefined);
					return json(res, 200, { report, diff, ...(saving ? { savedAt: report.generatedAt } : {}), ...(summary === undefined ? {} : { summary, unverified }) });
				} catch (error) { throw new WebError(500, connectionGuidance(error) ?? "Report failed"); }
				finally { try { await sessions?.closeAll(); } catch (error) { throw new WebError(500, connectionGuidance(error) ?? "Report failed"); } finally { release(); } }
			}
			if (raw === "/api/health" && req.method === "GET") {
				const release = acquireLlm();
				try {
					const checks = options.health ? await options.health() : await defaultHealth();
					return json(res, 200, checks.map(({ name, status }) => ({ name, status })));
				} finally { release(); }
			}
			if (raw === "/api/sessions" && req.method === "POST") {
				const data = await body(req);
				if (data.target !== undefined && typeof data.target !== "string") throw new WebError(400, "Invalid target");
				return json(res, 201, { sessionId: (await manager.create(data.target as string | undefined)).id });
			}
			const match = /^\/api\/sessions\/([a-zA-Z0-9-]+)(?:\/(ask|audit))?$/.exec(raw);
			if (!match) throw new WebError(404, "Not found");
			const id = match[1]!;
			if (!match[2] && req.method === "DELETE") { await manager.remove(id); res.writeHead(204); return res.end(); }
			if (match[2] === "audit" && req.method === "GET") return json(res, 200, await manager.audit(id));
			if (match[2] === "ask" && req.method === "POST") {
				const data = await body(req);
				if (typeof data.question !== "string" || !data.question.trim() || data.question.length > 32_000) throw new WebError(400, "Invalid question");
				try { parseTriageCommand(data.question); } catch (error) { throw new WebError(400, (error as Error).message); }
				const entry = manager.get(id);
				const release = acquireLlm();
				entry.active = true;
				let disconnected = false;
				const disconnect = () => { disconnected = true; if (!res.writableEnded) entry.agent.abort(); };
				res.on("close", disconnect);
				try {
					res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive" });
					res.flushHeaders();
					await ask(entry, data.question, (event, payload) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }, () => disconnected);
				} finally { entry.active = false; manager.touch(entry); release(); res.off("close", disconnect); }
				return res.end();
			}
			throw new WebError(405, "Method not allowed");
		}
		if (req.method !== "GET" && req.method !== "HEAD") throw new WebError(405, "Method not allowed");
		let path: string;
		try { path = decodeURIComponent(raw); } catch { throw new WebError(400, "Invalid path"); }
		if (path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) throw new WebError(403, "Forbidden");
		const file = resolve(staticRoot, `.${path === "/" ? "/index.html" : path}`);
		if (!file.startsWith(resolve(staticRoot) + sep)) throw new WebError(403, "Forbidden");
		const contentType = types[extname(file)];
		if (!contentType) throw new WebError(404, "Not found");
		try {
			const actual = await realpath(file);
			const root = await realpath(staticRoot);
			if (!actual.startsWith(root + sep)) throw new WebError(403, "Forbidden");
			const content = await readFile(actual);
			res.writeHead(200, { "Content-Type": contentType });
			res.end(req.method === "HEAD" ? undefined : content);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			if (path !== "/" && path !== "/index.html") throw new WebError(404, "Not found");
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(req.method === "HEAD" ? undefined : "<!doctype html><title>OracleDBPiAgent</title><p>OracleDBPiAgent web UI is ready.</p>");
		}
	}
	async function defaultHealth() {
		// Dynamic import avoids a CLI/server initialization cycle.
		const { doctor } = await import("../cli/index.js");
		const checks: { name: string; status: "ok" | "fail" }[] = [];
		await doctor(manager.config, { report: (name, ok) => checks.push({ name, status: ok ? "ok" : "fail" }) });
		return checks;
	}
	let closing: Promise<void> | undefined;
	async function close() {
		return closing ??= (async () => {
			process.off("SIGINT", shutdown); process.off("SIGTERM", shutdown);
			const stopped = new Promise<void>((resolve, reject) => server.close(error => error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve()));
			await manager.closeAll();
			server.closeAllConnections();
			await stopped;
		})();
	}
	const shutdown = () => { void close().catch(() => { process.exitCode = 1; }); };
	return { server, manager, token, close,
		listen: async () => {
			await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 8765, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
			process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
			const address = server.address();
			return `http://127.0.0.1:${typeof address === "object" && address ? address.port : options.port ?? 8765}/#token=${token}`;
		},
	};
}
