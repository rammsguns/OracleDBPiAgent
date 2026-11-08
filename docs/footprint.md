# Probe footprint (Oracle 19c, 2026-11-08T15:15:23.191Z)
Measured deterministic collector entrypoints sequentially (CLI formatting, audit-file writes and history persistence excluded) with the product read-only accounts on scaled C1/PIPDB1, d1 and p1 under their running workloads. No LLM calls. Connection setup, account/version gates, timestamp metadata probes, rewritten timestamp SELECTs, read-only transaction statements and cleanup are included in command wall time. The SQL ledger includes each issued statement, execute-call client time and any Oracle failure code; V$SQL child counters are aggregated by SQL_ID after sessions close. Rows are ROWS_PROCESSED (including the extra truncation sentinel), parses are PARSE_CALLS, and database elapsed/CPU are microseconds in the JSON. Client execute timing excludes later fetch and cleanup; command wall time includes them.
Reproduce: `PIAGENT_SECRET_DIR=/private/secrets npx tsx tests/helpers/measure-footprint.ts`, then `npx tsx tests/helpers/render-footprint.ts`. Optional positional target names restrict the run. See [raw final ledger](footprint-results.json) and [baseline ledger](footprint-baseline.json). SQL previews in the counter ledger are capped at 700 characters; the statement inventory retains full fixed SQL and contains no bind values or credentials.
Measurement uses an opt-in provider instrumentation argument: a unique leading SQL comment per command isolates its cursors, including initial account checks and date wrappers. C1 counter reads use SYS via docker exec OS authentication in oracle19c-cdb/PIPDB1 only. d1/p1 counter reads use the product account's granted V$SQL. No flush/reset, tracing, AWR/ASH or new grants. PARSING_SCHEMA_NAME changes with CURRENT_SCHEMA, so it must not be filtered to the login name. Observers use separate untagged sessions and are excluded. Tags create fresh parent cursors: these results include hard-parse overhead, rather than representing a purely warm steady state. Noncached ALTER/transaction statements and failed parses can lack V$SQL rows; their client timing/error remains in the inventory. Cursor aging can undercount counters; measurements are short, and every budget test rejects an empty capture.
Scope: top samples five seconds (included in wall time); drift includes self-comparison of all six scopes (schema/objects use the target default schema); report explicitly selects every available section, including optional security/sessions/space/backup/jobs. Other commands use defaults, and alertlog includes incidents. Tools are called directly without an agent/LLM. list_targets performs no SQL. get_source uses existing C1 BULKAPP.CURSOR_CHURN and a missing procedure on d1/p1; explain_plan prepares a tagged SELECT 1 and looks up its cached SQL_ID to avoid cache-aging failures; this preparation is conservatively included in the tool total. Arbitrary run_query SQL and input-dependent error hints cannot have a fixed footprint and are excluded; optional missing-grant fallback branches are measured only when encountered. Budgets do not certify every possible flag combination or a production-sized deployment.
All sessions now advertise MODULE=piagent and ACTION=the command/tool name (targets check for preflight). Nested collectors retain their outer command action. Labels are sent through driver end-to-end attributes, without package EXECUTE grants or an extra PL/SQL call. Public query limits are unchanged.
## Changes supported by measurements
The PUBLIC grants query's OR combined SYS package checks with application object checks and prevented effective owner/name filtering. Two disjoint UNION ALL branches retain the rows/order and enable predicate pushdown. The account-lifecycle object count now restricts owners to the non-Oracle-maintained users actually consumed by that check. Live equivalence tests compare the grant rewrite with the original on all three targets.
Top formerly rescanned/sorted V$SQLSTATS for every 200-row OFFSET page, up to 100 queries per interval. d1 baseline consumed 26.6 seconds database elapsed in 98 OFFSET executions (34.4 seconds wall including the five-second sample). A provider-private fixed-query capability now fetches at most 10,001 rows through one cursor per snapshot, retaining the existing 10,000-row output bound, sentinel, truncation warning and delta semantics. Third-party session adapters retain bounded paging. No filter excludes workload cursors.
Whole-database jobs/security checks legitimately cover multiple owners; default space lists top segments across application owners. Those scans remain where filtering would remove findings. Sessions resolves object IDs from current locks/waits; an attempted join rewrite/hint did not reduce measured gets and was discarded.
## Budgets
These are C1 integration regression ceilings with headroom for live workload and fresh parse overhead, not Oracle guarantees. Top's sampling duration must be added when choosing a duration other than five seconds. The same proposed ceilings are compared with measured d1/p1 values below; a busy production instance needs its own baseline.
| Command | Wall ceiling ms | Buffer-get ceiling |
|---|---:|---:|
| check | 20,000 | 200,000 |
| backup | 10,000 | 15,000 |
| jobs | 15,000 | 75,000 |
| top | 30,000 | 15,000 |
| space | 15,000 | 150,000 |
| sessions | 10,000 | 100,000 |
| security | 15,000 | 150,000 |
| alertlog | 10,000 | 20,000 |
| drift | 90,000 | 1,000,000 |
| report | 45,000 | 350,000 |
| targets check | 30,000 | 25,000 |

Fixed tools: proposed 15,000 ms / 150,000 gets per call (health_check uses the check ceiling; list_targets has zero DB work). The integration test enforces command wall/get ceilings on C1 and asserts exactly two top cursor executions. It skips only for missing secrets or an unavailable C1 listener/PDB; missing Docker/SYS observation or query failures fail the test.
## Command and fixed-tool totals
| Target | Command/tool | Wall ms | DB elapsed ms | CPU ms | Gets | Disk reads | Parses | Rows |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| c1-19c-pdb | check | 5,247.5 | 4,488.8 | 4,436.9 | 84,840 | 0 | 62 | 710 |
| c1-19c-pdb | backup | 1,044.9 | 879.8 | 858.7 | 369 | 0 | 26 | 239 |
| c1-19c-pdb | jobs | 2,526.3 | 2,264.2 | 2,248.2 | 15,072 | 0 | 19 | 616 |
| c1-19c-pdb | top | 6,848.3 | 1,224 | 1,215.2 | 271 | 0 | 9 | 9,337 |
| c1-19c-pdb | space | 2,877.6 | 2,712.3 | 2,687.3 | 28,174 | 2 | 22 | 224 |
| c1-19c-pdb | sessions | 1,724 | 1,561.2 | 1,545.6 | 31,248 | 0 | 15 | 375 |
| c1-19c-pdb | security | 3,326 | 3,100.1 | 3,132.8 | 25,441 | 0 | 74 | 3,753 |
| c1-19c-pdb | alertlog | 2,049.8 | 1,846.8 | 1,841.2 | 511 | 0 | 14 | 279 |
| c1-19c-pdb | drift | 18,483.7 | 16,267.4 | 15,823.1 | 343,576 | 0 | 234 | 6,660 |
| c1-19c-pdb | report | 14,929.2 | 12,364.5 | 12,360.8 | 104,831 | 0 | 257 | 7,267 |
| c1-19c-pdb | targets check | 10,501.8 | 10,155.7 | 10,042.9 | 4,990 | 2 | 120 | 137 |
| c1-19c-pdb | health_check | 5,000.2 | 4,612.8 | 4,552.9 | 90,017 | 0 | 63 | 723 |
| c1-19c-pdb | list_targets | 4.4 | 0 | 0 | 0 | 0 | 0 | 0 |
| c1-19c-pdb | db_overview | 1,025 | 925.5 | 916.8 | 324 | 0 | 13 | 143 |
| c1-19c-pdb | list_schemas | 1,894.7 | 1,792.3 | 1,787.2 | 38,920 | 0 | 7 | 141 |
| c1-19c-pdb | list_objects | 841.9 | 756.3 | 751.3 | 1,754 | 0 | 7 | 153 |
| c1-19c-pdb | describe_object | 2,869 | 4,171.7 | 3,189.7 | 860 | 0 | 10 | 160 |
| c1-19c-pdb | get_source | 1,335.3 | 1,468.8 | 1,365.5 | 463 | 0 | 14 | 142 |
| c1-19c-pdb | explain_plan | 2,154.7 | 1,920 | 1,911.3 | 656 | 0 | 15 | 289 |
| c1-19c-pdb | top_sql | 771 | 687.9 | 682.7 | 259 | 0 | 7 | 147 |
| c1-19c-pdb | session_activity | 1,064.7 | 958 | 952 | 277 | 0 | 7 | 138 |
| c1-19c-pdb | wait_events | 932.4 | 819.1 | 814.6 | 260 | 0 | 7 | 147 |
| c1-19c-pdb | tablespace_usage | 940.1 | 837.6 | 833 | 345 | 0 | 7 | 143 |
| d1-19c-lab | check | 4,404.2 | 4,068.9 | 4,008.8 | 66,373 | 0 | 61 | 5,142 |
| d1-19c-lab | backup | 555.4 | 422.1 | 403.8 | 3,080 | 0 | 26 | 4,847 |
| d1-19c-lab | jobs | 2,132.5 | 1,949.1 | 1,930.7 | 21,731 | 0 | 19 | 4,824 |
| d1-19c-lab | top | 7,726.2 | 2,099.1 | 2,082.8 | 3,046 | 0 | 9 | 24,739 |
| d1-19c-lab | space | 2,788 | 2,627.5 | 2,608.1 | 33,012 | 0 | 20 | 4,720 |
| d1-19c-lab | sessions | 1,005.5 | 885.5 | 868.6 | 21,031 | 0 | 15 | 4,912 |
| d1-19c-lab | security | 8,257.9 | 7,960.6 | 7,922.5 | 38,706 | 0 | 22 | 8,396 |
| d1-19c-lab | alertlog | 1,823.2 | 1,600.6 | 1,585.6 | 7,156 | 0 | 14 | 9,346 |
| d1-19c-lab | drift | 18,567.9 | 15,322.7 | 15,168.8 | 903,172 | 0 | 220 | 134,538 |
| d1-19c-lab | report | 18,077.7 | 14,405.3 | 14,226.6 | 181,878 | 0 | 202 | 93,175 |
| d1-19c-lab | targets check | 16,160.1 | 15,678 | 15,569.2 | 3,949 | 0 | 127 | 4,673 |
| d1-19c-lab | health_check | 4,403.4 | 4,064.1 | 3,999.4 | 78,704 | 0 | 62 | 5,145 |
| d1-19c-lab | list_targets | 0.8 | 0 | 0 | 0 | 0 | 0 | 0 |
| d1-19c-lab | db_overview | 1,020.6 | 895.3 | 888.1 | 3,080 | 0 | 8 | 4,674 |
| d1-19c-lab | list_schemas | 1,278.2 | 1,161.7 | 1,156.2 | 74,224 | 0 | 7 | 4,683 |
| d1-19c-lab | list_objects | 432.9 | 356 | 350 | 5,057 | 0 | 7 | 4,723 |
| d1-19c-lab | describe_object | 1,408.9 | 1,270.4 | 1,263.3 | 3,630 | 0 | 7 | 4,715 |
| d1-19c-lab | get_source | 1,184.6 | 1,056.2 | 1,047 | 3,070 | 0 | 8 | 4,673 |
| d1-19c-lab | explain_plan | 1,871.6 | 1,608.9 | 1,597.6 | 7,304 | 0 | 15 | 9,361 |
| d1-19c-lab | top_sql | 1,568.2 | 1,444.9 | 1,438.8 | 3,042 | 0 | 7 | 4,683 |
| d1-19c-lab | session_activity | 1,421.2 | 1,307.5 | 1,301.5 | 3,044 | 0 | 7 | 4,676 |
| d1-19c-lab | wait_events | 961.8 | 845.1 | 838.3 | 3,042 | 0 | 7 | 4,683 |
| d1-19c-lab | tablespace_usage | 982.4 | 870.4 | 863.3 | 3,101 | 0 | 7 | 4,677 |
| p1-19c-prod | check | 3,914.3 | 3,569.7 | 3,509.6 | 47,734 | 0 | 61 | 702 |
| p1-19c-prod | backup | 951 | 817.7 | 796.3 | 1,665 | 0 | 26 | 175 |
| p1-19c-prod | jobs | 2,759.5 | 2,527.1 | 2,508.5 | 26,022 | 0 | 19 | 559 |
| p1-19c-prod | top | 6,161.8 | 921 | 911.7 | 1,643 | 0 | 9 | 6,573 |
| p1-19c-prod | space | 3,477.1 | 3,335.9 | 3,313.8 | 39,292 | 0 | 20 | 132 |
| p1-19c-prod | sessions | 1,183 | 1,044.7 | 1,028.8 | 18,859 | 0 | 15 | 338 |
| p1-19c-prod | security | 5,782.9 | 5,513.8 | 5,477.5 | 26,241 | 0 | 22 | 3,707 |
| p1-19c-prod | alertlog | 1,201.4 | 1,040.2 | 1,032.2 | 2,067 | 0 | 14 | 190 |
| p1-19c-prod | drift | 18,650.1 | 16,086.6 | 15,988.9 | 944,699 | 0 | 220 | 5,362 |
| p1-19c-prod | report | 19,938.2 | 16,724.8 | 16,584.7 | 135,220 | 0 | 202 | 6,285 |
| p1-19c-prod | targets check | 10,062.9 | 9,688.2 | 9,589.7 | 2,697 | 0 | 117 | 95 |
| p1-19c-prod | health_check | 3,000.1 | 2,643.9 | 2,582.6 | 47,783 | 0 | 61 | 699 |
| p1-19c-prod | list_targets | 0.4 | 0 | 0 | 0 | 0 | 0 | 0 |
| p1-19c-prod | db_overview | 798.7 | 711.7 | 709.7 | 1,699 | 0 | 8 | 96 |
| p1-19c-prod | list_schemas | 1,047.1 | 954.3 | 950.2 | 11,726 | 0 | 7 | 97 |
| p1-19c-prod | list_objects | 905.9 | 810.9 | 805.7 | 2,984 | 0 | 7 | 107 |
| p1-19c-prod | describe_object | 1,537.9 | 1,441.2 | 1,437.6 | 2,006 | 0 | 7 | 120 |
| p1-19c-prod | get_source | 437.4 | 371.1 | 365.9 | 1,653 | 0 | 8 | 95 |
| c1-19c-pdb | get_source:view | 1,228.2 | 1,209.2 | 1,089.4 | 502 | 0 | 15 | 139 |
| c1-19c-pdb | top_sql:cpu_time | 1,160.8 | 1,056.5 | 1,049.6 | 259 | 0 | 7 | 147 |
| c1-19c-pdb | top_sql:buffer_gets | 1,112.1 | 1,004.2 | 1,000.4 | 259 | 0 | 7 | 147 |
| c1-19c-pdb | top_sql:executions | 884.8 | 782 | 777.6 | 259 | 0 | 7 | 147 |
| d1-19c-lab | get_source:view | 1,045.1 | 907.9 | 899.5 | 3,078 | 0 | 9 | 4,673 |
| d1-19c-lab | top_sql:cpu_time | 1,614.9 | 1,497 | 1,489 | 3,042 | 0 | 7 | 4,683 |
| d1-19c-lab | top_sql:buffer_gets | 1,701.8 | 1,583.6 | 1,576.2 | 3,042 | 0 | 7 | 4,683 |
| d1-19c-lab | top_sql:executions | 1,408.3 | 1,281.1 | 1,274.3 | 3,042 | 0 | 7 | 4,683 |
| p1-19c-prod | explain_plan | 1,708.3 | 1,525.5 | 1,516.4 | 2,215 | 0 | 15 | 205 |
| p1-19c-prod | top_sql | 918.1 | 825.6 | 821.2 | 1,627 | 0 | 7 | 105 |
| p1-19c-prod | session_activity | 846.6 | 756 | 752.5 | 1,629 | 0 | 7 | 98 |
| p1-19c-prod | wait_events | 867 | 772.7 | 768.5 | 1,631 | 0 | 7 | 105 |
| p1-19c-prod | tablespace_usage | 937.5 | 840.4 | 834.6 | 1,715 | 0 | 7 | 100 |
| p1-19c-prod | get_source:view | 947.5 | 846.5 | 840.4 | 1,649 | 0 | 8 | 95 |
| p1-19c-prod | top_sql:cpu_time | 1,013.3 | 914.2 | 908.5 | 1,627 | 0 | 7 | 105 |
| p1-19c-prod | top_sql:buffer_gets | 964.4 | 869.3 | 865.5 | 1,627 | 0 | 7 | 105 |
| p1-19c-prod | top_sql:executions | 1,032.9 | 936.1 | 929.1 | 1,627 | 0 | 7 | 105 |

## Before/after (C1)
Baseline report selected only default sections; final report selects all sections, so those report totals are not an optimization comparison.
| Command | Before gets | After gets | Before wall ms | After wall ms |
|---|---:|---:|---:|---:|
| check | 108,797 | 84,840 | 5,108 | 5,247.5 |
| security | 442,039 | 25,441 | 4,046.9 | 3,326 |
| drift | 1,153,092 | 343,576 | 20,889.9 | 18,483.7 |
| top | 280 | 271 | 9,289.1 | 6,848.3 |

## Five most expensive statements per run
Ranked by database elapsed time (including parse/execute/fetch), not by returned row count. Full SQL and all remaining statements are in the linked JSON inventories. Zero-SQL tools have no rows below.

### c1-19c-pdb — check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bwkz6abgp9372: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 699.5 | 697.6 | 255 | 0 | 1 | 133 |
| 0r1k0wk5hkzvz: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 397.2 | 395.7 | 10,530 | 0 | 1 | 3 |
| 2z5397gzjx1w7: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 372.9 | 370.5 | 37,868 | 0 | 1 | 4 |
| 5fsbgca0920f6: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 328.3 | 326.1 | 249 | 0 | 1 | 3 |
| 64kf0rcgzcn9r: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 327.3 | 326.6 | 30,931 | 0 | 1 | 1 |

### c1-19c-pdb — backup

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 43j2vf6scrvc3: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 670.5 | 669.4 | 242 | 0 | 1 | 133 |
| 2hgcqx3xtzq4g: WITH PIAGENT_WALL_QUERY (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2,PIAGENT_COL_3,PIAGENT_COL_4,PIAGENT_COL_5)  | 29.2 | 28.6 | 10 | 0 | 1 | 0 |
| 04zap94as4q76: SELECT SESSION_KEY, INPUT_TYPE, STATUS, START_TIME, END_TIME, OUTPUT_BYTES FROM V$RMAN_BACKUP_JOB_DETAILS ORDE | 29.2 | 28.1 | 10 | 0 | 1 | 0 |
| 25dx79dkh9htr: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.7 | 11.8 | 6 | 0 | 1 | 1 |
| damy2m724w1mf: SELECT NAME, SPACE_LIMIT, SPACE_USED, SPACE_RECLAIMABLE, NUMBER_OF_FILES FROM V$RECOVERY_FILE_DEST | 11.7 | 10.4 | 8 | 0 | 1 | 1 |

### c1-19c-pdb — jobs

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 82za5vh5ra19r: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 548.3 | 547.1 | 242 | 0 | 1 | 133 |
| 5j7tqf9p2f313: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 499.7 | 497.4 | 10,532 | 0 | 1 | 3 |
| 5fkrr0qsw9rqc: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 334.4 | 332.9 | 228 | 0 | 1 | 3 |
| 2dxcpqd4pjujk: SELECT OWNER, JOB_NAME, ENABLED, STATE, TO_CHAR(LAST_START_DATE, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') LAST_ST | 246.4 | 245.4 | 102 | 0 | 1 | 25 |
| dpba060tm607a: SELECT OWNER, INDEX_NAME, TABLE_OWNER, TABLE_NAME, STATUS FROM DBA_INDEXES WHERE STATUS IN ('UNUSABLE', 'INVAL | 239.8 | 239.4 | 2,043 | 0 | 1 | 0 |

### c1-19c-pdb — top

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 8mg8xszy2m6dc: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 701.9 | 700.8 | 242 | 0 | 1 | 133 |
| 0s7cjadpjpa07: SELECT sql_id, elapsed_time, cpu_time, buffer_gets, disk_reads, executions FROM V$SQLSTATS ORDER BY sql_id | 290.9 | 289.8 | 5 | 0 | 1 | 9,136 |
| 6yuz9c8wdrbpc: SELECT name, value FROM V$SYSSTAT WHERE name IN ('user calls', 'session logical reads', 'physical reads', 'red | 192.1 | 190.1 | 5 | 0 | 1 | 14 |
| 227tdbkp4x0q3: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13.2 | 12.7 | 6 | 0 | 1 | 1 |
| bdpmdmq5av8sd: SELECT stat_name, value, cumulative FROM V$OSSTAT ORDER BY stat_name | 12 | 9.6 | 7 | 0 | 1 | 50 |

### c1-19c-pdb — space

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bv6yy7jhtp0hq: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 1,596.7 | 1,595.5 | 27,399 | 2 | 1 | 20 |
| b2uy3uv8x2zwh: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 668.8 | 666.7 | 242 | 0 | 1 | 133 |
| c077yqc1jc4zq: SELECT t.tablespace_name,t.contents,t.bigfile,f.file_name,f.bytes,f.autoextensible,f.maxbytes,NVL(x.free_bytes | 248 | 246.3 | 255 | 0 | 1 | 7 |
| bu9mfp6hppbdw: SELECT file_type,percent_space_used,percent_space_reclaimable,number_of_files FROM v$flash_recovery_area_usage | 41.6 | 39.5 | 32 | 0 | 1 | 8 |
| 31t5ns3zg9hd9: SELECT f.tablespace_name,f.file_name,f.bytes,f.autoextensible,f.maxbytes FROM dba_data_files f JOIN dba_tables | 23.5 | 22 | 46 | 0 | 1 | 1 |

### c1-19c-pdb — sessions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| amh98rapf76w5: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 741.5 | 739.4 | 246 | 0 | 1 | 133 |
| cj5sdpqh701vm: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 380.4 | 379.2 | 30,931 | 0 | 1 | 1 |
| 3mx6sx30jvh2b: SELECT /*+ RULE */ SID, TYPE, LMODE, REQUEST FROM V$LOCK WHERE LMODE > 0 OR REQUEST > 0 ORDER BY SID, TYPE, ID | 223.9 | 223.2 | 16 | 0 | 1 | 57 |
| 80wf34yv136y9: SELECT SESSION_ID, OBJECT_ID, LOCKED_MODE FROM V$LOCKED_OBJECT ORDER BY SESSION_ID, OBJECT_ID | 82.8 | 81.3 | 7 | 0 | 1 | 0 |
| 9fka47q6pbj8m: SELECT SID, SERIAL#, USERNAME, OSUSER, MACHINE, PROGRAM, TYPE, STATUS, SQL_ID, PREV_SQL_ID, EVENT, WAIT_CLASS, | 41.1 | 40.4 | 7 | 0 | 1 | 92 |

### c1-19c-pdb — security

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 4asys1s27f3xu: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 1,472.3 | 1,469.9 | 3,378 | 0 | 1 | 9 |
| 8d418rh344tv2: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 629.4 | 628 | 242 | 0 | 1 | 133 |
| 0fvpy7x3k0vjy: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 288.7 | 273.4 | 16 | 0 | 45 | 2,155 |
| 53661cmvg7qq8: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 140.1 | 138.9 | 18,940 | 0 | 1 | 2 |
| dqf97x7y7uhjd: SELECT D.USERNAME, U.ACCOUNT_STATUS, U.ORACLE_MAINTAINED FROM DBA_USERS_WITH_DEFPWD D JOIN DBA_USERS U ON U.US | 117.8 | 117.2 | 39 | 0 | 1 | 0 |

### c1-19c-pdb — alertlog

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 9rax7whgpg7fy: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,542.3 | 1,539.4 | 484 | 0 | 2 | 266 |
| 3ktatwh1wjkup: SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT, CON_ID FROM V$DIAG_ALERT_EXT WHERE ORI | 262.5 | 261.8 | 5 | 0 | 1 | 5 |
| dakuxtxj2tj59: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13.4 | 13.2 | 6 | 0 | 2 | 2 |
| a56bk3u9nqqfn: SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS, i.CON_ID FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG | 12.5 | 11.1 | 10 | 0 | 1 | 0 |
| 7qcfb9nr0jk56: SELECT PRIVILEGE FROM SESSION_PRIVS | 10.2 | 10.2 | 6 | 0 | 2 | 2 |

### c1-19c-pdb — drift

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| fu243gkvhzx9d: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 5,123.7 | 5,118.9 | 6,766 | 0 | 2 | 18 |
| 9ykwjnz8uzhck: SELECT i.table_name, i.index_name, CASE WHEN REGEXP_LIKE(i.index_name, '^SYS_C[0-9]+$') THEN 'GENERATED NAME'  | 3,471 | 3,466.7 | 644 | 0 | 2 | 22 |
| g9y9646d3mufs: SELECT /*+ RULE */ c.table_name, c.constraint_name, c.generated, c.constraint_type, c.status, c.validated, c.d | 2,789.4 | 2,459.1 | 311,738 | 0 | 14 | 40 |
| c5r7zumbhk80f: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,539.2 | 1,506.8 | 5,294 | 0 | 28 | 3,724 |
| 31jtu9anz49sj: SELECT table_name, temporary, partitioned, iot_type FROM all_tables WHERE owner = :owner ORDER BY table_name | 954.6 | 952.3 | 366 | 0 | 2 | 10 |

### c1-19c-pdb — report

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| dqcp9h2mxqhsv: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 1,871.6 | 1,869.9 | 3,378 | 0 | 1 | 9 |
| azz2sv732rf4x: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 1,810.1 | 1,808.5 | 27,415 | 0 | 1 | 20 |
| 41cz5tgxrffqw: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,626.5 | 1,601.2 | 3,629 | 0 | 19 | 2,527 |
| amqa2p07sptj8: SELECT p.index_owner, p.index_name, p.partition_name, p.status FROM all_ind_partitions p JOIN all_indexes i ON | 725.9 | 724.1 | 248 | 0 | 1 | 1 |
| 2thk2q16vy76y: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 482.3 | 480.1 | 10,528 | 0 | 1 | 3 |

### c1-19c-pdb — targets check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 97u7pwyvw4zkr: SELECT 1 FROM USER_TAB_PRIVS WHERE ROWNUM = 0 | 2,905.5 | 2,903.2 | 23 | 0 | 1 | 0 |
| 096kxbj81bhzr: SELECT 1 FROM DBA_TAB_COL_STATISTICS WHERE ROWNUM = 0 | 795.2 | 793.8 | 547 | 2 | 1 | 0 |
| a681v7z7t4f4u: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 770 | 768.9 | 254 | 0 | 1 | 133 |
| 9gdrshp7ac8xj: SELECT 1 FROM ALL_TAB_STATISTICS WHERE ROWNUM = 0 | 673.6 | 672.3 | 182 | 0 | 1 | 0 |
| fqufn4qgb16gx: SELECT 1 FROM DBA_TAB_COLUMNS WHERE ROWNUM = 0 | 642 | 640.1 | 37 | 0 | 1 | 0 |

### c1-19c-pdb — health_check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 1fdj3qw6zrfrm: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 634.9 | 633.6 | 242 | 0 | 1 | 133 |
| b1d1v4423sqf1: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 488 | 486.4 | 10,528 | 0 | 1 | 3 |
| 6g5gt939bv04b: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 408.8 | 406.8 | 37,868 | 0 | 1 | 4 |
| 6jqk753ngtyqw: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 360.1 | 358.8 | 30,931 | 0 | 1 | 1 |
| gvbux1uf38zrr: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 322.7 | 320.7 | 232 | 0 | 1 | 3 |

### c1-19c-pdb — list_targets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|

### c1-19c-pdb — db_overview

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 6pp4njw75ud5m: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 799.5 | 797.8 | 242 | 0 | 1 | 133 |
| b116mprpzvwwm: SELECT SUM(bytes) FROM dba_data_files | 34.3 | 32.8 | 33 | 0 | 1 | 1 |
| b8vfrcrjmbkxc: SELECT value FROM v$pgastat WHERE name='total PGA allocated' | 26.4 | 25.8 | 5 | 0 | 1 | 1 |
| ap7r6yms331dr: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13.8 | 13.6 | 6 | 0 | 1 | 1 |
| 23v6r786wup3h: SELECT name, cdb FROM v$database | 12.5 | 11.7 | 6 | 0 | 1 | 1 |

### c1-19c-pdb — list_schemas

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 1mws8zczz5v6s: SELECT u.username, (SELECT COUNT(*) FROM dba_objects o WHERE o.owner=u.username) object_count, (SELECT SUM(byt | 997.1 | 994.8 | 38,666 | 0 | 1 | 4 |
| a5p526vh6u7nr: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 769.2 | 768.7 | 242 | 0 | 1 | 133 |
| 1p1aszfhu6qsa: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13.5 | 13.4 | 6 | 0 | 1 | 1 |
| c1s6j0ybkt099: SELECT PRIVILEGE FROM SESSION_PRIVS | 7.1 | 6.5 | 6 | 0 | 1 | 1 |
| a0qucpa326f9d: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.4 | 1.7 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — list_objects

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 3fd4mkw7x18pf: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 612.5 | 610.6 | 242 | 0 | 1 | 133 |
| 0zf0zx94sp7cy: SELECT owner, object_name, object_type, status FROM all_objects WHERE owner=:owner AND (:object_type IS NULL O | 123 | 121.6 | 1,500 | 0 | 1 | 16 |
| gy8xhp50y1htg: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.9 | 10.9 | 6 | 0 | 1 | 1 |
| 0pszp7w69j655: SELECT PRIVILEGE FROM SESSION_PRIVS | 6 | 5 | 6 | 0 | 1 | 1 |
| fbjm39amtc7zp: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 1.8 | 1.4 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — describe_object

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 08n6dh3fxfmty: SELECT 'COLUMN' kind, column_name name, data_type info, TO_CHAR(data_length) value, column_id position FROM al | 3,529.8 | 2,551.3 | 606 | 0 | 4 | 23 |
| adp1m82n98m4c: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 619.7 | 618.7 | 242 | 0 | 1 | 133 |
| 2p73nz927mrfz: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11.8 | 11.2 | 6 | 0 | 1 | 1 |
| 0gg77v2rf5dpk: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.1 | 5.8 | 6 | 0 | 1 | 1 |
| 1nnjmqwujwcq0: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 1.8 | 1.1 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — get_source

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 37mf6rfrrftbd: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 807.2 | 805.2 | 242 | 0 | 1 | 133 |
| d95s58natbjs8: SELECT type, line, text FROM all_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 367.1 | 328.6 | 141 | 0 | 3 | 0 |
| 24gwxbxz03r5t: SELECT type, line, text FROM dba_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 268.4 | 208.3 | 68 | 0 | 5 | 5 |
| 1myhgqq9bgu29: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13.1 | 12.6 | 6 | 0 | 1 | 1 |
| 7vhzhzbmfjfjv: SELECT PRIVILEGE FROM SESSION_PRIVS | 7.3 | 6.9 | 6 | 0 | 1 | 1 |

### c1-19c-pdb — explain_plan

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 4s6pn3a2ptmpw: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,549.1 | 1,546.3 | 484 | 0 | 2 | 266 |
| 8vud0s3tz9n22: SELECT sql_id FROM v$sql WHERE sql_text=:text AND plan_hash_value<>0 FETCH FIRST 1 ROWS ONLY | 260.4 | 259.2 | 5 | 0 | 1 | 1 |
| 5qgshgr2un28z: SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'TYPICAL')) | 82.6 | 81.8 | 155 | 0 | 1 | 13 |
| ck0tuvdugp631: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13 | 12.9 | 6 | 0 | 2 | 2 |
| grgjx9p5ammpc: SELECT PRIVILEGE FROM SESSION_PRIVS | 9.5 | 8.7 | 6 | 0 | 2 | 2 |

### c1-19c-pdb — top_sql

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 614brt8rz1bzh: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 452.2 | 451.1 | 242 | 0 | 1 | 133 |
| b4gwq2pkpc70j: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 217.3 | 216.3 | 5 | 0 | 1 | 10 |
| 7xbjn2tpsh5v2: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 8.9 | 8.5 | 6 | 0 | 1 | 1 |
| 4uj07jb6u6akf: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.7 | 4.4 | 6 | 0 | 1 | 1 |
| fustyu8krphqs: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.3 | 1.1 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — session_activity

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 6174kam63k7g9: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 669 | 667.5 | 242 | 0 | 1 | 133 |
| 0zxbg3ag3wus7: SELECT s.sid, s.serial#, s.username, s.status, s.sql_id, s.event, s.wait_class, s.seconds_in_wait, s.blocking_ | 264.2 | 263 | 23 | 0 | 1 | 1 |
| fqtbjh3wtskn2: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.4 | 11.5 | 6 | 0 | 1 | 1 |
| b7t13m4vp6v8s: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.9 | 6.6 | 6 | 0 | 1 | 1 |
| 2cyb9jxvgu6a5: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.4 | 1.3 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — wait_events

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 7md16fd62rmhf: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 780.8 | 779.4 | 242 | 0 | 1 | 133 |
| 0f7n3twp2sxh8: SELECT event, wait_class, total_waits, time_waited_micro FROM v$system_event WHERE wait_class<>'Idle' ORDER BY | 13.1 | 12.2 | 6 | 0 | 1 | 10 |
| avshrg9tjfc34: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 13 | 12.7 | 6 | 0 | 1 | 1 |
| ajwpx76qsuff4: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.9 | 6.4 | 6 | 0 | 1 | 1 |
| 9r4abj75wn4jx: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.2 | 1.3 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — tablespace_usage

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bpbgdpaadqw9n: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 742.2 | 740.8 | 242 | 0 | 1 | 133 |
| 1sjc6fy5rj1ys: SELECT d.tablespace_name, d.allocated_bytes, NVL(f.free_bytes,0) free_bytes, d.allocated_bytes-NVL(f.free_byte | 71 | 70.8 | 91 | 0 | 1 | 6 |
| 45fgxuhcsauwb: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.4 | 12.3 | 6 | 0 | 1 | 1 |
| ffnqkr39pfwbn: SELECT PRIVILEGE FROM SESSION_PRIVS | 7.2 | 6.3 | 6 | 0 | 1 | 1 |
| gs5fskpy84jrw: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2 | 1.8 | 0 | 0 | 1 | 1 |

### d1-19c-lab — check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| gryj2p4cpjr6m: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 731.2 | 729 | 3,030 | 0 | 1 | 4,669 |
| 22ytyrrhn7498: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 576.9 | 575.3 | 26,366 | 0 | 1 | 14 |
| 6ws3209r182d2: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 456.4 | 454.5 | 9,344 | 0 | 1 | 2 |
| 9yfhbw0ykmpuy: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 359.1 | 356.7 | 5,431 | 0 | 1 | 3 |
| 7472f15pyauyh: SELECT OWNER, INDEX_NAME, TABLE_OWNER, TABLE_NAME, STATUS FROM DBA_INDEXES WHERE STATUS IN ('UNUSABLE', 'INVAL | 232.7 | 231.1 | 1,841 | 0 | 1 | 0 |

### d1-19c-lab — backup

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 3v54tt08wdnc5: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 335.9 | 334.7 | 3,030 | 0 | 1 | 4,669 |
| c1agsqwbfm6ft: WITH PIAGENT_WALL_QUERY (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2,PIAGENT_COL_3,PIAGENT_COL_4,PIAGENT_COL_5)  | 11.2 | 11 | 2 | 0 | 1 | 0 |
| axm63ts24jp1c: SELECT SESSION_KEY, INPUT_TYPE, STATUS, START_TIME, END_TIME, OUTPUT_BYTES FROM V$RMAN_BACKUP_JOB_DETAILS ORDE | 10.6 | 9.5 | 2 | 0 | 1 | 0 |
| 41zj3vkpvd0m9: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10 | 9.7 | 2 | 0 | 1 | 1 |
| 0n4duy2wq4c0b: SELECT NAME, SPACE_LIMIT, SPACE_USED, SPACE_RECLAIMABLE, NUMBER_OF_FILES FROM V$RECOVERY_FILE_DEST | 5.9 | 4.9 | 2 | 0 | 1 | 0 |

### d1-19c-lab — jobs

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 5sqtvd1k8gchx: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 694.8 | 692.8 | 3,030 | 0 | 1 | 4,669 |
| 1zy5a6vsg3s49: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 445.8 | 444.5 | 9,344 | 0 | 1 | 2 |
| 82wq4g3q9dbw5: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 215.7 | 214.3 | 5,431 | 0 | 1 | 3 |
| fw83xx8jtgrtc: SELECT OWNER, INDEX_NAME, TABLE_OWNER, TABLE_NAME, STATUS FROM DBA_INDEXES WHERE STATUS IN ('UNUSABLE', 'INVAL | 167.5 | 165.7 | 1,841 | 0 | 1 | 0 |
| a5c47db3wdxz6: SELECT OWNER, JOB_NAME, ENABLED, STATE, TO_CHAR(LAST_START_DATE, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') LAST_ST | 119.6 | 119 | 74 | 0 | 1 | 22 |

### d1-19c-lab — top

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 3cwphq5fdy28y: SELECT sql_id, elapsed_time, cpu_time, buffer_gets, disk_reads, executions FROM V$SQLSTATS ORDER BY sql_id | 1,019.2 | 1,015.7 | 2 | 0 | 1 | 20,002 |
| 5dfgjm7mruu7m: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 816.5 | 813.4 | 3,030 | 0 | 1 | 4,669 |
| 2psd1ykw8sj6x: SELECT name, value FROM V$SYSSTAT WHERE name IN ('user calls', 'session logical reads', 'physical reads', 'red | 228.4 | 225 | 2 | 0 | 1 | 14 |
| 71378auv3xytj: SELECT stat_name, value, cumulative FROM V$OSSTAT ORDER BY stat_name | 12.9 | 10.4 | 2 | 0 | 1 | 50 |
| 8mz4hbydjtfcr: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.2 | 9.4 | 2 | 0 | 1 | 1 |

### d1-19c-lab — space

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 05xgd5yqtpq9n: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 1,582 | 1,581.2 | 29,575 | 0 | 1 | 20 |
| gu2u6yrvmd8dt: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 685.1 | 682.6 | 3,030 | 0 | 1 | 4,669 |
| cnrnw6hupzspb: SELECT t.tablespace_name,t.contents,t.bigfile,f.file_name,f.bytes,f.autoextensible,f.maxbytes,NVL(x.free_bytes | 221.3 | 219.9 | 186 | 0 | 1 | 5 |
| 5vfjc9ynbyu5h: SELECT s.sid,s.username,u.sql_id,u.segtype,u.tablespace,u.blocks*t.block_size FROM v$tempseg_usage u JOIN v$se | 31.8 | 29.8 | 80 | 0 | 1 | 8 |
| 2abun789m9u2t: SELECT file_type,percent_space_used,percent_space_reclaimable,number_of_files FROM v$flash_recovery_area_usage | 21.9 | 21.4 | 2 | 0 | 1 | 0 |

### d1-19c-lab — sessions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bkwr0cdra1hvp: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 499.5 | 497.7 | 3,030 | 0 | 1 | 4,669 |
| 9zkdqnx0q3b74: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 150.2 | 149 | 17,975 | 0 | 1 | 2 |
| cxb1xdahaxpky: SELECT /*+ RULE */ SID, TYPE, LMODE, REQUEST FROM V$LOCK WHERE LMODE > 0 OR REQUEST > 0 ORDER BY SID, TYPE, ID | 103.6 | 101.8 | 2 | 0 | 1 | 28 |
| d09ww24nmktww: SELECT SESSION_ID, OBJECT_ID, LOCKED_MODE FROM V$LOCKED_OBJECT ORDER BY SESSION_ID, OBJECT_ID | 38.3 | 36.5 | 2 | 0 | 1 | 0 |
| 419rpk3ufgx2k: SELECT S.SID, S.USERNAME, COALESCE(S.SQL_ID, S.PREV_SQL_ID) SQL_ID, TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(CAST(T.STA | 26.7 | 25.4 | 4 | 0 | 1 | 0 |

### d1-19c-lab — security

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 5fb1g7bdxcgkx: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 2,980.7 | 2,968.5 | 16,881 | 0 | 1 | 2,155 |
| 0d7cqndcs3w96: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 2,341.2 | 2,339.1 | 3,299 | 0 | 1 | 9 |
| 06vjqmmgnzkta: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 1,298.7 | 1,297.2 | 1,579 | 0 | 1 | 201 |
| d0hknvxgyv4dn: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 459.7 | 457.9 | 3,030 | 0 | 1 | 4,669 |
| 9vds3rjkp5x97: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 432.3 | 430.8 | 13,186 | 0 | 1 | 7 |

### d1-19c-lab — alertlog

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 51vp17h5ptssf: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,302.4 | 1,295.7 | 7,134 | 0 | 2 | 9,338 |
| 0jyvf05p7ykzz: SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT, CON_ID FROM V$DIAG_ALERT_EXT WHERE ORI | 260.7 | 260.3 | 2 | 0 | 1 | 0 |
| av0km3c7csgr8: SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS, i.CON_ID FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG | 14.1 | 9.4 | 4 | 0 | 1 | 0 |
| 768kz61csdx5m: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.6 | 10.5 | 2 | 0 | 2 | 2 |
| 9533mguj10cbu: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.7 | 5.7 | 14 | 0 | 2 | 2 |

### d1-19c-lab — drift

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 6t7w13tbfbwjw: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 4,255.9 | 4,252.4 | 6,615 | 0 | 2 | 18 |
| dfx643frgv83u: SELECT i.table_name, i.index_name, CASE WHEN REGEXP_LIKE(i.index_name, '^SYS_C[0-9]+$') THEN 'GENERATED NAME'  | 3,145.3 | 3,141.3 | 1,938 | 0 | 2 | 70 |
| 6vnmp3awma6bv: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 3,138.3 | 3,068.5 | 113,292 | 0 | 28 | 130,732 |
| 97trkpg1g2745: SELECT /*+ RULE */ c.table_name, c.constraint_name, c.generated, c.constraint_type, c.status, c.validated, c.d | 1,468.4 | 1,465 | 755,032 | 0 | 2 | 280 |
| fygk7gh65mk5t: SELECT table_name, temporary, partitioned, iot_type FROM all_tables WHERE owner = :owner ORDER BY table_name | 843.2 | 840.5 | 2,758 | 0 | 2 | 32 |

### d1-19c-lab — report

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bdf8axbhws6zs: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 2,505 | 2,456.6 | 76,545 | 0 | 19 | 88,711 |
| frt1ngk8c58sz: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 2,373.7 | 2,371 | 29,571 | 0 | 1 | 20 |
| cazwct9qavdda: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 1,545.6 | 1,543.9 | 3,299 | 0 | 1 | 9 |
| 4kp69rmfurfq4: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 1,443.2 | 1,432.7 | 16,879 | 0 | 1 | 2,155 |
| 720ubnuk294ur: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 820.5 | 818.7 | 1,579 | 0 | 1 | 201 |

### d1-19c-lab — targets check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| b83q791ksqb03: SELECT 1 FROM AUDIT_UNIFIED_POLICIES WHERE ROWNUM = 0 | 2,431.9 | 2,429.7 | 49 | 0 | 1 | 0 |
| 8gyyxv7482dua: SELECT 1 FROM ALL_IND_STATISTICS WHERE ROWNUM = 0 | 1,659.7 | 1,657.5 | 88 | 0 | 1 | 0 |
| ac268gas62jty: SELECT 1 FROM ALL_TAB_STATISTICS WHERE ROWNUM = 0 | 1,517.6 | 1,516 | 66 | 0 | 1 | 0 |
| 99syrpdcx1r69: SELECT 1 FROM DBA_TAB_PRIVS WHERE ROWNUM = 0 | 1,099.7 | 1,098.3 | 9 | 0 | 1 | 0 |
| 3ux48tt83n10k: SELECT 1 FROM USER_TAB_PRIVS WHERE ROWNUM = 0 | 1,012.9 | 1,012.1 | 9 | 0 | 1 | 0 |

### d1-19c-lab — health_check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 68xpy8umn9p7c: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 635.3 | 632.9 | 26,366 | 0 | 1 | 14 |
| c29pzk0upx5kr: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 506.5 | 504.8 | 3,030 | 0 | 1 | 4,669 |
| dx7vv0vqwvuy8: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 300.5 | 298.4 | 17,975 | 0 | 1 | 2 |
| c9wuuv3fsygtr: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 293.6 | 292 | 5,431 | 0 | 1 | 3 |
| 74hmhznd6h9p5: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 272.5 | 271.6 | 9,344 | 0 | 1 | 2 |

### d1-19c-lab — list_targets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|

### d1-19c-lab — db_overview

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| absa3z04hpqd4: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 772.4 | 769.2 | 3,030 | 0 | 1 | 4,669 |
| 42y0nahjrxcnj: WITH PIAGENT_WALL_QUERY (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2,PIAGENT_COL_3,PIAGENT_COL_4,PIAGENT_COL_5,P | 61.5 | 60.9 | 28 | 0 | 1 | 1 |
| gdzz41y2b3jp0: SELECT d.name, d.cdb, i.version_full, i.instance_name, i.host_name, i.startup_time, (SELECT value FROM nls_dat | 44.6 | 44.3 | 12 | 0 | 1 | 0 |
| 3dav1b456phms: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 7.7 | 6.8 | 2 | 0 | 1 | 1 |
| cvpm70527upxh: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.3 | 4.4 | 8 | 0 | 1 | 1 |

### d1-19c-lab — list_schemas

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 6h1tn5x7vvs81: SELECT u.username, (SELECT COUNT(*) FROM dba_objects o WHERE o.owner=u.username) object_count, (SELECT SUM(byt | 628.7 | 628 | 71,184 | 0 | 1 | 10 |
| 6h6harmj8hb24: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 511.5 | 508.9 | 3,030 | 0 | 1 | 4,669 |
| ftyg5smda8gj8: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11.3 | 11.1 | 2 | 0 | 1 | 1 |
| 2db0dff8jq0fq: SELECT PRIVILEGE FROM SESSION_PRIVS | 6 | 4.7 | 8 | 0 | 1 | 1 |
| ff88rmvqxppqf: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.3 | 2.2 | 0 | 0 | 1 | 1 |

### d1-19c-lab — list_objects

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bbmcu2pudkzgv: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 284.4 | 282.7 | 3,030 | 0 | 1 | 4,669 |
| ax0h5g8x3g0v2: SELECT owner, object_name, object_type, status FROM all_objects WHERE owner=:owner AND (:object_type IS NULL O | 61.9 | 61 | 2,017 | 0 | 1 | 50 |
| 3wknbzrtc7mh7: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 4.5 | 3.6 | 2 | 0 | 1 | 1 |
| fa9puz0b42anf: SELECT PRIVILEGE FROM SESSION_PRIVS | 2.5 | 1.5 | 8 | 0 | 1 | 1 |
| a65ugfh1t356s: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 1.2 | 0.3 | 0 | 0 | 1 | 1 |

### d1-19c-lab — describe_object

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 9f1h5263hnmfv: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 741.9 | 737.8 | 3,030 | 0 | 1 | 4,669 |
| bd96rs93kdmhc: SELECT 'COLUMN' kind, column_name name, data_type info, TO_CHAR(data_length) value, column_id position FROM al | 506.7 | 506 | 590 | 0 | 1 | 42 |
| 5802szmtc43zr: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.6 | 10 | 2 | 0 | 1 | 1 |
| 5mcsbcr48cqrs: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.5 | 5 | 8 | 0 | 1 | 1 |
| 224hcr1qbkrjs: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.5 | 2 | 0 | 0 | 1 | 1 |

### d1-19c-lab — get_source

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 6s3zap10dzbdm: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 825 | 820.4 | 3,030 | 0 | 1 | 4,669 |
| 0zapuzfk5dyt8: SELECT type, line, text FROM all_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 127.4 | 126.6 | 16 | 0 | 1 | 0 |
| 8bz1vj882tg1r: SELECT type, line, text FROM dba_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 81.9 | 81.5 | 14 | 0 | 1 | 0 |
| 8b15z5nxfvfb9: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11 | 10.3 | 2 | 0 | 1 | 1 |
| 63cyvpmmf5g8f: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.5 | 5.4 | 8 | 0 | 1 | 1 |

### d1-19c-lab — explain_plan

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 135r17mfx3g2m: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,387.1 | 1,381.3 | 7,134 | 0 | 2 | 9,338 |
| gwtycq188dn8h: SELECT sql_id FROM v$sql WHERE sql_text=:text AND plan_hash_value<>0 FETCH FIRST 1 ROWS ONLY | 118.4 | 117 | 2 | 0 | 1 | 1 |
| 1j3h5pu18ntt1: SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'TYPICAL')) | 76.1 | 75.2 | 152 | 0 | 1 | 13 |
| 2gha1k0zjzb74: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.6 | 10.4 | 2 | 0 | 2 | 2 |
| 3vxuvwzgb1ryu: SELECT PRIVILEGE FROM SESSION_PRIVS | 9.2 | 8.4 | 14 | 0 | 2 | 2 |

### d1-19c-lab — top_sql

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 92h2zn0gx6djy: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 760.7 | 757.8 | 3,030 | 0 | 1 | 4,669 |
| aq45zm2tq2dwr: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 663.3 | 662.3 | 2 | 0 | 1 | 10 |
| b5hh5ub37ma4k: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.2 | 10 | 2 | 0 | 1 | 1 |
| brn263mf6t3ng: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.3 | 5.3 | 8 | 0 | 1 | 1 |
| 129ph9p8ppas5: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.2 | 2 | 0 | 0 | 1 | 1 |

### d1-19c-lab — session_activity

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 3ta90vuz9htvg: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 778.6 | 775.8 | 3,030 | 0 | 1 | 4,669 |
| 2cj6spx5r1gsj: SELECT s.sid, s.serial#, s.username, s.status, s.sql_id, s.event, s.wait_class, s.seconds_in_wait, s.blocking_ | 509.4 | 508 | 4 | 0 | 1 | 3 |
| fjd6rcug3nhcm: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 9.1 | 8.8 | 2 | 0 | 1 | 1 |
| 4u7m8rtwgk3by: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.9 | 4.8 | 8 | 0 | 1 | 1 |
| 47m80tnud7qwy: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.5 | 2 | 0 | 0 | 1 | 1 |

### d1-19c-lab — wait_events

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 08brxz7yyxtyg: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 813.3 | 810 | 3,030 | 0 | 1 | 4,669 |
| 9rm38p4dr5uq7: SELECT event, wait_class, total_waits, time_waited_micro FROM v$system_event WHERE wait_class<>'Idle' ORDER BY | 11.2 | 10.4 | 2 | 0 | 1 | 10 |
| cf0n57k1ktfa3: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 9.9 | 10 | 2 | 0 | 1 | 1 |
| 1kczj8r2unfpj: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.3 | 4.6 | 8 | 0 | 1 | 1 |
| 3gh3fgwdp4v53: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.4 | 1.9 | 0 | 0 | 1 | 1 |

### d1-19c-lab — tablespace_usage

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bk3k1tntjwx9v: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 792.2 | 790 | 3,030 | 0 | 1 | 4,669 |
| 7j5vq8h39p4yb: SELECT d.tablespace_name, d.allocated_bytes, NVL(f.free_bytes,0) free_bytes, d.allocated_bytes-NVL(f.free_byte | 57.6 | 56.3 | 61 | 0 | 1 | 4 |
| fr508bg8f67q6: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10 | 9.5 | 2 | 0 | 1 | 1 |
| gtf682bxrvynv: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.2 | 4.7 | 8 | 0 | 1 | 1 |
| fghmm70t0kggw: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.4 | 1.6 | 0 | 0 | 1 | 1 |

### p1-19c-prod — check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| bf884v0n9v8v7: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 758.7 | 756.7 | 1,615 | 0 | 1 | 91 |
| 0hj0zmjkvkq1h: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 606.8 | 605.1 | 11,914 | 0 | 1 | 3 |
| 9kyqa7sp9712h: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 302.9 | 301.3 | 7,105 | 0 | 1 | 3 |
| 6bnp53ktq6zaf: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 238.7 | 236.9 | 17,218 | 0 | 1 | 1 |
| a4ufypw7gp7tm: SELECT OWNER, JOB_NAME, ENABLED, STATE, TO_CHAR(LAST_START_DATE, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') LAST_ST | 230.1 | 228.8 | 97 | 0 | 1 | 25 |

### p1-19c-prod — backup

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 2950ga1qgqkaj: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 678.4 | 677.4 | 1,615 | 0 | 1 | 91 |
| audkdqfsakjqt: WITH PIAGENT_WALL_QUERY (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2,PIAGENT_COL_3,PIAGENT_COL_4,PIAGENT_COL_5)  | 21 | 20.6 | 2 | 0 | 1 | 0 |
| 96vyzrcu3wa28: SELECT SESSION_KEY, INPUT_TYPE, STATUS, START_TIME, END_TIME, OUTPUT_BYTES FROM V$RMAN_BACKUP_JOB_DETAILS ORDE | 19.9 | 19 | 2 | 0 | 1 | 0 |
| 01j8qf7y8dbn4: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.4 | 9.7 | 2 | 0 | 1 | 1 |
| 0a9gk0t3j59nc: SELECT NAME, SPACE_LIMIT, SPACE_USED, SPACE_RECLAIMABLE, NUMBER_OF_FILES FROM V$RECOVERY_FILE_DEST | 7.8 | 6.1 | 2 | 0 | 1 | 0 |

### p1-19c-prod — jobs

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| aq8zpra5t0pg6: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 694.2 | 693.5 | 1,615 | 0 | 1 | 91 |
| 83bhgcmbgft45: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 632.4 | 631.8 | 11,914 | 0 | 1 | 3 |
| 49x78v5gwm0h9: SELECT OWNER, OBJECT_TYPE, COUNT(*) STALE_COUNT FROM DBA_TAB_STATISTICS WHERE STALE_STATS = 'YES' GROUP BY OWN | 313.2 | 311.3 | 7,121 | 0 | 1 | 3 |
| 4w2yxffmtannh: SELECT OWNER, JOB_NAME, ENABLED, STATE, TO_CHAR(LAST_START_DATE, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') LAST_ST | 232.9 | 232.2 | 81 | 0 | 1 | 25 |
| 4tzyrmxm7k9s5: SELECT OWNER, INDEX_NAME, TABLE_OWNER, TABLE_NAME, STATUS FROM DBA_INDEXES WHERE STATUS IN ('UNUSABLE', 'INVAL | 221 | 218.9 | 510 | 0 | 1 | 0 |

### p1-19c-prod — top

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| atu4qunwjx6t4: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 696.2 | 695.4 | 1,615 | 0 | 1 | 91 |
| f0bnur3pxbjp3: SELECT sql_id, elapsed_time, cpu_time, buffer_gets, disk_reads, executions FROM V$SQLSTATS ORDER BY sql_id | 180.8 | 179.1 | 6 | 0 | 1 | 6,414 |
| 9zxr20fm7msm0: SELECT name, value FROM V$SYSSTAT WHERE name IN ('user calls', 'session logical reads', 'physical reads', 'red | 19.1 | 16.6 | 6 | 0 | 1 | 14 |
| 961z6z65dc0ag: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.2 | 10.2 | 2 | 0 | 1 | 1 |
| 8kzmmsjynyjg2: SELECT stat_name, value, cumulative FROM V$OSSTAT ORDER BY stat_name | 5.2 | 3 | 6 | 0 | 1 | 50 |

### p1-19c-prod — space

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 5s93k6v24ub5c: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 2,228.5 | 2,224.1 | 37,268 | 0 | 1 | 12 |
| aaynazmk5p5pp: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 639.6 | 639.5 | 1,615 | 0 | 1 | 91 |
| 67s8g83zn9jw1: SELECT t.tablespace_name,t.contents,t.bigfile,f.file_name,f.bytes,f.autoextensible,f.maxbytes,NVL(x.free_bytes | 189.4 | 188.4 | 216 | 0 | 1 | 6 |
| 4tm3q9n02jywk: SELECT file_type,percent_space_used,percent_space_reclaimable,number_of_files FROM v$flash_recovery_area_usage | 54.8 | 54.6 | 2 | 0 | 1 | 0 |
| 3h696zupzd135: SELECT s.sid,s.username,u.sql_id,u.segtype,u.tablespace,u.blocks*t.block_size FROM v$tempseg_usage u JOIN v$se | 50.1 | 49 | 56 | 0 | 1 | 5 |

### p1-19c-prod — sessions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 8f4qksg4dt5x1: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 676.5 | 676.1 | 1,615 | 0 | 1 | 91 |
| 4jtrh9xv9h6z2: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 243 | 240.5 | 17,218 | 0 | 1 | 1 |
| 4gbs2crcz7nbz: SELECT /*+ RULE */ SID, TYPE, LMODE, REQUEST FROM V$LOCK WHERE LMODE > 0 OR REQUEST > 0 ORDER BY SID, TYPE, ID | 26.8 | 25.9 | 2 | 0 | 1 | 27 |
| 8fkq7cxnda3vu: SELECT S.SID, S.USERNAME, COALESCE(S.SQL_ID, S.PREV_SQL_ID) SQL_ID, TO_CHAR(SYS_EXTRACT_UTC(FROM_TZ(CAST(T.STA | 22.9 | 21.9 | 4 | 0 | 1 | 0 |
| a0ynmpvpr82xg: SELECT SID, SERIAL#, USERNAME, OSUSER, MACHINE, PROGRAM, TYPE, STATUS, SQL_ID, PREV_SQL_ID, EVENT, WAIT_CLASS, | 17.5 | 16.2 | 2 | 0 | 1 | 97 |

### p1-19c-prod — security

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 9t2pvz183mzh8: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 2,125.3 | 2,123.6 | 3,248 | 0 | 1 | 9 |
| 6tzfr7031puar: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 1,210.8 | 1,199 | 16,703 | 0 | 1 | 2,155 |
| 3btxvqmhfb5tk: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 940 | 938.4 | 1,567 | 0 | 1 | 201 |
| 97rn246p7apj0: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 694.8 | 694.1 | 1,615 | 0 | 1 | 91 |
| 5jkv2qww74srq: SELECT OWNER, COUNT(*) OBJECT_COUNT FROM DBA_OBJECTS WHERE OWNER IN (SELECT USERNAME FROM DBA_USERS WHERE ORAC | 167 | 165.3 | 2,523 | 0 | 1 | 1 |

### p1-19c-prod — alertlog

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 202kykhr93acq: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 900.3 | 896.8 | 2,045 | 0 | 2 | 182 |
| c6d6qw8f1r80c: SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, PROBLEM_KEY, MESSAGE_TEXT, CON_ID FROM V$DIAG_ALERT_EXT WHERE ORI | 119 | 118.5 | 2 | 0 | 1 | 0 |
| 5yg2dtj6ny136: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 6.2 | 5.1 | 2 | 0 | 2 | 2 |
| caxnj1g446m83: SELECT i.INCIDENT_ID, p.PROBLEM_KEY, i.CREATE_TIME, i.STATUS, i.CON_ID FROM V$DIAG_INCIDENT i LEFT JOIN V$DIAG | 5.6 | 4.3 | 4 | 0 | 1 | 0 |
| c0rqfdrd89ags: SELECT PRIVILEGE FROM SESSION_PRIVS | 3.5 | 2.9 | 14 | 0 | 2 | 2 |

### p1-19c-prod — drift

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 05tvhq4h26zx8: SELECT i.table_name, i.index_name, CASE WHEN REGEXP_LIKE(i.index_name, '^SYS_C[0-9]+$') THEN 'GENERATED NAME'  | 5,541.4 | 5,537.4 | 45,558 | 0 | 2 | 20 |
| 8hzc7mpn7hgqf: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 3,979.9 | 3,976.5 | 6,486 | 0 | 2 | 18 |
| afys0r4dt76yu: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 2,193.4 | 2,182.4 | 12,702 | 0 | 28 | 2,548 |
| 4f8cmkv1camt0: SELECT /*+ RULE */ c.table_name, c.constraint_name, c.generated, c.constraint_type, c.status, c.validated, c.d | 1,816.1 | 1,814.9 | 860,116 | 0 | 2 | 54 |
| 0sdf33vpymbcm: SELECT table_name, temporary, partitioned, iot_type FROM all_tables WHERE owner = :owner ORDER BY table_name | 569.5 | 566.9 | 2,579 | 0 | 2 | 8 |

### p1-19c-prod — report

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 8gbh9afmaq2w3: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 2,840.7 | 2,828.5 | 28,000 | 0 | 19 | 1,729 |
| dtd391h14asq9: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 2,564.9 | 2,552 | 16,703 | 0 | 1 | 2,155 |
| fjsvk96gcc9aw: SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJEC | 2,408.9 | 2,406.1 | 1,563 | 0 | 1 | 201 |
| b70jnn15mj9az: SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWN | 1,863.2 | 1,861.4 | 3,248 | 0 | 1 | 9 |
| baxyypwqcyg8b: SELECT s.owner,s.segment_name,s.partition_name,s.segment_type,s.tablespace_name,s.bytes,l.table_name,l.column_ | 1,563.6 | 1,562.2 | 37,276 | 0 | 1 | 12 |

### p1-19c-prod — targets check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| dxz9q9zdkgv25: SELECT 1 FROM USER_TAB_PRIVS WHERE ROWNUM = 0 | 2,692.2 | 2,690.3 | 9 | 0 | 1 | 0 |
| bf59n8k4wsgdn: SELECT 1 FROM ALL_TAB_STATISTICS WHERE ROWNUM = 0 | 1,076.9 | 1,076.2 | 66 | 0 | 1 | 0 |
| 0sscww41ytk5s: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 751.8 | 751.1 | 1,615 | 0 | 1 | 91 |
| fgjmvy05h8b85: SELECT 1 FROM AUDIT_UNIFIED_POLICIES WHERE ROWNUM = 0 | 748.5 | 747.4 | 69 | 0 | 1 | 0 |
| 584hbmx0rpmkd: SELECT 1 FROM ALL_IND_STATISTICS WHERE ROWNUM = 0 | 462.6 | 461.6 | 88 | 0 | 1 | 0 |

### p1-19c-prod — health_check

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| b5p13c0z81952: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 744.9 | 744.3 | 1,615 | 0 | 1 | 91 |
| 52jfdcw1p0c70: SELECT CLIENT_NAME, STATUS, WINDOW_GROUP FROM DBA_AUTOTASK_CLIENT ORDER BY CLIENT_NAME | 375.1 | 373.9 | 11,914 | 0 | 1 | 3 |
| 100ma6tr03h5k: SELECT OWNER, JOB_NAME, ENABLED, STATE, TO_CHAR(LAST_START_DATE, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') LAST_ST | 221.2 | 220 | 81 | 0 | 1 | 25 |
| 9sqn1sqz7mf64: SELECT t.tablespace_name,t.contents,t.bigfile,f.file_name,f.bytes,f.autoextensible,f.maxbytes,NVL(x.free_bytes | 193.1 | 192.6 | 233 | 0 | 1 | 6 |
| 8b7rm455gx3pp: SELECT OBJECT_ID, OWNER, OBJECT_NAME FROM DBA_OBJECTS WHERE OBJECT_ID IN (SELECT OBJECT_ID FROM V$LOCKED_OBJEC | 159.1 | 157.9 | 17,218 | 0 | 1 | 1 |

### p1-19c-prod — list_targets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|

### p1-19c-prod — db_overview

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 0243b7ux1q7j5: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 631.4 | 631.2 | 1,615 | 0 | 1 | 91 |
| 2vn3qkqah6n0u: WITH PIAGENT_WALL_QUERY (PIAGENT_COL_0,PIAGENT_COL_1,PIAGENT_COL_2,PIAGENT_COL_3,PIAGENT_COL_4,PIAGENT_COL_5,P | 33.2 | 33.1 | 62 | 0 | 1 | 1 |
| 4j5h6pza1n36n: SELECT d.name, d.cdb, i.version_full, i.instance_name, i.host_name, i.startup_time, (SELECT value FROM nls_dat | 29.4 | 29.3 | 12 | 0 | 1 | 0 |
| cm0548k0szat2: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 9 | 9.1 | 2 | 0 | 1 | 1 |
| 2n4tt0anmacrv: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.4 | 4.1 | 8 | 0 | 1 | 1 |

### p1-19c-prod — list_schemas

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 84yaxpkr4grn0: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 581.5 | 581.1 | 1,615 | 0 | 1 | 91 |
| 3tahqhq91qnb1: SELECT u.username, (SELECT COUNT(*) FROM dba_objects o WHERE o.owner=u.username) object_count, (SELECT SUM(byt | 353.3 | 352.9 | 10,101 | 0 | 1 | 2 |
| f8yb6qpgym2w0: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.1 | 10 | 2 | 0 | 1 | 1 |
| gxx513truz8qs: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.8 | 4 | 8 | 0 | 1 | 1 |
| c37jf3js0jpqj: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2 | 1.4 | 0 | 0 | 1 | 1 |

### p1-19c-prod — list_objects

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| dvv92rkrdmrf6: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 644.9 | 644.1 | 1,615 | 0 | 1 | 91 |
| 8f1tbswg5hvf0: SELECT owner, object_name, object_type, status FROM all_objects WHERE owner=:owner AND (:object_type IS NULL O | 146.3 | 145.1 | 1,359 | 0 | 1 | 12 |
| 8tgd394h63wrt: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10 | 10 | 2 | 0 | 1 | 1 |
| arbctgpvhqpfj: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.8 | 4 | 8 | 0 | 1 | 1 |
| 1r6k6bpnb3447: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.2 | 1 | 0 | 0 | 1 | 1 |

### p1-19c-prod — describe_object

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 87gtu6z553sny: SELECT 'COLUMN' kind, column_name name, data_type info, TO_CHAR(data_length) value, column_id position FROM al | 733.5 | 732.5 | 381 | 0 | 1 | 25 |
| ajq3f4wkt8yc4: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 687.9 | 686.9 | 1,615 | 0 | 1 | 91 |
| gpzjnvujf7u3f: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.2 | 10.1 | 2 | 0 | 1 | 1 |
| aaznns3j363tv: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.7 | 4.2 | 8 | 0 | 1 | 1 |
| 9axtapczvac43: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.1 | 1.5 | 0 | 0 | 1 | 1 |

### p1-19c-prod — get_source

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 9kd5jjb7hzdv2: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 229 | 228.7 | 1,615 | 0 | 1 | 91 |
| 7phn3ta82hus2: SELECT type, line, text FROM dba_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 80 | 79 | 13 | 0 | 1 | 0 |
| 6u8g4gqa2d8cn: SELECT type, line, text FROM all_source WHERE owner=:owner AND name=:name AND (:source_type IS NULL OR type=:s | 54.1 | 53.2 | 15 | 0 | 1 | 0 |
| 53zxtp8kmm209: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 3.8 | 2.6 | 2 | 0 | 1 | 1 |
| 3gqkgmknbhcsw: SELECT PRIVILEGE FROM SESSION_PRIVS | 1.9 | 1.4 | 8 | 0 | 1 | 1 |

### c1-19c-pdb — get_source:view

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 8fu9ffmyp0wy4: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 756.5 | 754.4 | 242 | 0 | 1 | 133 |
| 1fjy6k7guzbff: SELECT text_length FROM all_views WHERE owner=:owner AND view_name=:name | 158.6 | 144.3 | 115 | 0 | 3 | 0 |
| fquf896vx78mv: SELECT text_length, text, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') chars | 154 | 103.3 | 80 | 0 | 3 | 1 |
| 569y3nnqh7p6z: SELECT text_length FROM dba_views WHERE owner=:owner AND view_name=:name | 115.9 | 65 | 53 | 0 | 3 | 1 |
| 4btvrc7zc5u1u: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.2 | 11.5 | 6 | 0 | 1 | 1 |

### c1-19c-pdb — top_sql:cpu_time

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 1qn8w3kn1kq3s: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 809.9 | 807.9 | 242 | 0 | 1 | 133 |
| axby54b7d294u: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 221.3 | 219.8 | 5 | 0 | 1 | 10 |
| 6kcavwhcwwg2h: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.4 | 11.6 | 6 | 0 | 1 | 1 |
| avy15jsnc3rc5: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.9 | 6.1 | 6 | 0 | 1 | 1 |
| 7z62bqw6rry1m: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.6 | 2.1 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — top_sql:buffer_gets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| f0g3auz6wr3cf: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 748.7 | 747.7 | 242 | 0 | 1 | 133 |
| 3x91hmp24c6xv: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 227.8 | 227 | 5 | 0 | 1 | 10 |
| f99z72mhk07rj: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.3 | 11.3 | 6 | 0 | 1 | 1 |
| 9xhqaq4cy7s5s: SELECT PRIVILEGE FROM SESSION_PRIVS | 8.5 | 8.1 | 6 | 0 | 1 | 1 |
| 6r4mff907vfg0: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 3.3 | 3 | 0 | 0 | 1 | 1 |

### c1-19c-pdb — top_sql:executions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| b9t6rqs284m5f: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 535.8 | 534.7 | 242 | 0 | 1 | 133 |
| 6m9dmahspvkvj: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 221.8 | 220.4 | 5 | 0 | 1 | 10 |
| b3staf8x7j1m8: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 12.6 | 12.2 | 6 | 0 | 1 | 1 |
| fp19jm6zfa3tm: SELECT PRIVILEGE FROM SESSION_PRIVS | 7 | 6.7 | 6 | 0 | 1 | 1 |
| 4xsgzb776uwgx: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.3 | 2 | 0 | 0 | 1 | 1 |

### d1-19c-lab — get_source:view

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| b7588ydj815s2: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 817.6 | 813.8 | 3,030 | 0 | 1 | 4,669 |
| 964kkrpy1tfww: SELECT text_length FROM all_views WHERE owner=:owner AND view_name=:name | 26.4 | 25.7 | 12 | 0 | 1 | 0 |
| 2t8nusf208fk9: SELECT text_length, text, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') chars | 23.3 | 22.8 | 14 | 0 | 1 | 0 |
| 9j849yw8h7y6q: SELECT text_length FROM dba_views WHERE owner=:owner AND view_name=:name | 18.7 | 18 | 12 | 0 | 1 | 0 |
| 5w3bq5542569j: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11 | 11.1 | 2 | 0 | 1 | 1 |

### d1-19c-lab — top_sql:cpu_time

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| aquq1pz2zqb94: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 753.5 | 751.1 | 3,030 | 0 | 1 | 4,669 |
| c4k7x3fzdv68g: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 722.2 | 720.4 | 2 | 0 | 1 | 10 |
| 1tkxc4b2wjr5q: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.5 | 9.8 | 2 | 0 | 1 | 1 |
| 3h8ucpfp8bg51: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.4 | 4.8 | 8 | 0 | 1 | 1 |
| 81a947mfnzgha: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.4 | 1.3 | 0 | 0 | 1 | 1 |

### d1-19c-lab — top_sql:buffer_gets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 327g9avad3tnp: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 783.1 | 780.3 | 3,030 | 0 | 1 | 4,669 |
| 4p2x20gasqb8q: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 779.6 | 777.8 | 2 | 0 | 1 | 10 |
| 6kfa5320w3cqh: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.1 | 9.6 | 2 | 0 | 1 | 1 |
| gw9qm91u0sd42: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.3 | 5.1 | 8 | 0 | 1 | 1 |
| 2bs4tb8tcg9md: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.4 | 1.4 | 0 | 0 | 1 | 1 |

### d1-19c-lab — top_sql:executions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| adqwfhdub3b7p: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 730.7 | 727.4 | 3,030 | 0 | 1 | 4,669 |
| 0p0p9805vzgfh: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 527.5 | 526.3 | 2 | 0 | 1 | 10 |
| f8wcrmkdatbf0: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.4 | 10.1 | 2 | 0 | 1 | 1 |
| 7r9btnn1mqyqm: SELECT PRIVILEGE FROM SESSION_PRIVS | 7.3 | 7 | 8 | 0 | 1 | 1 |
| g9062ay7c1jdq: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.2 | 1.4 | 0 | 0 | 1 | 1 |

### p1-19c-prod — explain_plan

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 2d7u1jnk3j4pj: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 1,308.6 | 1,306.7 | 2,045 | 0 | 2 | 182 |
| du6hsp8u0p5q7: SELECT sql_id FROM v$sql WHERE sql_text=:text AND plan_hash_value<>0 FETCH FIRST 1 ROWS ONLY | 116.1 | 115 | 2 | 0 | 1 | 1 |
| a0nw28yc35twg: SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'TYPICAL')) | 76.1 | 74.1 | 152 | 0 | 1 | 13 |
| a5rths07z9wm9: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11.2 | 10.9 | 2 | 0 | 2 | 2 |
| g3sn8msw4hrh1: SELECT PRIVILEGE FROM SESSION_PRIVS | 6.5 | 5.3 | 14 | 0 | 2 | 2 |

### p1-19c-prod — top_sql

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 77rzgd0yfxjjj: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 725.8 | 725.1 | 1,615 | 0 | 1 | 91 |
| c9dysaxuxdkgh: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 79.8 | 78.7 | 2 | 0 | 1 | 10 |
| 1rc1z3yt7b8qd: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.3 | 10.4 | 2 | 0 | 1 | 1 |
| 84zm98ggb6q54: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.7 | 3.9 | 8 | 0 | 1 | 1 |
| bhrzhh20urpra: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.2 | 1.7 | 0 | 0 | 1 | 1 |

### p1-19c-prod — session_activity

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 8b9dkw62xqh0y: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 662.1 | 661.4 | 1,615 | 0 | 1 | 91 |
| 6a1gs03fhsxvz: SELECT s.sid, s.serial#, s.username, s.status, s.sql_id, s.event, s.wait_class, s.seconds_in_wait, s.blocking_ | 73.6 | 73.2 | 4 | 0 | 1 | 3 |
| 6qrb9jquh7n2k: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.7 | 10.3 | 2 | 0 | 1 | 1 |
| g1wd92jugg6yk: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.9 | 4.9 | 8 | 0 | 1 | 1 |
| 36dgbj4pqbgg0: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.2 | 1.8 | 0 | 0 | 1 | 1 |

### p1-19c-prod — wait_events

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| gr1s1uda2f9bu: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 740.5 | 739.4 | 1,615 | 0 | 1 | 91 |
| cguyg6ftkh0v7: SELECT event, wait_class, total_waits, time_waited_micro FROM v$system_event WHERE wait_class<>'Idle' ORDER BY | 11.8 | 11.5 | 6 | 0 | 1 | 10 |
| 9qruxv6jcx6r6: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.3 | 9.8 | 2 | 0 | 1 | 1 |
| f9f231zap70s6: SELECT PRIVILEGE FROM SESSION_PRIVS | 5 | 4.4 | 8 | 0 | 1 | 1 |
| ac83vdk3p3xgd: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.3 | 1.5 | 0 | 0 | 1 | 1 |

### p1-19c-prod — tablespace_usage

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 0wxhdnmsqa9b0: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 749.7 | 748.5 | 1,615 | 0 | 1 | 91 |
| 3y7qsj5hx8unx: SELECT d.tablespace_name, d.allocated_bytes, NVL(f.free_bytes,0) free_bytes, d.allocated_bytes-NVL(f.free_byte | 69.6 | 67.8 | 90 | 0 | 1 | 5 |
| fjz20uga4jzff: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.7 | 10.1 | 2 | 0 | 1 | 1 |
| 8u076wc2k2qz9: SELECT PRIVILEGE FROM SESSION_PRIVS | 5.2 | 4.7 | 8 | 0 | 1 | 1 |
| 0audpspu4z1d3: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.3 | 1.7 | 0 | 0 | 1 | 1 |

### p1-19c-prod — get_source:view

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| ftx0atafb3ntv: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 761.4 | 760.3 | 1,615 | 0 | 1 | 91 |
| ftxfydms6p1b5: SELECT text_length, text, (SELECT value FROM nls_database_parameters WHERE parameter='NLS_CHARACTERSET') chars | 35.4 | 33.5 | 13 | 0 | 1 | 0 |
| ct256mh1uy8z3: SELECT text_length FROM all_views WHERE owner=:owner AND view_name=:name | 29.1 | 29.1 | 11 | 0 | 1 | 0 |
| a3hhjgg4q5tk4: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.5 | 9.6 | 2 | 0 | 1 | 1 |
| g8bf1j443j5cd: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.8 | 4.2 | 8 | 0 | 1 | 1 |

### p1-19c-prod — top_sql:cpu_time

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 2gsmq3y2qxjm1: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 727.5 | 725.9 | 1,615 | 0 | 1 | 91 |
| b4qwrpsytf38u: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 165.6 | 164.6 | 2 | 0 | 1 | 10 |
| 7vxwkmrfcqxtg: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 11.1 | 10.5 | 2 | 0 | 1 | 1 |
| 6wdbq5zwts3zb: SELECT PRIVILEGE FROM SESSION_PRIVS | 5 | 4.5 | 8 | 0 | 1 | 1 |
| 98uk67x2snvf5: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.2 | 1.2 | 0 | 0 | 1 | 1 |

### p1-19c-prod — top_sql:buffer_gets

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 0yn6swrwrtu6y: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 719.5 | 719.2 | 1,615 | 0 | 1 | 91 |
| 4mn6tg5hfbdnn: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 129.2 | 127.7 | 2 | 0 | 1 | 10 |
| 4by3gmfgxs87j: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.8 | 10.3 | 2 | 0 | 1 | 1 |
| c0hbr3utwr40s: SELECT PRIVILEGE FROM SESSION_PRIVS | 5 | 4.2 | 8 | 0 | 1 | 1 |
| 268bkrtmhmups: SELECT SYS_CONTEXT('USERENV','SESSION_USER'), SYS_CONTEXT('USERENV','ISDBA'), SYS_CONTEXT('USERENV','PROXY_USE | 2.2 | 1.9 | 0 | 0 | 1 | 1 |

### p1-19c-prod — top_sql:executions

| SQL_ID / statement | DB ms | CPU ms | Gets | Reads | Parses | Rows |
|---|---:|---:|---:|---:|---:|---:|
| 00q3gg84rbpuz: SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grant | 747.2 | 744.6 | 1,615 | 0 | 1 | 91 |
| 7xvq87j17whbr: SELECT sql_id, executions, elapsed_time, cpu_time, buffer_gets, SUBSTR(sql_text,1,300) sql_text FROM v$sqlstat | 168.6 | 166.7 | 2 | 0 | 1 | 10 |
| 4jvu8pstajxfc: SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%' | 10.3 | 10.2 | 2 | 0 | 1 | 1 |
| cpaqqgz8nsmqr: SELECT PRIVILEGE FROM SESSION_PRIVS | 4.8 | 4.1 | 8 | 0 | 1 | 1 |
| cwtprvq4mcw67: SELECT SYS_CONTEXT('USERENV','DB_NAME'), SYS_CONTEXT('USERENV','INSTANCE_NAME'), SYS_CONTEXT('USERENV','SERVER | 2.3 | 1.1 | 0 | 0 | 1 | 1 |
