import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';
import type { EvalCase, AskResult } from '../../evals/types.js';

type Record = AskResult & { label: string; side: 'A' | 'B'; id: string; beforePass: boolean; afterPass: boolean; classification: string };
const fixture: { records: Record[]; truth: { [id: string]: (string | number)[][] } } = JSON.parse(readFileSync(new URL('./phase16f-gate.json', import.meta.url), 'utf8'));
const response = (answer: string): AskResult => ({ answer, toolCalls: [], usage: { input: 0, output: 0 } });

it('replays all eighty p16 gate answers, fixing nine artifacts and preserving all thirty-one real failures', async () => {
	const cases = await loadHardCases();
	const totals = { A: 0, B: 0 };
	expect(fixture.records).toHaveLength(80);
	expect(fixture.records.filter(r => r.classification === 'artifact')).toHaveLength(9);
	expect(fixture.records.filter(r => r.classification === 'agent-error')).toHaveLength(31);
	for (const record of fixture.records) {
		const test = cases.find(c => c.id === record.id)!;
		const actual = score(test, record, fixture.truth[test.id]).pass;
		expect(actual, `${record.label} ${record.side} ${record.id}`).toBe(record.afterPass);
		totals[record.side] += Number(actual);
	}
	expect(totals).toEqual({ A: 17, B: 32 });
});

it('keeps child and parent associations in the real horizontal and vertical relationship tables', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-purge-constraint')!;
	const note = '\nORA-02292: child record found blocks deletion. Constraint SYS_C007669. Delete rule: NO ACTION.';
	for (const label of ['p16-1', 'p16-2']) {
		const record = fixture.records.find(r => r.id === test.id && r.side === 'B' && r.label === label)!;
		const table = record.answer.split('\n\n').find(block => block.includes('| Role |'))!;
		expect(table).toBeTruthy();
		expect(score(test, response(table + note), fixture.truth[test.id]).pass).toBe(true);
		const swapped = table.replace(/Child/g, 'TEMP_ROLE').replace(/Parent/g, 'Child').replace(/TEMP_ROLE/g, 'Parent');
		expect(score(test, response(swapped + note), fixture.truth[test.id]).pass).toBe(false);
		expect(score(test, response(table.replace('ORDER_ID', 'PRODUCT_ID') + note), fixture.truth[test.id]).pass).toBe(false);
		for (const wrong of ['CASCADE', 'NULL']) {
			const incorrect = table + note.replace('Delete rule: NO ACTION', `Delete rule: ${wrong}. NO ACTION is an alternative`);
			expect(score(test, response(incorrect), fixture.truth[test.id]).pass).toBe(false);
		}
	}
});

it('groups only same-role attributes within one vertical table', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-purge-constraint')!;
	const render = (child: string, parent: string) => `| Attribute | Value |\n| --- | --- |\n| Child table | ${child} |\n| Child column | ORDER_ID |\n| Parent table | ${parent} |\n| Parent column | ORDER_ID |\n\nORA-02292 child records remain. SYS_C007669. Delete rule: NO ACTION.`;
	expect(score(test, response(render('ORDER_LINES', 'ORDERS')), fixture.truth[test.id]).pass).toBe(true);
	expect(score(test, response(render('ORDERS', 'ORDER_LINES')), fixture.truth[test.id]).pass).toBe(false);
	const partial = '| Attribute | Value |\n| --- | --- |\n| Child table | ORDER_LINES |\n\n| Attribute | Value |\n| --- | --- |\n| Child column | ORDER_ID |\n';
	expect(score(test, response(partial), [['CHILD', 'ORDER_LINES', 'ORDER_ID']]).pass).toBe(false);
});

it('normalizes every requested Unicode hyphen for facts and row cells without accepting wrong codes or lines', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-failed-lab-job')!;
	const withCodeFact = { ...test, expect: { ...test.expect, requiredFacts: [...test.expect.requiredFacts, 'ORA-20001'] } };
	const base = '| Field | Recorded value |\n| --- | --- |\n| Status | FAILED |\n| Error code | ORA-20001 |\n| Message | "destination unavailable" |\n| Source line | ORA-06512: at line 1 |\nAn application-raised error.';
	for (const code of [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]) {
		const hyphen = String.fromCodePoint(code);
		const answer = base.replaceAll('-', hyphen);
		expect(score(withCodeFact, response(answer), fixture.truth[test.id]).pass, `U+${code.toString(16)}`).toBe(true);
		expect(score(test, response(answer.replace('20001', '02292')), fixture.truth[test.id]).pass).toBe(false);
		expect(score(test, response(answer.replace('line 1', 'line 27')), fixture.truth[test.id]).pass).toBe(false);
	}
});

it('binds DML rows to only the current procedure heading and preserves operation identity', () => {
	const test: EvalCase = { id: 'routine-map', target: 'p1-19c-prod', category: 'test', question: 'test', groundTruth: { sql: 'SELECT subprogram,table_name,operation FROM example', mode: 'rowCells' }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
	const header = '| Table | Operation | Kind | Line |\n| --- | --- | --- | --- |\n';
	const answer = '## PROCEDURE place_orders\n' + header + '| ORDERS | INSERT INTO orders VALUES (1) | Write - INSERT | 6 |\n## ship_orders\n' + header + "| ORDERS | UPDATE orders SET status='SHIPPED' | Write (update) | 21 |";
	const truth = [['PLACE_ORDERS', 'ORDERS', 'INSERT'], ['SHIP_ORDERS', 'ORDERS', 'UPDATE']];
	expect(score(test, response(answer), truth).pass).toBe(true);
	expect(score(test, response(answer.replace('## ship_orders', '## Summary')), truth).pass).toBe(false);
	expect(score(test, response(answer.replace('## ship_orders', '## place_orders')), truth).pass).toBe(false);
	expect(score(test, response(answer.replace('INSERT INTO orders VALUES (1)', 'SELECT * FROM orders')), truth).pass).toBe(false);
	expect(score(test, response(answer.replace('UPDATE orders SET', 'DELETE FROM orders WHERE')), truth).pass).toBe(false);
});

it('does not split a routine mapping at parenthetical schedule assignments or mix real repeated records', async () => {
	const test = (await loadHardCases()).find(c => c.id === 'hard-p16-scheduler-map')!;
	const record = fixture.records.find(r => r.id === test.id && r.side === 'A' && r.label === 'p16-2')!;
	expect(score(test, record, fixture.truth[test.id]).pass).toBe(true);
	expect(score(test, response(record.answer.replace('shopapp.workload.ship_orders`', 'shopapp.workload.nightly_purge`')), fixture.truth[test.id]).pass).toBe(false);
	const simple = { ...test, groundTruth: { sql: 'SELECT subprogram,table_name FROM example', mode: 'rowCells' as const } };
	expect(score(simple, response('subprogram=A / table_name=X; subprogram=B / table_name=Y'), [['A', 'Y']]).pass).toBe(false);
});

it('requires the defaults conclusion and the correct purge order after removing unasked line numbers', async () => {
	const cases = await loadHardCases();
	const args = cases.find(c => c.id === 'hard-p16-history-arguments')!;
	const correct = fixture.records.find(r => r.id === args.id && r.side === 'B' && r.label === 'p16-3')!;
	expect(score(args, correct, fixture.truth[args.id]).pass).toBe(true);
	const noDefaults = correct.answer.split('**Defaults:**')[0]!;
	expect(score(args, response(noDefaults), fixture.truth[args.id]).pass).toBe(false);
	expect(score(args, response(noDefaults + '\nDefaults: Yes.'), fixture.truth[args.id]).pass).toBe(false);
	const purge = cases.find(c => c.id === 'hard-p16-purge-behavior')!;
	const description = 'ORDERED_AT older than 7 days, no status filter, COMMIT after both deletes. ';
	expect(score(purge, response(description + 'It deletes ORDER_LINES first, then ORDERS.'), fixture.truth[purge.id]).pass).toBe(true);
	expect(score(purge, response(description + 'It deletes ORDERS first, then ORDER_LINES.'), fixture.truth[purge.id]).pass).toBe(false);
});
