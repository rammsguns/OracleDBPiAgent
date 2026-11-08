import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const cases = JSON.parse(readFileSync(new URL('../../evals/cases-hard/phase30-check.json', import.meta.url), 'utf8')) as EvalCase[];
const grade = (suffix: string, answer: string) => score(cases.find(c => c.id.endsWith(suffix))!, {
	answer, toolCalls: [], usage: { input: 0, output: 0 },
}, [[suffix === 'archive-gap' ? 'NOARCHIVELOG' : 'UNCONFIGURED']]).pass;
it.each([
	'the check is vacuous, not a pass', "returns 'no gaps found' vacuously",
	"Gap semantics don't apply", "Gap semantics doesn't apply", 'Gap semantics does not apply',
	'the precondition for those views is unmet', 'there is no archive-log sequence stream to inspect',
	'the set of archived logs to examine is empty', 'the notion of sequence continuity simply does not exist',
	'a meaningful healthy result cannot be produced', 'the result is meaningless',
	'there is nothing to check', 'there is nothing to inspect', 'there is nothing to monitor',
	'no archived logs', 'no archive log stream', 'no sequence', 'empty set',
])('accepts archive applicability: %s', wording => {
	// Preserve the independent restore/health limitation expectation.
	expect(grade('archive-gap', `NOARCHIVELOG. ${wording}. This cannot prove restore feasibility.`)).toBe(true);
});
it.each([
	"Can 'absent' be reported as a healthy 0% usage measurement? **No.**",
	'Usage % undefined', 'No measurement exists at all', 'surface it as N/A / not configured',
	'conflating them produces a false pass', 'this is misleading',
	"a '0%' figure is not a computed value", 'not a real measurement',
])('accepts FRA applicability: %s', wording => {
	expect(grade('recovery-config', `UNCONFIGURED. ${wording}`)).toBe(true);
});
it.each([
	'NOARCHIVELOG. There are no gaps, healthy. This does not affect backups.',
	'NOARCHIVELOG. Nothing to check. We can establish a healthy no-gap result. This does not prove restore feasibility.',
	'NOARCHIVELOG. Mode reported from v$database.',
])('rejects a healthy gap claim or missing applicability: %s', answer => {
	expect(grade('archive-gap', answer)).toBe(false);
});
it.each([
	'UNCONFIGURED. Absent FRA is a healthy 0%.',
	'UNCONFIGURED. Not configured FRA is a healthy 0%.',
	'UNCONFIGURED. Usage undefined. Absent FRA is a healthy 0%.',
	'UNCONFIGURED. The destination parameter is NULL.',
])('rejects healthy absent FRA or missing measurement explanation: %s', answer => {
	expect(grade('recovery-config', answer)).toBe(false);
});
it('keeps the real NONE expiry error failing', () => {
	const test = cases.find(c => c.id.endsWith('expiry-range'))!;
	expect(score(test, { answer: 'NONE', toolCalls: [], usage: { input: 0, output: 0 } }, [['OVER 14 DAYS']]).pass).toBe(false);
});
