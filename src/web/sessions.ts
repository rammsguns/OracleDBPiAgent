import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import { loadConfig } from "../config/index.js";
import { checkStrataHealth } from "../llm/index.js";
import { createSessions } from "../agent/dbToolsAdapter.js";
import { createOracleAgent } from "../agent/index.js";
import { JsonlAuditSink } from "../audit/index.js";
import type { AppConfig, ToolContext } from "../contracts.js";
import { prepareChatQuestion } from "../cli/chatTriage.js";

export type WebAgent = Pick<Agent, "prompt" | "subscribe" | "abort" | "waitForIdle" | "state"> & {
	readonly unverified?: string[];
};
export interface Conversation {
	id: string;
	runId: string;
	agent: WebAgent;
	lastUsed: number;
	active: boolean;
	prepareQuestion?: (question: string) => Promise<string>;
	close(): Promise<void>;
}
export class WebError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
	}
}
export interface SessionOptions {
	triageRunner?: typeof import("../triage/index.js").triage;
	config?: AppConfig;
	agentFactory?: (context: ToolContext) => Promise<WebAgent>;
	checkHealth?: typeof checkStrataHealth;
	sessionFactory?: typeof createSessions;
	now?: () => number;
	idleMs?: number;
}
// Shared by every web server instance in this process. Hold until prompt settles,
// including after abort, so a replacement request cannot overlap Strata cleanup.
let running = false;
export function acquireLlm(): () => void {
	if (running) throw new WebError(409, "Agent is busy");
	running = true;
	return () => {
		running = false;
	};
}
export class SessionManager {
	readonly config: AppConfig;
	private entries = new Map<string, Conversation>();
	private pending = new Set<Promise<Conversation>>();
	private stopped = false;
	private now: () => number;
	private timer: NodeJS.Timeout;
	constructor(private options: SessionOptions = {}) {
		this.config = options.config ?? loadConfig();
		this.now = options.now ?? Date.now;
		this.timer = setInterval(() => {
			void this.expire().catch(() => {});
		}, 60_000);
		this.timer.unref();
	}
	async create(target?: string): Promise<Conversation> {
		if (this.stopped) throw new WebError(503, "Server is closing");
		if (target !== undefined && !this.config.targets.some(t => t.name === target)) {
			throw new WebError(400, "Invalid target");
		}
		// Reserve a slot before any asynchronous initialization.
		if (this.entries.size + this.pending.size >= 4) throw new WebError(409, "Session limit reached");
		const task = this.initialize(target);
		this.pending.add(task);
		try {
			return await task;
		} finally {
			this.pending.delete(task);
		}
	}
	private async initialize(target?: string): Promise<Conversation> {
		const config = { ...this.config, defaultTarget: target ?? this.config.defaultTarget };
		await (this.options.checkHealth ?? checkStrataHealth)(config.llm);
		const sessions = await (this.options.sessionFactory ?? createSessions)(config);
		try {
			const runId = randomUUID();
			const agent = await (this.options.agentFactory ?? createOracleAgent)({
				config,
				sessions,
				audit: new JsonlAuditSink(config.auditFile),
				runId,
				pinnedTarget: target,
			});
			let closed: Promise<void> | undefined;
			const prepareQuestion = (question: string) => {
				const context = {
					config,
					sessions,
					audit: new JsonlAuditSink(config.auditFile),
					runId,
					pinnedTarget: target,
				};
				return prepareChatQuestion(context, question, this.options.triageRunner);
			};
			const entry: Conversation = {
				id: randomUUID(),
				runId,
				agent,
				prepareQuestion,
				lastUsed: this.now(),
				active: false,
				close: () => {
					agent.abort();
					return closed ??= (async () => {
						try {
							await agent.waitForIdle();
						} finally {
							await sessions.closeAll();
						}
					})();
				},
			};
			this.entries.set(entry.id, entry);
			return entry;
		} catch (error) {
			await sessions.closeAll();
			throw error;
		}
	}
	get(id: string): Conversation {
		const entry = this.entries.get(id);
		if (!entry) throw new WebError(404, "Session not found");
		entry.lastUsed = this.now();
		return entry;
	}
	touch(entry: Conversation) {
		entry.lastUsed = this.now();
	}
	async remove(id: string) {
		const entry = this.get(id);
		this.entries.delete(id);
		await entry.close();
	}
	async expire() {
		const expired = [...this.entries.values()].filter(entry =>
			!entry.active && this.now() - entry.lastUsed >= (this.options.idleMs ?? 30 * 60_000));
		await Promise.allSettled(expired.map(entry => this.remove(entry.id)));
	}
	async closeAll() {
		this.stopped = true;
		clearInterval(this.timer);
		await Promise.allSettled([...this.pending]);
		const entries = [...this.entries.values()];
		this.entries.clear();
		await Promise.allSettled(entries.map(e => e.close()));
	}
	async audit(id: string) {
		const { runId } = this.get(id);
		let text: string;
		try {
			text = await readFile(this.config.auditFile, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		return text.split("\n").flatMap(line => {
			try {
				const row = JSON.parse(line);
				if (row.runId !== runId) return [];
				const fields = ["kind", "tool", "target", "sqlSha256", "rows", "elapsedMs"];
				const values = fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]);
				return [Object.fromEntries(values)];
			} catch {
				return [];
			}
		});
	}
}
export type StreamEvent = "text" | "tool_start" | "tool_end" | "done" | "error";
export async function ask(
	entry: Conversation,
	question: string,
	emit: (event: StreamEvent, data: unknown) => void,
	cancelled = () => false,
) {
	const offset = entry.agent.state.messages.length;
	const unsubscribe = entry.agent.subscribe((event: AgentEvent) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			emit("text", { delta: event.assistantMessageEvent.delta });
		}
		if (event.type === "tool_execution_start") {
			const fields = ["target", "owner", "name", "type", "limit", "sql_id"];
			const args = Object.entries(event.args ?? {}).filter(([key, value]) =>
				fields.includes(key) && ["string", "number", "boolean"].includes(typeof value));
			emit("tool_start", {
				name: event.toolName,
				args: JSON.stringify(Object.fromEntries(args)).slice(0, 300),
			});
		}
		if (event.type === "tool_execution_end") {
			emit("tool_end", {
				name: event.toolName,
				isError: event.isError,
				error: event.isError ? "Tool execution failed" : undefined,
				resultBytes: Buffer.byteLength(JSON.stringify(event.result)),
			});
		}
	});
	try {
		const prepared = entry.prepareQuestion ? await entry.prepareQuestion(question) : question;
		if (cancelled()) return;
		await entry.agent.prompt(prepared);
		if (entry.agent.state.errorMessage) throw new Error("Agent failed");
		const replies = entry.agent.state.messages.slice(offset).filter(m => m.role === "assistant");
		const answer = replies.at(-1)?.content.filter(c => c.type === "text").map(c => c.text).join("") ?? "";
		emit("done", { answer, unverified: entry.agent.unverified ?? [], usage: replies.map(m => m.usage) });
	} finally {
		unsubscribe();
	}
}
