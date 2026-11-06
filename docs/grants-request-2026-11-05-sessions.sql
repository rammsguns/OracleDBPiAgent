-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-05 (phase 23, sessions, blocking and waits).
-- Authorized by the project owner on 2026-11-05 ("apply the grants and start phase 23").
-- Applied once by the coordinator as `/ as sysdba` inside the container after verifying
-- the DB name, version 19c and grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, or grant option.
-- d1 (HARNESS_LAB) already reads these; only p1 needs them.
-- No AWR/ASH (DBA_HIST_*, V$ACTIVE_SESSION_HISTORY): Diagnostics Pack licensing.
-- Never run this file as part of the application or automated tests.

-- p1-19c-prod ONLY: container oracle19c-prod, localhost:1523/PRODCDB, Oracle 19c.
GRANT SELECT ON SYS.V_$SESSION_WAIT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$WAIT_CHAINS TO HARNESS_RO;
GRANT SELECT ON SYS.V_$TRANSACTION TO HARNESS_RO;
GRANT SELECT ON SYS.V_$LOCKED_OBJECT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$SYS_TIME_MODEL TO HARNESS_RO;
GRANT SELECT ON SYS.V_$EVENT_NAME TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_BLOCKERS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_WAITERS TO HARNESS_RO;
