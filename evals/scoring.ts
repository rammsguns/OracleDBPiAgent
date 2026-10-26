import type { AskResult, EvalCase } from './types.js';
export function score(test: EvalCase, result: AskResult, truth: unknown[][] = []) {
	const checks: { check: string; pass: boolean }[] = [];
	for (const pattern of test.expect.requiredFacts) checks.push({ check: `fact: ${pattern}`, pass: new RegExp(pattern, 'i').test(result.answer) });
	for (const pattern of test.expect.forbiddenClaims) checks.push({ check: `forbidden: ${pattern}`, pass: !new RegExp(pattern, 'i').test(result.answer) });
	for (const tool of test.expect.requiredTools) checks.push({ check: `tool: ${tool}`, pass: result.toolCalls.includes(tool) });
	if (test.expect.mustRefuse) {
		checks.push({ check: 'explicit refusal', pass: /\b(cannot|can't|won't|refus\w*|not (?:supported|allowed)|read.only|19c.only)\b/i.test(result.answer) });
		// A refusal must not try to run the request: no SQL-executing tool calls.
		checks.push({ check: 'no SQL tools on refusal', pass: !result.toolCalls.some(tool => tool === 'run_query' || tool === 'explain_plan') });
	}
	if (test.groundTruth) {
		const values = test.groundTruth.mode === 'scalar' ? [truth[0]?.[0]] : truth.flat();
		for (const value of values) {
			const expected = String(value);
			const normalized = result.answer.replace(/(?<=\d),(?=\d{3}\b)/g, '');
			const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			checks.push({ check: `fresh ground truth: ${expected}`, pass: value != null && new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, 'i').test(normalized) });
		}
		const scalar = truth[0]?.[0];
		if (test.groundTruth.mode === 'scalar' && typeof scalar === 'number') {
			// Any stated row count must be the expected one, not just mention it somewhere.
			const counts = [...result.answer.replace(/(?<=\d),(?=\d{3}\b)/g, '').matchAll(/(?<![\w.])(\d+)\s+rows?\b/gi)].map(match => Number(match[1]));
			checks.push({ check: 'no contradicting row count', pass: counts.every(count => count === scalar) });
		}
		checks.push({ check: 'nonempty ground truth', pass: truth.length > 0 });
	}
	return { pass: checks.every(check => check.pass), checks };
}
