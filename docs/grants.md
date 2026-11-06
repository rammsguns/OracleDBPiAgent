# Grant-request index

These are historical SELECT-only requests for a human DBA, not application setup
or scripts to rerun. The agent never applies grants. Dates below are request dates;
application history comes from the script headers and release records. Direct grants
name the diagnostic account, not a shared role. Existing role-based access is not
an exhaustive part of this index. Fixed views are granted via `SYS.V_$...`; the
product normally queries their `V$...` synonyms.

| Request date / file | Target / grantee | Requested views or tables | Enables |
| --- | --- | --- | --- |
| 2026-10-26 / [grants-request-2026-10-26.sql](grants-request-2026-10-26.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$INSTANCE`, `SYS.V_$DATABASE`, `SYS.V_$SGA`, `SYS.V_$PGASTAT`, `SYS.V_$SYSTEM_EVENT`, `SYS.V_$SQLSTATS`, `SYS.DBA_USERS`, `SYS.DBA_OBJECTS`, `SYS.DBA_SEGMENTS`, `SYS.DBA_DATA_FILES`, `SYS.DBA_FREE_SPACE` | Identity, SGA/PGA, waits, top SQL, schema/segment discovery and tablespace reports. |
| 2026-10-26 / [grants-request-2026-10-26.sql](grants-request-2026-10-26.sql) | d1-19c-lab (`localhost:1522/ORCL`); `HARNESS_LAB` | `HR.COUNTRIES`, `HR.DEPARTMENTS`, `HR.EMPLOYEES`, `HR.JOBS`, `HR.JOB_HISTORY`, `HR.LOCATIONS`, `HR.REGIONS`, `OE.CUSTOMERS`, `OE.INVENTORIES`, `OE.ORDERS`, `OE.ORDER_ITEMS`, `OE.PRODUCT_DESCRIPTIONS`, `OE.PRODUCT_INFORMATION`, `OE.PROMOTIONS`, `OE.WAREHOUSES`, `CO.CUSTOMERS`, `CO.ORDERS`, `CO.ORDER_ITEMS`, `CO.PRODUCTS`, `CO.STORES` | Read-only HR, OE and CO sample-data questions and object inspection; these are base tables, not views. |
| 2026-11-04 / [grants-request-2026-11-04-alertlog.sql](grants-request-2026-11-04-alertlog.sql) | d1-19c-lab (`localhost:1522/ORCL`); `HARNESS_LAB` | `SYS.V_$DIAG_ALERT_EXT`, `SYS.V_$DIAG_INCIDENT`, `SYS.V_$DIAG_PROBLEM` | Alert-log filtering, folded errors, ADR incidents/problems and triage correlation through SQL; no server-file access. |
| 2026-11-04 / [grants-request-2026-11-04-alertlog.sql](grants-request-2026-11-04-alertlog.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$DIAG_ALERT_EXT`, `SYS.V_$DIAG_INCIDENT`, `SYS.V_$DIAG_PROBLEM` | Alert-log filtering, folded errors, ADR incidents/problems and triage correlation through SQL; no server-file access. |
| 2026-11-04 / [grants-request-2026-11-04-plsql.sql](grants-request-2026-11-04-plsql.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.DBA_SOURCE`, `SYS.DBA_ERRORS`, `SYS.DBA_DEPENDENCIES`, `SYS.DBA_PROCEDURES`, `SYS.DBA_ARGUMENTS`, `SYS.DBA_OBJECTS` | PL/SQL source, compile errors, callers/dependencies, signatures and object metadata on p1. |
| 2026-11-05 / [grants-request-2026-11-05-security.sql](grants-request-2026-11-05-security.sql) | d1-19c-lab (`localhost:1522/ORCL`); `HARNESS_LAB` | `SYS.DBA_USERS_WITH_DEFPWD`, `SYS.AUDIT_UNIFIED_ENABLED_POLICIES`, `SYS.AUDIT_UNIFIED_POLICIES` | Default-password account names and unified audit-policy configuration; on p1 also privilege/role paths, profiles, proxy/password-file metadata, parameters and traditional audit configuration. |
| 2026-11-05 / [grants-request-2026-11-05-security.sql](grants-request-2026-11-05-security.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.DBA_SYS_PRIVS`, `SYS.DBA_ROLE_PRIVS`, `SYS.DBA_TAB_PRIVS`, `SYS.DBA_ROLES`, `SYS.DBA_PROFILES`, `SYS.PROXY_USERS`, `SYS.V_$PWFILE_USERS`, `SYS.V_$PARAMETER`, `SYS.DBA_STMT_AUDIT_OPTS`, `SYS.DBA_USERS_WITH_DEFPWD`, `SYS.AUDIT_UNIFIED_ENABLED_POLICIES`, `SYS.AUDIT_UNIFIED_POLICIES` | Default-password account names and unified audit-policy configuration; on p1 also privilege/role paths, profiles, proxy/password-file metadata, parameters and traditional audit configuration. |
| 2026-11-05 / [grants-request-2026-11-05-sqlperf.sql](grants-request-2026-11-05-sqlperf.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$SQL_PLAN_STATISTICS_ALL`, `SYS.V_$SQL_SHARED_CURSOR`, `SYS.V_$SQL_BIND_CAPTURE`, `SYS.DBA_SQL_PLAN_BASELINES`, `SYS.DBA_SQL_PROFILES`, `SYS.DBA_TAB_STATISTICS`, `SYS.DBA_IND_STATISTICS`, `SYS.DBA_TAB_COL_STATISTICS` | Cached plan statistics, cursor mismatch reasons, bind metadata (never values), baselines/profiles and object statistics. |
| 2026-11-05 / [grants-request-2026-11-05-sessions.sql](grants-request-2026-11-05-sessions.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$SESSION_WAIT`, `SYS.V_$WAIT_CHAINS`, `SYS.V_$TRANSACTION`, `SYS.V_$LOCKED_OBJECT`, `SYS.V_$SYS_TIME_MODEL`, `SYS.V_$EVENT_NAME`, `SYS.DBA_BLOCKERS`, `SYS.DBA_WAITERS` | Session waits, blocking chains, open transactions, locked objects and time model for `piagent sessions` (phase 23). No ASH/AWR. |
| 2026-11-06 / [grants-request-2026-11-06-space.sql](grants-request-2026-11-06-space.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.DBA_TEMP_FILES`, `SYS.DBA_LOBS`, `SYS.DBA_UNDO_EXTENTS`, `SYS.V_$SORT_USAGE` (V$TEMPSEG_USAGE), `SYS.V_$SORT_SEGMENT`, `SYS.V_$UNDOSTAT`, `SYS.V_$RECOVERY_FILE_DEST`, `SYS.V_$FLASH_RECOVERY_AREA_USAGE`, `SYS.V_$LOG`, `SYS.V_$LOGFILE`, `SYS.V_$TEMPFILE`, `SYS.V_$DATAFILE` | Tablespace, temp, undo, redo and recovery-area capacity for `piagent space` (phase 24). No DBA_EXTENTS. |

The 2026-10-26 request was applied on 2026-10-27 (31 grants). The phase 16
PL/SQL request was applied with owner authorization on 2026-11-04; it includes
`DBA_OBJECTS`, also present in the original p1 request. The alert-log request
records six applied grants on 2026-11-04. The SQL-performance and security
requests were applied on 2026-11-05. d1 already reads the PL/SQL and SQL-performance
views through `SELECT_CATALOG_ROLE`, so those files request only p1 grants.
For security, d1 already had the privilege/profile/parameter views; its section
adds only the three missing default-password/policy views. These observations
are historical, not a guarantee that grants cannot later be revoked.

## Deliberate exclusions

- `UNIFIED_AUDIT_TRAIL` is not granted or queried: it exposes other users' activity;
  security reports inspect policy configuration instead.
- `SYS.USER$` is not granted or queried: it contains password hashes.
  `DBA_USERS_WITH_DEFPWD` supplies names without hashes.
- No AWR/ASH (`DBA_HIST_*`, `V$ACTIVE_SESSION_HISTORY`) is requested or queried;
  SQL insight uses the current cursor cache without Diagnostics Pack sources.
- No ANY privileges, writes, EXECUTE grants or grant option are requested by
  these files. No audit-administration/viewer roles are requested.
- OE nested storage tables are accessed through their parent tables, not
  independently granted; sequences and routines are outside the sample-data request.

Missing views yield availability notes in [SQL insight](sqlperf.md),
[security](security.md) and other evidence reports. `ok` means that the evidence
was available, not that the database is secure or that all possible grants were read.
