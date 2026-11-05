// Real read-only Oracle sessions; all LLM paths disabled for Security captures.
import { createWebServer } from '../../src/web/server.js';
const web = createWebServer({ port: 0,
	checkHealth: async () => {}, health: async () => [{ name: 'LLM disabled for Security capture', status: 'ok' }],
	agentFactory: async () => ({ state: { messages: [] } as any, subscribe: () => () => {}, abort: () => {}, waitForIdle: async () => {}, prompt: async () => { throw new Error('LLM forbidden for Security capture'); } }),
});
process.stdout.write(await web.listen());
