# SQL Insight: p1-19c-prod / 54x8br9b0szpk

ok; all times UTC; time per execution in ms (3 significant digits).

INSERT INTO ORDERS (CUSTOMER_ID) VALUES (TRUNC(DBMS_RANDOM.VALUE(1, 50001))) RETURNING ORDER_ID INTO :O0 

## Findings

| Finding | Evidence | Verify Next (Shown, Never Run) |
| --- | --- | --- |
| Stale or missing statistics | DBA_TAB_STATISTICS: Owner: SHOPAPP; Name: ORDERS; Stale: true; Last Analyzed: 2026-11-04T22:00:07Z | SELECT OWNER, TABLE_NAME, STALE_STATS, LAST_ANALYZED FROM DBA_TAB_STATISTICS WHERE OWNER = 'SHOPAPP' AND TABLE_NAME = 'ORDERS' |

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: ok · Indexes: skipped · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Indexes: skipped; 
- Mismatches: skipped; V$SQL_SHARED_CURSOR

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1206349063 | 47725 | 8148688 | 8020466 | 697243 | 0 | 47725 | 0.171 | 0.168 | 14.6 | 0 | 1 | 2026-11-04T04:30:02Z | 2026-11-05T17:10:39Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 1206349063 | 47725 | 2026-11-04T04:30:02Z | 2026-11-05T17:10:39Z | 0.171 |

## Tables

| Owner | Name | Stale | Last Analyzed | Num Rows | Status | View |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDERS | true | 2026-11-04T22:00:07Z | 470650 | ok | DBA_TAB_STATISTICS |

## Binds

| Child | Name | Position | Type | Captured |
| --- | --- | --- | --- | --- |
| 1 | :O0 | 1 | NUMBER | NO |

## Plan 1206349063 (display_cursor)

```
SQL_ID  54x8br9b0szpk, child number 1
-------------------------------------
INSERT INTO ORDERS (CUSTOMER_ID) VALUES (TRUNC(DBMS_RANDOM.VALUE(1, 
50001))) RETURNING ORDER_ID INTO :O0
 
Plan hash value: 1206349063
 
---------------------------------------------------------
| Id  | Operation                | Name         | Cost  |
---------------------------------------------------------
|   0 | INSERT STATEMENT         |              |     1 |
|   1 |  LOAD TABLE CONVENTIONAL | ORDERS       |       |
|   2 |   SEQUENCE               | ISEQ$$_73443 |       |
---------------------------------------------------------
 
Note
-----
   - cpu costing is off (consider enabling it)
 
```

