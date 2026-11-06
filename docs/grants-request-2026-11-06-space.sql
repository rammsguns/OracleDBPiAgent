-- FOR A HUMAN DBA ONLY. Agent-authored request, 2026-11-06 (phase 24, space and capacity).
-- Authorized by the project owner on 2026-11-06 ("continue with phase 24 and apply the grants").
-- Applied once by the coordinator as `/ as sysdba` inside the container after verifying
-- the DB name, version 19c and grantee. No password is read.
-- SELECT grants only: no ANY privileges, writes, EXECUTE, or grant option.
-- d1 (HARNESS_LAB) already reads these through its roles; only p1 needs them.
-- V$TEMPSEG_USAGE is a public synonym for SYS.V_$SORT_USAGE, so the grant names the base view.
-- DBA_EXTENTS is deliberately not granted (not needed, slow).
-- Never run this file as part of the application or automated tests.

-- p1-19c-prod ONLY: container oracle19c-prod, localhost:1523/PRODCDB, Oracle 19c.
GRANT SELECT ON SYS.DBA_TEMP_FILES TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_LOBS TO HARNESS_RO;
GRANT SELECT ON SYS.DBA_UNDO_EXTENTS TO HARNESS_RO;
GRANT SELECT ON SYS.V_$SORT_USAGE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$SORT_SEGMENT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$UNDOSTAT TO HARNESS_RO;
GRANT SELECT ON SYS.V_$RECOVERY_FILE_DEST TO HARNESS_RO;
GRANT SELECT ON SYS.V_$FLASH_RECOVERY_AREA_USAGE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$LOG TO HARNESS_RO;
GRANT SELECT ON SYS.V_$LOGFILE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$TEMPFILE TO HARNESS_RO;
GRANT SELECT ON SYS.V_$DATAFILE TO HARNESS_RO;
