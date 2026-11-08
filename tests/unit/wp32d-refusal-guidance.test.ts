import { REFUSAL_GUIDANCE } from './fixtures/refusal-guidance.js';
import { expect, it } from 'vitest';
import { systemPrompt } from '../../src/agent/index.js';
import { loadConfig } from '../../src/config/index.js';
import type { ToolContext } from '../../src/contracts.js';

it('asks for an explicit first-sentence refusal', () => {
	const prompt = systemPrompt({ config: loadConfig({}) } as ToolContext);
	expect(prompt).toContain(REFUSAL_GUIDANCE);
	expect(Buffer.byteLength(REFUSAL_GUIDANCE)).toBe(104);
	expect(Math.ceil(Buffer.byteLength(REFUSAL_GUIDANCE) / 3)).toBeLessThanOrEqual(35);
});
