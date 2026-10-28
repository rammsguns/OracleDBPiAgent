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
	expect(prompt.startsWith('Read-only:no writes/DDL/PLSQL/EXPLAIN PLAN writes/ASH/AWR/non-19c.')).toBe(true);
	expect(prompt).toContain('no target substitution. Pin: p1-19c-prod.\n\nRefuse pre-tools/existence checks');
	expect(prompt).toContain('Never request/reveal credentials/bind values.');
	config.llm.promptAppendix = 'Optional final appendix.';
	expect(systemPrompt(ctx)).toBe(prompt + '\n\nAdditional answer guidance (subject to all rules above):\nOptional final appendix.');
});

it('keeps FK resolution and exact-column rules before appended tool notes', () => {
	const tools = createDbTools({ config: loadConfig({}) } as ToolContext);
	const original = tools.find(tool => tool.name === 'describe_object')!;
	for (const fact of ['no FK parent table/column', 'never infer', 'run_query ALL_CONSTRAINTS(R_OWNER,R_CONSTRAINT_NAME) join ALL_CONS_COLUMNS']) expect(original.description).toContain(fact);
	const updated = appendToolNotes(tools, { describe_object: 'Optional tool note.' }).find(tool => tool.name === 'describe_object')!;
	expect(updated.description).toBe(original.description + '\n\nOptional tool note.');
	for (const fact of ['Read-only;1 statement;maxRows<=config', 'chat tool-seen only', 'describe_object unseen requested cols first', 'no similar/SUB-name swaps']) expect(tools.find(tool => tool.name === 'run_query')!.description).toContain(fact);
});
