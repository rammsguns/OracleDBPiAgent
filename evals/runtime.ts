import { loadConfig } from '../src/config/index.js';
import { evalLlmConfig, type EvalEndpoint } from '../src/config/eval.js';
import { evalHealth, createEvalStrataProvider } from '../src/llm/eval.js';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import type { AppConfig, AuditSink, SessionProvider, ToolContext, Limits } from '../src/contracts.js';
import type { AskResult } from './types.js';
import { truncateUtf8 } from '../src/agent/index.js';

// Eval-local adapter keeps cached usage out of the shared product contracts.
export interface CachedAskResult extends AskResult {
	usage: AskResult['usage'] & { cached: number };
	toolDetails: ToolDetail[];
	/** Text only, at most 4096 UTF-8 bytes per tool result; no arguments/details. */
	toolResultTexts: string[];
	groundingCorrections: number;
	unverified?: string[];
	requests: RequestUsage[];
}

export interface RequestUsage {
	/** One-based user turn; zero only for histories with no preceding user message. */
	turn: number;
	input: number;
	cached: number;
	output: number;
	newUserChars: number;
	newToolResultChars: number;
	prevThinkingChars: number;
	prevTextChars: number;
	prevToolCallArgChars: number;
}

// Count text blocks only: images, signatures, metadata and framing are excluded.
function textChars(content: any): number {
	if (typeof content === 'string') return content.length;
	return (content ?? []).reduce((n: number, part: any) => n + (part.type === 'text' ? part.text.length : 0), 0);
}

function collectRequests(messages: any[]): RequestUsage[] {
	const requests: RequestUsage[] = [];
	let turn = 0, newUserChars = 0, newToolResultChars = 0;
	let prevThinkingChars = 0, prevTextChars = 0, prevToolCallArgChars = 0;
	for (const message of messages) {
		if (message.role === 'user') {
			turn++;
			newUserChars += textChars(message.content);
		} else if (message.role === 'toolResult') {
			newToolResultChars += textChars(message.content);
		} else if (message.role === 'assistant') {
			requests.push({ turn, input: message.usage?.input ?? 0, cached: message.usage?.cacheRead ?? 0,
				output: message.usage?.output ?? 0, newUserChars, newToolResultChars,
				prevThinkingChars, prevTextChars, prevToolCallArgChars });
			newUserChars = newToolResultChars = 0;
			prevThinkingChars = (message.content ?? []).reduce((n: number, part: any) => n + (part.type === 'thinking' ? part.thinking.length : 0), 0);
			prevTextChars = textChars(message.content);
			// Serialize only to measure length; never retain the arguments or bind values.
			prevToolCallArgChars = (message.content ?? []).reduce((n: number, part: any) => n + (part.type === 'toolCall' ? JSON.stringify(part.arguments ?? {}).length : 0), 0);
		}
	}
	return requests;
}

export interface ToolDetail {
	tool: string;
	args: string;
	// null means no matching result was present, rather than a successful call.
	isError: boolean | null;
	error?: string;
	resultBytes: number | null;
}

export class DependencyUnavailable extends Error {}
export async function productModule(path: string): Promise<any> {
	try { return await import(pathToFileURL(resolve(path)).href); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' && String((error as Error).message).includes(resolve(path))) throw new DependencyUnavailable(`Product module unavailable: ${path}`);
		throw error;
	}
}
export async function runtime(endpoint: EvalEndpoint = "primary") {
	const configModule = await productModule('src/config/index.ts');
	const oracleModule = await productModule('src/oracle/index.ts');
	const toolsModule = await productModule('src/tools/index.ts');
	const agentModule = await productModule('src/agent/index.ts');
	const primary: AppConfig = await configModule.loadConfig(process.env);
	const config: AppConfig = { ...primary, llm: evalLlmConfig(primary.llm, endpoint) };
	const wiring = endpoint === 'secondary' ? await createEvalStrataProvider(config.llm) : undefined;
	const sessions: SessionProvider = await oracleModule.createSessionProvider(config);
	const audit: AuditSink = { record: async event => {
		await mkdir(dirname(config.auditFile), { recursive: true });
		// Deliberately omit detail and SQL text: no bind values or credentials.
		const { at, runId, kind, target, tool, sqlSha256, rows, truncated, elapsedMs, unverifiedCount } = event;
		await appendFile(config.auditFile, JSON.stringify({ at, runId, kind, target, tool, sqlSha256, rows, truncated, elapsedMs, unverifiedCount }) + '\n');
	} };
	return { config, sessions, async ask(question: string | string[], target: string, limits: Partial<Limits> = {}): Promise<CachedAskResult> {
		const events: string[] = [];
		const ctx: ToolContext = { config: { ...config, defaultTarget: target, limits: caseLimits(config.limits, limits) }, sessions, audit: {
			record: async event => {
				// The agent's beforeToolCall hook audits each admitted call once (no elapsedMs); the tool's
				// own completion event repeats tool_call with elapsedMs, so count only the hook's.
				if (event.kind === 'tool_call' && event.tool && event.elapsedMs === undefined) events.push(event.tool);
				await audit.record(event);
			},
		}, runId: crypto.randomUUID(), pinnedTarget: target };
		const tools = toolsModule.createDbTools(ctx);
		// Local adapter: coordinator must confirm the WP-A factory/context contract.
		const agent = await agentModule.createOracleAgent({ ...ctx, tools }, wiring);
		try {
			await promptTurns(agent, question);
			return { ...collectResult(agent.state.messages, events), unverified: agent.unverified ?? [] };
		} finally { await agent.dispose?.(); }
	} };
}
export async function requireStrata() {
	let response: Response;
	try { response = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(5000) }); }
	catch { throw new DependencyUnavailable('Strata health endpoint unavailable'); }
	if (!response.ok) throw new DependencyUnavailable('Strata health endpoint not ready');
	const health = await response.json() as Record<string, unknown>;
	if (health.status !== 'ok' || health.loaded === false || health.model_loaded === false) throw new DependencyUnavailable('Strata is unloaded or not healthy; stop without reconfiguring');
}

// One agent retains conversation state; await each turn before sending the next.
export async function promptTurns(agent: { prompt(question: string): Promise<unknown> }, input: string | string[]) {
	const turns = typeof input === 'string' ? [input] : input;
	if (!turns.length || turns.some(turn => !turn.trim())) throw new Error('Eval turns must be nonempty');
	for (const turn of turns) await agent.prompt(turn);
}

// Score only the final reply, retaining requests and usage from the entire chat.
export function collectResult(messages: any[], events: string[] = []): CachedAskResult {
	const assistants = messages.filter(message => message.role === 'assistant');
	const last = assistants.at(-1);
	if (last?.errorMessage) throw new Error(last.errorMessage);
	const answer = (last?.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
	const calls = assistants.flatMap(message => (message.content ?? []).filter((part: any) => part.type === 'toolCall').map((part: any) => part.name));
	const results = new Map(messages.filter(message => message.role === 'toolResult' && typeof message.toolCallId === 'string').map(message => [message.toolCallId, message]));
	const toolDetails: ToolDetail[] = assistants.flatMap(message => (message.content ?? [])
		.filter((part: any) => part.type === 'toolCall')
		.map((part: any): ToolDetail => {
			const result = typeof part.id === 'string' ? results.get(part.id) : undefined;
			const text = (result?.content ?? []).filter((content: any) => content.type === 'text').map((content: any) => content.text).join('\n');
			// Arguments are SQL/object names/options. Omit sensitive fields defensively,
			// including nested fields, before applying the whole-value text limit.
			const args = JSON.stringify(part.arguments ?? {}, (key, value) =>
				/bind|password|passwd|secret|api.?key|credential|token/i.test(key) ? undefined : value).slice(0, 300);
			return { tool: part.name, args, isError: result ? result.isError === true : null,
				...(result?.isError ? { error: text.split(/\r?\n/)[0]!.slice(0, 200) } : {}),
				resultBytes: result ? Buffer.byteLength(text, 'utf8') : null };
		}));
	const groundingCorrections = messages.filter(message => message.role === 'user' && typeof message.content === 'string'
		&& (message.content.startsWith("These numbers do not appear in this conversation's tool results: ") || message.content.startsWith("These values do not appear in this conversation's tool results: "))
		&& (message.content.endsWith('. Correct or remove them; use tools only if needed.') || message.content.includes('only fix or remove the listed numbers'))).length;
	return { answer, toolDetails, groundingCorrections, toolResultTexts: messages.filter(message => message.role === 'toolResult').map(message => truncateUtf8((message.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n'), 4096)), requests: collectRequests(messages), toolCalls: calls.length ? calls : events, executedToolCalls: [...events],
		usage: { cached: assistants.reduce((n, message) => n + (message.usage?.cacheRead ?? 0), 0), input: assistants.reduce((n, message) => n + (message.usage?.input ?? 0), 0), output: assistants.reduce((n, message) => n + (message.usage?.output ?? 0), 0) } };
}

export function caseLimits(defaults: Limits, overrides: Partial<Limits> = {}): Limits {
	return { ...defaults, ...overrides };
}

export async function requireEvalStrata(endpoint: EvalEndpoint = 'primary') {
	const primary = loadConfig().llm;
	const selected = evalLlmConfig(primary, endpoint);
	const primaryHealth = await evalHealth(primary);
	return endpoint === 'primary' ? primaryHealth : await evalHealth(selected);
}
