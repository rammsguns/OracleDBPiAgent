# Issue triage: p1-19c-prod

Read-only evidence. Hypotheses are ranked diagnostic leads, not proof. Credential-looking literals are redacted; ordinary business literals are preserved; graph call associations and statement ranges are heuristic.

## Issue 1

NIGHTLY_PURGE_JOB

Window: 24h. Codes: ORA-02292, ORA-06512. Reported times: none.

### Ranked hypotheses

1. Cutoff evaluated twice / predicate mismatch: rows crossing the boundary between statements keep child rows.

- SHOPAPP.WORKLOAD.NIGHTLY_PURGE, line 26: `DELETE FROM order_lines WHERE order_id IN (SELECT order_id FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY);`
- SHOPAPP.WORKLOAD.NIGHTLY_PURGE, line 27: `DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;`
- Both statements evaluate a time-relative cutoff separately; the later statement can include parents that crossed the boundary.
- This is a source-based hypothesis; current aggregates cannot reconstruct the failing transaction.
- Current matching child row count: 790696 (a new read-only snapshot, not proof of the historical cause).

2. A child foreign key still references the parent rows being deleted.

- SHOPAPP.SYS_C007669: table SHOPAPP.ORDER_LINES, type R.
- SHOPAPP.WORKLOAD line 27 inside NIGHTLY_PURGE: `DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;`
- SHOPAPP.NIGHTLY_PURGE_JOB line 1 inside anonymous block (job_action): `BEGIN shopapp.workload.nightly_purge; END;`

### Limitations

No additional limitations identified; view failures and caps are reported below.

### Concurrency review

SHOPAPP.PLACE_ORDERS_JOB calls SHOPAPP.WORKLOAD.PLACE_ORDERS: line 6 inserts a new parent and RETURNING order_id INTO v_order; line 12 inserts child rows using that new key. This shown path cannot explain child rows for old parents selected by the purge; it does not support that concurrency explanation.

### Suggested fixes (not executed)

Suggestions for a developer; no changes were run.

- For SHOPAPP.WORKLOAD.NIGHTLY_PURGE lines 26 and 27, capture the cutoff once in a variable and use it in both statements; make the predicates identical.

- For SHOPAPP.ORDER_LINES → SHOPAPP.ORDERS, collect the intended parent key set first and delete children using that same key set before deleting parents.

- Consider ON DELETE CASCADE only as a schema design choice after reviewing ownership, retention rules and all dependent tables.

- Add exception logging that records the error stack, backtrace, captured cutoff and operation context without credentials.

### Frame excerpts

SHOPAPP.WORKLOAD line 27 inside NIGHTLY_PURGE; ok; DBA_SOURCE.

Statement (heuristic): `DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;`

```plsql
19:   PROCEDURE ship_orders IS
20:   BEGIN
21:     UPDATE orders SET status = 'SHIPPED' WHERE status = 'NEW' AND ordered_at < SYSTIMESTAMP - INTERVAL '2' MINUTE;
22:     COMMIT;
23:   END;
24:   PROCEDURE nightly_purge IS
25:   BEGIN
26:     DELETE FROM order_lines WHERE order_id IN (SELECT order_id FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY);
27:     DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;
28:     COMMIT;
29:   END;
30: END workload;
```

SHOPAPP.NIGHTLY_PURGE_JOB line 1 inside anonymous block (job_action); ok; DBA_SCHEDULER_JOBS.

Statement (heuristic): `BEGIN shopapp.workload.nightly_purge; END;`

```plsql
1: BEGIN shopapp.workload.nightly_purge; END;
```

### Evidence

Named scheduler job actions: ok; DBA_SCHEDULER_JOBS

| OWNER | JOB_NAME | JOB_TYPE | JOB_ACTION |
| --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | PLSQL_BLOCK | BEGIN shopapp.workload.nightly_purge; END; |

Scheduler run history in window: ok; DBA_SCHEDULER_JOB_RUN_DETAILS

| OWNER | JOB_NAME | STATUS | ERROR# | ACTUAL_START_DATE | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | FAILED | 2292 | 2026-11-04T04:30:02.953Z | ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1<br> |

Source around SHOPAPP.WORKLOAD line 27 (from bounded dictionary source): ok; DBA_SOURCE

See the redacted frame excerpt above; source was collected through the bounded dictionary reader.

Compile errors in SHOPAPP: ok; DBA_ERRORS

No rows returned; absence is limited to visible evidence.

Invalid objects in SHOPAPP: ok; DBA_OBJECTS

No rows returned; absence is limited to visible evidence.

Candidate log tables in SHOPAPP (listed only): ok; ALL_TABLES; DBA_TABLES ORA-00942

No rows returned; absence is limited to visible evidence.

Constraint SHOPAPP.SYS_C007669: ok; ALL_CONSTRAINTS; DBA_CONSTRAINTS ORA-00942

| OWNER | CONSTRAINT_NAME | CONSTRAINT_TYPE | TABLE_NAME | R_OWNER | R_CONSTRAINT_NAME | DELETE_RULE | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | SYS_C007669 | R | ORDER_LINES | SHOPAPP | SYS_C007661 | NO ACTION | ENABLED |

Columns for SHOPAPP.SYS_C007669: ok; ALL_CONS_COLUMNS; DBA_CONS_COLUMNS ORA-00942

| OWNER | CONSTRAINT_NAME | TABLE_NAME | COLUMN_NAME | POSITION |
| --- | --- | --- | --- | --- |
| SHOPAPP | SYS_C007669 | ORDER_LINES | ORDER_ID | 1 |

Parent/key table for SHOPAPP.SYS_C007669: ok; ALL_CONSTRAINTS; DBA_CONSTRAINTS ORA-00942

| OWNER | CONSTRAINT_NAME | TABLE_NAME | CONSTRAINT_TYPE |
| --- | --- | --- | --- |
| SHOPAPP | SYS_C007661 | ORDERS | P |

Columns for SHOPAPP.SYS_C007661: ok; ALL_CONS_COLUMNS; DBA_CONS_COLUMNS ORA-00942

| OWNER | CONSTRAINT_NAME | TABLE_NAME | COLUMN_NAME | POSITION |
| --- | --- | --- | --- | --- |
| SHOPAPP | SYS_C007661 | ORDERS | ORDER_ID | 1 |

All visible child foreign keys referencing SHOPAPP.SYS_C007661: ok; ALL_CONSTRAINTS; DBA_CONSTRAINTS ORA-00942

| OWNER | CONSTRAINT_NAME | TABLE_NAME | R_OWNER | R_CONSTRAINT_NAME | DELETE_RULE | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | SYS_C007669 | ORDER_LINES | SHOPAPP | SYS_C007661 | NO ACTION | ENABLED |

Current child references matching parent predicate (SHOPAPP.ORDER_LINES → SHOPAPP.ORDERS): ok; SHOPAPP.ORDER_LINES, SHOPAPP.ORDERS

| CHILD_ROWS |
| --- |
| 790696 |

Other jobs referencing SHOPAPP.WORKLOAD (concurrency review): ok; DBA_SCHEDULER_JOBS

| OWNER | JOB_NAME | JOB_ACTION |
| --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | BEGIN shopapp.workload.nightly_purge; END; |
| SHOPAPP | PLACE_ORDERS_JOB | BEGIN shopapp.workload.place_orders(25); END; |
| SHOPAPP | SHIP_ORDERS_JOB | BEGIN shopapp.workload.ship_orders; END; |

### Local error guide

ORA-02292: Integrity constraint violated: child record found. Typical causes: Parent DELETE/UPDATE still has referencing child rows. Read-only checks: Resolve all child foreign keys, including tables not cleared by the preceding code.

### Numbered debug checklist

1. Named scheduler job actions. Look for the job type and entry point; an empty current dictionary result with retained history can mean a dropped or auto-dropped job.

```sql
SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE (JOB_NAME = 'NIGHTLY_PURGE_JOB') ORDER BY OWNER, JOB_NAME
```

2. Scheduler run history in window. Look for FAILED runs, their exact error stack and start time; compare repeated failures with the reported incident window.

```sql
SELECT OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO FROM DBA_SCHEDULER_JOB_RUN_DETAILS WHERE ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(24, 'HOUR') AND ((OWNER = 'SHOPAPP' AND JOB_NAME = 'NIGHTLY_PURGE_JOB')) ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC
```

3. Source around SHOPAPP.WORKLOAD line 27 (from bounded dictionary source). Look for the raising statement and the enclosing subprogram; compare the child and parent selection predicates and their evaluation times.

```sql
SELECT TYPE, LINE, TEXT FROM DBA_SOURCE WHERE OWNER = 'SHOPAPP' AND NAME = 'WORKLOAD' AND LINE BETWEEN 19 AND 35 ORDER BY TYPE, LINE
```

4. Compile errors in SHOPAPP. Look for compiler line/position and messages naming the failing object or its dependencies.

```sql
SELECT OWNER, NAME, TYPE, LINE, POSITION, TEXT FROM DBA_ERRORS WHERE OWNER = 'SHOPAPP' ORDER BY NAME, TYPE, SEQUENCE
```

5. Invalid objects in SHOPAPP. Look for INVALID status on the failing unit or a dependency and compare LAST_DDL_TIME with the incident.

```sql
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, LAST_DDL_TIME FROM DBA_OBJECTS WHERE OWNER = 'SHOPAPP' AND STATUS = 'INVALID' ORDER BY OBJECT_NAME, OBJECT_TYPE
```

6. Candidate log tables in SHOPAPP (listed only). Look for plausible application log names; only explicitly configured log tables may be read.

```sql
SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'SHOPAPP' AND (TABLE_NAME LIKE '%LOG%' OR TABLE_NAME LIKE '%ERROR%') ORDER BY TABLE_NAME
```

7. Constraint SHOPAPP.SYS_C007669. Look for constraint type, owning child table, referenced parent key, delete rule and enabled status.

```sql
SELECT OWNER, CONSTRAINT_NAME, CONSTRAINT_TYPE, TABLE_NAME, R_OWNER, R_CONSTRAINT_NAME, DELETE_RULE, STATUS FROM ALL_CONSTRAINTS WHERE OWNER = 'SHOPAPP' AND CONSTRAINT_NAME = 'SYS_C007669'
```

8. Columns for SHOPAPP.SYS_C007669. Look for columns ordered by POSITION; pair child and parent key columns at the same position.

```sql
SELECT OWNER, CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, POSITION FROM ALL_CONS_COLUMNS WHERE OWNER = 'SHOPAPP' AND CONSTRAINT_NAME = 'SYS_C007669' ORDER BY POSITION
```

9. Parent/key table for SHOPAPP.SYS_C007669. Look for the parent table and primary/unique key referenced by the failing foreign key.

```sql
SELECT OWNER, CONSTRAINT_NAME, TABLE_NAME, CONSTRAINT_TYPE FROM ALL_CONSTRAINTS WHERE OWNER = 'SHOPAPP' AND CONSTRAINT_NAME = 'SYS_C007661'
```

10. Columns for SHOPAPP.SYS_C007661. Look for columns ordered by POSITION; pair child and parent key columns at the same position.

```sql
SELECT OWNER, CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, POSITION FROM ALL_CONS_COLUMNS WHERE OWNER = 'SHOPAPP' AND CONSTRAINT_NAME = 'SYS_C007661' ORDER BY POSITION
```

11. All visible child foreign keys referencing SHOPAPP.SYS_C007661. Look for every child foreign key to this parent key, including other owners; ALL visibility can hide additional children.

```sql
SELECT OWNER, CONSTRAINT_NAME, TABLE_NAME, R_OWNER, R_CONSTRAINT_NAME, DELETE_RULE, STATUS FROM ALL_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'R' AND R_OWNER = 'SHOPAPP' AND R_CONSTRAINT_NAME = 'SYS_C007661' ORDER BY OWNER, CONSTRAINT_NAME
```

12. Current child references matching parent predicate (SHOPAPP.ORDER_LINES → SHOPAPP.ORDERS). Look for a nonzero CHILD_ROWS count: children currently reference parents eligible for the parent operation; zero does not disprove a past boundary race.

```sql
SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT < SYSTIMESTAMP - INTERVAL '7' DAY)
```

13. Other jobs referencing SHOPAPP.WORKLOAD (concurrency review). Look for job entry points that insert child rows, then verify whether their keys can refer to the same eligible parents.

```sql
SELECT OWNER, JOB_NAME, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE INSTR(UPPER(JOB_ACTION), 'WORKLOAD') > 0 ORDER BY OWNER, JOB_NAME
```

### Trace diagram

```mermaid
flowchart LR
  n0["SHOPAPP.WORKLOAD.NIGHTLY_PURGE line 27"]
  n1["DELETE FROM orders WHERE ordered_at _ SYSTIMESTAMP - INTERVAL _7_ DAY_"]
  n2["SHOPAPP.NIGHTLY_PURGE_JOB"]
  n3["SHOPAPP.ORDER_LINES"]
  n4["SHOPAPP.SYS_C007669"]
  n5["SHOPAPP.ORDERS"]
  n6["SHOPAPP.NIGHTLY_PURGE_JOB.anonymous block (job_action) line 1"]
  n7["BEGIN shopapp.workload.nightly_purge_ END_"]
  n0 -->|references| n1
  n2 -.->|references| n0
  n3 -->|references| n4
  n1 -.->|references| n5
  n4 -->|references| n5
  n6 -->|references| n7
  n2 -.->|references| n6
  n7 -.->|references| n5
```

