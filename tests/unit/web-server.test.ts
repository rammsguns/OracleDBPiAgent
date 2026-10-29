import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "node:http";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { loadConfig } from "../../src/config/index.js";
import { createWebServer } from "../../src/web/server.js";
import { SessionManager, type WebAgent } from "../../src/web/sessions.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).reverse().map(fn => fn())); vi.restoreAllMocks(); });
const secret = "private-driver-DSN-password";
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(r => { resolve = r; });
	return { promise, resolve };
}
async function fixture(options: { fail?: boolean; hold?: boolean; failFactory?: boolean; deferAbort?: boolean; now?: () => number } = {}) {
	const dir = await mkdtemp(join(tmpdir(), "piagent-web-"));
	cleanup.push(() => rm(dir, { recursive: true, force: true }));
	const config = { ...loadConfig({}), auditFile: join(dir, "audit.jsonl") };
	const agents: WebAgent[] = [];
	const closes: ReturnType<typeof vi.fn>[] = [];
	const contexts: any[] = [];
	const started = deferred();
	const hold = deferred();
	let idle = Promise.resolve();
	const manager = new SessionManager({ config, now: options.now,
		checkHealth: async () => {},
		sessionFactory: async () => { const closeAll = vi.fn(async () => {}); closes.push(closeAll); return { get: vi.fn(), closeAll }; },
		agentFactory: async ctx => {
			contexts.push(ctx);
			if (options.failFactory) throw new Error(secret);
			const listeners = new Set<(e: AgentEvent) => void>();
			const emit = (event: any) => { for (const fn of listeners) fn(event); };
			const agent = {
				state: { messages: [] } as any,
				subscribe: (fn: (e: AgentEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
				abort: vi.fn(() => { if (!options.deferAbort) hold.resolve(); }),
				waitForIdle: () => idle,
				prompt: vi.fn(async () => {
					const end = deferred(); idle = end.promise;
					try {
						started.resolve();
						if (options.hold) await hold.promise;
						if (options.fail) throw new Error(secret);
						emit({ type: "tool_execution_start", toolName: "run_query", args: { sql: "x".repeat(400) } });
						emit({ type: "tool_execution_end", toolName: "run_query", isError: true, result: { content: [{ type: "text", text: secret }] } });
						emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Answer" } });
						agent.state.messages.push({ role: "assistant", content: [{ type: "text", text: "Answer" }], usage: { input: 1, output: 2 } });
					} finally { end.resolve(); }
				}),
			} as unknown as WebAgent;
			agents.push(agent); return agent;
		},
	});
	const web = createWebServer({ manager, port: 0, token: "test-token", staticDir: dir, health: async () => [{ name: "Strata", status: "ok" }] });
	const url = new URL(await web.listen());
	cleanup.push(web.close);
	const port = Number(url.port);
	function call(path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) {
		return new Promise<{ status: number; text: string; headers: any }>((resolve, reject) => {
			const req = request({ host: "127.0.0.1", port, path, method, headers: { Authorization: "Bearer test-token", ...headers } }, res => {
				const chunks: Buffer[] = [];
				res.on("data", chunk => chunks.push(chunk));
				res.on("end", () => resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString(), headers: res.headers }));
			});
			req.on("error", reject); req.end(data === undefined ? undefined : JSON.stringify(data));
		});
	}
	async function session() { const result = await call("/api/sessions", "POST", {}); expect(result.status).toBe(201); return JSON.parse(result.text).sessionId as string; }
	return { web, manager, call, session, agents, closes, contexts, dir, started, hold, port };
}

describe("loopback web API", () => {
	it("binds only 127.0.0.1 and generates a random fragment token", async () => {
		const f = await fixture();
		expect(f.web.server.address()).toMatchObject({ address: "127.0.0.1", family: "IPv4" });
		const web = createWebServer({ manager: f.manager, port: 0 }); cleanup.push(web.close);
		expect(await web.listen()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]{64}$/);
	});
	it.each(["", "Bearer wrong", "bearer test-token", "Bearer test-token-extra"])("requires an exact bearer token: %s", async authorization => {
		const f = await fixture(); const result = await f.call("/api/targets", "GET", undefined, { Authorization: authorization });
		expect(result.status).toBe(401); expect(result.headers["cache-control"]).toBe("no-store");
	});
	it.each([{ Host: "attacker.test" }, { Origin: "https://attacker.test" }, { Origin: "null" }, { Host: "127.0.0.1:123" }])("rejects untrusted Host/Origin %j", async headers => {
		const f = await fixture(); expect((await f.call("/api/targets", "GET", undefined, headers)).status).toBe(403);
	});
	it("accepts both approved hostnames and origins, sends security headers and hides target details", async () => {
		const f = await fixture();
		for (const host of ["localhost", "127.0.0.1"]) {
			const result = await f.call("/api/targets", "GET", undefined, { Host: `${host}:${f.port}`, Origin: `http://${host}:${f.port}` });
			expect(result.status).toBe(200);
			expect(result.headers).toMatchObject({ "content-security-policy": "default-src 'self'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" });
			expect(Object.keys(JSON.parse(result.text)[0]).sort()).toEqual(["description", "environment", "name"]);
			expect(result.text).not.toMatch(/1522|1523|HARNESS_|password|PRODCDB|localhost/);
		}
		expect((await f.call("/api/targets", "GET", undefined, { Host: `localhost:${f.port}`, Origin: `http://127.0.0.1:${f.port}` })).status).toBe(403);
	});
	it("streams bounded tool metadata, text and completion without driver errors", async () => {
		const f = await fixture(); const id = await f.session(); const result = await f.call(`/api/sessions/${id}/ask`, "POST", { question: "hi" });
		expect(result.headers["content-type"]).toContain("text/event-stream");
		const events = result.text.trim().split("\n\n").map(block => ({ event: block.split("\n")[0]!.slice(7), data: JSON.parse(block.split("\n")[1]!.slice(6)) }));
		expect(events.map(e => e.event)).toEqual(["tool_start", "tool_end", "text", "done"]);
		expect(events[0]!.data.args).toBe("{}");
		expect(events[1]!.data).toMatchObject({ name: "run_query", isError: true, error: "Tool execution failed" });
		expect(events[1]!.data.resultBytes).toBeGreaterThan(0);
		expect(events[2]!.data).toEqual({ delta: "Answer" });
		expect(events[3]!.data).toEqual({ answer: "Answer", unverified: [], usage: [{ input: 1, output: 2 }] });
		expect(result.text).not.toContain(secret);
	});
	it("serializes prompts across server instances with 409 and releases after completion", async () => {
		const f = await fixture({ hold: true }); const g = await fixture();
		const id = await f.session(); const other = await g.session();
		const pending = f.call(`/api/sessions/${id}/ask`, "POST", { question: "hold" }); await f.started.promise;
		expect((await g.call(`/api/sessions/${other}/ask`, "POST", { question: "hi" })).status).toBe(409);
		f.hold.resolve(); await pending;
		expect((await g.call(`/api/sessions/${other}/ask`, "POST", { question: "hi" })).status).toBe(200);
	});
	it("aborts on stream disconnect and holds the lock until the prompt settles", async () => {
		const f = await fixture({ hold: true, deferAbort: true }); const id = await f.session();
		const closed = deferred();
		const req = request({ host: "127.0.0.1", port: f.port, path: `/api/sessions/${id}/ask`, method: "POST", headers: { Authorization: "Bearer test-token" } }, res => { res.destroy(); });
		req.on("error", () => {}); req.on("close", closed.resolve); req.end(JSON.stringify({ question: "hold" }));
		await f.started.promise; await closed.promise;
		await vi.waitFor(() => expect(f.agents[0]!.abort).toHaveBeenCalled());
		expect((await f.call(`/api/sessions/${id}/ask`, "POST", { question: "busy" })).status).toBe(409);
		f.hold.resolve();
		await f.agents[0]!.waitForIdle();
		expect((await f.call(`/api/sessions/${id}/ask`, "POST", { question: "next" })).status).toBe(200);
	});
	it("returns generic SSE errors and releases the lock on failure", async () => {
		const f = await fixture({ fail: true }); const id = await f.session();
		for (let i = 0; i < 2; i++) {
			const result = await f.call(`/api/sessions/${id}/ask`, "POST", { question: "hi" });
			expect(result.status).toBe(200); expect(result.text).toContain('event: error\ndata: {"message":"Request failed"}'); expect(result.text).not.toContain(secret);
		}
	});
	it("caps sessions including concurrent initialization and frees slots on delete", async () => {
		const f = await fixture();
		const results = await Promise.all(Array.from({ length: 5 }, () => f.call("/api/sessions", "POST", {})));
		expect(results.map(r => r.status).sort()).toEqual([201, 201, 201, 201, 409]);
		const id = JSON.parse(results.find(r => r.status === 201)!.text).sessionId;
		expect((await f.call(`/api/sessions/${id}`, "DELETE")).status).toBe(204);
		expect(f.closes[0]).toHaveBeenCalledOnce();
		await f.session();
	});
	it("expires idle sessions, preserves active sessions, and closes on shutdown", async () => {
		let now = 0; const f = await fixture({ now: () => now }); const id = await f.session();
		const entry = f.manager.get(id); entry.active = true;
		now = 30 * 60_000; await f.manager.expire(); expect(f.closes[0]).not.toHaveBeenCalled();
		entry.active = false; await f.manager.expire(); expect(f.closes[0]).toHaveBeenCalledOnce();
		expect(() => f.manager.get(id)).toThrow("Session not found");
		await f.session(); await f.web.close(); expect(f.closes[1]).toHaveBeenCalledOnce();
	});
	it("pins the selected target and rejects unknown targets and malformed input", async () => {
		const f = await fixture();
		expect((await f.call("/api/sessions", "POST", { target: "other" })).status).toBe(400);
		expect((await f.call("/api/sessions", "POST", { target: [] })).status).toBe(400);
		const result = await f.call("/api/sessions", "POST", { target: "p1-19c-prod" });
		expect(f.contexts[0].pinnedTarget).toBe("p1-19c-prod");
		expect(f.contexts[0].config.defaultTarget).toBe("p1-19c-prod");
		const id = JSON.parse(result.text).sessionId;
		expect((await f.call(`/api/sessions/${id}/ask`, "POST", { question: " " })).status).toBe(400);
	});
	it("masks initialization errors and closes the failed provider", async () => {
		const f = await fixture({ failFactory: true });
		const result = await f.call("/api/sessions", "POST", {});
		expect(result.status).toBe(500); expect(JSON.parse(result.text)).toEqual({ message: "Request failed" });
		expect(result.text).not.toContain(secret); expect(f.closes[0]).toHaveBeenCalledOnce();
	});
	it("filters audit records by runId and allowlists fields", async () => {
		const f = await fixture(); const id = await f.session();
		expect(JSON.parse((await f.call(`/api/sessions/${id}/audit`)).text)).toEqual([]);
		await writeFile(join(f.dir, "audit.jsonl"), [JSON.stringify({ runId: "other", kind: "tool_call", tool: secret }), "bad json", JSON.stringify({ runId: f.contexts[0].runId, kind: "tool_call", tool: "run_query", target: "d1-19c-lab", sqlSha256: "hash", rows: 2, elapsedMs: 3, sqlText: secret, binds: secret, detail: secret })].join("\n"));
		const result = await f.call(`/api/sessions/${id}/audit`);
		expect(JSON.parse(result.text)).toEqual([{ kind: "tool_call", tool: "run_query", target: "d1-19c-lab", sqlSha256: "hash", rows: 2, elapsedMs: 3 }]);
		expect(result.text).not.toContain(secret);
	});
	it("returns only named health statuses", async () => {
		const f = await fixture(); expect(JSON.parse((await f.call("/api/health")).text)).toEqual([{ name: "Strata", status: "ok" }]);
	});
	it("serves allowlisted static files and placeholder, blocks traversal and escaping symlinks", async () => {
		const f = await fixture();
		expect((await f.call("/")).text).toContain("web UI is ready");
		await writeFile(join(f.dir, "app.js"), "console.log('ready')");
		expect((await f.call("/app.js")).headers["content-type"]).toContain("javascript");
		await symlink("/etc/hosts", join(f.dir, "escape.txt"));
		for (const path of ["/../PLAN.md", "/%2e%2e/PLAN.md", "/%2e%2e%2fPLAN.md", "/..%5cPLAN.md", "/escape.txt"]) expect((await f.call(path)).status).toBe(403);
		expect((await f.call("/audit.jsonl")).status).toBe(404);
		expect((await f.call("/%zz")).status).toBe(400);
	});
});
