-- FOR A HUMAN DBA ONLY. Proposed 2026-11-06; NOT APPLIED.
-- p1-19c-prod ONLY: localhost:1523/PRODCDB, Oracle 19c, grantee HARNESS_RO.
-- Before applying, verify SELECT name FROM v$database returns PRODCDB;
-- SELECT version_full FROM v$instance returns 19.9.1.0.0 (major 19);
-- SELECT username FROM dba_users WHERE username = 'HARNESS_RO' returns HARNESS_RO.
-- Stop on any mismatch. Review eval grant premises before owner approval/application.
-- SELECT only; no ANY privileges, writes, EXECUTE, grant option or licensed history.
-- Never execute from the application or automated tests. V$SQLSTATS already granted.
GRANT SELECT ON SYS.V_$SYSSTAT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$OSSTAT TO HARNESS_RO;
-- Phase 27 session-stat access for follow-on consumers (not queried by top):
GRANT SELECT ON SYS.V_$SESSTAT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$STATNAME TO HARNESS_RO;
