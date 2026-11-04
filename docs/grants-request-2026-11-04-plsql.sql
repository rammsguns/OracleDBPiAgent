-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-04 (phase 16, PL/SQL features).
-- Authorized by the project owner on 2026-11-04 ("Write and run it"), to be applied once
-- by the coordinator as `/ as sysdba` inside the oracle19c-prod container after verifying
-- the DB name, version 19.9.1 and grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, or grant option.
-- Grantee is the agent's own read-only account, not the shared harness role.
-- Never run this file as part of the application or automated tests.
-- p1-19c-prod ONLY: localhost:1523/PRODCDB, Oracle 19c.
-- d1-19c-lab already reads these views through SELECT_CATALOG_ROLE; no d1 section.
GRANT SELECT ON SYS.DBA_SOURCE TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_ERRORS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_DEPENDENCIES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_PROCEDURES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_ARGUMENTS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_OBJECTS TO HARNESS_RO;
