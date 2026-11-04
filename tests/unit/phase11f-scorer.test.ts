import { expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';

function matches(answer: string, rows: unknown[][], sql = 'SELECT owner, table_name FROM example') {
	const test: EvalCase = { id: 'synthetic', target: 'p1-19c-prod', category: 'test', question: 'test', groundTruth: { sql, mode: 'rowCells' }, expect: { requiredFacts: [], forbiddenClaims: [], requiredTools: [], mustRefuse: false } };
	return score(test, { answer, toolCalls: [], usage: { input: 0, output: 0 } }, rows).pass;
}

// Complete archived answers: every failing rowCells record from gate-14b,
// plus B ch4's order trace, which already passes the master scorer.
const archived = [
	{
		"label": "ch1 A hard-p11b-partial-memory",
		"answer": "## Results for `p1-19c-prod`\n\n| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Major database version** | `19.9.1.0.0` | `db_overview` tool |\n| **Configured SGA_TARGET (bytes)** | **Not available** | — |\n\n### Why SGA_TARGET cannot be reported\n\nThe account lacks privileges on `V$PARAMETER` and `V$SYSTEM_PARAMETER` (both return `ORA-00942: table or view does not exist`). No other accessible view exposes the configured `sga_target` initialization parameter.\n\nThe `db_overview` tool reports **currently allocated SGA = 3,221,222,464 bytes**, but per your instruction this is *not* treated as the configured target—it reflects runtime allocation, which may differ from the `SGA_TARGET` setting (especially under AMM/ASMM where the actual target could be higher or lower).\n\n**Conclusion:** The configured `SGA_TARGET` value in bytes cannot be verified with the current account's privileges.",
		"rows": [
			[
				"PRODCDB"
			],
			[
				"19"
			]
		],
		"sql": "SELECT instance_name FROM v$instance UNION ALL SELECT REGEXP_SUBSTR(version,'^[0-9]+') FROM v$instance",
		"pass_": false
	},
	{
		"label": "ch1 B hard-p11-plan-line-tree",
		"answer": "**Target:** p1-19c-prod  \n**SQL_ID:** `6scf5afs3262d`, **child_number:** 0  \n**Source:** `explain_plan` tool (cached plan from V$SQL_PLAN — optimizer estimates, not measured runtime statistics)\n\n| LINE | PARENT | DEPTH | OP | OPTIONS |\n|------|--------|-------|----|---------|\n| 0 | ROOT | 0 | SELECT STATEMENT | NONE |\n| 1 | 0 | 1 | INDEX UNIQUE SCAN | NONE |\n\n**Notes on plan structure vs. measured runtime:**\n\n- The columns shown (Rows, Bytes, Cost) are **optimizer estimates** from the cached plan in `V$SQL_PLAN`, not actual execution statistics.\n- No separate `OPTIONS` value is populated for either line (e.g., no `DESCENDING`, `SAMPLE`, etc.).\n- The predicate `access(\"ORDER_ID\"=(-110011))` confirms the unique-scan access path on index `SYS_C007661` (the primary-key constraint index on `SHOPAPP.ORDERS`).",
		"rows": [
			[
				0,
				"ROOT",
				0,
				"SELECT STATEMENT",
				"NONE"
			],
			[
				1,
				"0",
				1,
				"INDEX",
				"UNIQUE SCAN"
			]
		],
		"sql": "SELECT p.id,NVL(TO_CHAR(p.parent_id),'ROOT'),p.depth,p.operation,NVL(p.options,'NONE') FROM v$sql_plan p WHERE (p.sql_id,p.child_number) IN (SELECT sql_id,child_number FROM v$sql WHERE UPPER(sql_text) LIKE 'SELECT /* P11_ORDER_PROBE */ ORDER_ID FROM SHOPAPP.ORDERS WHERE ORDER_ID = -110011%' ORDER BY sql_id,child_number FETCH FIRST 1 ROW ONLY) ORDER BY p.id",
		"pass_": false
	},
	{
		"label": "ch1 B hard-p11-warehouse-location-key",
		"answer": "Here is the full resolution chain from `OE.WAREHOUSES` to its location parent, confirmed via tool results on **d1-19c-lab**:\n\n| Attribute | Value |\n|-----------|-------|\n| **Child column** | `LOCATION_ID` (position 1 in FK) |\n| **Parent owner** | `HR` |\n| **Referenced constraint** | `LOC_ID_PK` (Primary Key) |\n| **Backing index** | `HR.LOC_ID_PK` |\n| **Index uniqueness** | UNIQUE |\n| **Index status** | VALID |\n| **Indexed column position** | 1 |\n| **Indexed column name** | `LOCATION_ID` |\n| **Column data type** | NUMBER |\n\n### Resolution path\n\n1. **describe_object** on `OE.WAREHOUSES` revealed FK constraint `WAREHOUSES_LOCATION_FK` (ENABLED) on child column `LOCATION_ID`.\n2. **ALL_CONSTRAINTS** confirmed the FK's `R_OWNER = HR`, `R_CONSTRAINT_NAME = LOC_ID_PK` — the parent is **not** in OE; it lives in the **HR** schema.\n3. **ALL_INDEXES / ALL_IND_COLUMNS** resolved the backing index for `LOC_ID_PK`: a single-column UNIQUE index on `LOCATION_ID NUMBER` at position 1.",
		"rows": [
			[
				"LOCATION_ID",
				"HR",
				"LOCATIONS",
				"LOC_ID_PK",
				"LOC_ID_PK",
				"UNIQUE",
				1,
				"LOCATION_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.owner,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='OE' AND c.table_name='WAREHOUSES' AND c.constraint_type='R' ORDER BY cc.position,ic.column_position",
		"pass_": false
	},
	{
		"label": "ch1 B hard-p11b-partial-memory",
		"answer": "## Results for `p1-19c-prod`\n\n| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Major database version** | `19.9.1.0.0` (Oracle 19c) | `db_overview` tool |\n| **Configured SGA_TARGET (bytes)** | **Not available** | See below |\n\n### Unavailable source\n\nThe configured `SGA_TARGET` parameter value cannot be retrieved because the account lacks privileges on all relevant dynamic performance views:\n\n- `V$SYSTEM_PARAMETER` → ORA-00942\n- `V$PARAMETER` → ORA-00942\n- `GV$PARAMETER` → ORA-00942\n\nThe `db_overview` tool reports **currently allocated SGA = 3,221,222,464 bytes**, but per your instruction this is **not** treated as the configured `SGA_TARGET`—it reflects actual memory allocation at runtime, which may differ from the parameter setting (e.g., if `MEMORY_TARGET`/AMM is in use, or if the parameter was changed without restart).\n\n**Conclusion:** The instance name and version are confirmed; the configured `SGA_TARGET` value is unverifiable with the current account privileges.",
		"rows": [
			[
				"PRODCDB"
			],
			[
				"19"
			]
		],
		"sql": "SELECT instance_name FROM v$instance UNION ALL SELECT REGEXP_SUBSTR(version,'^[0-9]+') FROM v$instance",
		"pass_": false
	},
	{
		"label": "ch2 B hard-p11-order-customer-key",
		"answer": "Here is the complete foreign-key trace on **p1-19c-prod**, built entirely from dictionary joins (no name assumptions):\n\n| Step | Detail |\n|------|--------|\n| **Child table** | SHOPAPP.**ORDERS** |\n| **FK constraint** | SYS_C007662 (ENABLED) |\n| **Child column** | CUSTOMER_ID (position 1) |\n| **Parent table** | SHOPAPP.**CUSTOMERS** |\n| **Referenced constraint** | SYS_C007649 — type **P** (Primary Key) |\n| **Backing index** | SYS_C007649 |\n| **Index uniqueness** | **UNIQUE** |\n| **Indexed position** | 1 |\n| **Parent column** | CUSTOMER_ID |\n| **Data type** | NUMBER (length 22, no precision/scale declared, NOT NULL) |\n\n### How the chain was resolved\n\n1. **ALL_CONSTRAINTS + ALL_CONS_COLUMNS** — found FK `SYS_C007662` on ORDERS; its `R_OWNER`/`R_CONSTRAINT_NAME` pointed to `SHOPAPP.SYS_C007649`.\n2. **ALL_CONSTRAINTS** (parent side) — confirmed `SYS_C007649` is a Primary Key on table **CUSTOMERS**.\n3. **ALL_INDEXES + ALL_IND_COLUMNS** — the only unique index on CUSTOMERS is named `SYS_C007649` (Oracle auto-creates an index bearing the constraint name for system-named PKs), covering column CUSTOMER_ID at position 1.\n4. **ALL_TAB_COLUMNS** — CUSTOMER_ID is `NUMBER`, NOT NULL.\n\nThe FK is fully supported by a unique index on the parent key, so no unindexed-FK performance risk exists here.",
		"rows": [
			[
				"CUSTOMER_ID",
				"CUSTOMERS",
				"SYS_C007649",
				"SYS_C007649",
				"UNIQUE",
				1,
				"CUSTOMER_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='SHOPAPP' AND c.table_name='ORDERS' AND c.constraint_type='R' AND p.table_name='CUSTOMERS' ORDER BY cc.position,ic.column_position",
		"pass_": true
	},
	{
		"label": "ch2 B hard-p11b-partial-memory",
		"answer": "## Results for `p1-19c-prod`\n\n| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Full version** | `19.9.1.0.0` (major version: **19**) | `db_overview` tool |\n| **Configured `SGA_TARGET` (bytes)** | **Not available** | — |\n\n### Why SGA_TARGET cannot be verified\n\nThe account on this target lacks privileges on the dynamic performance views that expose initialization parameters:\n\n- `V$PARAMETER` → ORA-00942\n- `V$SYSTEM_PARAMETER` → ORA-00942\n- `GV$PARAMETER` → ORA-00942\n\nNo alternative read-only source (e.g., a spfile/pfile reader) is exposed through the available tooling.\n\n### What is *not* being reported as SGA_TARGET\n\nThe `db_overview` tool reports **SGA_BYTES = 3,221,222,464** — this is the currently allocated SGA size. Per your instruction, I explicitly do **not** treat this as the configured `SGA_TARGET` value, because:\n\n- If `MEMORY_TARGET` (AMM) is active, `SGA_TARGET` may be 0 and the SGA is dynamically sized within the memory target.\n- Even with ASMM, the allocated SGA can differ from the parameter if a resize has occurred since startup.\n\n**Conclusion:** Instance name and version are confirmed; the configured `SGA_TARGET` value in bytes cannot be verified with the current account's privileges.",
		"rows": [
			[
				"PRODCDB"
			],
			[
				"19"
			]
		],
		"sql": "SELECT instance_name FROM v$instance UNION ALL SELECT REGEXP_SUBSTR(version,'^[0-9]+') FROM v$instance",
		"pass_": true
	},
	{
		"label": "ch3 B hard-p11b-partial-memory",
		"answer": "## Results for `p1-19c-prod`\n\n| Item | Value | Source |\n|------|-------|--------|\n| Instance name | **PRODCDB** | `db_overview` |\n| Full database version | **19.9.1.0.0** | `db_overview` |\n| Configured `SGA_TARGET` (bytes) | **Unavailable** | — |\n\n### Why SGA_TARGET cannot be reported\n\nThe account on this target has **no SELECT privilege** on any parameter view:\n\n- `V$PARAMETER` → ORA-00942\n- `V$SYSTEM_PARAMETER` → ORA-00942\n- `V$SPPARAMETER` → ORA-00942\n- `GV$PARAMETER` → ORA-00942\n\nThe only memory-related view granted is `V$SGA`, which exposes **currently allocated** component sizes (Fixed, Variable, Buffer Cache, Shared Pool, Large Pool, etc.)—not the configured `SGA_TARGET` parameter. Per your instruction, I will not infer a configured target from those allocation figures.\n\n### What *is* available (for reference only)\n\nThe `db_overview` tool reports **total SGA currently allocated = 3,221,222,464 bytes (~3 GiB)**, but this is an observed runtime allocation, not a verified configuration parameter value.",
		"rows": [
			[
				"PRODCDB"
			],
			[
				"19"
			]
		],
		"sql": "SELECT instance_name FROM v$instance UNION ALL SELECT REGEXP_SUBSTR(version,'^[0-9]+') FROM v$instance",
		"pass_": false
	},
	{
		"label": "ch4 B hard-p11-order-customer-key",
		"answer": "Here is the complete FK → parent → index trace, built entirely from dictionary views on **p1-19c-prod**:\n\n| # | Item | Value | Source view(s) |\n|---|------|-------|----------------|\n| 1 | **Child column** | `SHOPAPP.ORDERS.CUSTOMER_ID` | ALL_CONSTRAINTS + ALL_CONS_COLUMNS |\n| 2 | **FK constraint name** | `SYS_C007662` (type `R`) | ALL_CONSTRAINTS |\n| 3 | **Parent table** | `SHOPAPP.CUSTOMERS` | ALL_CONSTRAINTS (`r_owner`/`r_constraint_name` → parent row) |\n| 4 | **Referenced constraint** | `SYS_C007649` (type `P` — primary key) | ALL_CONSTRAINTS |\n| 5 | **Backing index** | `SYS_C007649` | ALL_INDEXES (index on SHOPAPP.CUSTOMERS whose columns exactly match the PK constraint columns) |\n| 6 | **Index uniqueness** | `UNIQUE` | ALL_INDEXES.uniqueness |\n| 7 | **Indexed position** | `1` | ALL_IND_COLUMNS.column_position |\n| 8 | **Parent column** | `CUSTOMER_ID` | ALL_IND_COLUMNS / ALL_CONS_COLUMNS |\n| 9 | **Data type** | `NUMBER` (length 22, no precision/scale, NOT NULL) | ALL_TAB_COLUMNS |\n\n### Key observations\n\n- The FK and PK constraint names are system-generated (`SYS_C…`), so they carry no semantic hint; the parent table was resolved via the `R_OWNER`/`R_CONSTRAINT_NAME` columns in `ALL_CONSTRAINTS`, not by name matching.\n- The backing index happens to share the constraint name (`SYS_C007649`)—this is Oracle's default behaviour when a PK is created without an explicit `USING INDEX` clause—but it was confirmed by joining `ALL_INDEXES` → `ALL_IND_COLUMNS` and verifying the indexed column set matches the PK column set exactly.\n- The index is **UNIQUE** on a single column (`CUSTOMER_ID`), so the FK lookup from ORDERS will always be a unique scan—optimal for referential-integrity checks.",
		"rows": [
			[
				"CUSTOMER_ID",
				"CUSTOMERS",
				"SYS_C007649",
				"SYS_C007649",
				"UNIQUE",
				1,
				"CUSTOMER_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='SHOPAPP' AND c.table_name='ORDERS' AND c.constraint_type='R' AND p.table_name='CUSTOMERS' ORDER BY cc.position,ic.column_position",
		"pass_": true
	},
	{
		"label": "ch4 B hard-p11-warehouse-location-key",
		"answer": "Here is the full resolution chain on **d1-19c-lab**:\n\n| Attribute | Value |\n|-----------|-------|\n| **Child column** | `LOCATION_ID` (position 1 in OE.WAREHOUSES) |\n| **Parent owner** | **HR** (not OE) |\n| **Referenced constraint** | `LOC_ID_PK` (owner HR, type P) |\n| **Backing index** | `LOC_ID_PK` (owner HR) |\n| **Uniqueness** | UNIQUE |\n| **Indexed position** | 1 |\n| **Indexed column** | `LOCATION_ID` |\n| **Data type** | NUMBER |\n\n**Resolution path:**\n\n1. `describe_object` on OE.WAREHOUSES revealed FK `WAREHOUSES_LOCATION_FK` on child column `LOCATION_ID`.\n2. `ALL_CONSTRAINTS` join confirmed `R_OWNER = HR`, `R_CONSTRAINT_NAME = LOC_ID_PK` — the parent is **not** in OE.\n3. `ALL_CONSTRAINTS` + `ALL_INDEXES` confirmed the PK's backing index is `HR.LOC_ID_PK`, uniqueness **UNIQUE**.\n4. `ALL_IND_COLUMNS` joined to `ALL_TAB_COLUMNS` shows a single indexed column: position 1 → `LOCATION_ID` (NUMBER).",
		"rows": [
			[
				"LOCATION_ID",
				"HR",
				"LOCATIONS",
				"LOC_ID_PK",
				"LOC_ID_PK",
				"UNIQUE",
				1,
				"LOCATION_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.owner,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='OE' AND c.table_name='WAREHOUSES' AND c.constraint_type='R' ORDER BY cc.position,ic.column_position",
		"pass_": false
	},
	{
		"label": "ch4 B hard-p11b-partial-memory",
		"answer": "## Results for `p1-19c-prod`\n\n| Item | Value | Source |\n|------|-------|--------|\n| **Instance name** | `PRODCDB` | `db_overview` tool |\n| **Major database version** | `19.9.1.0.0` (full string) | `db_overview` tool |\n| **Configured SGA_TARGET (bytes)** | **Not available** | — |\n\n### Why SGA_TARGET cannot be reported\n\nThe account on this target does not have privileges to query `V$PARAMETER`, `V$SYSTEM_PARAMETER`, or `GV$PARAMETER` — all three return **ORA-00942: table or view does not exist**. No other tool in the available set exposes initialization parameter values.\n\nThe `db_overview` tool reports **SGA_BYTES = 3,221,222,464**, but that is the *currently allocated* SGA size, not the configured `SGA_TARGET` parameter. Per your instruction, I will not present it as if it were the configured target.\n\n**To obtain the actual value**, a session with access to `V$PARAMETER` (or `SHOW PARAMETER sga_target` in SQL*Plus) would be required.",
		"rows": [
			[
				"PRODCDB"
			],
			[
				"19"
			]
		],
		"sql": "SELECT instance_name FROM v$instance UNION ALL SELECT REGEXP_SUBSTR(version,'^[0-9]+') FROM v$instance",
		"pass_": false
	},
	{
		"label": "ch4 A hard-p11-order-customer-key",
		"answer": "Here is the complete foreign-key trace on **p1-19c-prod**, built entirely from dictionary views:\n\n| Step | Detail | Source |\n|------|--------|--------|\n| **Child table** | SHOPAPP.ORDERS | `ALL_CONSTRAINTS` |\n| **Child column** | CUSTOMER_ID (position 1) | `ALL_CONS_COLUMNS` via describe_object |\n| **FK constraint** | SYS_C007662 (type R, ENABLED) | `ALL_CONSTRAINTS` |\n| **Parent table** | SHOPAPP.CUSTOMERS | `ALL_CONSTRAINTS.R_OWNER / R_CONSTRAINT_NAME` → resolved to table_name |\n| **Referenced constraint** | SYS_C007649 (type P = Primary Key, ENABLED) | `ALL_CONSTRAINTS` |\n| **Backing index** | SYS_C007649 | `ALL_INDEXES` joined on `ALL_CONSTRAINTS.INDEX_NAME` |\n| **Index uniqueness** | UNIQUE | `ALL_INDEXES.UNIQUENESS` |\n| **Index status** | VALID | `ALL_INDEXES.STATUS` |\n\n### Indexed parent columns (position → column → type)\n\n| Position | Column | Data Type | Length | Precision | Scale |\n|----------|--------|-----------|--------|-----------|-------|\n| 1 | CUSTOMER_ID | NUMBER | 22 | NULL | NULL |\n\n### Summary of the chain\n\n```\nSHOPAPP.ORDERS.CUSTOMER_ID\n  ──FK SYS_C007662──▶\nSHOPAPP.CUSTOMERS (PK SYS_C007649)\n  ──backed by──▶\nIndex SYS_C007649 (UNIQUE, VALID) on CUSTOMER_ID NUMBER(22)\n```\n\nBoth the child column (`ORDERS.CUSTOMER_ID`) and the parent indexed column (`CUSTOMERS.CUSTOMER_ID`) are **NUMBER** with length 22 and no declared precision/scale, confirming type compatibility. The index name happens to match the constraint name because Oracle auto-creates a system-named unique index for the primary key—but this was confirmed via `ALL_CONSTRAINTS.INDEX_NAME`, not assumed.",
		"rows": [
			[
				"CUSTOMER_ID",
				"CUSTOMERS",
				"SYS_C007649",
				"SYS_C007649",
				"UNIQUE",
				1,
				"CUSTOMER_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='SHOPAPP' AND c.table_name='ORDERS' AND c.constraint_type='R' AND p.table_name='CUSTOMERS' ORDER BY cc.position,ic.column_position",
		"pass_": false
	},
	{
		"label": "ch4 A hard-p11-warehouse-location-key",
		"answer": "Here is the full resolution chain for the FK on **OE.WAREHOUSES**:\n\n| Attribute | Value |\n|-----------|-------|\n| Child column | `LOCATION_ID` (position 1 in FK `WAREHOUSES_LOCATION_FK`) |\n| Parent owner / table | **HR** . **LOCATIONS** |\n| Referenced constraint | `LOC_ID_PK` (owner HR) |\n| Backing index | `LOC_ID_PK` (owner HR) |\n| Uniqueness | **UNIQUE** |\n| Indexed position | 1 |\n| Indexed column | `LOCATION_ID` |\n| Column type | `NUMBER` |\n\n**Key point:** The parent is **not** in OE — it lives in the **HR** schema (`HR.LOCATIONS`), and its primary key is backed by a unique index on a single `NUMBER` column.",
		"rows": [
			[
				"LOCATION_ID",
				"HR",
				"LOCATIONS",
				"LOC_ID_PK",
				"LOC_ID_PK",
				"UNIQUE",
				1,
				"LOCATION_ID",
				"NUMBER"
			]
		],
		"sql": "SELECT cc.column_name,p.owner,p.table_name,p.constraint_name,p.index_name,i.uniqueness,ic.column_position,ic.column_name,tc.data_type FROM all_constraints c JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name JOIN all_constraints p ON p.owner=c.r_owner AND p.constraint_name=c.r_constraint_name JOIN all_indexes i ON i.owner=p.index_owner AND i.index_name=p.index_name JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name JOIN all_tab_columns tc ON tc.owner=ic.table_owner AND tc.table_name=ic.table_name AND tc.column_name=ic.column_name WHERE c.owner='OE' AND c.table_name='WAREHOUSES' AND c.constraint_type='R' ORDER BY cc.position,ic.column_position",
		"pass_": true
	},
	{
		"label": "ch4 A hard-p11b-stats-grain",
		"answer": "## Result (one record)\n\n| Metric | Value | Source |\n|--------|-------|--------|\n| Dictionary NUM_ROWS | **10** | `ALL_TABLES.NUM_ROWS` (last analyzed 2026-09-11) |\n| Live row count | **10** | `COUNT(*)` on `HR.JOB_HISTORY` |\n| Distinct employees | **7** | `COUNT(DISTINCT employee_id)` on `HR.JOB_HISTORY` |\n\n## Reconciliation\n\nThe statistics NUM_ROWS (10) matches the live COUNT(\\*) (10) exactly, so the optimizer's table-level cardinality is current and accurate for this table.\n\n## Can a statistics row count answer \"how many different employees have history\"?\n\n**No.** `NUM_ROWS` is a scalar table-level statistic that records the total number of rows in the segment at the time statistics were gathered. It carries no information about distinct values within any column. Even column-level statistics (`NUM_DISTINCT` in `ALL_TAB_COL_STATISTICS`) are *estimates* (often derived from a sample or approximate distinct-count algorithms) and may drift from reality between gather jobs.\n\nThe authoritative source for \"how many different employees appear in JOB_HISTORY\" is a **live query** — specifically `COUNT(DISTINCT employee_id)` executed against the table itself, which I used above and which returned **7**.",
		"rows": [
			[
				10,
				10,
				7
			]
		],
		"sql": "SELECT t.num_rows,(SELECT COUNT(*) FROM hr.job_history),(SELECT COUNT(DISTINCT employee_id) FROM hr.job_history) FROM all_tables t WHERE owner='HR' AND table_name='JOB_HISTORY'",
		"pass_": true
	}
];

for (const fixture of archived) {
	it(`scores archived ${fixture.label}`, () => {
		expect(matches(fixture.answer, fixture.rows, fixture.sql)).toBe(fixture.pass_);
	});
}

it('binds qualified table owners and rejects conflicting owners across layouts', () => {
	for (const answer of [
		'| owner | table_name |\n|---|---|\n|HR|HR.**CUSTOMERS**|',
		'| Item | Value |\n|---|---|\n|owner|HR|\n|table_name|HR . CUSTOMERS|',
		'owner=HR / table_name=HR.CUSTOMERS',
	]) {
		expect(matches(answer, [['HR', 'CUSTOMERS']])).toBe(true);
		expect(matches(answer.replace(/HR(?=\s*\.)/g, 'OE'), [['HR', 'CUSTOMERS']])).toBe(false);
	}
	const sql = 'SELECT parent_owner, parent_table FROM example';
	expect(matches('parent_owner=HR / parent_table=OE.CUSTOMERS', [['HR', 'CUSTOMERS']], sql)).toBe(false);
	expect(matches('parent_owner=HR / parent_table=HR.CUSTOMERS', [['HR', 'CUSTOMERS']], sql)).toBe(true);
});

it('keeps distinct evidence, sources and unrelated tables separate', () => {
	const good = '| Metric | Value | Source |\n|---|---|---|\n|Dictionary rows|10|NUM_ROWS|\n|Live rows|10|COUNT|\n|Distinct employees|7|COUNT DISTINCT|';
	expect(matches(good, [[10, 10, 7]])).toBe(true);
	expect(matches(good.replace('|Live rows|10|', '|Live rows|11|'), [[10, 10, 7]])).toBe(false);
	expect(matches(good.replace('|Distinct employees|7|COUNT DISTINCT|', '|Distinct employees|8|7|'), [[10, 10, 7]])).toBe(false);
	expect(matches(good.replace('|Live rows|', '\nUnrelated\n| Metric | Value | Source |\n|---|---|---|\n|Live rows|'), [[10, 10, 7]])).toBe(false);
	const order = archived.find(f => f.label === 'ch2 B hard-p11-order-customer-key')!;
	expect(matches(order.answer.replace('SYS_C007649 — type', 'WRONG_INDEX — type'), order.rows, order.sql)).toBe(false);
	expect(matches(order.answer.replace('SHOPAPP.**CUSTOMERS**', 'SHOPAPP.**ORDERS**'), order.rows, order.sql)).toBe(false);
});

it('requires an explicit standalone major value without deriving it from a version', () => {
	for (const value of ['19c', '19.9.1.0.0', '19.9.1.0.0 (major version: **190**)', '19.9.1.0.0 (major version: **23**)']) {
		expect(matches(`| Full version | ${value} | source |`, [['19']])).toBe(false);
	}
	expect(matches('| Full version | 19.9.1.0.0 (major version: **19**) | source |', [['19']])).toBe(true);
	expect(matches('(major version: **19**) and (other: 4)', [['19', 4]])).toBe(false);
});
