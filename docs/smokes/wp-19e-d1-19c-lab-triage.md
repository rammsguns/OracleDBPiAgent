# Issue triage: d1-19c-lab

Read-only evidence. Hypotheses are ranked diagnostic leads, not proof. Credential-looking literals are redacted; ordinary business literals are preserved; graph call associations and statement ranges are heuristic.

## Issue 1

query slow on SH.SALES

Window: 24h. Codes: none. Reported times: none.

### Alert log

ok; 2026-11-04T17:09:44.469Z to 2026-11-05T17:09:44.469Z (exclusive). Job-run queries use their own ±10 minute windows, including historical runs.

| Index | First / last | Count | Codes | Incident / problem / trace | Message |
|---|---|---|---|---|---|

No matching alert entries returned within the bounded queries.

### SQL Performance

ok

0 diagnostic statements excluded (session user).

# SQL Insight: d1-19c-lab / fcx229huagr7s

ok; all times UTC; time per execution in ms (3 significant digits).

SELECT ch.channel_desc,        SUM(CASE WHEN t.calendar_year = 2000 THEN 1 ELSE 0 END) AS sales_2000,        SUM(CASE WHEN t.calendar_year = 2001 THEN 1 ELSE 0 END) AS sales_2001 FROM sh.channels ch LEFT JOIN sh.sales s ON s.channel_id = ch.channel_id LEFT JOIN sh.times t ON s.time_id = t.time_id AND t.calendar_year IN (2000, 2001) GROUP BY ch.channel_desc ORDER BY ch.channel_desc

## Findings

No findings in available evidence.

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: ok · Indexes: skipped · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Indexes: skipped; 
- Mismatches: skipped; V$SQL_SHARED_CURSOR

No baselines, profiles, binds or mismatches.

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 134784940 | 1 | 230111 | 229438 | 1668 | 0 | 5 | 230 | 229 | 1670 | 0 | 5 | 2026-11-04T20:42:14Z | 2026-11-04T20:42:13Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 134784940 | 1 | 2026-11-04T20:42:14Z | 2026-11-04T20:42:13Z | 230 |

## Tables

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SH | TIMES | false | 2026-10-27T22:00:28Z | 1826 | ok | DBA_TAB_STATISTICS |
| SH | CHANNELS | false | 2026-10-28T22:00:30Z | 5 | ok | DBA_TAB_STATISTICS |
| SH | SALES | false | 2026-10-27T22:00:29Z | 918843 | ok | DBA_TAB_STATISTICS |

## Plan 134784940 (display_cursor)

```
SQL_ID  fcx229huagr7s, child number 0
-------------------------------------
SELECT ch.channel_desc,        SUM(CASE WHEN t.calendar_year = 2000 
THEN 1 ELSE 0 END) AS sales_2000,        SUM(CASE WHEN t.calendar_year 
= 2001 THEN 1 ELSE 0 END) AS sales_2001 FROM sh.channels ch LEFT JOIN 
sh.sales s ON s.channel_id = ch.channel_id LEFT JOIN sh.times t ON 
s.time_id = t.time_id AND t.calendar_year IN (2000, 2001) GROUP BY 
ch.channel_desc ORDER BY ch.channel_desc
 
Plan hash value: 134784940
 
---------------------------------------------------------------------------------------------------
| Id  | Operation              | Name     | Rows  | Bytes | Cost (%CPU)| Time     | Pstart| Pstop |
---------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT       |          |       |       |   563 (100)|          |       |       |
|   1 |  SORT GROUP BY         |          |     5 |   180 |   563   (7)| 00:00:01 |       |       |
|*  2 |   HASH JOIN RIGHT OUTER|          |   918K|    31M|   540   (3)| 00:00:01 |       |       |
|*  3 |    TABLE ACCESS FULL   | TIMES    |   731 |  8772 |    18   (0)| 00:00:01 |       |       |
|*  4 |    HASH JOIN OUTER     |          |   918K|    21M|   519   (2)| 00:00:01 |       |       |
|   5 |     TABLE ACCESS FULL  | CHANNELS |     5 |    65 |     3   (0)| 00:00:01 |       |       |
|   6 |     PARTITION RANGE ALL|          |   918K|  9870K|   514   (2)| 00:00:01 |     1 |    28 |
|   7 |      TABLE ACCESS FULL | SALES    |   918K|  9870K|   514   (2)| 00:00:01 |     1 |    28 |
---------------------------------------------------------------------------------------------------
 
Predicate Information (identified by '[REDACTED]' id):
---------------------------------------------------
 
   2 - access("S"."TIME_ID"="T"."TIME_ID")
   3 - filter(("T"."CALENDAR_YEAR"=2000 OR "T"."CALENDAR_YEAR"=2001))
   4 - access("S"."CHANNEL_ID"="CH"."CHANNEL_ID")
 
```


### Ranked hypotheses

1. No recorded failure was found for SH.SALES.

- Searched DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_OBJECTS, DBA_ERRORS for SH.SALES, in the requested 24h window and (for named jobs/objects) up to 5 latest runs without a time filter.
- Owner scope for compile errors and invalid objects: SH. No matching run history, compiler errors or invalid objects were returned; unavailable views and caps are listed in the evidence.

### Limitations

No additional limitations identified; view failures and caps are reported below.

### Concurrency review

No supported concurrent child-insert path identified from the available source and job evidence.

### Suggested fixes (not executed)

Suggestions for a developer; no changes were run.

- Try a wider window, for example --since 30d, to inspect more history; the latest-run lookup is limited to 5 rows.

- Check the spelling and provide OWNER.JOB_NAME or OWNER.OBJECT_NAME to remove owner ambiguity.

- The job may have been dropped or may belong to an owner this account cannot see; ask the DBA to confirm its owner and retained scheduler history.

### Frame excerpts

### Evidence

Identifier candidate lookup: ok; DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS, DBA_OBJECTS

| CANDIDATE | KIND | OWNER | NAME |
| --- | --- | --- | --- |
| 2 | OBJECT | SH | SALES |

Named scheduler job actions: ok; DBA_SCHEDULER_JOBS

No rows returned; absence is limited to visible evidence.

Jobs referencing SH.SALES (lexical heuristic): ok; DBA_SCHEDULER_JOBS

No rows returned; absence is limited to visible evidence.

Scheduler run history in window: ok; DBA_SCHEDULER_JOB_RUN_DETAILS

No rows returned; absence is limited to visible evidence.

Latest scheduler runs for SH.SALES (regardless of window; max 5): ok; DBA_SCHEDULER_JOB_RUN_DETAILS

No rows returned; absence is limited to visible evidence.

Compile errors in SH: ok; DBA_ERRORS

No rows returned; absence is limited to visible evidence.

Invalid objects in SH: ok; DBA_OBJECTS

No rows returned; absence is limited to visible evidence.

Candidate log tables in SH (listed only): ok; DBA_TABLES

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
| fcx229huagr7s | SELECT ch.channel_desc,        SUM(CASE WHEN t.calendar_year = 2000 THEN 1 ELSE 0 END) AS sales_2000,        SUM(CASE WHEN t.calendar_year = 2001 THEN 1 ELSE 0 END) AS sales_2001 FROM sh.channels ch LEFT JOIN sh.sales s ON s.channel_id = ch.channel_id LEFT JOIN sh.times t ON s.time_id = t.time_id AND t.calendar_year IN (2000, 2001) GROUP BY ch.channel_desc ORDER BY ch.channel_desc | 230111 |
| f3wph2p3s7jhw | SELECT ch.channel_desc,TO_CHAR(ROUND(100*(SUM(CASE WHEN t.calendar_year=2001 THEN s.amount_sold ELSE 0 END)-SUM(CASE WHEN t.calendar_year=2000 THEN s.amount_sold ELSE 0 END))/NULLIF(SUM(CASE WHEN t.calendar_year=2000 THEN s.amount_sold ELSE 0 END),0),2), 'FM999999999990.00') FROM SH.sales s JOIN SH.times t ON t.time_id=s.time_id JOIN SH.channels ch ON ch.channel_id=s.channel_id WHERE t.calendar_year IN (2000,2001) GROUP BY ch.channel_desc ORDER BY ch.channel_desc | 173138.8 |
| 67skf3phgtbtw | SELECT * FROM (SELECT co.country_region,ch.channel_desc,TO_CHAR(ROUND(SUM(s.amount_sold),2), 'FM999999999990.00') revenue FROM SH.sales s JOIN SH.times t ON t.time_id=s.time_id JOIN SH.customers c ON c.cust_id=s.cust_id JOIN SH.countries co ON co.country_id=c.country_id JOIN SH.channels ch ON ch.channel_id=s.channel_id WHERE t.calendar_year=2000 GROUP BY co.country_region,ch.channel_desc ORDER BY SUM(s.amount_sold) DESC,co.country_region,ch.channel_desc) WHERE ROWNUM&lt;=3 | 141498.22702702702 |

SQL insight: V$SQL: ok; V$SQL

| CHILD_NUMBER | PLAN_HASH_VALUE | EXECUTIONS | ELAPSED_TIME | CPU_TIME | BUFFER_GETS | DISK_READS | ROWS_PROCESSED | TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(TO_TIMESTAMP(TRIM(FIRST_LOAD_TIME),'YYYY-MM-DD/HH24:MI:SS'),TO_CHAR(SYSTIMESTAMP,'TZH:TZM'))),'YYYY-MM-DD"T"HH24:MI:SS"Z"') | TO_CHAR(LAST_ACTIVE_TIME,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | SQL_TEXT | TO_CHAR(EXACT_MATCHING_SIGNATURE) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 134784940 | 1 | 230111 | 229438 | 1668 | 0 | 5 | 2026-11-04T20:42:14Z | 2026-11-04T20:42:13Z | SELECT ch.channel_desc,        SUM(CASE WHEN t.calendar_year = 2000 THEN 1 ELSE 0 END) AS sales_2000,        SUM(CASE WHEN t.calendar_year = 2001 THEN 1 ELSE 0 END) AS sales_2001 FROM sh.channels ch LEFT JOIN sh.sales s ON s.channel_id = ch.channel_id LEFT JOIN sh.times t ON s.time_id = t.time_id AND t.calendar_year IN (2000, 2001) GROUP BY ch.channel_desc ORDER BY ch.channel_desc | 5219700212612365545 |

SQL insight: V$SQL_PLAN: ok; V$SQL_PLAN

| ID | PARENT_ID | OPERATION | OPTIONS | OBJECT_OWNER | OBJECT_NAME | OBJECT_TYPE |
| --- | --- | --- | --- | --- | --- | --- |
| 0 |  | SELECT STATEMENT |  |  |  |  |
| 1 | 0 | SORT | GROUP BY |  |  |  |
| 2 | 1 | HASH JOIN | RIGHT OUTER |  |  |  |
| 3 | 2 | TABLE ACCESS | FULL | SH | TIMES | TABLE |
| 4 | 2 | HASH JOIN | OUTER |  |  |  |
| 5 | 4 | TABLE ACCESS | FULL | SH | CHANNELS | TABLE |
| 6 | 4 | PARTITION RANGE | ALL |  |  |  |
| 7 | 6 | TABLE ACCESS | FULL | SH | SALES | TABLE |

SQL insight: DBMS_XPLAN.DISPLAY_CURSOR: ok; DBMS_XPLAN.DISPLAY_CURSOR

| PLAN_TABLE_OUTPUT |
| --- |
| SQL_ID  fcx229huagr7s, child number 0 |
| ------------------------------------- |
| SELECT ch.channel_desc,        SUM(CASE WHEN t.calendar_year = 2000  |
| THEN 1 ELSE 0 END) AS sales_2000,        SUM(CASE WHEN t.calendar_year  |
| = 2001 THEN 1 ELSE 0 END) AS sales_2001 FROM sh.channels ch LEFT JOIN  |
| sh.sales s ON s.channel_id = ch.channel_id LEFT JOIN sh.times t ON  |
| s.time_id = t.time_id AND t.calendar_year IN (2000, 2001) GROUP BY  |
| ch.channel_desc ORDER BY ch.channel_desc |
|   |
| Plan hash value: 134784940 |
|   |
| --------------------------------------------------------------------------------------------------- |
| &#124; Id  &#124; Operation              &#124; Name     &#124; Rows  &#124; Bytes &#124; Cost (%CPU)&#124; Time     &#124; Pstart&#124; Pstop &#124; |
| --------------------------------------------------------------------------------------------------- |
| &#124;   0 &#124; SELECT STATEMENT       &#124;          &#124;       &#124;       &#124;   563 (100)&#124;          &#124;       &#124;       &#124; |
| &#124;   1 &#124;  SORT GROUP BY         &#124;          &#124;     5 &#124;   180 &#124;   563   (7)&#124; 00:00:01 &#124;       &#124;       &#124; |
| &#124;*  2 &#124;   HASH JOIN RIGHT OUTER&#124;          &#124;   918K&#124;    31M&#124;   540   (3)&#124; 00:00:01 &#124;       &#124;       &#124; |
| &#124;*  3 &#124;    TABLE ACCESS FULL   &#124; TIMES    &#124;   731 &#124;  8772 &#124;    18   (0)&#124; 00:00:01 &#124;       &#124;       &#124; |
| &#124;*  4 &#124;    HASH JOIN OUTER     &#124;          &#124;   918K&#124;    21M&#124;   519   (2)&#124; 00:00:01 &#124;       &#124;       &#124; |
| &#124;   5 &#124;     TABLE ACCESS FULL  &#124; CHANNELS &#124;     5 &#124;    65 &#124;     3   (0)&#124; 00:00:01 &#124;       &#124;       &#124; |
| &#124;   6 &#124;     PARTITION RANGE ALL&#124;          &#124;   918K&#124;  9870K&#124;   514   (2)&#124; 00:00:01 &#124;     1 &#124;    28 &#124; |
| &#124;   7 &#124;      TABLE ACCESS FULL &#124; SALES    &#124;   918K&#124;  9870K&#124;   514   (2)&#124; 00:00:01 &#124;     1 &#124;    28 &#124; |
| --------------------------------------------------------------------------------------------------- |
|   |
| Predicate Information (identified by '[REDACTED]' id): |
| --------------------------------------------------- |
|   |
|    2 - access("S"."TIME_ID"="T"."TIME_ID") |
|    3 - filter(("T"."CALENDAR_YEAR"=2000 OR "T"."CALENDAR_YEAR"=2001)) |
|    4 - access("S"."CHANNEL_ID"="CH"."CHANNEL_ID") |
|   |

SQL insight: DBA_TAB_STATISTICS: ok; DBA_TAB_STATISTICS

| STALE_STATS | TO_CHAR(LAST_ANALYZED,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | NUM_ROWS |
| --- | --- | --- |
| NO | 2026-10-27T22:00:28Z | 1826 |

SQL insight: DBA_TAB_STATISTICS: ok; DBA_TAB_STATISTICS

| STALE_STATS | TO_CHAR(LAST_ANALYZED,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | NUM_ROWS |
| --- | --- | --- |
| NO | 2026-10-28T22:00:30Z | 5 |

SQL insight: DBA_TAB_STATISTICS: ok; DBA_TAB_STATISTICS

| STALE_STATS | TO_CHAR(LAST_ANALYZED,'YYYY-MM-DD"T"HH24:MI:SS"Z"') | NUM_ROWS |
| --- | --- | --- |
| NO | 2026-10-27T22:00:29Z | 918843 |

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
SELECT 2 CANDIDATE, 'SH' OWNER_FILTER, 'SALES' NAME_FILTER FROM DUAL)
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
SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE ((JOB_NAME = 'SALES' AND (OWNER = 'SH'))) ORDER BY OWNER, JOB_NAME
```

3. Jobs referencing SH.SALES (lexical heuristic). Look for the job type and entry point; an empty current dictionary result with retained history can mean a dropped or auto-dropped job.

```sql
SELECT OWNER, JOB_NAME, JOB_TYPE, JOB_ACTION FROM DBA_SCHEDULER_JOBS WHERE INSTR(UPPER(JOB_ACTION), 'SALES') > 0 ORDER BY OWNER, JOB_NAME
```

4. Scheduler run history in window. Look for FAILED runs, their exact error stack and start time; compare repeated failures with the reported incident window.

```sql
SELECT OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO FROM DBA_SCHEDULER_JOB_RUN_DETAILS WHERE ACTUAL_START_DATE >= SYSTIMESTAMP - NUMTODSINTERVAL(24, 'HOUR') AND ((OWNER = 'SH' AND JOB_NAME = 'SALES')) ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC
```

5. Latest scheduler runs for SH.SALES (regardless of window; max 5). These are the latest retained runs without a time filter, capped at 5; check OUTSIDE_WINDOW and the last-run timestamp before treating an old failure as current.

```sql
SELECT OWNER, JOB_NAME, STATUS, ERROR#, ACTUAL_START_DATE, ADDITIONAL_INFO, CASE WHEN ACTUAL_START_DATE < SYSTIMESTAMP - NUMTODSINTERVAL(24, 'HOUR') THEN 1 ELSE 0 END AS OUTSIDE_WINDOW FROM DBA_SCHEDULER_JOB_RUN_DETAILS WHERE JOB_NAME = 'SALES' AND OWNER = 'SH' ORDER BY ACTUAL_START_DATE DESC NULLS LAST, LOG_ID DESC
```

6. Compile errors in SH. Look for compiler line/position and messages naming the failing object or its dependencies.

```sql
SELECT OWNER, NAME, TYPE, LINE, POSITION, TEXT FROM DBA_ERRORS WHERE OWNER = 'SH' ORDER BY NAME, TYPE, SEQUENCE
```

7. Invalid objects in SH. Look for INVALID status on the failing unit or a dependency and compare LAST_DDL_TIME with the incident.

```sql
SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, LAST_DDL_TIME FROM DBA_OBJECTS WHERE OWNER = 'SH' AND STATUS = 'INVALID' ORDER BY OBJECT_NAME, OBJECT_TYPE
```

8. Candidate log tables in SH (listed only). Look for plausible application log names; only explicitly configured log tables may be read.

```sql
SELECT OWNER, TABLE_NAME FROM DBA_TABLES WHERE OWNER = 'SH' AND (TABLE_NAME LIKE '%LOG%' OR TABLE_NAME LIKE '%ERROR%') ORDER BY TABLE_NAME
```

9. Alert log ORA-12012 job discovery in window. Compare codes, incident metadata and timestamps; a ±10 minute match alone does not establish causation. SQL binds: {"fromTime":"2026-11-04T17:09:44.469+00:00","toTime":"2026-11-05T17:09:44.469+00:00","maxLevel":8,"marker0":"ORA-","marker1":"TNS-","marker2":"ERRORS IN FILE","marker3":"INCIDENT=","marker4":"DEADLOCK","code0":"(^|[^A-Z0-9_])ORA-0*12012([^0-9]|$)","fetchLimit":51}

```sql
SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT FROM V$DIAG_ALERT_EXT WHERE ORIGINATING_TIMESTAMP >= TO_TIMESTAMP_TZ(:fromTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND ORIGINATING_TIMESTAMP < TO_TIMESTAMP_TZ(:toTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND (MESSAGE_LEVEL <= 8 OR INSTR(UPPER(MESSAGE_TEXT), :marker0) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker1) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker2) > 0 OR INSTR(UPPER(MESSAGE_TEXT), :marker3) > 0 OR INSTR(UPPER(MESSAGE_TEXT), 'DEADLOCK') > 0) AND (REGEXP_LIKE(UPPER(MESSAGE_TEXT), :code0)) ORDER BY ORIGINATING_TIMESTAMP DESC, RECORD_ID DESC FETCH FIRST 51 ROWS ONLY
```

10. ADR incidents in triage window. Compare codes, incident metadata and timestamps; a ±10 minute match alone does not establish causation. SQL binds: {"fromTime":"2026-11-04T17:09:46.252+00:00","toTime":"2026-11-05T17:09:46.252+00:00","fetchLimit":51}

```sql
SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG_PROBLEM p ON p.PROBLEM_ID = i.PROBLEM_ID AND p.CON_ID = i.CON_ID WHERE i.CREATE_TIME >= TO_TIMESTAMP_TZ(:fromTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') AND i.CREATE_TIME < TO_TIMESTAMP_TZ(:toTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') ORDER BY i.CREATE_TIME DESC, i.INCIDENT_ID DESC FETCH FIRST 51 ROWS ONLY
```

11. Excluded session-user diagnostic SQL. Look for failures or object diagnostics inside the requested time window; check visibility and cap markers before treating an empty result as absence.

```sql
SELECT COUNT(DISTINCT s.SQL_ID) FROM V$SQL s WHERE s.PARSING_SCHEMA_NAME = SYS_CONTEXT('USERENV', 'SESSION_USER') AND s.EXECUTIONS > 0 AND s.LAST_ACTIVE_TIME >= SYSDATE - 24 / 24 AND s.LAST_ACTIVE_TIME <= SYSDATE AND EXISTS (SELECT 1 FROM V$SQL_PLAN p WHERE p.SQL_ID = s.SQL_ID AND p.CHILD_NUMBER = s.CHILD_NUMBER AND ((p.OBJECT_OWNER = 'SH' AND p.OBJECT_NAME = 'SALES')))
```

12. Top SQL referencing issue objects (cursor-cache cumulative time per execution). Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"hours":24,"owner0":"SH","name0":"SALES"}

```sql
SELECT s.SQL_ID, MIN(s.SQL_TEXT) SQL_TEXT, SUM(s.ELAPSED_TIME) / SUM(s.EXECUTIONS) ELAPSED_PER_EXEC FROM V$SQL s WHERE s.PARSING_SCHEMA_NAME <> SYS_CONTEXT('USERENV', 'SESSION_USER') AND s.EXECUTIONS > 0 AND s.LAST_ACTIVE_TIME >= SYSDATE - 24 / 24 AND s.LAST_ACTIVE_TIME <= SYSDATE AND EXISTS (SELECT 1 FROM V$SQL_PLAN p WHERE p.SQL_ID = s.SQL_ID AND p.CHILD_NUMBER = s.CHILD_NUMBER AND ((p.OBJECT_OWNER = 'SH' AND p.OBJECT_NAME = 'SALES'))) GROUP BY s.SQL_ID ORDER BY ELAPSED_PER_EXEC DESC, s.SQL_ID FETCH FIRST 3 ROWS ONLY
```

13. SQL insight: V$SQL. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fcx229huagr7s"}

```sql
SELECT CHILD_NUMBER, PLAN_HASH_VALUE, EXECUTIONS, ELAPSED_TIME, CPU_TIME, BUFFER_GETS, DISK_READS, ROWS_PROCESSED, TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(TO_TIMESTAMP(TRIM(FIRST_LOAD_TIME), 'YYYY-MM-DD/HH24:MI:SS'), TO_CHAR(SYSTIMESTAMP, 'TZH:TZM'))), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), TO_CHAR(LAST_ACTIVE_TIME, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), SQL_TEXT, TO_CHAR(EXACT_MATCHING_SIGNATURE) FROM V$SQL WHERE SQL_ID = :id ORDER BY CHILD_NUMBER
```

14. SQL insight: V$SQL_PLAN. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fcx229huagr7s","child":0}

```sql
SELECT ID, PARENT_ID, OPERATION, OPTIONS, OBJECT_OWNER, OBJECT_NAME, OBJECT_TYPE FROM V$SQL_PLAN WHERE SQL_ID = :id AND CHILD_NUMBER = 0 ORDER BY ID
```

15. SQL insight: DBMS_XPLAN.DISPLAY_CURSOR. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fcx229huagr7s","child":0}

```sql
SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, 0, 'TYPICAL'))
```

16. SQL insight: DBA_TAB_STATISTICS. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"owner":"SH","name":"TIMES"}

```sql
SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM DBA_TAB_STATISTICS WHERE OWNER = 'SH' AND TABLE_NAME = 'TIMES' AND PARTITION_NAME IS NULL
```

17. SQL insight: DBA_TAB_STATISTICS. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"owner":"SH","name":"CHANNELS"}

```sql
SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM DBA_TAB_STATISTICS WHERE OWNER = 'SH' AND TABLE_NAME = 'CHANNELS' AND PARTITION_NAME IS NULL
```

18. SQL insight: DBA_TAB_STATISTICS. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"owner":"SH","name":"SALES"}

```sql
SELECT STALE_STATS, TO_CHAR(LAST_ANALYZED, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NUM_ROWS FROM DBA_TAB_STATISTICS WHERE OWNER = 'SH' AND TABLE_NAME = 'SALES' AND PARTITION_NAME IS NULL
```

19. SQL insight: DBA_SQL_PLAN_BASELINES. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"signature":"5219700212612365545"}

```sql
SELECT SQL_HANDLE, PLAN_NAME, ENABLED, ACCEPTED FROM DBA_SQL_PLAN_BASELINES WHERE SIGNATURE = TO_NUMBER(:signature)
```

20. SQL insight: DBA_SQL_PROFILES. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"signature":"5219700212612365545"}

```sql
SELECT NAME, STATUS, TYPE FROM DBA_SQL_PROFILES WHERE SIGNATURE = TO_NUMBER(:signature)
```

21. SQL insight: V$SQL_BIND_CAPTURE. Compare cursor-cache plans, cumulative per-execution metrics and object statistics; cached timing differences are diagnostic leads, not proof of causation. SQL binds: {"id":"fcx229huagr7s"}

```sql
SELECT CHILD_NUMBER, NAME, POSITION, DATATYPE_STRING, WAS_CAPTURED FROM V$SQL_BIND_CAPTURE WHERE SQL_ID = :id ORDER BY CHILD_NUMBER, POSITION
```
