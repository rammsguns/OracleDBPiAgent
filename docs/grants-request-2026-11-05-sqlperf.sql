-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-05 (phase 19, single-SQL drill-down).
-- Authorized by the project owner on 2026-11-05 ("apply the grants and start phase 19").
-- Applied once by the coordinator as `/ as sysdba` inside the container after verifying
-- the DB name, version 19c and grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, or grant option.
-- d1 (HARNESS_LAB) already reads these through SELECT_CATALOG_ROLE; only p1 needs them.
-- No AWR/ASH (DBA_HIST_*, V$ACTIVE_SESSION_HISTORY): Diagnostics Pack licensing.
-- Never run this file as part of the application or automated tests.

-- p1-19c-prod ONLY: container oracle19c-prod, localhost:1523/PRODCDB, Oracle 19c.
GRANT SELECT ON SYS.V_$SQL_PLAN_STATISTICS_ALL TO HARNESS_RO;
GRANT SELECT ON SYS.V_$SQL_SHARED_CURSOR TO HARNESS_RO;
GRANT SELECT ON SYS.V_$SQL_BIND_CAPTURE TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_SQL_PLAN_BASELINES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_SQL_PROFILES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_TAB_STATISTICS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_IND_STATISTICS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_TAB_COL_STATISTICS TO HARNESS_RO;
