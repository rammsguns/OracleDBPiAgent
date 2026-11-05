import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

function matches(answer: string, truth: unknown[][], id = 'hard-p18-test') {
	const test: EvalCase = { id, target: 'd1-19c-lab', category: 'test', question: 'test',
		groundTruth: { sql: 'SELECT code, incident FROM example', mode: 'rowCells' },
		expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
	return score(test, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, truth).pass;
}
const incident = [['ORA-00800', '225332']];
const table = '| **2026-10-22 23:21:11** | **ORA-00800**: soft external error, arguments: ... | **225332** |';
const job = [['SHOPAPP.NIGHTLY_PURGE_JOB', 'SHOPAPP.SYS_C007669']];
const bullets = '- **Failed job (schema-qualified):** `SHOPAPP.NIGHTLY_PURGE_JOB`\n- **Violated constraint (schema-qualified):** `SHOPAPP.SYS_C007669` — a foreign-key constraint';

it('accepts the minimal archived table and labelled bullet fixtures only for p18', () => {
	expect(matches(table, incident)).toBe(true);
	expect(matches(bullets, job)).toBe(true);
	expect(matches(table, incident, 'historical')).toBe(false);
	expect(matches(bullets, job, 'historical')).toBe(false);
});
it.each(['ORA-00800: message', '`ORA-00800` message', '**TNS-12541**: no listener', '__ORA-00800__: message'])('accepts code prefixes: %s', cell => {
	const code = cell.includes('TNS') ? 'TNS-12541' : 'ORA-00800';
	expect(matches(`| ${cell} | 225332 |`, [[code, '225332']])).toBe(true);
});
it('rejects wrong codes, incidents, code suffixes and codes borrowed from another table row', () => {
	for (const answer of [table.replace('ORA-00800', 'ORA-00801'), table.replace('225332', '225333'),
		table.replace('ORA-00800', 'ORA-008001'), '| ORA-00801: message | 225332 |\n| ORA-00800: message | 225333 |']) {
		expect(matches(answer, incident)).toBe(false);
	}
});
it('rejects negated facts and accepts separate complete labelled records', () => {
	expect(matches(bullets.replace('`SHOPAPP.SYS_C007669`', 'not caused by SHOPAPP.SYS_C007669'), job)).toBe(false);
	expect(matches(bullets, [...job, ['SHOPAPP.OTHER_JOB', 'SHOPAPP.OTHER_KEY']])).toBe(false);
	expect(matches('- Code: ORA-00800\n- Incident: 225332\n- Code: ORA-00801\n- Incident: 225333',
		[...incident, ['ORA-00801', '225333']])).toBe(true);
});
