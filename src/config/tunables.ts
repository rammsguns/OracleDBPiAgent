import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import type { AppConfig, LlmConfig } from '../contracts.js';

export interface HarnessTunables {
	temperature?: number;
	reasoningBudgetTokens?: number;
	promptAppendix?: string;
	toolNotes?: Record<string, string>;
	dropPriorThinking?: boolean;
}
export type TunableLlmConfig = LlmConfig & HarnessTunables;
export type TunableAppConfig = AppConfig & { llm: TunableLlmConfig };
export function readBoundedFile(path: string): Buffer {
	const fd = openSync(path, 'r');
	try {
		if (!fstatSync(fd).isFile() || fstatSync(fd).size > 8192) throw new Error('Tunable file must be a regular file of at most 8192 bytes');
		const buffer = Buffer.alloc(8193);
		let length = 0;
		while (length < buffer.length) {
			const count = readSync(fd, buffer, length, buffer.length - length, null);
			if (!count) break;
			length += count;
		}
		if (length > 8192) throw new Error('Tunable file exceeds 8192 bytes');
		return buffer.subarray(0, length);
	} finally { closeSync(fd); }
}
export function loadTunables(env: NodeJS.ProcessEnv): HarnessTunables {
	const result: HarnessTunables = {};
	if (env.PIAGENT_LLM_REASONING_BUDGET !== undefined) {
		const raw = env.PIAGENT_LLM_REASONING_BUDGET;
		const n = Number(raw);
		if (!raw.trim() || !Number.isInteger(n) || n < 64 || n > 8192) throw new Error('Invalid PIAGENT_LLM_REASONING_BUDGET');
		result.reasoningBudgetTokens = n;
	}
	if (env.PIAGENT_LLM_TEMPERATURE !== undefined) {
		const raw = env.PIAGENT_LLM_TEMPERATURE;
		const n = Number(raw);
		if (!raw.trim() || !Number.isFinite(n) || n < 0 || n > 2) throw new Error('Invalid PIAGENT_LLM_TEMPERATURE');
		result.temperature = n;
	}
	if (env.PIAGENT_DROP_PRIOR_THINKING !== undefined) {
		if (!['0', '1'].includes(env.PIAGENT_DROP_PRIOR_THINKING)) throw new Error('Invalid PIAGENT_DROP_PRIOR_THINKING');
		result.dropPriorThinking = env.PIAGENT_DROP_PRIOR_THINKING === '1';
	}
	if (env.PIAGENT_PROMPT_APPENDIX_FILE) result.promptAppendix = readBoundedFile(env.PIAGENT_PROMPT_APPENDIX_FILE).toString('utf8');
	if (env.PIAGENT_TOOL_NOTES_FILE) {
		const notes: unknown = JSON.parse(readBoundedFile(env.PIAGENT_TOOL_NOTES_FILE).toString('utf8'));
		if (!notes || typeof notes !== 'object' || Array.isArray(notes) || Object.values(notes).some(value => typeof value !== 'string')) throw new Error('Tool notes must be an object of strings');
		result.toolNotes = notes as Record<string, string>;
	}
	return result;
}
export function appendToolNotes<T extends { name: string; description: string }>(tools: T[], notes: Record<string, string> = {}): T[] {
	if (Object.keys(notes).some(name => !tools.some(tool => tool.name === name))) throw new Error('Unknown tool name in tool notes');
	return tools.map(tool => Object.hasOwn(notes, tool.name) ? { ...tool, description: `${tool.description}\n\n${notes[tool.name]}` } : tool);
}
