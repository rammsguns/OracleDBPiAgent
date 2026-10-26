import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import type { AppConfig, AuditSink, SessionProvider, ToolContext } from '../src/contracts.js';
import type { AskResult } from './types.js';

export class DependencyUnavailable extends Error {}
export async function productModule(path: string): Promise<any> {
	try { return await import(pathToFileURL(resolve(path)).href); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' && String((error as Error).message).includes(resolve(path))) throw new DependencyUnavailable(`Product module unavailable: ${path}`);
		throw error;
	}
}
export async function runtime() {
	const configModule = await productModule('src/config/index.ts');
	const oracleModule = await productModule('src/oracle/index.ts');
	const toolsModule = await productModule('src/tools/index.ts');
	const agentModule = await productModule('src/agent/index.ts');
	const config: AppConfig = await configModule.loadConfig(process.env);
	const sessions: SessionProvider = await oracleModule.createSessionProvider(config);
	const audit: AuditSink = { record: async event => {
		await mkdir(dirname(config.auditFile), { recursive: true });
		// Deliberately omit detail and SQL text: no bind values or credentials.
		const { at, runId, kind, target, tool, sqlSha256, rows, truncated, elapsedMs } = event;
		await appendFile(config.auditFile, JSON.stringify({ at, runId, kind, target, tool, sqlSha256, rows, truncated, elapsedMs }) + '\n');
	} };
	return { config, sessions, async ask(question: string, target: string): Promise<AskResult> {
		const events: string[] = [];
		const ctx: ToolContext = { config: { ...config, defaultTarget: target }, sessions, audit: {
			record: async event => {
				if (event.kind === 'tool_call' && event.tool) events.push(event.tool);
				await audit.record(event);
			},
		}, runId: crypto.randomUUID() };
		const tools = toolsModule.createDbTools(ctx);
		// Local adapter: coordinator must confirm the WP-A factory/context contract.
		const agent = await agentModule.createOracleAgent({ ...ctx, tools });
		try {
			await agent.prompt(question);
			const messages = agent.state.messages as any[];
			const assistants = messages.filter(message => message.role === 'assistant');
			const last = assistants.at(-1);
			if (last?.errorMessage) throw new Error(last.errorMessage);
			const answer = (last?.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
			const calls = assistants.flatMap(message => (message.content ?? []).filter((part: any) => part.type === 'toolCall').map((part: any) => part.name));
			return { answer, toolCalls: calls.length ? calls : events,
				usage: { input: assistants.reduce((n, message) => n + (message.usage?.input ?? 0), 0), output: assistants.reduce((n, message) => n + (message.usage?.output ?? 0), 0) } };
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
