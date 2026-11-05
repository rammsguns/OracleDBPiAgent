// Real read-only Oracle sessions; every LLM path is stubbed for WP-19C captures.
import { createWebServer } from '../../src/web/server.js';
const web = createWebServer({ port: 0,
	checkHealth: async () => {}, health: async () => [{ name: 'LLM disabled for SQL capture', status: 'ok' }],
	agentFactory: async () => ({ state: { messages: [] } as any, subscribe: () => () => {}, abort: () => {}, waitForIdle: async () => {}, prompt: async () => { throw new Error('LLM forbidden for SQL capture'); } }),
});
// Parent captures this URL in memory. Never print it in test results.
process.stdout.write(await web.listen());
