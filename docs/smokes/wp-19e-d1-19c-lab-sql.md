# SQL Insight: d1-19c-lab / 049p7mbjpqj6x

ok; all times UTC; time per execution in ms (3 significant digits).

SELECT p.prod_category,        TO_CHAR(SUM(s.amount_sold),'FM9999999990.00') AS category_revenue,        TO_CHAR(ROUND(100*SUM(s.amount_sold)/SUM(SUM(s.amount_sold)) OVER (),2),'FM9999990.00') AS pct_of_1999_total FROM sh.sales s JOIN sh.times t ON s.time_id = t.time_id JOIN sh.products p ON s.prod_id = p.prod_id WHERE t.calendar_year = 1999 GROUP BY p.prod_category ORDER BY p.prod_category

## Findings

No findings in available evidence.

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: ok · Indexes: ok · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Mismatches: skipped; V$SQL_SHARED_CURSOR

No baselines, profiles, binds or mismatches.

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 837898052 | 1 | 53128 | 52075 | 482 | 0 | 5 | 53.1 | 52.1 | 482 | 0 | 5 | 2026-11-05T10:04:31Z | 2026-11-05T10:04:31Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 837898052 | 1 | 2026-11-05T10:04:31Z | 2026-11-05T10:04:31Z | 53.1 |

## Tables

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SH | TIMES | false | 2026-10-27T22:00:28Z | 1826 | ok | DBA_TAB_STATISTICS |
| SH | SALES | false | 2026-10-27T22:00:29Z | 918843 | ok | DBA_TAB_STATISTICS |

## Indexes

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SH | PRODUCTS_PK | false | 2026-09-11T18:12:24Z | 72 | ok | DBA_IND_STATISTICS |
| SH | PRODUCTS_PROD_CAT_IX | false | 2026-09-11T18:12:24Z | 72 | ok | DBA_IND_STATISTICS |

## Plan 837898052 (display_cursor)

```
SQL_ID  049p7mbjpqj6x, child number 0
-------------------------------------
SELECT p.prod_category,        TO_CHAR(SUM(s.amount_sold),'FM9999999990.
00') AS category_revenue,        TO_CHAR(ROUND(100*SUM(s.amount_sold)/SU
M(SUM(s.amount_sold)) OVER (),2),'FM9999990.00') AS pct_of_1999_total 
FROM sh.sales s JOIN sh.times t ON s.time_id = t.time_id JOIN 
sh.products p ON s.prod_id = p.prod_id WHERE t.calendar_year = 1999 
GROUP BY p.prod_category ORDER BY p.prod_category
 
Plan hash value: 837898052
 
------------------------------------------------------------------------------------------------------------------------
| Id  | Operation                       | Name                 | Rows  | Bytes | Cost (%CPU)| Time     | Pstart| Pstop |
------------------------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT                |                      |       |       |   544 (100)|          |       |       |
|   1 |  WINDOW BUFFER                  |                      |     5 |   250 |   544   (3)| 00:00:01 |       |       |
|   2 |   SORT GROUP BY                 |                      |     5 |   250 |   544   (3)| 00:00:01 |       |       |
|*  3 |    HASH JOIN                    |                      |   229K|    10M|   538   (2)| 00:00:01 |       |       |
|   4 |     VIEW                        | index$_join$_004     |    72 |  1512 |     2   (0)| 00:00:01 |       |       |
|*  5 |      HASH JOIN                  |                      |       |       |            |          |       |       |
|   6 |       INDEX FAST FULL SCAN      | PRODUCTS_PK          |    72 |  1512 |     1   (0)| 00:00:01 |       |       |
|   7 |       INDEX FAST FULL SCAN      | PRODUCTS_PROD_CAT_IX |    72 |  1512 |     1   (0)| 00:00:01 |       |       |
|*  8 |     HASH JOIN                   |                      |   229K|  6505K|   536   (2)| 00:00:01 |       |       |
|   9 |      PART JOIN FILTER CREATE    | :BF0000              |   365 |  4380 |    18   (0)| 00:00:01 |       |       |
|* 10 |       TABLE ACCESS FULL         | TIMES                |   365 |  4380 |    18   (0)| 00:00:01 |       |       |
|  11 |      PARTITION RANGE JOIN-FILTER|                      |   918K|    14M|   515   (2)| 00:00:01 |:BF0000|:BF0000|
|  12 |       TABLE ACCESS FULL         | SALES                |   918K|    14M|   515   (2)| 00:00:01 |:BF0000|:BF0000|
------------------------------------------------------------------------------------------------------------------------
 
Predicate Information (identified by operation id):
---------------------------------------------------
 
   3 - access("S"."PROD_ID"="P"."PROD_ID")
   5 - access(ROWID=ROWID)
   8 - access("S"."TIME_ID"="T"."TIME_ID")
  10 - filter("T"."CALENDAR_YEAR"=1999)
 
```

