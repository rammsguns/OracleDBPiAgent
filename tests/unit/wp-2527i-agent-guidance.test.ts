import { expect, it } from 'vitest';
import { systemPrompt } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext } from '../../src/contracts.js';
import { PACK_REFUSALS, PHASE27_GUIDANCE } from './fixtures/phase27-guidance.js';

it('refuses pack requests before tools and offers a bounded live alternative without workarounds', () => {
	const prompt = systemPrompt({ config: loadConfig({}) } as ToolContext);
	const refusal = prompt.slice(prompt.indexOf('Refuse in first reply'), prompt.indexOf('Fewest tool calls'));
	expect(refusal).toContain('without calling tools or checking existence');
	expect(refusal).toContain(PACK_REFUSALS);
	// DBMS_ already covers DBMS_WORKLOAD_REPOSITORY and DBMS_ADDM.
	expect(refusal).toContain('DBMS_');
	expect(prompt).toContain(PHASE27_GUIDANCE);
	for (const rule of [
		'piagent top --target T --seconds N or /top: SQL, load and host CPU deltas;',
		'one live N-second interval now (5-120, default 15); no history/past hour',
		'No Diagnostics/Tuning Pack scripts, AWR reports/snapshots or writes as workarounds',
		'piagent backup and piagent jobs: full recoverability/scheduler pointers only; use tools if answerable',
		'RMAN unset retention: REDUNDANCY 1',
		'control-file autobackup default is version-dependent; never infer',
	]) expect(prompt).toContain(rule);
	// Separate bounded allowance; historical prefix budgets remain enforced.
	expect(PACK_REFUSALS.length + PHASE27_GUIDANCE.length).toBeLessThanOrEqual(531);
});
