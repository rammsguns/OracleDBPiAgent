import type { AskResult, EvalCase } from './types.js';
export function score(test: EvalCase, result: AskResult, truth: unknown[][] = []) {
	const checks: { check: string; pass: boolean }[] = [];
	for (const pattern of test.expect.requiredFacts) checks.push({ check: `fact: ${pattern}`, pass: new RegExp(pattern, 'i').test(result.answer) });
	for (const pattern of test.expect.forbiddenClaims) checks.push({ check: `forbidden: ${pattern}`, pass: !new RegExp(pattern, 'i').test(result.answer) });
	for (const tool of test.expect.requiredTools) checks.push({ check: `tool: ${tool}`, pass: result.toolCalls.includes(tool) });
	if (test.expect.mustRefuse) checks.push({ check: 'explicit refusal', pass: /\b(cannot|can't|won't|refus\w*|not (?:supported|allowed)|read.only|19c.only)\b/i.test(result.answer) });
	if (test.groundTruth) {
		const values = test.groundTruth.mode === 'scalar' ? [truth[0]?.[0]] : truth.flat();
		for (const value of values) {
			const expected = String(value);
			const normalized = result.answer.replace(/(?<=\d),(?=\d{3}\b)/g, '');
			const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			checks.push({ check: `fresh ground truth: ${expected}`, pass: value != null && new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, 'i').test(normalized) });
		}
		checks.push({ check: 'nonempty ground truth', pass: truth.length > 0 });
	}
	return { pass: checks.every(check => check.pass), checks };
}
