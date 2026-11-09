import type { Limits } from '../src/contracts.js';
interface EvalCaseBase {
	id: string;
	target: string;
	category: string;
	limits?: Partial<Limits>;
	/** Exact SELECTs executed as the target account immediately before this case's agent run. */
	setup?: string[];
	/** Optimization split (PLAN.md "Model optimization loop"): tune on dev, confirm on holdout. */
	split?: 'dev' | 'holdout' | 'regression' | 'challenge' | 'pdb' | 'standby';
	/** Opt in to skipping cache-dependent cases when pre/post truth has no rows. */
	skipWhenTruthEmpty?: boolean;
	groundTruth?: { sql: string; mode: 'scalar' | 'allCells' | 'rowCells'; setupSql?: string; factTemplates?: string[] };
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
