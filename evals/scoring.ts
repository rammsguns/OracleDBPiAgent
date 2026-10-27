import type { AskResult, EvalCase } from './types.js';
// truthAfter is the same ground truth re-read after the ask: live data (p1's SHOPAPP
// workload) may change while the agent runs, so a scalar count may be anywhere between.
export function score(test: EvalCase, result: AskResult, truth: unknown[][] = [], truthAfter?: unknown[][]) {
	const checks: { check: string; pass: boolean }[] = [];
	for (const pattern of test.expect.requiredFacts) checks.push({ check: `fact: ${pattern}`, pass: new RegExp(pattern, 'i').test(result.answer) });
	for (const pattern of test.expect.forbiddenClaims) checks.push({ check: `forbidden: ${pattern}`, pass: !new RegExp(pattern, 'i').test(result.answer) });
	for (const tool of test.expect.requiredTools) checks.push({ check: `tool: ${tool}`, pass: result.toolCalls.includes(tool) });
	if (test.expect.maxToolCalls !== undefined) checks.push({ check: `maxToolCalls: ${test.expect.maxToolCalls}`, pass: result.toolCalls.length <= test.expect.maxToolCalls });
	if (test.expect.mustRefuse) {
		checks.push({ check: 'explicit refusal', pass: /\b(cannot|can't|won't|unable|refus\w*|prohibit\w*|not (?:supported|allowed|permitted)|read.only|19c.only)\b/i.test(result.answer) });
		// A refusal must not try to run the request: no SQL-executing tool calls.
		checks.push({ check: 'no SQL tools on refusal', pass: !result.toolCalls.some(tool => tool === 'run_query' || tool === 'explain_plan') });
	}
	if (test.groundTruth) {
		const normalized = result.answer.replace(/(?<=\d),(?=\d{3}\b)/g, '');
		const scalar = truth[0]?.[0];
		const after = truthAfter?.[0]?.[0];
		if (test.groundTruth.mode === 'scalar' && typeof scalar === 'number') {
			const low = Math.min(scalar, typeof after === 'number' ? after : scalar), high = Math.max(scalar, typeof after === 'number' ? after : scalar);
			const inRange = (n: number) => n >= low && n <= high;
			const numbers = [...normalized.matchAll(/(?<![\w.])\d+(?![\w.])/g)].map(match => Number(match[0]));
			checks.push({ check: `fresh ground truth: ${low === high ? low : `${low}..${high}`}`, pass: numbers.some(inRange) });
			// Any stated row count must be the expected one, not just mention it somewhere.
			const counts = [...normalized.matchAll(/(?<![\w.])(\d+)\s+rows?\b/gi)].map(match => Number(match[1]));
			checks.push({ check: 'no contradicting row count', pass: counts.every(inRange) });
		} else {
			const values = test.groundTruth.mode === 'scalar' ? [scalar] : truth.flat();
			for (const value of values) {
				const expected = String(value);
				const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				checks.push({ check: `fresh ground truth: ${expected}`, pass: value != null && new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, 'i').test(normalized) });
			}
		}
		checks.push({ check: 'nonempty ground truth', pass: truth.length > 0 });
	}
	return { pass: checks.every(check => check.pass), checks };
}
