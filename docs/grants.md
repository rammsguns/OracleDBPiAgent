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
| 2026-11-06 / [grants-request-2026-11-06-backup.sql](grants-request-2026-11-06-backup.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$RMAN_BACKUP_JOB_DETAILS`, `SYS.V_$BACKUP_SET`, `SYS.V_$BACKUP_PIECE`, `SYS.V_$DATAFILE`, `SYS.V_$BACKUP_DATAFILE`, `SYS.V_$ARCHIVED_LOG`, `SYS.V_$LOG_HISTORY`, `SYS.V_$CONTROLFILE`, `SYS.V_$RMAN_CONFIGURATION`, `SYS.V_$RECOVERY_FILE_DEST`, `SYS.V_$DATABASE_BLOCK_CORRUPTION`, `SYS.V_$RECOVER_FILE`, `SYS.V_$DATABASE` | Recoverability, RMAN inventory/configuration, archived-log continuity, corruption and recovery files. Applied 2026-11-06. |
| 2026-11-06 / [grants-request-2026-11-06-jobs.sql](grants-request-2026-11-06-jobs.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.DBA_SCHEDULER_JOB_LOG`, `SYS.DBA_SCHEDULER_WINDOWS`, `SYS.DBA_AUTOTASK_CLIENT`, `SYS.DBA_AUTOTASK_JOB_HISTORY`, `SYS.DBA_OPTSTAT_OPERATIONS`, `SYS.DBA_INDEXES`, `SYS.DBA_IND_PARTITIONS`, `SYS.DBA_IND_SUBPARTITIONS` | Scheduler failures, autotask/windows, statistics operations and maintenance debt. Applied 2026-11-06. |
| 2026-11-06 / [grants-request-2026-11-06-top.sql](grants-request-2026-11-06-top.sql) | p1-19c-prod (`localhost:1523/PRODCDB`); `HARNESS_RO` | `SYS.V_$SYSSTAT`, `SYS.V_$OSSTAT` | Live SQL/load sampler (V$SQLSTATS was already granted). Applied 2026-11-06. |

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
for a new account. The template is the explicit grant inventory; historical
request files are incremental lab deltas, not a provisioning sequence. HR/OE/CO
sample-data grants are deliberately omitted from the PDB template.

The owner approved “Apply all” for phases 25–27. On 2026-11-06 the p1 grants
were applied after checking PRODCDB, version 19.9.1.0.0 and HARNESS_RO:
13 backup, eight jobs and two top grants (23 total). WP-25D re-premised the
affected backup evals first; afterwards `validate-hard` and `validate-p25` passed
as recorded in PLAN.md. Original SQL request headers still describe proposals;
this application record supersedes their pending wording. Grants may later be
revoked, so use preflight to check current access.

## Backup, jobs and top readiness

`targets check --target T` probes the groups below with zero-row SELECTs;
`--all` lists each view, `--json` emits structured results and `--grants-sql`
prints suggestions without applying grants. Readability does not prove complete
history or establish that an empty PDB result means absence.

| Feature group | Queried views |
| --- | --- |
| `backup` | `V$RMAN_BACKUP_JOB_DETAILS`, `V$BACKUP_SET`, `V$BACKUP_PIECE`, `V$DATAFILE`, `V$BACKUP_DATAFILE`, `V$ARCHIVED_LOG`, `V$LOG_HISTORY`, `V$CONTROLFILE`, `V$RMAN_CONFIGURATION`, `V$RECOVERY_FILE_DEST`, `V$DATABASE_BLOCK_CORRUPTION`, `V$RECOVER_FILE`, `V$DATABASE` |
| `jobs` | `DBA_SCHEDULER_JOBS`, `DBA_SCHEDULER_JOB_RUN_DETAILS`, `DBA_SCHEDULER_JOB_LOG`, `DBA_SCHEDULER_WINDOWS`, `DBA_AUTOTASK_CLIENT`, `DBA_AUTOTASK_JOB_HISTORY`, `DBA_OPTSTAT_OPERATIONS`, `DBA_OBJECTS`, `DBA_INDEXES`, `DBA_IND_PARTITIONS`, `DBA_IND_SUBPARTITIONS`, `DBA_TAB_STATISTICS` |
| `top` | `V$SQLSTATS`, `V$SYSSTAT`, `V$OSSTAT` |

The [backup](backup.md), [jobs](jobs.md) and [top](top.md) readers use these
views. Full `backup` and `jobs` report sections and triage reuse the readers;
backup drift compares explicit `V$RMAN_CONFIGURATION` settings only. These
three readiness groups are separate catalog entries: inspect them alongside
`report`, `triage` and `drift` readiness when using the composed features.
The top group requests no unused V$SESSTAT or V$STATNAME access.

The catalog in `src/preflight/views.ts` also covers `connection`, `ask`, `report`,
per-section `report:*` groups, `sessions`, `space`, `security`, `sql`, `alertlog`,
`plsql`, `triage` and `drift`. It includes dictionary fallbacks and cached-plan
support. The template includes their SELECT dependencies and retained historical
grants. Its ordered GRANT statements are the exact inventory; no speculative
future-phase inventory is implied.

Normalize `V$X` to `SYS.V_$X` for grants, except `V$TEMPSEG_USAGE`, which maps
to `SYS.V_$SORT_USAGE`. Publicly readable ALL/USER/SESSION views, DUAL,
PRODUCT_COMPONENT_VERSION and NLS_DATABASE_PARAMETERS are included explicitly
for review; normally no extra grant is needed for those. ALL views still restrict
rows to visible objects. DBA views can expose source, SQL text and application
error text; the DBA must approve that exposure. No grant implies permission to
execute user routines. Live PDB behavior remains unverified.
