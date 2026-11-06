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

## Fresh PDB inventory (phase 28)

Use [the owner guide](real-targets.md) and [PDB template](grants-template-pdb.sql)
for a new account. The seven historical request files are incremental lab deltas.
Their union contains **59 distinct SYS views**, plus **20 HR/OE/CO base tables**;
those sample tables are deliberately omitted from the PDB template.

Comparison made against the fixed SQL in `src/` on 2026-11-06:

```bash
rg -n -i '\b(from|join)\s+(sys\.)?[a-z_][a-z0-9_$]*' src
rg -n '^GRANT SELECT ON ' docs/grants-request*.sql
rg -n 'this.read|reader.read|stats\(|jobs\(|runs\(|prefix|suffix' src/plsql src/triage src/report src/sqlperf src/tools
```

Normalize `V$X` to `SYS.V_$X`; `V$TEMPSEG_USAGE` maps to `SYS.V_$SORT_USAGE`.
Inspect query builders as well as literal FROM/JOIN matches: PL/SQL and triage
expand fixed DBA/ALL suffixes; reports expand stats/jobs/runs; SQL insight expands
TAB/IND statistics and baselines/profiles; tools
replace ALL with DBA for fixed describe/source fallbacks.
Do not treat policy denylists or arbitrary `run_query` text as fixed feature
queries. The bounded dictionary-hint catalog is also included in readiness
probes and grants. This is a reviewed source inventory, not a SQL
parser or a claim that every view is visible inside every PDB.

The resolved fixed-query set has **104 views**. Its **54 additions** over
the historical SYS grant union are listed below (SYS owner; underlying names):

- `ALL_ARGUMENTS`
- `ALL_CONSTRAINTS`
- `ALL_CONS_COLUMNS`
- `ALL_DEPENDENCIES`
- `ALL_ERRORS`
- `ALL_INDEXES`
- `ALL_IND_COLUMNS`
- `ALL_IND_EXPRESSIONS`
- `ALL_IND_PARTITIONS`
- `ALL_IND_STATISTICS`
- `ALL_IND_SUBPARTITIONS`
- `ALL_OBJECTS`
- `ALL_PROCEDURES`
- `ALL_SCHEDULER_JOBS`
- `ALL_SCHEDULER_JOB_RUN_DETAILS`
- `ALL_SOURCE`
- `ALL_SYNONYMS`
- `ALL_TABLES`
- `ALL_TAB_COLUMNS`
- `ALL_TAB_STATISTICS`
- `ALL_USERS`
- `ALL_VIEWS`
- `DATABASE_PROPERTIES`
- `DBA_TRIGGERS`
- `DBA_SCHEDULER_JOB_LOG`
- `DBA_SCHEDULER_PROGRAMS`
- `DBA_SCHEDULER_PROGRAM_ARGS`
- `DBA_SCHEDULER_SCHEDULES`
- `DBA_CONSTRAINTS`
- `DBA_CONS_COLUMNS`
- `DBA_INDEXES`
- `DBA_IND_COLUMNS`
- `DBA_SCHEDULER_JOBS`
- `DBA_SCHEDULER_JOB_RUN_DETAILS`
- `DBA_TABLES`
- `DBA_TABLESPACES`
- `DBA_TABLESPACE_USAGE_METRICS`
- `DBA_TAB_COLUMNS`
- `DBA_VIEWS`
- `DUAL`
- `NLS_DATABASE_PARAMETERS`
- `PRODUCT_COMPONENT_VERSION`
- `ROLE_TAB_PRIVS`
- `SESSION_PRIVS`
- `SESSION_ROLES`
- `USER_TAB_PRIVS_RECD`
- `V_$ARCHIVED_LOG`
- `V_$LOCK`
- `V_$LOG_HISTORY`
- `V_$RMAN_BACKUP_JOB_DETAILS`
- `V_$SESSION`
- `V_$SESSION_LONGOPS`
- `V_$SQL`
- `V_$SQL_PLAN`

The **9 historical views below are retained** to preserve the complete
request union. They are not directly named by the resolved fixed feature SELECTs;
`V_$SQL_PLAN_STATISTICS_ALL` also supports `DBMS_XPLAN.DISPLAY_CURSOR` internally.
Other retained views were requested as feature prerequisites or diagnostic access;
this comparison does not claim the current fixed commands read every one:

- `DBA_BLOCKERS`
- `DBA_TAB_COL_STATISTICS`
- `DBA_WAITERS`
- `PROXY_USERS`
- `V_$DATAFILE`
- `V_$EVENT_NAME`
- `V_$SESSION_WAIT`
- `V_$SQL_PLAN_STATISTICS_ALL`
- `V_$TEMPFILE`

The template's **113 explicit SELECT grants** are exactly the union of those
two sets; its ordered statements are the complete exact inventory. Publicly
readable ALL/USER/SESSION views, DUAL, PRODUCT_COMPONENT_VERSION and
NLS_DATABASE_PARAMETERS are included explicitly for review; normally no extra
grant is needed for those. ALL views still restrict rows to the login's visible
objects. DBA views expose wider metadata, including source and SQL text: the DBA
must approve that exposure. No grant implies permission to execute user routines.

Phase 28's new account-check queries are being built by WP-28A. This inventory
includes existing `USER_TAB_PRIVS_RECD`, `ROLE_TAB_PRIVS`, `SESSION_PRIVS` and
`SESSION_ROLES`; `USER_TAB_PRIVS` is expected to be public for the new check.
The coordinator must reconcile the final preflight catalog with this template
when merging parallel work. Future phases 25–27 are not added speculatively.
