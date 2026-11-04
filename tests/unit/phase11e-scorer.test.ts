import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const test: EvalCase = { id: 'synthetic', target: 'p1-19c-prod', category: 'test', question: 'test', groundTruth: { sql: 'SELECT child_column, parent_table, parent_constraint, index_name, uniqueness, column_position, column_name, data_type FROM example', mode: 'rowCells' }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
const truth = [['CUSTOMER_ID', 'CUSTOMERS', 'SYS_C007649', 'SYS_C007649', 'UNIQUE', 1, 'CUSTOMER_ID', 'NUMBER']];
function matches(answer: string, rows: unknown[][] = truth) {
	return score(test, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, rows).pass;
}
// Verbatim table blocks from gate-11b B ch1/ch3 (order) and ch2/ch3 (memory).
const orderTables = [
	"| # | Item | Value | Source view |\n|---|------|-------|-------------|\n| 1 | **Child column** | `CUSTOMER_ID` (position 1) | `ALL_CONS_COLUMNS` for FK `SYS_C007662` |\n| 2 | **Parent table** | `SHOPAPP.CUSTOMERS` | `ALL_CONSTRAINTS.TABLE_NAME` of `SYS_C007649` |\n| 3 | **Referenced constraint** | `SYS_C007649` (type **P**, ENABLED) | `ALL_CONSTRAINTS.R_OWNER / R_CONSTRAINT_NAME` |\n| 4 | **Backing index** | `SYS_C007649` (owner SHOPAPP) | `ALL_CONSTRAINTS.INDEX_OWNER / INDEX_NAME` → joined to `ALL_INDEXES` |\n| 5 | **Index uniqueness** | **UNIQUE** | `ALL_INDEXES.UNIQUENESS` |\n| 6 | **Indexed position** | 1 | `ALL_IND_COLUMNS.COLUMN_POSITION` |\n| 7 | **Parent column** | `CUSTOMER_ID` | `ALL_IND_COLUMNS.COLUMN_NAME` / `ALL_CONS_COLUMNS` |\n| 8 | **Data type** | `NUMBER` (length 22, no precision/scale → floating-point NUMBER) | `ALL_TAB_COLUMNS` |",
	"| Step | Detail | Value |\n|------|--------|-------|\n| **Child table** | SHOPAPP.ORDERS | — |\n| **FK constraint** | `SYS_C007662` (type R) | — |\n| **Child column** | position 1 | `CUSTOMER_ID` |\n| **Parent table** | SHOPAPP.**CUSTOMERS** | — |\n| **Referenced constraint** | `SYS_C007649` (type **P** = Primary Key) | — |\n| **Backing index** | `SYS_C007649` (auto-created by Oracle for the PK; same name as the constraint, not a user-chosen name) | — |\n| **Index uniqueness** | **UNIQUE** | — |\n| **Indexed position** | 1 | — |\n| **Parent column** | `CUSTOMER_ID` | — |\n| **Data type** | `NUMBER` (length 22, no explicit precision/scale) | NOT NULL |"
];
const memoryTables = [
	"| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Full version** | `19.9.1.0.0` (major = 19) | `db_overview` tool |\n| **SGA_TARGET (configured)** | **Not available** | See below |",
	"| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Full version** | `19.9.1.0.0` (major = 19) | `db_overview` tool |\n| **Configured `SGA_TARGET`** | **Not available** | — |"
];
it('accepts the archived vertical tables with presentation columns', () => {
	for (const table of orderTables) expect(matches(table)).toBe(true);
});
it('rejects wrong index/type even when sources contain the correct value', () => {
	for (const table of orderTables) {
		expect(matches(table.replace(/(Backing index[^\n]*?)SYS_C007649/, '$1WRONG_INDEX'))).toBe(false);
		expect(matches(table.replace(/(Data type[^\n]*?)NUMBER/, '$1VARCHAR2'))).toBe(false);
	}
});
it('never pools unrelated vertical tables or numbered/source columns', () => {
	const table = orderTables[0]!;
	const lines = table.split('\n');
	expect(matches(lines.slice(0, 6).join('\n') + '\n\nUnrelated record\n' + [...lines.slice(0, 2), ...lines.slice(6)].join('\n'))).toBe(false);
	expect(matches(table.replace('| 1 | **Child column** | `CUSTOMER_ID`', '| 1 | **Child column** | `OTHER_ID`'))).toBe(false);
	expect(matches(table.replace('| 6 | **Indexed position** | 1 |', '| 6 | **Indexed position** | 2 |'))).toBe(false);
	expect(matches(table, [...truth, ...truth])).toBe(false);
});
it('binds explicit truth labels in wider vertical tables', () => {
	const table = '| # | Item | Value | Source |\n|---|---|---|---|\n|1|column_position|1|dictionary|\n|2|data_type|NUMBER|dictionary|';
	// Match labels to their actual SELECT positions using a dedicated truth shape.
	const labeled = { ...test, groundTruth: { sql: 'SELECT column_position, data_type FROM example', mode: 'rowCells' as const } };
	expect(score(labeled, { answer: table, toolCalls: [], usage: { input: 0, output: 0 } }, [[1, 'NUMBER']]).pass).toBe(true);
	const answer = table.replace('|column_position|1|', '|column_position|NUMBER|').replace('|data_type|NUMBER|', '|data_type|1|');
	expect(score(labeled, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, [[1, 'NUMBER']]).pass).toBe(false);
});
it('preserves explicit inline assignments for singleton rows in multi-row truth', () => {
	for (const table of memoryTables) {
		expect(matches(table, [['PRODCDB'], ['19']])).toBe(true);
		expect(matches(table.replace('major = 19', 'major = 23'), [['PRODCDB'], ['19']])).toBe(false);
	}
	for (const version of ['19c', '19.9.1.0.0', '19.9.1.0.0 (Oracle 19c)', '19.9.1.0.0 (major = 190)']) {
		expect(matches(`| Full version | ${version} | source |`, [['19']])).toBe(false);
		expect(matches(version, [['19']])).toBe(false);
	}
	expect(matches('(first=4) and (second=1)', [[4, 1], [8, 2]])).toBe(false);
});
