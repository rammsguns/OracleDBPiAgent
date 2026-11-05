# WP-19B: SQL triage and agent integration

Implemented on `wp-19b-sql-triage`, based on merged WP-19A. No shared contract changes are needed.

## Behavior

`triageIssue` now attaches `sql` evidence for a validated SQL_ID, or for slow/slowness/timeout/“takes long” plus a resolved object. Existing name discovery resolves unqualified object names. Object discovery reads at most three SQL_IDs, ranked by execution-weighted cumulative elapsed time per execution, with matching child-plan object owner/name and last-active time inside the requested window. Insight is read for the first candidate.

The local session adapter records every actual SQL insight query as a triage `Check`, preserving exact SQL, binds, rows, caps, errors and the existing hash-only audit behavior. It reuses the bounded triage reader. Missing views and unexpected query failures degrade to unavailable evidence; failed views are queried once per collection. The core's DBA-to-ALL fallback still works. Cache misses say “SQL not in cursor cache”. No captured bind values are selected. SQL findings precede other diagnostic leads and carry their own verify-next SQL/binds, displayed and never executed. `/triage` uses the existing shared renderer automatically; old results without `sql` still render.

Only DBMS_XPLAN rejection messages changed in SQL policy. They show `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('<sql_id>', <child>, 'TYPICAL'))`. The normalized source hash test proves the policy remains byte-identical to 19A apart from those messages. The existing default prompt/tool snapshot test passes without fixture changes.

Changed files:

- `src/triage/sqlperf.ts`: optional collection, candidate lookup and SQL hypotheses.
- `src/triage/index.ts`: collection, ranking and Markdown; local `Hypothesis.verifyNext` is optional.
- `src/oracle/sqlPolicy.ts`: rejection text only.
- `tests/unit/triage-sqlperf.test.ts`: fixtures, resilience, integration wiring, legacy rendering and policy source snapshot.
- `tests/integration/triage-sqlperf.test.ts`: p1 object and text-discovered SQL_ID triage, no LLM.
- `docs/wp-19b-sql-triage.md`: this handoff and live output.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 78 files passed, 1,166 tests passed (including byte-identical default prompt/tool snapshot).
- `npm run test:browser`: 38 passed, 2 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/triage-sqlperf.test.ts`: 1 file passed, 1 test passed, no skips.
- `git diff --check`: passed.

Only the added integration file was run. No LLM requests, health checks, evals or full integration suite were run. The coordinator's Phase 19B A/B gate remains unverified because Strata is reserved. Missing grants, unexpected failures, cache misses, multiple plans, nested-loop scans and high child counts were verified with fixtures; the live cursor had one plan hash. Existing browser coverage ran; the separate WP-19C web SQL panel is outside this package.

## Live p1 smoke (2026-11-05)

Both commands used the configured `p1-19c-prod` target with HARNESS_RO, Oracle 19c, approved secret directory, default `24h` window, no `--summarize` and no LLM. Output below is the verbatim SQL section, SQL hypotheses and candidate evidence extracted from CLI stdout; unrelated scheduler/alert/graph output is omitted. SQL text in evidence can include existing cached application writes; none of those statements was executed by this smoke. Timing is cumulative across the cursor lifetime, not elapsed time measured only inside the incident window. Stale statistics are a diagnostic lead, not proof of the cause.

### Slow object issue

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- triage --target p1-19c-prod --issue 'orders query slow on SHOPAPP.ORDERS'
```

Exit 0. Three candidates were returned; the first was a cached diagnostic SELECT referencing ORDERS. There is deliberately no parsing-schema or SELECT-only candidate restriction in the approved lookup.

````markdown
Top SQL referencing issue objects (cursor-cache cumulative time per execution): ok; V$SQL / V$SQL_PLAN

| SQL_ID | SQL_TEXT | ELAPSED_PER_EXEC |
| --- | --- | --- |
| fdkzjqg9y6gcx | SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY) | 192625.91228070174 |
| g5hr2v02ur0qy | UPDATE ORDERS SET STATUS = 'SHIPPED' WHERE STATUS = 'NEW' AND ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '2' MINUTE | 8500.076190476191 |
| 54x8br9b0szpk | INSERT INTO ORDERS (CUSTOMER_ID) VALUES (TRUNC(DBMS_RANDOM.VALUE(1, 50001))) RETURNING ORDER_ID INTO :O0  | 168.06731034482758 |

### SQL performance

ok

# SQL insight: p1-19c-prod / fdkzjqg9y6gcx

ok; all times UTC; elapsed and CPU in microseconds.

SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY)

- children: ok; V$SQL
- plans: ok; DBMS_XPLAN.DISPLAY_CURSOR
- planObjects: ok; V$SQL_PLAN
- planChanges: ok; V$SQL
- tables:SHOPAPP.ORDERS: ok; DBA_TAB_STATISTICS
- indexes:SHOPAPP.ORDER_LINES_PK: ok; DBA_IND_STATISTICS
- tables: ok; DBA_TAB_STATISTICS
- indexes: ok; DBA_IND_STATISTICS
- baselines: ok; DBA_SQL_PLAN_BASELINES
- profiles: ok; DBA_SQL_PROFILES
- binds: ok; V$SQL_BIND_CAPTURE
- mismatches: skipped; V$SQL_SHARED_CURSOR

## children

| child | planHashValue | execs | elapsed | cpu | bufferGets | diskReads | rowsProcessed | elapsedPerExec | cpuPerExec | bufferGetsPerExec | diskReadsPerExec | rowsPerExec | firstLoad | lastActive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 917443222 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-04T23:30:30Z |
| 1 | 917443222 | 56 | 10197391 | 10139517 | 197969 | 0 | 56 | 182096.26785714287 | 181062.80357142858 | 3535.160714285714 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z |

## planChanges

| planHashValue | execs | firstLoad | lastActive | elapsedPerExec |
| --- | --- | --- | --- | --- |
| 917443222 | 57 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z | 192625.91228070174 |

## tables

| owner | name | stale | lastAnalyzed | numRows | status | view |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDERS | true | 2026-11-04T22:00:07Z | 470650 | ok | DBA_TAB_STATISTICS |

## indexes

| owner | name | stale | lastAnalyzed | numRows | status | view |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDER_LINES_PK | true | 2026-11-04T22:00:10Z | 1412103 | ok | DBA_IND_STATISTICS |

## baselines

No rows returned.

## profiles

No rows returned.

## binds

No rows returned.

## mismatches

No rows returned.

## findings

| label | view | columns | rows | status | sql | binds | truncated | attempts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stale or missing statistics | DBA_TAB_STATISTICS | ["owner","name","stale","lastAnalyzed"] | [["SHOPAPP","ORDERS",true,"2026-11-04T22:00:07Z"]] | ok |  | {} | false | [] |
| Stale or missing statistics | DBA_IND_STATISTICS | ["owner","name","stale","lastAnalyzed"] | [["SHOPAPP","ORDER_LINES_PK",true,"2026-11-04T22:00:10Z"]] | ok |  | {} | false | [] |

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

- DBA_TAB_STATISTICS: owner &#124; name &#124; stale &#124; lastAnalyzed
- SHOPAPP &#124; ORDERS &#124; true &#124; 2026-11-04T22:00:07Z

Verify next (not executed):

```sql
SELECT OWNER, TABLE_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_TAB_STATISTICS WHERE OWNER = :owner AND TABLE_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDERS"}

2. Stale or missing statistics

- DBA_IND_STATISTICS: owner &#124; name &#124; stale &#124; lastAnalyzed
- SHOPAPP &#124; ORDER_LINES_PK &#124; true &#124; 2026-11-04T22:00:10Z

Verify next (not executed):

```sql
SELECT OWNER, INDEX_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_IND_STATISTICS WHERE OWNER = :owner AND INDEX_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDER_LINES_PK"}
````

### Text discovery and explicit SQL_ID issue

Found the live SQL_ID through this read-only query using a text bind, not a hard-coded ID:

```sql
SELECT SQL_ID, SQL_TEXT FROM V$SQL
WHERE SQL_TEXT LIKE :fragment
ORDER BY LAST_ACTIVE_TIME DESC FETCH FIRST 3 ROWS ONLY
```

Binds: `{"fragment":"SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES%"}`.
The lookup returned two child rows for SQL_ID `fdkzjqg9y6gcx`, both with text:

```sql
SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT < SYSTIMESTAMP - INTERVAL '7' DAY)
```

Then ran:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- triage --target p1-19c-prod --issue 'Why is SQL_ID fdkzjqg9y6gcx slow?'
```

Exit 0. The explicit-ID path skipped candidate selection, retained both cursor children and the cached plan, and produced the same stale-statistics leads. Output:

````markdown
### SQL performance

ok

# SQL insight: p1-19c-prod / fdkzjqg9y6gcx

ok; all times UTC; elapsed and CPU in microseconds.

SELECT COUNT(*) AS CHILD_ROWS FROM SHOPAPP.ORDER_LINES c WHERE EXISTS (SELECT 1 FROM SHOPAPP.ORDERS p WHERE c.ORDER_ID = p.ORDER_ID AND p.ORDERED_AT &lt; SYSTIMESTAMP - INTERVAL '7' DAY)

- children: ok; V$SQL
- plans: ok; DBMS_XPLAN.DISPLAY_CURSOR
- planObjects: ok; V$SQL_PLAN
- planChanges: ok; V$SQL
- tables:SHOPAPP.ORDERS: ok; DBA_TAB_STATISTICS
- indexes:SHOPAPP.ORDER_LINES_PK: ok; DBA_IND_STATISTICS
- tables: ok; DBA_TAB_STATISTICS
- indexes: ok; DBA_IND_STATISTICS
- baselines: ok; DBA_SQL_PLAN_BASELINES
- profiles: ok; DBA_SQL_PROFILES
- binds: ok; V$SQL_BIND_CAPTURE
- mismatches: skipped; V$SQL_SHARED_CURSOR

## children

| child | planHashValue | execs | elapsed | cpu | bufferGets | diskReads | rowsProcessed | elapsedPerExec | cpuPerExec | bufferGetsPerExec | diskReadsPerExec | rowsPerExec | firstLoad | lastActive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 917443222 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 782286 | 781073 | 5774 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-04T23:30:30Z |
| 1 | 917443222 | 56 | 10197391 | 10139517 | 197969 | 0 | 56 | 182096.26785714287 | 181062.80357142858 | 3535.160714285714 | 0 | 1 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z |

## planChanges

| planHashValue | execs | firstLoad | lastActive | elapsedPerExec |
| --- | --- | --- | --- | --- |
| 917443222 | 57 | 2026-11-04T23:30:30Z | 2026-11-05T15:01:38Z | 192625.91228070174 |

## tables

| owner | name | stale | lastAnalyzed | numRows | status | view |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDERS | true | 2026-11-04T22:00:07Z | 470650 | ok | DBA_TAB_STATISTICS |

## indexes

| owner | name | stale | lastAnalyzed | numRows | status | view |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDER_LINES_PK | true | 2026-11-04T22:00:10Z | 1412103 | ok | DBA_IND_STATISTICS |

## baselines

No rows returned.

## profiles

No rows returned.

## binds

No rows returned.

## mismatches

No rows returned.

## findings

| label | view | columns | rows | status | sql | binds | truncated | attempts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stale or missing statistics | DBA_TAB_STATISTICS | ["owner","name","stale","lastAnalyzed"] | [["SHOPAPP","ORDERS",true,"2026-11-04T22:00:07Z"]] | ok |  | {} | false | [] |
| Stale or missing statistics | DBA_IND_STATISTICS | ["owner","name","stale","lastAnalyzed"] | [["SHOPAPP","ORDER_LINES_PK",true,"2026-11-04T22:00:10Z"]] | ok |  | {} | false | [] |

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

- DBA_TAB_STATISTICS: owner &#124; name &#124; stale &#124; lastAnalyzed
- SHOPAPP &#124; ORDERS &#124; true &#124; 2026-11-04T22:00:07Z

Verify next (not executed):

```sql
SELECT OWNER, TABLE_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_TAB_STATISTICS WHERE OWNER = :owner AND TABLE_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDERS"}

2. Stale or missing statistics

- DBA_IND_STATISTICS: owner &#124; name &#124; stale &#124; lastAnalyzed
- SHOPAPP &#124; ORDER_LINES_PK &#124; true &#124; 2026-11-04T22:00:10Z

Verify next (not executed):

```sql
SELECT OWNER, INDEX_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_IND_STATISTICS WHERE OWNER = :owner AND INDEX_NAME = :name
```
Binds: {"owner":"SHOPAPP","name":"ORDER_LINES_PK"}

3. Network or parallel worker communication failure is a diagnostic lead.

- 2026-11-04T19:12:02.692Z to 2026-11-04T19:12:02.692Z (count 1): TNS-00507: Connection closed

4. Network or parallel worker communication failure is a diagnostic lead.

- 2026-11-04T19:12:02.692Z to 2026-11-04T19:12:02.692Z (count 1): TNS-12537: TNS:connection closed
````
