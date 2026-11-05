# Issue triage: p1-19c-prod

Read-only evidence. Hypotheses are ranked diagnostic leads, not proof. Credential-looking literals are redacted; ordinary business literals are preserved; graph call associations and statement ranges are heuristic.

## Issue 1

query slow on SHOPAPP.ORDERS

Window: 24h. Codes: none. Reported times: none.

### Alert log

ok; 2026-11-04T17:09:49.977Z to 2026-11-05T17:09:49.977Z (exclusive). Job-run queries use their own ±10 minute windows, including historical runs.

| Index | First / last | Count | Codes | Incident / problem / trace | Message |
|---|---|---|---|---|---|

No matching alert entries returned within the bounded queries.

### SQL Performance

ok

0 diagnostic statements excluded (session user).

# SQL Insight: p1-19c-prod / fdkzjqg9y6gcx

ok; all times UTC; time per execution in ms (3 significant digits).

SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY)

## Findings

| Finding | Evidence | Verify Next (Shown, Never Run) |
| --- | --- | --- |
| Stale or missing statistics | DBA_TAB_STATISTICS: Owner: SHOPAPP; Name: ORDERS; Stale: true; Last Analyzed: 2026-11-04T22:00:07Z | SELECT OWNER, TABLE_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_TAB_STATISTICS WHERE OWNER = 'SHOPAPP' AND TABLE_NAME = 'ORDERS' |
| Stale or missing statistics | DBA_IND_STATISTICS: Owner: SHOPAPP; Name: ORDER_LINES_PK; Stale: true; Last Analyzed: 2026-11-04T22:00:10Z | SELECT OWNER, INDEX_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_IND_STATISTICS WHERE OWNER = 'SHOPAPP' AND INDEX_NAME = 'ORDER_LINES_PK' |

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: ok · Indexes: ok · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Mismatches: skipped; V$SQL_SHARED_CURSOR

No baselines, profiles, binds or mismatches.

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 917443222 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 782 | 781 | 5770 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-04T23:30:30Z |
| 1 | 917443222 | 56 | 10197391 | 10139517 | 197969 | 0 | 56 | 182 | 181 | 3540 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 917443222 | 57 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z | 193 |

## Tables

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDERS | true | 2026-11-04T22:00:07Z | 470650 | ok | DBA_TAB_STATISTICS |

## Indexes

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDER_LINES_PK | true | 2026-11-04T22:00:10Z | 1412103 | ok | DBA_IND_STATISTICS |

## Plan 917443222 (display_cursor)

```
SQL_ID  fdkzjqg9y6gcx, child number 0
-------------------------------------
SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS 
(SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND 
p.ORDERED_AT < SYSTIMESTAMP - INTERVAL '7' DAY)
 
Plan hash value: 917443222
 
-----------------------------------------------------------------------------------------
| Id  | Operation              | Name           | Rows  | Bytes | Cost (%CPU)| Time     |
-----------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT       |                |       |       |  1545 (100)|          |
|   1 |  SORT AGGREGATE        |                |     1 |    21 |            |          |
|*  2 |   HASH JOIN            |                | 69699 |  1429K|  1545   (3)| 00:00:01 |
|*  3 |    TABLE ACCESS FULL   | ORDERS         | 23533 |   367K|   674   (4)| 00:00:01 |
|   4 |    INDEX FAST FULL SCAN| ORDER_LINES_PK |  1412K|  6895K|   867   (1)| 00:00:01 |
-----------------------------------------------------------------------------------------
 
Predicate Information (identified by '[REDACTED]' id):
---------------------------------------------------
 
   2 - access("C"."ORDER_ID"="P"."ORDER_ID")
   3 - filter(SYS_EXTRACT_UTC(INTERNAL_FUNCTION("P"."ORDERED_AT"))<SYS_EXTRACT_UT
              C(SYSTIMESTAMP(6)-INTERVAL'+07 00:00:00' DAY(2) TO SECOND(0)))
 
Note
-----
   - this is an adaptive plan
 
```


### Ranked hypotheses

1. Stale or missing statistics

- DBA_TAB_STATISTICS: Owner: SHOPAPP; Name: ORDERS; Stale: true; Last Analyzed: 2026-11-04T22:00:07Z

Verify next (not executed):

```sql
SELECT OWNER, TABLE_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_TAB_STATISTICS WHERE OWNER = :owner AND TABLE_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDERS"}

2. Stale or missing statistics

- DBA_IND_STATISTICS: Owner: SHOPAPP; Name: ORDER_LINES_PK; Stale: true; Last Analyzed: 2026-11-04T22:00:10Z

Verify next (not executed):

```sql
SELECT OWNER, INDEX_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_IND_STATISTICS WHERE OWNER = :owner AND INDEX_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDER_LINES_PK"}

### Limitations

No additional limitations identified; view failures and caps are reported below.

### Concurrency review

No supported concurrent child-insert path identified from the available source and job evidence.

### Suggested fixes (not executed)

Suggestions for a developer; no changes were run.

Inspect the unavailable source and raising condition before choosing a remediation; preserve exception/backtrace logging without credentials.

### Frame excerpts

### Evidence

Identifier candidate lookup: ok; DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_OBJECTS

| CANDIDATE | KIND | OWNER | NAME |
| --- | --- | --- | --- |
| 2 | OBJECT | SHOPAPP | ORDERS |

Named scheduler job actions: ok; DBA_SCHEDULER_JOBS

No rows returned; absence is limited to visible evidence.

Jobs referencing SHOPAPP.ORDERS (lexical heuristic): ok; DBA_SCHEDULER_JOBS

No rows returned; absence is limited to visible evidence.

Scheduler run history in window: ok; DBA_SCHEDULER_JOB_RUN_DETAILS

No rows returned; absence is limited to visible evidence.

Latest scheduler runs for SHOPAPP.ORDERS (regardless of window; max 5): ok; DBA_SCHEDULER_JOB_RUN_DETAILS

No rows returned; absence is limited to visible evidence.

Compile errors in SHOPAPP: ok; DBA_ERRORS

No rows returned; absence is limited to visible evidence.

Invalid objects in SHOPAPP: ok; DBA_OBJECTS

No rows returned; absence is limited to visible evidence.

Candidate log tables in SHOPAPP (listed only): ok; ALL_TABLES; DBA_TABLES ORA-00942

No rows returned; absence is limited to visible evidence.

Alert log ORA-12012 job discovery in window: ok; V$DIAG_ALERT_EXT

No rows returned; absence is limited to visible evidence.

ADR incidents in triage window: ok; V$DIAG_INCIDENT JOIN V$DIAG_PROBLEM

No rows returned; absence is limited to visible evidence.

Excluded session-user diagnostic SQL: ok; V$SQL / V$SQL_PLAN

| COUNT(DISTINCTS.SQL_ID) |
| --- |
| 0 |

Top SQL referencing issue objects (cursor-cache cumulative time per execution): ok; V$SQL / V$SQL_PLAN

| SQL_ID | SQL_TEXT | ELAPSED_PER_EXEC |
| --- | --- | --- |
| fdkzjqg9y6gcx | SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY) | 192625.91228070174 |
| g5hr2v02ur0qy | UPDATE ORDERS SET STATUS = 'SHIPPED' WHERE STATUS = 'NEW' AND ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '2' MINUTE | 8624.550660792951 |
| 54x8br9b0szpk | INSERT INTO ORDERS (CUSTOMER_ID) VALUES (TRUNC(DBMS_RANDOM.VALUE(1, 50001))) RETURNING ORDER_ID INTO :O0  | 170.81176717357104 |

SQL insight: V$SQL: ok; V$SQL

| CHILD_NUMBER | PLAN_HASH_VALUE | EXECUTIONS | ELAPSED_TIME | CPU_TIME | BUFFER_GETS | DISK_READS | ROWS_PROCESSED | TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(TO_TIMESTAMP(TRIM(FIRST_LOAD_TIME),'YYYY-MM-DD/HH24:MI:SS'),TO_CHAR(SYSTIMESTAMP,'TZH:TZM'))),'YYYY-MM-DD"T"HH24:MI:SS"Z"') | TO_CHAR(LAST_ACTIVE_TIME,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | SQL_TEXT | TO_CHAR(EXACT_MATCHING_SIGNATURE) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 917443222 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-04T23:30:30Z | SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY) | 1532244669087953591 |
| 1 | 917443222 | 56 | 10197391 | 10139517 | 197969 | 0 | 56 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z | SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY) | 1532244669087953591 |

SQL insight: V$SQL_PLAN: ok; V$SQL_PLAN

| ID | PARENT_ID | OPERATION | OPTIONS | OBJECT_OWNER | OBJECT_NAME | OBJECT_TYPE |
| --- | --- | --- | --- | --- | --- | --- |
| 0 |  | SELECT STATEMENT |  |  |  |  |
| 1 | 0 | SORT | AGGREGATE |  |  |  |
| 2 | 1 | HASH JOIN |  |  |  |  |
| 3 | 2 | NESTED LOOPS |  |  |  |  |
| 4 | 3 | STATISTICS COLLECTOR |  |  |  |  |
| 5 | 4 | TABLE ACCESS | FULL | SHOPAPP | ORDERS | TABLE |
| 6 | 3 | INDEX | RANGE SCAN | SHOPAPP | ORDER_LINES_PK | INDEX (UNIQUE) |
| 7 | 2 | INDEX | FAST FULL SCAN | SHOPAPP | ORDER_LINES_PK | INDEX (UNIQUE) |

SQL insight: DBMS_XPLAN.DISPLAY_CURSOR: ok; DBMS_XPLAN.DISPLAY_CURSOR

| PLAN_TABLE_OUTPUT |
| --- |
| SQL_ID  fdkzjqg9y6gcx, child number 0 |
| ------------------------------------- |
| SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS  |
| (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND  |
| p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY) |
|   |
| Plan hash value: 917443222 |
|   |
| ----------------------------------------------------------------------------------------- |
| &#124; Id  &#124; Operation              &#124; Name           &#124; Rows  &#124; Bytes &#124; Cost (%CPU)&#124; Time     &#124; |
| ----------------------------------------------------------------------------------------- |
| &#124;   0 &#124; SELECT STATEMENT       &#124;                &#124;       &#124;       &#124;  1545 (100)&#124;          &#124; |
| &#124;   1 &#124;  SORT AGGREGATE        &#124;                &#124;     1 &#124;    21 &#124;            &#124;          &#124; |
| &#124;*  2 &#124;   HASH JOIN            &#124;                &#124; 69699 &#124;  1429K&#124;  1545   (3)&#124; 00:00:01 &#124; |
| &#124;*  3 &#124;    TABLE ACCESS FULL   &#124; ORDERS         &#124; 23533 &#124;   367K&#124;   674   (4)&#124; 00:00:01 &#124; |
| &#124;   4 &#124;    INDEX FAST FULL SCAN&#124; ORDER_LINES_PK &#124;  1412K&#124;  6895K&#124;   867   (1)&#124; 00:00:01 &#124; |
| ----------------------------------------------------------------------------------------- |
|   |
| Predicate Information (identified by '[REDACTED]' id): |
| --------------------------------------------------- |
|   |
|    2 - access("C"."ORDER_ID"="P"."ORDER_ID") |
|    3 - filter(SYS_EXTRACT_UTC(INTERNAL_FUNCTION("P"."ORDERED_AT"))&lt;SYS_EXTRACT_UT |
|               C(SYSTIMESTAMP(6)-INTERVAL'+07 00:00:00' DAY(2) TO SECOND(0))) |
|   |
| Note |
| ----- |
|    - this is an adaptive plan |
|   |

SQL insight: DBA_TAB_STATISTICS: ok; DBA_TAB_STATISTICS

| STALE_STATS | TO_CHAR(LAST_ANALYZED,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | NUM_ROWS |
| --- | --- | --- |
| YES | 2026-11-04T22:00:07Z | 470650 |

SQL insight: DBA_IND_STATISTICS: ok; DBA_IND_STATISTICS

| STALE_STATS | TO_CHAR(LAST_ANALYZED,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | NUM_ROWS |
| --- | --- | --- |
| YES | 2026-11-04T22:00:10Z | 1412103 |

SQL insight: DBA_SQL_PLAN_BASELINES: ok; DBA_SQL_PLAN_BASELINES

No rows returned; absence is limited to visible evidence.

SQL insight: DBA_SQL_PROFILES: ok; DBA_SQL_PROFILES

No rows returned; absence is limited to visible evidence.

SQL insight: V$SQL_BIND_CAPTURE: ok; V$SQL_BIND_CAPTURE

No rows returned; absence is limited to visible evidence.

### Local error guide

### Numbered debug checklist

1. Identifier candidate lookup. Look for failures or object diagnostics inside the requested time window; check visibility and cap markers before treating an empty result as absence.

```sql
WITH candidates AS (SELECT 0 CANDIDATE, :owner0 OWNER_FILTER, 'QUERY' NAME_FILTER FROM DUAL
UNION ALL
SELECT 1 CANDIDATE, :owner1 OWNER_FILTER, 'SLOW' NAME_FILTER FROM DUAL
UNION ALL
SELECT 2 CANDIDATE, 'SHOPAPP' OWNER_FILTER, 'ORDERS' NAME_FILTER FROM DUAL)
SELECT DISTINCT c.CANDIDATE, 'JOB' KIND, d.OWNER, d.JOB_NAME NAME
FROM candidates c JOIN DBA_SCHEDULER_JOBS d ON d.JOB_NAME = c.NAME_FILTER
AND (c.OWNER_FILTER IS NULL OR d.OWNER = c.OWNER_FILTER)
UNION
SELECT DISTINCT c.CANDIDATE, 'JOB' KIND, d.OWNER, d.JOB_NAME NAME
FROM candidates c JOIN DBA_SCHEDULER_JOB_RUN_DETAILS d ON d.JOB_NAME = c.NAME_FILTER
AND (c.OWNER_FILTER IS NULL OR d.OWNER = c.OWNER_FILTER)
UNION
SELECT DISTINCT c.CANDIDATE, 'OBJECT' KIND, d.OWNER, d.OBJECT_NAME NAME
FROM candidates c JOIN DBA_OBJECTS d ON d.OBJECT_NAME = c.NAME_FILTER
AND (c.OWNER_FILTER IS NULL OR d.OWNER = c.OWNER_FILTER)
ORDER BY 1, 2, 3, 4
```

2. Named scheduler job actions. Look for the job type and entry point; an empty current dictionary result with retained history can mean a dropped or auto-dropped job.

```sql
SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE ((JOB_NAME = 'ORDERS' AND (OWNER = 'SHOPAPP'))) ORDER BY OWNER, JOB_NAME
```

3. Jobs referencing SHOPAPP.ORDERS (lexical heuristic). Look for the job type and entry point; an empty current dictionary result with retained history can mean a dropped or auto-dropped job.

```sql
SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE INSTR(UPPER(JOB_ACTION), 'ORDERS') > 0 ORDER BY OWNER, JOB_NAME
```

4. Scheduler run history in window. Look for FAILED runs, their exact error stack and start time; compare repeated failures with the reported incident window.

```sql
SELECT OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO FROM DBA_SCHEDULER_JOB_RUN_DETAILS WHERE ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(24, 'HOUR') AND ((OWNER = 'SHOPAPP' AND JOB_NAME = 'ORDERS')) ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC
```

5. Latest scheduler runs for SHOPAPP.ORDERS (regardless of window; max 5). These are the latest retained runs without a time filter, capped at 5; check OUTSIDE_WINDOW and the last-run timestamp before treating an old failure as current.

```sql
SELECT OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO, CASE WHEN ACTUAL_START_DATE < SYSTIMESTAMP - NUMTODSINTERVAL(24, 'HOUR') THEN 1 ELSE 0 END AS OUTSIDE_WINDOW FROM DBA_SCHEDULER_JOB_RUN_DETAILS WHERE JOB_NAME = 'ORDERS' AND OWNER = 'SHOPAPP' ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC
```

6. Compile errors in SHOPAPP. Look for compiler line/position and messages naming the failing object or its dependencies.

```sql
SELECT OWNER, NAME, TYPE, LINE, POSITION, TEXT FROM DBA_ERRORS WHERE OWNER = 'SHOPAPP' ORDER BY NAME, TYPE, SEQUENCE
```

7. Invalid objects in SHOPAPP. Look for INVALID status on the failing unit or a dependency and compare LAST_DDL_TIME with the incident.

```sql
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, LAST_DDL_TIME FROM DBA_OBJECTS WHERE OWNER = 'SHOPAPP' AND STATUS = 'INVALID' ORDER BY OBJECT_NAME, OBJECT_TYPE
```

8. Candidate log tables in SHOPAPP (listed only). Look for plausible application log names; only explicitly configured log tables may be read.

```sql
SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'SHOPAPP' AND (TABLE_NAME LIKE '%LOG%' OR TABLE_NAME LIKE '%ERROR%') ORDER BY TABLE_NAME
```

9. Alert log ORA-12012 job discovery in window. Compare codes, incident metadata and timestamps; a ±10 minute match alone does not establish causation. SQL binds: {"fromTime":"2026-11-04T17:09:49.977+00:00","toTime":"2026-11-05T17:09:49.977+00:00","maxLevel":8,"marker0":"ORA-","marker1":"TNS-","marker2":"ERRORS IN FILE","marker3":"INCIDENT=","marker4":"DEADLOCK","code0":"(^|[^A-Z0-9_])ORA-0*12012([^0-9]|$)","fetchLimit":51}

```sql
SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT FROM V$DIAG_ALERT_EXT WHERE ORIGINATING_TIMESTAMP >= TO_TIMESTAMP_TZ(:fromTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND ORIGINATING_TIMESTAMP < TO_TIMESTAMP_TZ(:toTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND (MESSAGE_LEVEL <= 8 OR INSTR(UPPER(MESSAGE_TEXT), :marker0) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker1) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker2) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker3) > 0 OR INSTR(UPPER(MESSAGE_TEXT), 'DEADLOCK') > 0) AND (REGEXP_LIKE(UPPER(MESSAGE_TEXT), :code0)) ORDER BY ORIGINATING_TIMESTAMP DESC, RECORD_ID DESC FETCH FIRST 51 ROWS ONLY
```

10. ADR incidents in triage window. Compare codes, incident metadata and timestamps; a ±10 minute match alone does not establish causation. SQL binds: {"fromTime":"2026-11-04T17:09:50.506+00:00","toTime":"2026-11-05T17:09:50.506+00:00","fetchLimit":51}

```sql
SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG_PROBLEM p ON p.PROBLEM_ID = i.PROBLEM_ID AND p.CON_ID = i.CON_ID WHERE i.CREATE_TIME >= TO_TIMESTAMP_TZ(:fromTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND i.CREATE_TIME < TO_TIMESTAMP_TZ(:toTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') ORDER BY i.CREATE_TIME DESC, i.INCIDENT_ID DESC FETCH FIRST 51 ROWS ONLY
```

11. Excluded session-user diagnostic SQL. Look for failures or object diagnostics inside the requested time window; check visibility and cap markers before treating an empty result as absence.

```sql
SELECT COUNT(DISTINCT s.SQL_ID) FROM V$SQL s WHERE s.PARSING_SCHEMA_NAME = SYS_CONTEXT('USERENV', 'SESSION_USER') AND s.EXECUTIONS > 0 AND s.LAST_ACTIVE_TIME >= SYSDATE - 24 / 24 AND s.LAST_ACTIVE_TIME <= SYSDATE AND EXISTS (SELECT 1 FROM V$SQL_PLAN p WHERE p.SQL_ID = s.SQL_ID AND p.CHILD_NUMBER = s.CHILD_NUMBER AND ((p.OBJECT_OWNER = 'SHOPAPP' AND p.OBJECT_NAME = 'ORDERS')))
```

12. Top SQL referencing issue objects (cursor-cache cumulative time per execution). Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"hours":24,"owner0":"SHOPAPP","name0":"ORDERS"}

```sql
SELECT s.SQL_ID, MIN(s.SQL_TEXT) SQL_TEXT, SUM(s.ELAPSED_TIME) / SUM(s.EXECUTIONS) ELAPSED_PER_EXEC FROM V$SQL s WHERE s.PARSING_SCHEMA_NAME <> SYS_CONTEXT('USERENV', 'SESSION_USER') AND s.EXECUTIONS > 0 AND s.LAST_ACTIVE_TIME >= SYSDATE - 24 / 24 AND s.LAST_ACTIVE_TIME <= SYSDATE AND EXISTS (SELECT 1 FROM V$SQL_PLAN p WHERE p.SQL_ID = s.SQL_ID AND p.CHILD_NUMBER = s.CHILD_NUMBER AND ((p.OBJECT_OWNER = 'SHOPAPP' AND p.OBJECT_NAME = 'ORDERS'))) GROUP BY s.SQL_ID ORDER BY ELAPSED_PER_EXEC DESC, s.SQL_ID FETCH FIRST 3 ROWS ONLY
```

13. SQL insight: V$SQL. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fdkzjqg9y6gcx"}

```sql
SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS, ELAPSED_TIME, CPU_TIME, BUFFER_GETS, DISK_READS, ROWS_PROCESSED, TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(TO_TIMESTAMP(TRIM(FIRST_LOAD_TIME), 'YYYY-MM-DD/HH24:MI:SS'), TO_CHAR(SYSTIMESTAMP, 'TZH:TZM'))), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), TO_CHAR(LAST_ACTIVE_TIME, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), SQL_TEXT, TO_CHAR(EXACT_MATCHING_SIGNATURE) FROM V$SQL WHERE SQL_ID = :id ORDER BY CHILD_NUMBER
```

14. SQL insight: V$SQL_PLAN. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fdkzjqg9y6gcx","child":0}

```sql
SELECT ID, PARENT_ID, OPERATION, OPTIONS, OBJECT_OWNER, OBJECT_NAME, OBJECT_TYPE FROM V$SQL_PLAN WHERE SQL_ID = :id AND CHILD_NUMBER = 0 ORDER BY ID
```

15. SQL insight: DBMS_XPLAN.DISPLAY_CURSOR. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fdkzjqg9y6gcx","child":0}

```sql
SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, 0, 'TYPICAL'))
```

16. SQL insight: DBA_TAB_STATISTICS. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"owner":"SHOPAPP","name":"ORDERS"}

```sql
SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM DBA_TAB_STATISTICS WHERE OWNER = 'SHOPAPP' AND TABLE_NAME = 'ORDERS' AND PARTITION_NAME IS NULL
```

17. SQL insight: DBA_IND_STATISTICS. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"owner":"SHOPAPP","name":"ORDER_LINES_PK"}

```sql
SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM DBA_IND_STATISTICS WHERE OWNER = 'SHOPAPP' AND INDEX_NAME = 'ORDER_LINES_PK' AND PARTITION_NAME IS NULL
```

18. SQL insight: DBA_SQL_PLAN_BASELINES. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"signature":"1532244669087953591"}

```sql
SELECT SQL_HANDLE, PLAN_NAME, ENABLED, ACCEPTED FROM DBA_SQL_PLAN_BASELINES WHERE SIGNATURE = TO_NUMBER(:signature)
```

19. SQL insight: DBA_SQL_PROFILES. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"signature":"1532244669087953591"}

```sql
SELECT NAME, STATUS, TYPE FROM DBA_SQL_PROFILES WHERE SIGNATURE = TO_NUMBER(:signature)
```

20. SQL insight: V$SQL_BIND_CAPTURE. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fdkzjqg9y6gcx"}

```sql
SELECT CHILD_NUMBER, NAME, POSITION, DATATYPE_STRING, WAS_CAPTURED FROM V$SQL_BIND_CAPTURE WHERE SQL_ID = :id ORDER BY CHILD_NUMBER, POSITION
```
