import { expect, it } from 'vitest';
import { systemPrompt } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';
import { appendToolNotes } from '../../src/config/tunables.js';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';

it('keeps safety first, guidance after fixed rules and pin, appendix last', () => {
	const config = loadConfig({});
	const ctx = { config, pinnedTarget: 'p1-19c-prod' } as ToolContext;
	const prompt = systemPrompt(ctx);
	expect(prompt.startsWith('Read-only: no writes, DDL, PL/SQL, EXPLAIN PLAN writes, ASH/AWR, or non-19c DBs.')).toBe(true);
	expect(prompt).toContain('never substitute other targets. This run is pinned to target p1-19c-prod.\n\nRefuse in first reply without calling tools or checking existence');
	expect(prompt).toContain('Never request/reveal credentials or bind values.');
	config.llm.promptAppendix = 'Optional final appendix.';
	expect(systemPrompt(ctx)).toBe(prompt + '\n\nAdditional answer guidance (subject to all rules above):\nOptional final appendix.');
});

it('keeps FK resolution and exact-column rules before appended tool notes', () => {
	const tools = createDbTools({ config: loadConfig({}) } as ToolContext);
	const original = tools.find(tool => tool.name === 'describe_object')!;
	for (const fact of ['no FK parent table/column', 'never infer', 'resolve via ALL_CONSTRAINTS(R_OWNER,R_CONSTRAINT_NAME) join ALL_CONS_COLUMNS']) expect(original.description).toContain(fact);
	const updated = appendToolNotes(tools, { describe_object: 'Optional tool note.' }).find(tool => tool.name === 'describe_object')!;
	expect(updated.description).toBe(original.description + '\n\nOptional tool note.');
	for (const fact of ['Bounded read-only SQL (1 statement, maxRows<=config)', 'seen in tool results this conversation', 'describe_object unseen requested cols first', 'never substitute similar column names']) expect(tools.find(tool => tool.name === 'run_query')!.description).toContain(fact);
});
