import { mkdtemp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { loadConfig } from '../../src/config/index.js';
import { createWebServer } from '../../src/web/server.js';
import type { WebAgent } from '../../src/web/sessions.js';

export const hostile = '<img src=x onerror=alert(1)> <script>alert(1)</script>';
export async function startFakeServer() {
	const dir = await mkdtemp(join(tmpdir(), 'piagent-browser-'));
	const config = { ...loadConfig({}), secretDir: dir, auditFile: join(dir, 'audit.jsonl') };
	let now = 0;
	const stats = { aborted: 0, prompts: 0 };
	const web = createWebServer({ port: 0, config, now: () => now, idleMs: 1000,
		report: async (_ctx, options) => ({ target: options?.target ?? 'd1-19c-lab', generatedAt: '2026-10-29', sections: [
			{ name: 'identity', status: 'ok', source: 'fake', columns: ['VALUE'], rows: [[hostile + 'x'.repeat(500)]], note: 'Fake identity' },
			{ name: 'backups', status: 'unavailable', source: 'fake', columns: [], rows: [], note: 'not available: needs SELECT on SYS.V_$RMAN_BACKUP_JOB_DETAILS' },
		] }),
		summarize: async () => hostile + ' Invented 98,765 rows.',
		checkHealth: async () => {},
		health: async () => [{ name: 'Fake Strata', status: 'ok' }, { name: 'Fake Oracle', status: 'fail' }],
		sessionFactory: async () => ({ get: async () => { throw new Error('Database access forbidden in browser tests'); }, closeAll: async () => {} }),
		agentFactory: async ctx => {
			await appendFile(config.auditFile, JSON.stringify({ runId: ctx.runId, kind: 'tool_call', tool: hostile, target: ctx.config.defaultTarget, sqlSha256: 'fake-hash', rows: 7, elapsedMs: 12 }) + '\n');
			const listeners = new Set<Parameters<WebAgent['subscribe']>[0]>();
			// Scripted SDK event fragments are deliberately limited to fields consumed by ask().
			const emit = (event: unknown) => listeners.forEach(fn => fn(event as AgentEvent, new AbortController().signal));
			let release = () => {}, idle = Promise.resolve(), aborted = false;
			const state = { messages: [] as any[] };
			const agent: WebAgent = {
				state: state as WebAgent['state'], unverified: ['UNSUPPORTED_TABLE'],
				subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
				abort: () => { if (!aborted) stats.aborted++; aborted = true; release(); },
				waitForIdle: () => idle,
				prompt: async question => {
					stats.prompts++; aborted = false;
					idle = new Promise<void>(resolve => { release = resolve; });
					try {
						emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Partial answer' } });
						if (question === 'hold') await idle;
						else await Promise.race([idle, new Promise(resolve => setTimeout(resolve, 350))]);
						if (aborted) return;
						for (const isError of [false, true]) {
							emit({ type: 'tool_execution_start', toolName: isError ? 'failed_query' : 'run_query', args: { name: hostile, binds: { secret: "never-export-bind" }, sql: "never-export-sql" } });
							await new Promise(resolve => setTimeout(resolve, 100));
							emit({ type: 'tool_execution_end', toolName: isError ? 'failed_query' : 'run_query', isError, result: { content: [{ type: 'text', text: 'fake result' }] } });
						}
						emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' streamed tail' } });
						const answer = 'Final answer ' + hostile;
						state.messages.push({ role: 'assistant', content: [{ type: 'text', text: answer }], usage: { input: 1, output: 2 } });
					} finally { release(); }
				},
			};
			return agent;
		},
	});
	return { url: await web.listen(), stats,
		expire: async () => { now += 1001; await web.manager.expire(); },
		close: async () => { await web.close(); await rm(dir, { recursive: true, force: true }); },
	};
}
