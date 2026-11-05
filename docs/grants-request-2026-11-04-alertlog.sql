-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-04 (phase 18, alert-log triage).
-- Authorized by the project owner on 2026-11-04 ("Write and run it"). Applied once by the
-- coordinator on 2026-11-04 (6 x "Grant succeeded"), verified with read-only queries, as `/ as sysdba` inside each container after verifying the DB name, version 19c and
-- grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, or grant option.
-- Grantees are the agent's own read-only accounts, not shared harness roles.
-- Never run this file as part of the application or automated tests.
-- The V$DIAG_* views read the ADR alert log and incident metadata through SQL; the agent
-- never reads server files.

-- d1-19c-lab ONLY: container oracle19c, localhost:1522/ORCL, Oracle 19c.
GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_LAB;
GRANT SELECT ON SYS.V_$DIAG_INCIDENT TO HARNESS_LAB;
GRANT SELECT ON SYS.V_$DIAG_PROBLEM TO HARNESS_LAB;

-- p1-19c-prod ONLY: container oracle19c-prod, localhost:1523/PRODCDB, Oracle 19c.
GRANT SELECT ON SYS.V_$DIAG_ALERT_EXT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$DIAG_INCIDENT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$DIAG_PROBLEM TO HARNESS_RO;
