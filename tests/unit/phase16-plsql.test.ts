import { expect, it } from 'vitest';
import { loadHardCases } from '../../evals/validate-hard.js';
import { score } from '../../evals/scoring.js';

// Live read-only snapshots, 2026-11-04. Actual evals always fetch fresh truth.
const fixtures = [
	{
		"id": "hard-p16-entry-points",
		"columns": [
			"PROCEDURE_NAME"
		],
		"rows": [
			[
				"NIGHTLY_PURGE"
			],
			[
				"PLACE_ORDERS"
			],
			[
				"SHIP_ORDERS"
			]
		],
		"note": "",
		"prose": [
			"The package exposes the procedure NIGHTLY_PURGE.",
			"The package exposes the procedure PLACE_ORDERS.",
			"The package exposes the procedure SHIP_ORDERS."
		],
		"wrong": [
			[
				[
					"PURGE_ORDERS"
				],
				[
					"PLACE_ORDERS"
				],
				[
					"SHIP_ORDERS"
				]
			],
			[
				[
					"NIGHTLY_PURGE"
				],
				[
					"PLACE_ORDER"
				],
				[
					"SHIP_ORDERS"
				]
			]
		]
	},
	{
		"id": "hard-p16-writes",
		"columns": [
			"SUBPROGRAM",
			"TABLE_NAME",
			"OPERATION"
		],
		"rows": [
			[
				"PLACE_ORDERS",
				"ORDERS",
				"INSERT"
			],
			[
				"PLACE_ORDERS",
				"PRODUCTS",
				"UPDATE"
			],
			[
				"PLACE_ORDERS",
				"ORDER_LINES",
				"INSERT"
			],
			[
				"PLACE_ORDERS",
				"ORDERS",
				"UPDATE"
			],
			[
				"SHIP_ORDERS",
				"ORDERS",
				"UPDATE"
			],
			[
				"NIGHTLY_PURGE",
				"ORDER_LINES",
				"DELETE"
			],
			[
				"NIGHTLY_PURGE",
				"ORDERS",
				"DELETE"
			]
		],
		"note": "",
		"prose": [
			"PLACE_ORDERS performs INSERT on ORDERS.",
			"PLACE_ORDERS performs UPDATE on PRODUCTS.",
			"PLACE_ORDERS performs INSERT on ORDER_LINES.",
			"PLACE_ORDERS performs UPDATE on ORDERS.",
			"SHIP_ORDERS performs UPDATE on ORDERS.",
			"NIGHTLY_PURGE performs DELETE on ORDER_LINES.",
			"NIGHTLY_PURGE performs DELETE on ORDERS."
		],
		"wrong": [
			[
				[
					"PLACE_ORDERS",
					"ORDERS",
					"INSERT"
				],
				[
					"PLACE_ORDERS",
					"PRODUCTS",
					"SELECT"
				],
				[
					"PLACE_ORDERS",
					"ORDER_LINES",
					"INSERT"
				],
				[
					"PLACE_ORDERS",
					"ORDERS",
					"UPDATE"
				],
				[
					"SHIP_ORDERS",
					"ORDERS",
					"UPDATE"
				],
				[
					"NIGHTLY_PURGE",
					"ORDER_LINES",
					"DELETE"
				],
				[
					"NIGHTLY_PURGE",
					"ORDERS",
					"DELETE"
				]
			],
			[
				[
					"PLACE_ORDERS",
					"ORDERS",
					"INSERT"
				],
				[
					"PLACE_ORDERS",
					"PRODUCTS",
					"UPDATE"
				],
				[
					"PLACE_ORDERS",
					"ORDER_LINES",
					"INSERT"
				],
				[
					"PLACE_ORDERS",
					"ORDERS",
					"UPDATE"
				],
				[
					"SHIP_ORDERS",
					"ORDERS",
					"UPDATE"
				],
				[
					"NIGHTLY_PURGE",
					"PRODUCTS",
					"DELETE"
				],
				[
					"NIGHTLY_PURGE",
					"ORDERS",
					"DELETE"
				]
			]
		]
	},
	{
		"id": "hard-p16-purge-behavior",
		"columns": [
			"TABLE_NAME"
		],
		"rows": [
			[
				"ORDER_LINES"
			],
			[
				"ORDERS"
			]
		],
		"note": "It deletes child rows first, then parent rows older than 7 days using ORDERED_AT, and commits at line 28. There is no status filter.",
		"prose": [
			"It deletes from ORDER_LINES.",
			"It deletes from ORDERS."
		],
		"wrong": [
			[
				[
					"PRODUCTS"
				],
				[
					"ORDERS"
				]
			],
			[
				[
					"ORDER_LINES"
				],
				[
					"CUSTOMERS"
				]
			]
		]
	},
	{
		"id": "hard-p16-scheduler-map",
		"columns": [
			"JOB_NAME",
			"ENTRY_POINT"
		],
		"rows": [
			[
				"NIGHTLY_PURGE_JOB",
				"NIGHTLY_PURGE"
			],
			[
				"PLACE_ORDERS_JOB",
				"PLACE_ORDERS"
			],
			[
				"SHIP_ORDERS_JOB",
				"SHIP_ORDERS"
			]
		],
		"note": "PLACE_ORDERS_JOB passes 25 as the order count.",
		"prose": [
			"NIGHTLY_PURGE_JOB invokes NIGHTLY_PURGE.",
			"PLACE_ORDERS_JOB invokes PLACE_ORDERS.",
			"SHIP_ORDERS_JOB invokes SHIP_ORDERS."
		],
		"wrong": [
			[
				[
					"NIGHTLY_PURGE_JOB",
					"SHIP_ORDERS"
				],
				[
					"PLACE_ORDERS_JOB",
					"PLACE_ORDERS"
				],
				[
					"SHIP_ORDERS_JOB",
					"SHIP_ORDERS"
				]
			],
			[
				[
					"NIGHTLY_PURGE_JOB",
					"NIGHTLY_PURGE"
				],
				[
					"PLACE_ORDERS_JOB",
					"NIGHTLY_PURGE"
				],
				[
					"SHIP_ORDERS_JOB",
					"SHIP_ORDERS"
				]
			]
		]
	},
	{
		"id": "hard-p16-purge-constraint",
		"columns": [
			"ROLE",
			"TABLE_NAME",
			"COLUMN_NAME"
		],
		"rows": [
			[
				"CHILD",
				"ORDER_LINES",
				"ORDER_ID"
			],
			[
				"PARENT",
				"ORDERS",
				"ORDER_ID"
			]
		],
		"note": "ORA-02292 means child records remain and block parent deletion. Constraint SYS_C007669 has delete rule NO ACTION.",
		"prose": [
			"The CHILD table is ORDER_LINES with column ORDER_ID.",
			"The PARENT table is ORDERS with column ORDER_ID."
		],
		"wrong": [
			[
				[
					"CHILD",
					"ORDERS",
					"ORDER_ID"
				],
				[
					"PARENT",
					"ORDER_LINES",
					"ORDER_ID"
				]
			],
			[
				[
					"CHILD",
					"ORDER_LINES",
					"PRODUCT_ID"
				],
				[
					"PARENT",
					"ORDERS",
					"ORDER_ID"
				]
			]
		]
	},
	{
		"id": "hard-p16-purge-line",
		"columns": [
			"FACT"
		],
		"rows": [
			[
				"27"
			],
			[
				"NIGHTLY_PURGE"
			],
			[
				"DELETE"
			],
			[
				"ORDERS"
			]
		],
		"note": "The outer block is line 1; the package frame identifies the failing parent delete.",
		"prose": [
			"The observed fact is 27.",
			"The observed fact is NIGHTLY_PURGE.",
			"The observed fact is DELETE.",
			"The observed fact is ORDERS."
		],
		"wrong": [
			[
				[
					"26"
				],
				[
					"NIGHTLY_PURGE"
				],
				[
					"DELETE"
				],
				[
					"ORDERS"
				]
			],
			[
				[
					"1"
				],
				[
					"NIGHTLY_PURGE"
				],
				[
					"DELETE"
				],
				[
					"ORDERS"
				]
			]
		]
	},
	{
		"id": "hard-p16-history-trigger",
		"columns": [
			"FACT"
		],
		"rows": [
			[
				"AFTER"
			],
			[
				"ROW"
			],
			[
				"EMPLOYEES"
			],
			[
				"UPDATE"
			]
		],
		"note": "On UPDATE OF JOB_ID or DEPARTMENT_ID it calls ADD_JOB_HISTORY to insert JOB_HISTORY using the old employee ID, hire date, job and department, with SYSDATE as end date.",
		"prose": [
			"The observed fact is AFTER.",
			"The observed fact is ROW.",
			"The observed fact is EMPLOYEES.",
			"The observed fact is UPDATE."
		],
		"wrong": [
			[
				[
					"BEFORE"
				],
				[
					"ROW"
				],
				[
					"EMPLOYEES"
				],
				[
					"UPDATE"
				]
			],
			[
				[
					"AFTER"
				],
				[
					"ROW"
				],
				[
					"JOB_HISTORY"
				],
				[
					"UPDATE"
				]
			]
		]
	},
	{
		"id": "hard-p16-security-trigger",
		"columns": [
			"FACT"
		],
		"rows": [
			[
				"BEFORE"
			],
			[
				"STATEMENT"
			],
			[
				"EMPLOYEES"
			],
			[
				"INSERT"
			],
			[
				"UPDATE"
			],
			[
				"DELETE"
			]
		],
		"note": "It calls SECURE_DML, which raises application error -20205 outside 08:00 through 18:00 or on SAT and SUN. This describes the code; day names depend on session language.",
		"prose": [
			"The observed fact is BEFORE.",
			"The observed fact is STATEMENT.",
			"The observed fact is EMPLOYEES.",
			"The observed fact is INSERT.",
			"The observed fact is UPDATE.",
			"The observed fact is DELETE."
		],
		"wrong": [
			[
				[
					"AFTER"
				],
				[
					"STATEMENT"
				],
				[
					"EMPLOYEES"
				],
				[
					"INSERT"
				],
				[
					"UPDATE"
				],
				[
					"DELETE"
				]
			],
			[
				[
					"BEFORE"
				],
				[
					"ROW"
				],
				[
					"EMPLOYEES"
				],
				[
					"INSERT"
				],
				[
					"UPDATE"
				],
				[
					"DELETE"
				]
			]
		]
	},
	{
		"id": "hard-p16-history-arguments",
		"columns": [
			"ARGUMENT_NAME",
			"POSITION",
			"IN_OUT",
			"DATA_TYPE"
		],
		"rows": [
			[
				"P_EMP_ID",
				1,
				"IN",
				"NUMBER"
			],
			[
				"P_START_DATE",
				2,
				"IN",
				"DATE"
			],
			[
				"P_END_DATE",
				3,
				"IN",
				"DATE"
			],
			[
				"P_JOB_ID",
				4,
				"IN",
				"VARCHAR2"
			],
			[
				"P_DEPARTMENT_ID",
				5,
				"IN",
				"NUMBER"
			]
		],
		"note": "DEFAULTED N means no argument has a default.",
		"prose": [
			"P_EMP_ID is argument 1, mode IN, datatype NUMBER.",
			"P_START_DATE is argument 2, mode IN, datatype DATE.",
			"P_END_DATE is argument 3, mode IN, datatype DATE.",
			"P_JOB_ID is argument 4, mode IN, datatype VARCHAR2.",
			"P_DEPARTMENT_ID is argument 5, mode IN, datatype NUMBER."
		],
		"wrong": [
			[
				[
					"P_EMP_ID",
					1,
					"IN",
					"NUMBER"
				],
				[
					"P_START_DATE",
					2,
					"IN",
					"NUMBER"
				],
				[
					"P_END_DATE",
					3,
					"IN",
					"DATE"
				],
				[
					"P_JOB_ID",
					4,
					"IN",
					"VARCHAR2"
				],
				[
					"P_DEPARTMENT_ID",
					5,
					"IN",
					"NUMBER"
				]
			],
			[
				[
					"P_EMP_ID",
					1,
					"IN",
					"NUMBER"
				],
				[
					"P_START_DATE",
					2,
					"IN",
					"DATE"
				],
				[
					"P_END_DATE",
					3,
					"IN",
					"DATE"
				],
				[
					"P_JOB_ID",
					4,
					"IN",
					"VARCHAR2"
				],
				[
					"P_DEPARTMENT_ID",
					5,
					"OUT",
					"NUMBER"
				]
			]
		]
	},
	{
		"id": "hard-p16-failed-lab-job",
		"columns": [
			"STATUS",
			"ERROR_CODE",
			"MESSAGE",
			"SOURCE_LINE"
		],
		"rows": [
			[
				"FAILED",
				"ORA-20001",
				"destination unavailable",
				1
			]
		],
		"note": "This is an application-raised error recorded at line 1, rather than a foreign-key violation.",
		"prose": [
			"The run status is FAILED, with ORA-20001 reporting destination unavailable at line 1."
		],
		"wrong": [
			[
				[
					"FAILED",
					"ORA-02292",
					"destination unavailable",
					1
				]
			],
			[
				[
					"FAILED",
					"ORA-20001",
					"destination unavailable",
					27
				]
			]
		]
	}
];

it('adds ten blind PL/SQL cases on approved targets with no tool requirements', async () => {
	const cases = (await loadHardCases()).filter(test => test.id.startsWith('hard-p16-'));
	expect(cases).toHaveLength(10);
	expect(new Set(cases.map(test => test.target)).size).toBe(2);
	for (const test of cases) {
		expect(test.split).toBe('challenge');
		expect(test.groundTruth?.mode).toBe('rowCells');
		expect(test.expect.requiredTools).toEqual([]);
		expect(test.question).not.toMatch(/run_query|get_source|describe_object|triage|plsql doc/);
	}
});

for (const fixture of fixtures) {
	it(`${fixture.id}: accepts table, vertical label/value and prose; rejects two realistic errors in every layout`, async () => {
		const test = (await loadHardCases()).find(test => test.id === fixture.id)!;
		const table = (rows: (string | number)[][]) => [
			'| ' + fixture.columns.join(' | ') + ' |',
			'| ' + fixture.columns.map(() => '---').join(' | ') + ' |',
			...rows.map(row => '| ' + row.join(' | ') + ' |'),
		].join('\n');
		const vertical = (rows: (string | number)[][]) => rows.map(row => [
			'| Attribute | Value |', '| --- | --- |',
			...row.map((value, i) => `| ${fixture.columns[i]} | ${value} |`),
		].join('\n')).join('\n\n');
		const prose = (rows: (string | number)[][]) => rows.map((row, i) => {
			let sentence = fixture.prose[i]!;
			// Replace only the changed token in the natural sentence for wrong answers.
			row.forEach((value, col) => {
				if (value !== fixture.rows[i]![col]) sentence = sentence.replace(String(fixture.rows[i]![col]), String(value));
			});
			return sentence;
		}).join('\n');
		for (const render of [table, vertical, prose]) {
			const response = (rows: (string | number)[][]) => ({ answer: render(rows) + '\n' + fixture.note, toolCalls: [], usage: { input: 0, output: 0 } });
			expect(score(test, response(fixture.rows), fixture.rows).pass, response(fixture.rows).answer).toBe(true);
			for (const wrong of fixture.wrong) expect(score(test, response(wrong), fixture.rows).pass, response(wrong).answer).toBe(false);
		}
	});
}

it('requires source-based explanations in addition to matching metadata', async () => {
	const cases = await loadHardCases();
	const errors: Record<string, [string, string]> = {
		'hard-p16-purge-behavior': ['older than 7 days', 'older than 30 days'],
		'hard-p16-scheduler-map': ['passes 25', 'passes 100'],
		'hard-p16-purge-constraint': ['ORA-02292', 'ORA-02291'],
		'hard-p16-history-trigger': ['old employee', 'new employee'],
		'hard-p16-security-trigger': ['-20205', '-20001'],
		'hard-p16-failed-lab-job': ['application-raised error', 'foreign-key error'],
	};
	for (const [id, [correct, incorrect]] of Object.entries(errors)) {
		const fixture = fixtures.find(f => f.id === id)!;
		const test = cases.find(c => c.id === id)!;
		const answer = fixture.prose.join('\n') + '\n' + fixture.note;
		expect(answer).toContain(correct);
		expect(score(test, { answer: answer.replace(correct, incorrect), toolCalls: [], usage: { input: 0, output: 0 } }, fixture.rows).pass, id).toBe(false);
	}
});
