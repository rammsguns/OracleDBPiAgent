import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { systemPrompt } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';
import { appendToolNotes } from '../../src/config/tunables.js';
import { createDbTools } from '../../src/tools/index.js';
import type { ToolContext } from '../../src/contracts.js';

it('places the exact promoted guidance after all fixed rules and pinned target, before an optional appendix', async () => {
	// refuse-first-concise.txt, tightened to the same rules in compact-guidance.txt (2026-10-27).
	const guidance = (await readFile('evals/variants/compact-guidance.txt', 'utf8')).trim();
	const config = loadConfig({});
	const ctx = { config, pinnedTarget: 'p1-19c-prod' } as ToolContext;
	const prompt = systemPrompt(ctx);
	expect(prompt).toContain('Use only read-only tools; never execute writes, DDL, PL/SQL, EXPLAIN PLAN writes, or access ASH/AWR or non-19c databases.');
	expect(prompt).toContain('report that failure and never substitute data from another target. This run is pinned to target p1-19c-prod.\n\n' + guidance);
	expect(prompt.endsWith(guidance)).toBe(true);
	expect(prompt.split(guidance)).toHaveLength(2);
	config.llm.promptAppendix = 'Optional final appendix.';
	expect(systemPrompt(ctx)).toBe(prompt + '\n\nAdditional answer guidance (subject to all rules above):\nOptional final appendix.');
	expect(systemPrompt({ config } as ToolContext).indexOf(guidance)).toBeGreaterThan(systemPrompt({ config } as ToolContext).indexOf('never substitute data from another target.'));
});

it('includes the exact FK note in describe_object and appends optional notes after it', async () => {
	const note = JSON.parse(await readFile('evals/variants/describe-notes.json', 'utf8')).describe_object as string;
	const tools = createDbTools({ config: loadConfig({}) } as ToolContext);
	const original = tools.find(tool => tool.name === 'describe_object')!;
	expect(original.description).toBe('Columns, constraints, indexes and table statistics\n\n' + note);
	const updated = appendToolNotes(tools, { describe_object: 'Optional tool note.' }).find(tool => tool.name === 'describe_object')!;
	expect(updated.description).toBe(original.description + '\n\nOptional tool note.');
	expect(original.description.endsWith(note)).toBe(true);
	// Promoted after the defaults regressed on hard-region-channel (COUNTRY_SUBREGION substituted for COUNTRY_REGION).
	const columns = JSON.parse(await readFile('evals/variants/describe-runquery-notes.json', 'utf8')).run_query as string;
	expect(tools.find(tool => tool.name === 'run_query')!.description).toBe('Execute bounded read-only SQL\n\n' + columns);
});
