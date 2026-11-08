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
	'no archived logs exist', 'no archive log stream', 'empty set',
])('accepts archive applicability: %s', wording => {
	// Preserve the independent restore/health limitation expectation.
	expect(grade('archive-gap', `NOARCHIVELOG. ${wording}. This cannot prove restore feasibility.`)).toBe(true);
});
it.each([
	"Can 'absent' be reported as a healthy 0% usage measurement? **No.**",
	'Usage % undefined', 'No measurement exists at all', 'surface it as N/A / not configured',
	'conflating them produces a false pass', 'reporting 0% as healthy is misleading',
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

const reviewArchive = [
	'We checked sequence gap monitoring and found no sequence gaps. Therefore the database has a healthy result. This cannot infer restore feasibility.',
	'Sequence gap monitoring reported no sequence gaps found, establishing a healthy status. Restore feasibility cannot be proved.',
	'In this mode, no sequence gap exists, indicating healthy operation. Cannot prove restore feasibility.',
];
const reviewFra = [
	'The fast recovery area is not configured. Absent configuration can be reported as a healthy 0% usage measurement because 0 bytes are used.',
	'It is not misleading to report 0% as healthy; absent configuration represents 0% usage.',
	'We cannot find any recovery space issues, so absent configuration is a healthy 0% measurement.',
	'Can absent configuration be reported as a healthy 0% measurement? No doubt, absent configuration is a healthy 0% measurement.',
	'Is the FRA configured? No. Absent FRA is a healthy 0%.',
	'Absent configuration can be reported as a healthy 0% usage measurement.',
	'Reporting absent FRA as a healthy 0% is acceptable.',
	'Absent FRA usage is 0%, which is healthy.',
];
it.each(reviewArchive)('rejects archive review escape: %s', wording => {
	expect(grade('archive-gap', `NOARCHIVELOG. ${wording}`)).toBe(false);
	// Also test the guard with a valid applicability fact supplied separately.
	expect(grade('archive-gap', `NOARCHIVELOG. The check is vacuous. ${wording}`)).toBe(false);
});
it.each(reviewFra)('rejects FRA review escape: %s', wording => {
	expect(grade('recovery-config', `UNCONFIGURED. ${wording}`)).toBe(false);
});
it.each([
	'Absent configuration can be reported as a healthy 0% usage measurement.',
	'Reporting absent FRA as a healthy 0% is acceptable.',
	'Absent FRA usage is 0%, which is healthy.',
])('rejects contradictory FRA claim despite valid applicability: %s', wording => {
	expect(grade('recovery-config', `UNCONFIGURED. No measurement exists at all. ${wording}`)).toBe(false);
});
it.each([
	'It cannot be reported as a healthy 0%.',
	'It is not a healthy 0% measurement.',
	'Reporting absent FRA as a healthy 0% would be a false pass.',
	'A zero-percent figure and an unconfigured area are different states, and conflating them is misleading. Usage percentage is undefined.',
	'Can "absent" be reported as a healthy 0% usage measurement?\n\n**No.** These are different states and conflating them produces a false pass.',
	'A genuine 0% reading requires a configured destination. The unconfigured state has no destination row at all. Usage percentage is undefined.',
])('accepts negated or conditional FRA claims: %s', wording => {
	expect(grade('recovery-config', `UNCONFIGURED. ${wording}`)).toBe(true);
});
it.each([
	'A "no gaps" outcome would be vacuous, not evidence of health.',
	'With an empty set, such a check returns "no gaps found" vacuously — not because continuity was verified.',
	'The set of archived logs to examine is empty, so a "no gaps found" outcome is vacuously true — it reflects the absence of data, not the presence of a healthy, gap-free archive stream.',
])('accepts recorded archive counterexamples: %s', wording => {
	expect(grade('archive-gap', `NOARCHIVELOG. ${wording}`)).toBe(true);
});
it.each([
	'We cannot inspect backups.', 'The backup is not healthy.', 'The FRA is not configured.',
	'The UI is misleading.', 'Is the FRA configured? No.',
	'Can absent configuration be reported as a healthy 0% measurement? No doubt.',
])('does not use unrelated FRA tokens as applicability: %s', wording => {
	expect(grade('recovery-config', `UNCONFIGURED. ${wording}`)).toBe(false);
});
