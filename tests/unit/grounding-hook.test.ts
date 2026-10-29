import { expect, it } from 'vitest';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { createOracleAgent } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';

async function fixture(replies: string[], enabled = true, maxCalls = 20) {
	const config = loadConfig({ PIAGENT_GROUNDING_CHECK: enabled ? '1' : '0', PIAGENT_MAX_TOOL_CALLS: String(maxCalls) });
	config.targets[0]!.description = 'PROMOTIONS 3313394.74';
	const audit: any[] = [], contexts: any[] = [];
	const agent = await createOracleAgent({ config, runId: 'grounding-test', sessions: { get: async () => { throw Error('No DB'); }, closeAll: async () => {} }, audit: { record: async e => { audit.push(e); } } }, {
		model: { id: 'test', name: 'test', api: 'openai-completions', provider: 'strata', baseUrl: config.llm.baseUrl, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000 },
		streamFn: (_m, context) => {
			contexts.push(structuredClone(context));
			const next = replies.shift();
			if (next === undefined) throw Error('Unexpected additional request');
			const content = next === 'TOOL' ? [{ type: 'toolCall' as const, id: String(contexts.length), name: 'list_targets', arguments: {} }] : [{ type: 'text' as const, text: next }];
			const message = { role: 'assistant' as const, api: 'openai-completions' as const, provider: 'strata', model: 'test', content, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: next === 'TOOL' ? 'toolUse' as const : 'stop' as const, timestamp: Date.now() };
			const stream = createAssistantMessageEventStream();
			stream.push({ type: 'done', reason: message.stopReason, message }); stream.end(message);
			return stream;
		},
	});
	return { agent, audit, contexts };
}

it('corrects unsupported numbers once using the exact follow-up, keeping identifiers out of the correction turn', async () => {
	const { agent, audit, contexts } = await fixture(['TOOL', '`PROMO`: 3,331,394.74', '`PROMOTIONS`: 3,313,394.74']);
	await agent.prompt('What is the table total?');
	expect(contexts).toHaveLength(3);
	expect(contexts[2].messages.at(-1).content).toContain("These numbers do not appear in this conversation's tool results: 3,331,394.74. Keep the rest of your answer, including any refusal, and only fix or remove the listed numbers; use tools only if needed.");
	expect(contexts[2].messages.at(-1).content).not.toContain('PROMO');
	expect(agent.unverified).toEqual([]);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 0 }]);
});

it('lists unsupported identifiers in unverified and audit without triggering a correction turn', async () => {
	const { agent, audit, contexts } = await fixture(['TOOL', 'Table is `PROMO`.']);
	await agent.prompt('Find the table.');
	expect(contexts).toHaveLength(2);
	expect(agent.unverified).toEqual(['PROMO']);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 1 }]);
});

it('skips check and correction entirely when the run made no successful tool calls', async () => {
	const { agent, audit, contexts } = await fixture(['Table `PROMO` has 99,999 rows.']);
	await agent.prompt('Tell me about the table.');
	expect(contexts).toHaveLength(1);
	expect(agent.unverified).toEqual([]);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 0 }]);
});

it('skips check and correction entirely when the answer is a refusal', async () => {
	const { agent, audit, contexts } = await fixture(['TOOL', "I can't execute that statement. DROP TABLE is DDL and 99,999 rows are protected."]);
	await agent.prompt('Drop the table.');
	expect(contexts).toHaveLength(2);
	expect(agent.unverified).toEqual([]);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 0 }]);
});

it('reports residual facts, never schedules a second correction and resets per user run', async () => {
	const { agent, audit, contexts } = await fixture(['TOOL', 'Count 99,999', 'Count 99,999', 'No data available.']);
	await agent.prompt('Find the count.');
	expect(contexts).toHaveLength(3);
	expect(agent.unverified).toEqual(['99,999']);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 1 }]);
	await agent.prompt('Anything else?');
	expect(agent.unverified).toEqual([]);
});

it('performs no extra requests for supported answers or disabled checks', async () => {
	for (const [replies, enabled] of [[['TOOL', 'PROMOTIONS 3,313,394.74'], true], [['TOOL', 'PROMO 98765'], false]] as const) {
		const { agent, contexts } = await fixture([...replies], enabled);
		await agent.prompt('Find the table.');
		expect(contexts).toHaveLength(replies.length);
		expect(agent.unverified).toEqual([]);
	}
});

it('ignores question facts, but does not treat its correction instruction as evidence', async () => {
	const { agent } = await fixture(['TOOL', 'Count 99,999 is unknown; count 88,888 is unknown.', 'Count 88,888 is unknown.']);
	await agent.prompt('Is the count 99,999?');
	expect(agent.unverified).toEqual(['88,888']);
});

it('permits tools during correction and checks the final reply with new evidence', async () => {
	const { agent, contexts } = await fixture(['TOOL', 'Count 99999', 'TOOL', 'PROMOTIONS 3313394.74']);
	await agent.prompt('Find the total.');
	expect(contexts).toHaveLength(4);
	expect(agent.unverified).toEqual([]);
});

it('keeps the existing budget final turn and corrects without restoring tools', async () => {
	const { agent, contexts } = await fixture(['TOOL', 'TOOL', 'Total 99,999', 'PROMOTIONS 3,313,394.74'], true, 1);
	await agent.prompt('Find the table.');
	expect(contexts).toHaveLength(4);
	expect(contexts[3].messages.filter((m: any) => m.role === 'system').flatMap((m: any) => m.tools ?? [])).toEqual([]);
	expect(contexts[3].messages.filter((m: any) => m.role === 'system').at(-1).toolsRemoved).toContainEqual({ name: 'list_targets' });
	expect(agent.unverified).toEqual([]);
});

it('retains flags if the correction request fails, without looping', async () => {
	const { agent, audit, contexts } = await fixture(['TOOL', 'Total 99,999']);
	await agent.prompt('Find the table.');
	expect(contexts).toHaveLength(3);
	expect(agent.state.errorMessage).toBeDefined();
	expect(agent.unverified).toEqual(['99,999']);
	expect(audit.filter(e => e.kind === 'run_end')).toMatchObject([{ unverifiedCount: 1 }]);
});

it('never exempts a fact merely because a previous correction instruction named it', async () => {
	const { agent, contexts } = await fixture(['TOOL', '99,999', '99,999', 'TOOL', '99,999', '99,999']);
	await agent.prompt('First lookup.');
	await agent.prompt('Second lookup.');
	expect(contexts).toHaveLength(6);
	expect(agent.unverified).toEqual(['99,999']);
});
