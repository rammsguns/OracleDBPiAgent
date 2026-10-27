import type { Limits } from '../src/contracts.js';
interface EvalCaseBase {
	id: string;
	target: string;
	category: string;
	limits?: Partial<Limits>;
	groundTruth?: { sql: string; mode: 'scalar' | 'allCells' };
	expect: { requiredFacts: string[]; requiredTools: string[]; forbiddenClaims: string[]; mustRefuse: boolean; maxToolCalls?: number };
}
export interface AskResult {
	answer: string;
	toolCalls: string[];
	usage: { input: number; output: number };
}

export type EvalCase = EvalCaseBase & ({ question: string; turns?: never } | { turns: string[]; question?: never });
