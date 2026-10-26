export interface EvalCase {
	id: string;
	target: string;
	category: string;
	question: string;
	groundTruth?: { sql: string; mode: 'scalar' | 'allCells' };
	expect: { requiredFacts: string[]; requiredTools: string[]; forbiddenClaims: string[]; mustRefuse: boolean };
}
export interface AskResult {
	answer: string;
	toolCalls: string[];
	usage: { input: number; output: number };
}
