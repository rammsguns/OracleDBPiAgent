import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager, WebError, acquireLlm, ask, type SessionOptions } from "./sessions.js";

import { generateReport, renderMarkdown, sectionNames } from "../report/index.js";
import { loadLatestReport, saveReport, reportDirectory, validateReportTarget } from "../report/history.js";
import { webReportDiff } from "./reportDiff.js";
import { summarizeReport, checkReportSummary } from "../report/summarize.js";
import { createSessions } from "../agent/dbToolsAdapter.js";
import { JsonlAuditSink } from "../audit/index.js";

export interface WebServerOptions extends SessionOptions {
	report?: typeof generateReport;
	/** Local history seams; no shared configuration fields. */
	reportDirectory?: string;
	loadReport?: typeof loadLatestReport;
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
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 64 * 1024) throw new WebError(413, "Request too large");
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
export function createWebServer(options: WebServerOptions = {}) {
	const manager = options.manager ?? new SessionManager(options);
	const token = options.token ?? randomBytes(32).toString("hex");
	const digest = (value: string) => createHash("sha256").update(value).digest();
	const expected = digest(`Bearer ${token}`);
	const staticRoot = options.staticDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "static");
	const server = createServer((req, res) => {
		res.setHeader("Content-Security-Policy", "default-src 'self'");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Referrer-Policy", "no-referrer");
		void handle(req, res).catch(error => {
			if (res.destroyed) return;
			if (res.headersSent) { res.write(`event: error\ndata: ${JSON.stringify({ message: "Request failed" })}\n\n`); res.end(); }
			else json(res, error instanceof WebError ? error.status : 500, { message: error instanceof WebError ? error.message : "Request failed" });
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
			if (raw === "/api/targets" && req.method === "GET") return json(res, 200, manager.config.targets.map(({ name, environment, description, username }) => ({ name, environment, description: description.replaceAll(username, "read-only account") })));
			if ((raw === "/api/report" && req.method === "GET") || (raw === "/api/report/save" && req.method === "POST")) {
				const saving = req.method === "POST";
				const params = new URL(req.url!, "http://localhost").searchParams;
				const target = params.get("target") ?? manager.config.defaultTarget;
				const sections = params.has("sections") ? params.get("sections")!.split(",") : undefined;
				try { validateReportTarget(target, manager.config.targets); } catch { throw new WebError(400, "Invalid target"); }
				if (sections?.some(name => !sectionNames.includes(name))) throw new WebError(400, "Invalid sections");
				if (params.has("summarize") && params.get("summarize") !== "1") throw new WebError(400, "Invalid summary option");
				const release = params.has("summarize") ? acquireLlm() : () => {};
				let sessions;
				try {
					sessions = await (options.sessionFactory ?? createSessions)(manager.config);
					const report = await (options.report ?? generateReport)({ config: manager.config, sessions, audit: new JsonlAuditSink(manager.config.auditFile), runId: randomUUID(), pinnedTarget: target }, { target, sections });
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
				} catch { throw new WebError(500, "Report failed"); }
				finally { try { await sessions?.closeAll(); } catch { throw new WebError(500, "Report failed"); } finally { release(); } }
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
				const entry = manager.get(id);
				const release = acquireLlm();
				entry.active = true;
				const disconnect = () => { if (!res.writableEnded) entry.agent.abort(); };
				res.on("close", disconnect);
				try {
					res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive" });
					res.flushHeaders();
					await ask(entry, data.question, (event, payload) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); });
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
