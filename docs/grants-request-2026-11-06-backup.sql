-- FOR A HUMAN DBA ONLY. Proposed phase 25 backup evidence grants; NOT APPLIED.
-- p1-19c-prod only: localhost:1523/PRODCDB, database PRODCDB, Oracle 19c,
-- grantee HARNESS_RO. Never run this file from the product or automated tests.
-- Before applying, verify all three prerequisites with these SELECTs:
-- SELECT name, cdb FROM v$database; -- must be PRODCDB, NO for this lab
-- SELECT version_full FROM product_component_version
--   WHERE product LIKE 'Oracle%Database%'; -- must start with 19.
-- SELECT username FROM dba_users WHERE username = 'HARNESS_RO'; -- exactly one row
-- Stop if database name, version or grantee differs. These comments are a human
-- verification gate, not an executable assertion. Agent never applies grants.
-- SELECT only: no roles, ANY/write/EXECUTE privileges, or grant option.
-- Control-file/RMAN/archived-log evidence is CDB-wide (shared by all PDBs).
-- Owner PDBs use grants-template-pdb.sql, not this lab-specific request.
GRANT SELECT ON SYS.V_$RMAN_BACKUP_JOB_DETAILS TO HARNESS_RO;
GRANT SELECT ON SYS.V_$BACKUP_SET TO HARNESS_RO;
GRANT SELECT ON SYS.V_$BACKUP_PIECE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$BACKUP_DATAFILE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$ARCHIVED_LOG TO HARNESS_RO;
GRANT SELECT ON SYS.V_$LOG_HISTORY TO HARNESS_RO;
GRANT SELECT ON SYS.V_$CONTROLFILE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$RMAN_CONFIGURATION TO HARNESS_RO;
GRANT SELECT ON SYS.V_$DATABASE_BLOCK_CORRUPTION TO HARNESS_RO;
GRANT SELECT ON SYS.V_$RECOVER_FILE TO HARNESS_RO;
