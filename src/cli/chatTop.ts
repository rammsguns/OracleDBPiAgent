import type { ToolContext } from '../contracts.js';
import { collectTop } from '../triage/features.js';
import { renderTop, validateSeconds } from '../top/index.js';
export function parseTopCommand(question: string): { seconds: number } | undefined {
	question = question.trim();
	if (!/^\/top(?:\s|$)/.test(question)) return undefined;
	const match = /^\/top(?:\s+--seconds\s+(\d+))?\s*$/.exec(question);
	if (!match) throw new Error('Usage: /top [--seconds N] (5–120; default 15)');
	const seconds = match[1] === undefined ? 15 : Number(match[1]);
	validateSeconds(seconds);
	return { seconds };
}
/** Return a deterministic response directly; never add a model turn. */
export async function runChatTop(ctx: ToolContext, question: string, signal?: AbortSignal): Promise<string | undefined> {
	const command = parseTopCommand(question);
	if (!command) return undefined;
	return renderTop(await collectTop(ctx, ctx.pinnedTarget ?? ctx.config.defaultTarget, command.seconds, signal));
}
