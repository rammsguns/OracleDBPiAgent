import { expect, it } from 'vitest';
import { Type } from 'typebox';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { createOracleAgent } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';

async function fixture(replies: string[], enabled = true, maxCalls = 20, toolCalls?: { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }[], pinnedTarget?: string) {
	const config = loadConfig({ PIAGENT_GROUNDING_CHECK: enabled ? '1' : '0', PIAGENT_MAX_TOOL_CALLS: String(maxCalls) });
	config.targets[0]!.description = 'PROMOTIONS 3313394.74';
	const audit: any[] = [], contexts: any[] = [];
	const agent = await createOracleAgent({ config, pinnedTarget, runId: 'grounding-test', sessions: { get: async () => { throw Error('No DB'); }, closeAll: async () => {} }, audit: { record: async e => { audit.push(e); } } }, {
		model: { id: 'test', name: 'test', api: 'openai-completions', provider: 'strata', baseUrl: config.llm.baseUrl, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000 },
		streamFn: (_m, context) => {
			contexts.push(structuredClone(context));
			const next = replies.shift();
			if (next === undefined) throw Error('Unexpected additional request');
			const content = next === 'TOOL' ? toolCalls ?? [{ type: 'toolCall' as const, id: String(contexts.length), name: 'list_targets', arguments: {} }] : [{ type: 'text' as const, text: next }];
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
	expect(contexts[2].messages.at(-1).content).toContain("These numbers do not appear in this conversation's tool results: 3,331,394.74. Return the complete revised answer, which will replace your previous answer. Keep the rest of your answer, including any refusal, and only fix or remove the listed numbers; use tools only if needed.");
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

for (const key of ['schema', 'owner']) {
	it(`matches result owners by toolCallId using ${key}, including missing owners`, async () => {
		const { agent, contexts } = await fixture(['TOOL', 'HR.SECURE_DML HR.EMPLOYEES FAKE.SECURE_DML OE.EMPLOYEES HR.UNKNOWN 99999', 'HR.SECURE_DML HR.EMPLOYEES FAKE.SECURE_DML OE.EMPLOYEES HR.UNKNOWN'], true, 20, [
			{ type: 'toolCall', id: 'source', name: 'fixture_source', arguments: { [key]: 'hr' } },
			{ type: 'toolCall', id: 'other', name: 'fixture_source', arguments: {} },
		]);
		agent.state.tools = [{
			name: 'fixture_source', label: 'fixture', description: 'Unit test evidence',
			parameters: Type.Object({ schema: Type.Optional(Type.String()), owner: Type.Optional(Type.String()) }),
			execute: async id => ({ content: [{ type: 'text', text: id === 'source' ? 'PROCEDURE secure_dml; ON employees' : 'unknown' }], details: {} }),
		}];
		await agent.prompt('Explain the source.');
		expect(agent.unverified).toEqual(['FAKE.SECURE_DML', 'OE.EMPLOYEES', 'HR.UNKNOWN']);
		expect(contexts).toHaveLength(3);
		expect(contexts[2].messages.at(-1).content).toContain('99999');
	});
}

it('revises zero-tool pack refusals once, even with grounding disabled, and removes tools', async () => {
	for (const enabled of [true, false]) {
		const { agent, contexts, audit } = await fixture(['AWR is unavailable.', 'AWR is unavailable.'], enabled);
		await agent.prompt('Show AWR for the last hour.');
		expect(contexts).toHaveLength(2);
		const correction = contexts[1].messages.at(-1).content;
		expect(correction).toContain(`piagent top --target ${loadConfig({}).defaultTarget} --seconds N`);
		expect(correction).toContain('one live 5-120 second interval now (default 15)');
		expect(correction).toContain('no history');
		expect(contexts[1].messages.filter((m: any) => m.role === 'system').flatMap((m: any) => m.tools ?? [])).toEqual([]);
		expect(audit.filter(e => e.kind === 'tool_call')).toEqual([]);
	}
});

it('shares the correction allowance with numbers, preserving residual grounding', async () => {
	const { agent, contexts } = await fixture(['TOOL', 'Count 99,999', 'AWR is unavailable. Count 88,888']);
	await agent.prompt('Find the count.');
	expect(contexts).toHaveLength(3);
	expect(agent.unverified).toContain('88,888');
});

it('does not correct a compliant pack refusal or let a revision invoke tools', async () => {
	const compliant = await fixture(['AWR is unavailable. Use piagent top.']);
	await compliant.agent.prompt('AWR history?');
	expect(compliant.contexts).toHaveLength(1);
	const blocked = await fixture(['AWR is unavailable.', 'TOOL', 'Use piagent top.']);
	await blocked.agent.prompt('AWR history?');
	expect(blocked.audit.filter(e => e.kind === 'tool_call')).toEqual([]);
	expect(blocked.contexts.length).toBeLessThanOrEqual(3);
});

it('uses the pinned target and resets the pack allowance on the next run', async () => {
	const { agent, contexts } = await fixture(['ASH unavailable.', 'Use /top.', 'ASH unavailable.', 'Use /top.'], true, 20, undefined, 'p1-19c-prod');
	await agent.prompt('Show ASH history.');
	await agent.prompt('Show ASH history again.');
	expect(contexts).toHaveLength(4);
	for (const i of [1, 3]) expect(contexts[i].messages.at(-1).content).toContain('piagent top --target p1-19c-prod --seconds N');
});

it('does not schedule a numbers follow-up after a pack revision', async () => {
	const { agent, contexts } = await fixture(['TOOL', 'AWR unavailable.', 'Use piagent top. Count 88,888']);
	await agent.prompt('Show AWR history.');
	expect(contexts).toHaveLength(3);
	expect(agent.unverified).toContain('88,888');
});
