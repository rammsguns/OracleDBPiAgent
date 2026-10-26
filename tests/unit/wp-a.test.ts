import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, assertLoopbackUrl } from "../../src/config/index.js";
import { JsonlAuditSink } from "../../src/audit/index.js";
import { createOracleAgent, pruneContext, truncateUtf8 } from "../../src/agent/index.js";
import { checkStrataHealth, strataFetch } from "../../src/llm/index.js";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const dirs: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function temp() { const dir = await mkdtemp(join(tmpdir(), "piagent-a-")); dirs.push(dir); return dir; }
describe("WP-A configuration", () => {
	it.each(["https://example.org/v1", "http://127.0.0.1.evil/v1", "http://user:secret@localhost:8080/v1", "file:///tmp/model", "http://192.168.1.1/v1", "http://localhost/v1?key=x"])("rejects unsafe URL %s", url => expect(() => assertLoopbackUrl(url)).toThrow());
	it.each(["http://127.0.0.1:8080/v1", "http://[::1]:8080/v1", "http://localhost:8080/v1"])("accepts loopback %s", url => expect(assertLoopbackUrl(url).protocol).toBe("http:"));
	it("resolves secrets without reading them and validates limits/defaults", () => {
		const cfg = loadConfig({ PIAGENT_SECRET_DIR: "./missing-secret-directory" });
		expect(cfg.secretDir).toMatch(/\/missing-secret-directory$/);
		expect(cfg.targets).toHaveLength(2);
		expect(() => loadConfig({ PIAGENT_MAX_TOOL_CALLS: "0" })).toThrow();
		expect(() => loadConfig({ PIAGENT_DEFAULT_TARGET: "other" })).toThrow();
	});
	it("refuses changed target identities and path traversal", async () => {
		const file = join(await temp(), "targets.json");
		for (const changes of [{ username: "SYS" }, { port: 1521 }, { passwordFile: "../secret" }, { host: "remote" }]) {
			const targets = structuredClone(loadConfig({}).targets); Object.assign(targets[0]!, changes);
			await writeFile(file, JSON.stringify({ version: 1, targets }));
			expect(() => loadConfig({ PIAGENT_TARGETS_FILE: file })).toThrow();
		}
	});
});
it("serializes concurrent audit records and omits sensitive free-form fields", async () => {
	const file = join(await temp(), "nested/audit.jsonl"); const sink = new JsonlAuditSink(file);
	await Promise.all(Array.from({ length: 20 }, (_, i) => sink.record({ at: new Date().toISOString(), runId: String(i), kind: "tool_call", detail: "password", sqlText: "select 'secret' from dual" })));
	const text = await readFile(file, "utf8"); expect(text.trim().split("\n")).toHaveLength(20); expect(text).not.toMatch(/password|secret/);
});
it("bounds UTF-8 output without replacement characters", () => { expect(truncateUtf8("é😀abc", 5)).toBe("é"); expect(truncateUtf8("abc", 0)).toBe(""); });
it("prunes old tool content without mutating history or removing call linkage", () => {
	const messages = [{ role: "toolResult", toolCallId: "id", content: [{ type: "text", text: "x".repeat(1000) }] }, { role: "user", content: "new" }] as AgentMessage[];
	const pruned = pruneContext(messages, 100); expect(pruned[0]).toMatchObject({ toolCallId: "id" }); expect(JSON.stringify(pruned).length).toBeLessThan(500); expect(JSON.stringify(messages)).toContain("x".repeat(1000));
});
it("rejects unloaded health and redirects/remote inference endpoints", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", loaded: false }))));
	await expect(checkStrataHealth(loadConfig({}).llm)).rejects.toThrow(/unloaded/);
	await expect(strataFetch("http://example.org/v1/chat/completions")).rejects.toThrow();
	await expect(strataFetch("http://localhost:9999/v1/chat/completions")).rejects.toThrow();
});
it("blocks budget overflow and requests exactly one final turn without tools", async () => {
	const config = loadConfig({ PIAGENT_MAX_TOOL_CALLS: "1" }); const events: unknown[] = []; let requests = 0;
	const model = { id: "test", name: "test", api: "openai-completions", provider: "strata", baseUrl: config.llm.baseUrl, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 } as const;
	const agent = await createOracleAgent({ config, runId: "test", sessions: { get: async () => { throw Error("No DB"); }, closeAll: async () => {} }, audit: { record: async e => { events.push(e); } } }, {
		model: { ...model, input: ["text"] }, streamFn: (_m, context) => {
			requests++; const stream = createAssistantMessageEventStream();
			if (requests === 3) expect(JSON.stringify(context.messages.filter(m => m.role === "system"))).not.toContain('"name":"list_targets"');
			const content = requests < 3 ? [{ type: "toolCall" as const, id: String(requests), name: "list_targets", arguments: {} }] : [{ type: "text" as const, text: "Final evidence" }];
			const message = { role: "assistant" as const, api: "openai-completions" as const, provider: "strata", model: "test", content, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: requests < 3 ? "toolUse" as const : "stop" as const, timestamp: Date.now() };
			stream.push({ type: "done", reason: message.stopReason, message }); stream.end(message); return stream;
		},
	});
	await agent.prompt("List targets");
	const result = await agent.afterToolCall!({ toolCall: { id: "test", name: "list_targets" }, args: {}, result: { content: [{ type: "text", text: '\"\\😀'.repeat(10000) }], details: { oversized: "x".repeat(20000) } }, isError: false } as never);
	expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(config.limits.maxToolResultBytes);
	expect(result?.details).toEqual({ truncated: true });
	expect(JSON.stringify(result)).not.toContain("oversized");
	// A new user prompt resets the per-run budget, including after exhaustion.
	const before = events.length; await agent.prompt("Another question");
	expect(events.slice(before)).toContainEqual(expect.objectContaining({ kind: "run_start" }));
	const now = Date.now();
	const clock = vi.spyOn(Date, "now").mockReturnValue(now + config.limits.maxWallSeconds * 1000 + 1);
	try {
		await expect(agent.beforeToolCall!({ toolCall: { id: "late", name: "list_targets" }, args: {} } as never)).resolves.toMatchObject({ block: true, terminate: true });
	} finally { clock.mockRestore(); }
	expect(requests).toBe(4); expect(events).toContainEqual(expect.objectContaining({ kind: "tool_blocked" }));
});
it("blocks tool calls for any target other than the pinned one", async () => {
	const config = loadConfig({}); const events: { kind: string }[] = [];
	const model = { id: "test", name: "test", api: "openai-completions", provider: "strata", baseUrl: config.llm.baseUrl, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 } as const;
	const agent = await createOracleAgent({ config, runId: "pin", pinnedTarget: "p1-19c-prod", sessions: { get: async () => { throw Error("No DB"); }, closeAll: async () => {} }, audit: { record: async e => { events.push(e); } } }, { model: { ...model, input: ["text"] }, streamFn: () => { throw Error("No LLM"); } });
	expect(agent.state.systemPrompt).toContain("pinned to target p1-19c-prod");
	// Outside a prompt the run clock is unset; keep the wall budget from tripping.
	const clock = vi.spyOn(Date, "now").mockReturnValue(1);
	try {
		await expect(agent.beforeToolCall!({ toolCall: { id: "a", name: "wait_events" }, args: { target: "d1-19c-lab" } } as never)).resolves.toMatchObject({ block: true });
		await expect(agent.beforeToolCall!({ toolCall: { id: "b", name: "wait_events" }, args: { target: "p1-19c-prod" } } as never)).resolves.toBeUndefined();
	} finally { clock.mockRestore(); }
	expect(events.map(e => e.kind)).toEqual(["tool_blocked", "tool_call"]);
});
