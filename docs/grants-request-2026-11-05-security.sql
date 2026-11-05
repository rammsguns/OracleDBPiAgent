-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-05 (phase 20, security and privilege review).
-- Authorized by the project owner on 2026-11-05 ("apply the grants", then "continue with next phase").
-- Applied once by the coordinator as `/ as sysdba` inside each container after verifying the DB
-- name, version 19c and grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, AUDIT_ADMIN/AUDIT_VIEWER roles, or grant option.
-- Deliberately NOT granted: UNIFIED_AUDIT_TRAIL (other users' activity) and SYS.USER$ (password hashes).
-- DBA_USERS_WITH_DEFPWD exposes only USERNAME and PRODUCT, never a hash.
-- Never run this file as part of the application or automated tests.

-- d1-19c-lab ONLY: container oracle19c, localhost:1522/ORCL, Oracle 19c.
-- HARNESS_LAB already reads the DBA_* privilege views through SELECT_CATALOG_ROLE.
GRANT SELECT ON SYS.DBA_USERS_WITH_DEFPWD TO HARNESS_LAB;
GRANT SELECT ON SYS.AUDIT_UNIFIED_ENABLED_POLICIES TO HARNESS_LAB;
GRANT SELECT ON SYS.AUDIT_UNIFIED_POLICIES TO HARNESS_LAB;

-- p1-19c-prod ONLY: container oracle19c-prod, localhost:1523/PRODCDB, Oracle 19c.
GRANT SELECT ON SYS.DBA_SYS_PRIVS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_ROLE_PRIVS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_TAB_PRIVS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_ROLES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_PROFILES TO HARNESS_RO;
GRANT SELECT ON SYS.PROXY_USERS TO HARNESS_RO;
GRANT SELECT ON SYS.V_$PWFILE_USERS TO HARNESS_RO;
GRANT SELECT ON SYS.V_$PARAMETER TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_STMT_AUDIT_OPTS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_USERS_WITH_DEFPWD TO HARNESS_RO;
GRANT SELECT ON SYS.AUDIT_UNIFIED_ENABLED_POLICIES TO HARNESS_RO;
GRANT SELECT ON SYS.AUDIT_UNIFIED_POLICIES TO HARNESS_RO;
