import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { systemPrompt } from '../../src/agent/index.js';
import { createDbTools } from '../../src/agent/dbToolsAdapter.js';
import { loadConfig } from '../../src/config/index.js';
import { parseTriageCommand, prepareChatQuestion } from '../../src/cli/chatTriage.js';
import type { ToolContext } from '../../src/contracts.js';
it('parses only the slash command, requires issue and caps UTF-8 bytes', () => {
	expect(parseTriageCommand('/triage ORA-02292\nline 27')).toBe('ORA-02292\nline 27');
	for (const q of ['ordinary question', '/triageOther issue', 'what is /triage']) expect(parseTriageCommand(q)).toBeUndefined();
	expect(() => parseTriageCommand('/triage ')).toThrow('Usage');
	expect(() => parseTriageCommand('/triage ' + 'é'.repeat(32769))).toThrow('64 KiB');
});
it('leaves normal turns alone and grounds a single question on deterministic evidence', async () => {
	const run = vi.fn(async (_ctx: ToolContext, _options: unknown) => ({ target: 'd1-19c-lab', issues: [], scan: null }));
	const ctx = { config: { defaultTarget: 'd1-19c-lab' } } as ToolContext;
	expect(await prepareChatQuestion(ctx, 'hello', run)).toBe('hello'); expect(run).not.toHaveBeenCalled();
	expect(await prepareChatQuestion(ctx, '/triage ORA-02292', run)).toContain('Do not call tools');
	expect(run).toHaveBeenCalledExactlyOnceWith(ctx, { target: 'd1-19c-lab', issue: 'ORA-02292' });
});
it('snapshots default agent prompt and tool schemas/descriptions against master', async () => {
	// Captured only after verifying the constructors byte-for-byte against the recorded master commit.
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/chat-master.json', import.meta.url), 'utf8'));
	const ctx = { config: loadConfig({}), sessions: {}, audit: {}, runId: 'snapshot' } as ToolContext;
	expect(systemPrompt(ctx)).toBe(baseline.systemPrompt);
	const tools = (await createDbTools(ctx)).map(t => ({ name: t.name, label: t.label, description: t.description, parameters: t.parameters }));
	expect(JSON.stringify(tools)).toBe(JSON.stringify(baseline.tools));
});
it('does not start a model prompt if web chat disconnects during evidence gathering', async () => {
	const { ask } = await import('../../src/web/sessions.js');
	const prompt = vi.fn(), unsubscribe = vi.fn();
	const entry = { agent: { state: { messages: [] }, subscribe: () => unsubscribe, prompt }, prepareQuestion: async () => 'grounded evidence' };
	await ask(entry as any, '/triage ORA-02292', vi.fn(), () => true);
	expect(prompt).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
});
