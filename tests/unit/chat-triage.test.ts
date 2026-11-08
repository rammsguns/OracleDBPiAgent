import { HEALTH_GUIDANCE } from './fixtures/health-guidance.js';
import { PACK_REFUSALS, PHASE27_GUIDANCE } from './fixtures/phase27-guidance.js';
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { systemPrompt } from '../../src/agent/index.js';
import { createDbTools } from '../../src/agent/dbToolsAdapter.js';
import { loadConfig } from '../../src/config/index.js';
import { parseTriageCommand, prepareChatQuestion } from '../../src/cli/chatTriage.js';
import { ADR_GUIDANCE } from './fixtures/adr-guidance.js';
import type { ToolContext } from '../../src/contracts.js';
it('parses only the slash command, requires issue and caps UTF-8 bytes', () => {
	expect(parseTriageCommand('/triage ORA-02292\nline 27')).toEqual({ issue: 'ORA-02292\nline 27', since: '24h' });
	for (const q of ['ordinary question', '/triageOther issue', 'what is /triage']) expect(parseTriageCommand(q)).toBeUndefined();
	expect(() => parseTriageCommand('/triage ')).toThrow('Usage');
	expect(() => parseTriageCommand('/triage ' + 'é'.repeat(32769))).toThrow('64 KiB');
});
it('leaves normal turns alone and grounds a single question on deterministic evidence', async () => {
	const run = vi.fn(async (_ctx: ToolContext, _options: unknown) => ({ target: 'd1-19c-lab', issues: [], scan: null }));
	const ctx = { config: { defaultTarget: 'd1-19c-lab' } } as ToolContext;
	expect(await prepareChatQuestion(ctx, 'hello', run)).toBe('hello'); expect(run).not.toHaveBeenCalled();
	expect(await prepareChatQuestion(ctx, '/triage ORA-02292', run)).toContain('Do not call tools');
	expect(run).toHaveBeenCalledExactlyOnceWith(ctx, { target: 'd1-19c-lab', issue: 'ORA-02292', since: '24h' });
});
it('snapshots default agent prompt and tool schemas/descriptions against master', async () => {
	// Captured only after verifying the constructors byte-for-byte against the recorded master commit.
	const baseline = JSON.parse(readFileSync(new URL('./fixtures/chat-master.json', import.meta.url), 'utf8'));
	const ctx = { config: loadConfig({}), sessions: {}, audit: {}, runId: 'snapshot' } as ToolContext;
	expect(systemPrompt(ctx).replace(HEALTH_GUIDANCE, "")).toBe(baseline.systemPrompt.replace("rule overrides.", PACK_REFUSALS + "rule overrides.") + ADR_GUIDANCE + PHASE27_GUIDANCE);
	const tools = (await createDbTools(ctx)).filter(t => t.name !== "health_check").map(t => ({ name: t.name, label: t.label, description: t.description, parameters: t.parameters }));
	expect(JSON.stringify(tools)).toBe(JSON.stringify(baseline.tools));
});
it('does not start a model prompt if web chat disconnects during evidence gathering', async () => {
	const { ask } = await import('../../src/web/sessions.js');
	const prompt = vi.fn(), unsubscribe = vi.fn();
	const entry = { agent: { state: { messages: [] }, subscribe: () => unsubscribe, prompt }, prepareQuestion: async () => 'grounded evidence' };
	await ask(entry as any, '/triage ORA-02292', vi.fn(), () => true);
	expect(prompt).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
});

it.each(["1m", "90m", "12h", "7d", "30d", "720h", "43200m"])(
	"forwards a leading window %s to deterministic triage",
	async since => {
		const run = vi.fn(async () => ({ target: "p1-19c-prod", issues: [], scan: null }));
		const ctx = { config: { defaultTarget: "d1-19c-lab" }, pinnedTarget: "p1-19c-prod" } as ToolContext;
		const question = `/triage --since ${since} ORA-02292\nline 27`;
		expect(parseTriageCommand(question)).toEqual({ since, issue: "ORA-02292\nline 27" });
		await prepareChatQuestion(ctx, question, run);
		expect(run).toHaveBeenCalledExactlyOnceWith(ctx, {
			target: "p1-19c-prod", since, issue: "ORA-02292\nline 27",
		});
	},
);
it.each(["", "7d", "0h issue", "31d issue", "721h issue", "-1d issue", "1.5h issue", "7D issue", "oops issue"])(
	"rejects missing or invalid window/issue: %s before collecting evidence or prompting",
	async suffix => {
		const run = vi.fn();
		await expect(prepareChatQuestion({} as ToolContext, `/triage --since ${suffix}`, run)).rejects.toThrow(
			"Usage: /triage [--since <duration>] <issue text>",
		);
		expect(run).not.toHaveBeenCalled();
	},
);
it("preserves flags inside issue text and caps the issue after parsing a window", () => {
	expect(parseTriageCommand("/triage ORA-02292 --since 7d")).toEqual({
		issue: "ORA-02292 --since 7d", since: "24h",
	});
	expect(() => parseTriageCommand("/triage --since 7d " + "é".repeat(32769))).toThrow("64 KiB");
});
