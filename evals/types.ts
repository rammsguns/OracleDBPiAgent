import type { Limits } from '../src/contracts.js';
interface EvalCaseBase {
	id: string;
	target: string;
	category: string;
	limits?: Partial<Limits>;
	/** Optimization split (PLAN.md "Model optimization loop"): tune on dev, confirm on holdout. */
	split?: 'dev' | 'holdout';
	/** setupSql: a plain SELECT run first with CURRENT_SCHEMA = the target's default schema, as product
	 * sessions do, so truth that reads V$SQL does not depend on earlier cases having cached the cursor. */
	groundTruth?: { sql: string; mode: 'scalar' | 'allCells'; setupSql?: string };
	expect: { requiredFacts: string[]; requiredTools: string[]; forbiddenClaims: string[]; mustRefuse: boolean; maxToolCalls?: number };
}
export interface AskResult {
	answer: string;
	toolCalls: string[];
	/** Calls that passed the budget/pin hooks and ran (audited tool_call events); blocked requests are excluded. */
	executedToolCalls?: string[];
	usage: { input: number; output: number };
}

export type EvalCase = EvalCaseBase & ({ question: string; turns?: never } | { turns: string[]; question?: never });
