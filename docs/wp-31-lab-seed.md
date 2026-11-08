# WP-31 lab seed verification

Captured 2026-11-08. No LLM calls. Administration limited to oracle19c-cdb/PIPDB1. Seed ran twice successfully, retaining data and credentials.

## `targets check --target c1-19c-pdb`

Exit: 1

```text
targets.json packaged lab values must match the pinned lab configuration
```

## `check --target c1-19c-pdb`

Exit: 1

```text
targets.json packaged lab values must match the pinned lab configuration
```

## `backup --target c1-19c-pdb`

Exit: 1

```text
targets.json packaged lab values must match the pinned lab configuration
```

## `space --target c1-19c-pdb`

Exit: 1

```text
targets.json packaged lab values must match the pinned lab configuration
```

## `jobs --target c1-19c-pdb`

Exit: 1

```text
targets.json packaged lab values must match the pinned lab configuration
```

## Direct read-only verification

```sql
select sys_context('USERENV','CON_NAME') container_name from dual
```
```json
[["PIPDB1"]]
```
```sql
select table_name,num_rows,stale_stats,stattype_locked from dba_tab_statistics where owner='SHOPAPP' and partition_name is null
```
```json
[["PRODUCTS",2000,"YES","ALL"],["ORDERS",30000,"NO",null],["ORDER_LINES",90000,"NO",null],["CUSTOMERS",3000,"NO",null],["VIEW_SOURCE",null,null,null],["ORDER_HISTORY",3471,"NO",null]]
```
```sql
select object_name,object_type,status from dba_objects where owner='SHOPAPP' and status<>'VALID'
```
```json
[["INVALID_CUSTOMER_VIEW","VIEW","INVALID"]]
```
```sql
select index_name,partition_name,status from dba_ind_partitions where index_owner='SHOPAPP' and status='UNUSABLE'
```
```json
[["HISTORY_ORDER_IX","P_202601","UNUSABLE"]]
```
```sql
select job_name,status,error# from dba_scheduler_job_run_details where owner='SHOPAPP'
```
```json
[["REPORT_EXPORT_JOB","FAILED",20001],["REPORT_EXPORT_JOB","FAILED",20001],["PLACE_ORDERS_JOB","SUCCEEDED",0]]
```
```sql
select privilege from dba_sys_privs where grantee='PIAGENT_RO'
```
```json
[["CREATE SESSION"]]
```
```sql
select granted_role from dba_role_privs where grantee='PIAGENT_RO'
```
```json
[]
```

Exact object-grant comparison: 133 SELECT grants match the template plus five app tables; no grant option.

Root service CDB19 login refused: ORA-01017 (PDB-local user).

## CLI with supported private target-file adapter

The packaged-target loader rejects the third entry before connection. The same JSON copied to a temporary 0600 private targets file bypasses only that packaged pin. No product code changed.

### `targets check --target c1-19c-pdb`

Exit: 0

```text
c1-19c-pdb: Oracle 19.9.1.0.0; CDB/PDB; container PIPDB1; user PIAGENT_RO; account check passed
report: ok; 7 not-applicable
sessions: ok
space: ok; 6 not-applicable
security: ok
sql: ok
alertlog: ok
plsql: ok
triage: ok; 7 not-applicable
report:identity: ok
report:tablespaces: ok
report:waits: ok
report:top_sql: ok
report:optimizer_stats: ok
report:index_health: ok
report:index_partitions: ok
report:index_subpartitions: ok
report:parameters: ok
report:scheduler_jobs: ok
report:scheduler_failures: ok
report:long_operations: ok
report:backups: ok
report:archive_switches: ok; 1 not-applicable
report:sessions: ok
report:security: ok
report:space: ok; 6 not-applicable
ask: ok
connection: ok
drift: ok
backup: ok; 2 not-applicable
jobs: ok
top: ok
check: ok; 7 not-applicable
Use --grants-sql for suggested SELECT grants; --all lists every view.
```

### `check --target c1-19c-pdb`

Exit: 1

```text
# Check: WARN — 0 CRIT, 2 WARN, 4 UNKNOWN, 10 OK (c1-19c-pdb)
Captured 2026-11-08T06:11:31.753Z (UTC). Sequential snapshots; windowed history is not a continuous monitor.

| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c1-19c-pdb | tablespace:SHOP_DATA | OK | 9.5 % | 85 / 95 | This PDB (PIPDB1) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | tablespace:SYSAUX | OK | 1.2 % | 85 / 95 | This PDB (PIPDB1) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | tablespace:SYSTEM | OK | 1.0 % | 85 / 95 | This PDB (PIPDB1) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | tablespace:USERS | OK | 0.0 % | 85 / 95 | This PDB (PIPDB1) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | undo:UNDOTBS1 | OK | 0.6 % | 85 / 95 | This PDB (PIPDB1) (local undo) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | temp:TEMP | OK | 0.0 % | 85 / 95 | This PDB (PIPDB1) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | recovery | OK | 4.6 % | 80 / 90 | CDB-wide (shared by all PDBs) | piagent space --target c1-19c-pdb |  |
| c1-19c-pdb | blocking | UNKNOWN | UNKNOWN | 60 / 300 | This PDB (PIPDB1) | piagent sessions --target c1-19c-pdb | V$LOCK: query failed. |
| c1-19c-pdb | backupAge | UNKNOWN | UNKNOWN | 26 / 50 | CDB-wide (shared by all PDBs) | piagent backup --target c1-19c-pdb | No successful full/level-0 backup established for every visible datafile; external catalogs are not checked. |
| c1-19c-pdb | archiveGaps | UNKNOWN | UNKNOWN | > 0 = CRIT | CDB-wide (shared by all PDBs) | piagent backup --target c1-19c-pdb | No successful full/level-0 backup established for every visible datafile; external catalogs are not checked. A full-backup checkpoint is required for gap analysis. |
| c1-19c-pdb | failedJobs | WARN | 2 runs | 1 / 3 | This PDB (PIPDB1) | piagent jobs --target c1-19c-pdb |  |
| c1-19c-pdb | maintenance | WARN | 2 objects/index units | 1 / 20 | This PDB (PIPDB1) | piagent jobs --target c1-19c-pdb | Index, partition and subpartition units counted separately. |
| c1-19c-pdb | alertErrors | UNKNOWN | UNKNOWN | 1 / incident only | CDB-wide (shared by all PDBs) | piagent alertlog --target c1-19c-pdb | V$DIAG_ALERT_EXT: row cap reached; results are incomplete. Visible ORA count is at least 0; below threshold; unseen rows may change the verdict. |
| c1-19c-pdb | incidents | OK | 0 incidents | > 0 = CRIT | CDB-wide (shared by all PDBs) | piagent alertlog --target c1-19c-pdb |  |
| c1-19c-pdb | expiry | OK | 180.2 days | 14 / 3 | This PDB (PIPDB1) | piagent security --target c1-19c-pdb |  |
| c1-19c-pdb | defaultPasswords | OK | 0 accounts | > 0 = CRIT | This PDB (PIPDB1) | piagent security --target c1-19c-pdb |  |

```

### `backup --target c1-19c-pdb`

Exit: 0

```text
# Backup — c1-19c-pdb

CDB-wide (shared by all PDBs). Current PDB visibility only; empty rows do not establish absence.

Captured 2026-11-08T06:12:08.958Z. Sequential bounded SELECT snapshots.

## Restore-to-time estimate
Status: Not verifiable with the available evidence.

- From: not established.
- Through: not established.
- Evidence: database, datafiles, backups, sets, pieces, archives, history, corruption, recoverFiles.

Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.

## Per-datafile backups

| file | level0 | incremental | checkpointScn |
| --- | --- | --- | --- |
| 9 | 2026-11-08T12:06:16.000Z | none | 2512437 |
| 10 | 2026-11-08T12:06:17.000Z | none | 2512437 |
| 11 | 2026-11-08T12:06:09.000Z | none | 2512437 |
| 12 | 2026-11-08T12:05:59.000Z | none | 2512437 |
| 13 | none | none | none |

## Archive gaps

None.

## Recovery-area balance (bytes)

| limitBytes | usedBytes | reclaimableBytes | nonReclaimableBytes | availableAfterReclaimBytes |
| --- | --- | --- | --- | --- |
| 20 GiB | 1.03 GiB | 114.04 MiB | 939.36 MiB | 19.08 GiB |

## Evidence jobs (V$RMAN_BACKUP_JOB_DETAILS): ok — No rows visible in this PDB; absence cannot be inferred.

None.

## Evidence sets (V$BACKUP_SET): ok

| SET_STAMP | SET_COUNT | BACKUP_TYPE | INCREMENTAL_LEVEL | START_TIME | COMPLETION_TIME | PIECES |
| --- | --- | --- | --- | --- | --- | --- |
| 1248761209 | 5 | L | none | 2026-11-08T12:06:49.000Z | 2026-11-08T12:06:50.000Z | 1 |
| 1248761158 | 3 | I | 0 | 2026-11-08T12:05:58.000Z | 2026-11-08T12:06:17.000Z | 1 |
| 1248761085 | 1 | L | none | 2026-11-08T12:04:45.000Z | 2026-11-08T12:04:50.000Z | 1 |

## Evidence pieces (V$BACKUP_PIECE): ok

| SET_STAMP | SET_COUNT | PIECE# | COPY# | STATUS | DELETED | COMPLETION_TIME |
| --- | --- | --- | --- | --- | --- | --- |
| 1248761209 | 5 | 1 | 1 | A | NO | 2026-11-08T12:06:50.000Z |
| 1248761158 | 3 | 1 | 1 | A | NO | 2026-11-08T12:06:17.000Z |
| 1248761085 | 1 | 1 | 1 | A | NO | 2026-11-08T12:04:50.000Z |

## Evidence datafiles (V$DATAFILE): ok

| FILE# | NAME | CREATION_CHANGE# |
| --- | --- | --- |
| 9 | /opt/oracle/oradata/CDB19/PIPDB1/system01.dbf | 2506372 |
| 10 | /opt/oracle/oradata/CDB19/PIPDB1/sysaux01.dbf | 2506376 |
| 11 | /opt/oracle/oradata/CDB19/PIPDB1/undotbs01.dbf | 2506379 |
| 12 | /opt/oracle/oradata/CDB19/PIPDB1/users01.dbf | 2507274 |
| 13 | /opt/oracle/oradata/CDB19/PIPDB1/shop_data01.dbf | 2512544 |

## Evidence backups (V$BACKUP_DATAFILE): ok

| FILE# | SET_STAMP | SET_COUNT | INCREMENTAL_LEVEL | CHECKPOINT_CHANGE# | CHECKPOINT_TIME | COMPLETION_TIME | RESETLOGS_CHANGE# | CREATION_CHANGE# |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T12:05:58.000Z | 2026-11-08T12:06:17.000Z | 1920977 | 2506376 |
| 9 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T12:05:58.000Z | 2026-11-08T12:06:16.000Z | 1920977 | 2506372 |
| 11 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T12:05:58.000Z | 2026-11-08T12:06:09.000Z | 1920977 | 2506379 |
| 12 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T12:05:58.000Z | 2026-11-08T12:05:59.000Z | 1920977 | 2507274 |

## Evidence archives (V$ARCHIVED_LOG): ok

| THREAD# | SEQUENCE# | RESETLOGS_CHANGE# | FIRST_CHANGE# | NEXT_CHANGE# | FIRST_TIME | NEXT_TIME | STATUS | DELETED | NAME |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 12 | 1920977 | 2469629 | 2510789 | 2026-11-08T12:00:19.000Z | 2026-11-08T12:04:40.000Z | A | NO | /opt/oracle/oradata/fra/CDB19/archivelog/2026_11_08/o1_mf_1_12_oh047rgr_.arc |
| 1 | 13 | 1920977 | 2510789 | 2510847 | 2026-11-08T12:04:40.000Z | 2026-11-08T12:04:44.000Z | A | NO | /opt/oracle/oradata/fra/CDB19/archivelog/2026_11_08/o1_mf_1_13_oh047wmj_.arc |
| 1 | 14 | 1920977 | 2510847 | 2512466 | 2026-11-08T12:04:44.000Z | 2026-11-08T12:06:48.000Z | A | NO | /opt/oracle/oradata/fra/CDB19/archivelog/2026_11_08/o1_mf_1_14_oh04crz5_.arc |

## Evidence history (V$LOG_HISTORY): ok

| THREAD# | SEQUENCE# | FIRST_CHANGE# | NEXT_CHANGE# | FIRST_TIME | RESETLOGS_CHANGE# |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1920977 | 1981790 | 2026-11-08T11:40:38.000Z | 1920977 |
| 1 | 2 | 1981790 | 1986629 | 2026-11-08T11:44:02.000Z | 1920977 |
| 1 | 3 | 1986629 | 1992733 | 2026-11-08T11:44:26.000Z | 1920977 |
| 1 | 4 | 1992733 | 2034842 | 2026-11-08T11:44:59.000Z | 1920977 |
| 1 | 5 | 2034842 | 2084717 | 2026-11-08T11:46:05.000Z | 1920977 |
| 1 | 6 | 2084717 | 2144531 | 2026-11-08T11:46:56.000Z | 1920977 |
| 1 | 7 | 2144531 | 2181424 | 2026-11-08T11:47:41.000Z | 1920977 |
| 1 | 8 | 2181424 | 2196718 | 2026-11-08T11:48:47.000Z | 1920977 |
| 1 | 9 | 2196718 | 2281048 | 2026-11-08T11:52:46.000Z | 1920977 |
| 1 | 10 | 2281048 | 2371451 | 2026-11-08T11:57:25.000Z | 1920977 |
| 1 | 11 | 2371451 | 2469629 | 2026-11-08T11:58:58.000Z | 1920977 |
| 1 | 12 | 2469629 | 2510789 | 2026-11-08T12:00:19.000Z | 1920977 |
| 1 | 13 | 2510789 | 2510847 | 2026-11-08T12:04:40.000Z | 1920977 |
| 1 | 14 | 2510847 | 2512466 | 2026-11-08T12:04:44.000Z | 1920977 |

## Evidence controlfiles (V$CONTROLFILE): ok

| NAME | STATUS | IS_RECOVERY_DEST_FILE |
| --- | --- | --- |
| /opt/oracle/oradata/CDB19/control01.ctl | none | NO |

## Evidence configuration (V$RMAN_CONFIGURATION): ok

| NAME | VALUE |
| --- | --- |
| CONTROLFILE AUTOBACKUP | ON |
| RETENTION POLICY | TO RECOVERY WINDOW OF 7 DAYS |
| DEVICE TYPE | DISK BACKUP TYPE TO COMPRESSED BACKUPSET PARALLELISM 1 |

## Evidence recoveryArea (V$RECOVERY_FILE_DEST): ok

| NAME | SPACE_LIMIT | SPACE_USED | SPACE_RECLAIMABLE | NUMBER_OF_FILES |
| --- | --- | --- | --- | --- |
| /opt/oracle/oradata/fra | 20 GiB | 1.03 GiB | 114.04 MiB | 9 |

## Evidence corruption (V$DATABASE_BLOCK_CORRUPTION): ok — No rows visible in this PDB; absence cannot be inferred.

None.

## Evidence recoverFiles (V$RECOVER_FILE): ok — No rows visible in this PDB; absence cannot be inferred.

None.

## Evidence database (V$DATABASE): ok

| DBID | NAME | LOG_MODE | RESETLOGS_CHANGE# | CURRENT_SCN |
| --- | --- | --- | --- | --- |
| 4030503316 | CDB19 | ARCHIVELOG | 1920977 | 2520768 |

```

### `space --target c1-19c-pdb`

Exit: 0

```text
# Space — c1-19c-pdb

Captured at 2026-11-08T06:12:11.306Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **info: Redo** — CDB-wide (shared by all PDBs in this CDB). A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

Current PDB visibility only; file visibility and temporary/undo allocation depend on container configuration.
| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SHOP_DATA | 256 MiB | 24.38 MiB | 256 MiB | █░░░░░░░░░ 9.5% | █░░░░░░░░░ 9.5% | 231.63 MiB |
| SYSAUX | 400 MiB | 386.75 MiB | 32 GiB | ██████████ 96.7% | ░░░░░░░░░░ 1.2% | 31.62 GiB |
| SYSTEM | 320 MiB | 316.56 MiB | 32 GiB | ██████████ 98.9% | ░░░░░░░░░░ 1.0% | 31.69 GiB |
| TEMP | 382 MiB | 382 MiB | 32 GiB | ██████████ 100.0% | ░░░░░░░░░░ 1.2% | 31.63 GiB |
| UNDOTBS1 | 200 MiB | 200 MiB | 32 GiB | ██████████ 100.0% | ░░░░░░░░░░ 0.6% | 31.8 GiB |
| USERS | 5 MiB | 1 MiB | 32 GiB | ██░░░░░░░░ 20.0% | ░░░░░░░░░░ 0.0% | 32 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SHOP_DATA | PERMANENT | false | 1 | 231.63 MiB |
| SYSAUX | PERMANENT | false | 1 | 13.25 MiB |
| SYSTEM | PERMANENT | false | 1 | 3.44 MiB |
| TEMP | TEMPORARY | false | 1 | 0 B |
| UNDOTBS1 | UNDO | false | 1 | 0 B |
| USERS | PERMANENT | false | 1 | 4 MiB |

| Tablespace | Path | Bytes | Maximum | Autoextend |
| --- | --- | --- | --- | --- |
| SHOP_DATA | /opt/oracle/oradata/CDB19/PIPDB1/shop_data01.dbf | 256 MiB | 0 B | false |
| SYSAUX | /opt/oracle/oradata/CDB19/PIPDB1/sysaux01.dbf | 400 MiB | 32 GiB | true |
| SYSTEM | /opt/oracle/oradata/CDB19/PIPDB1/system01.dbf | 320 MiB | 32 GiB | true |
| TEMP | /opt/oracle/oradata/CDB19/PIPDB1/temp01.dbf | 382 MiB | 32 GiB | true |
| UNDOTBS1 | /opt/oracle/oradata/CDB19/PIPDB1/undotbs01.dbf | 200 MiB | 32 GiB | true |
| USERS | /opt/oracle/oradata/CDB19/PIPDB1/users01.dbf | 5 MiB | 32 GiB | true |

</details>

## Top segments

Current PDB visibility only; file visibility and temporary/undo allocation depend on container configuration.
| Owner | Name | Partition | Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDER_HISTORY | P_202601 | TABLE PARTITION | SHOP_DATA | 8 MiB |
| SHOPAPP | LINES_PRODUCT_IX |  | INDEX | SHOP_DATA | 3 MiB |
| SHOPAPP | ORDER_LINES |  | TABLE | SHOP_DATA | 3 MiB |
| SHOPAPP | SYS_C007672 |  | INDEX | SHOP_DATA | 3 MiB |
| SHOPAPP | ORDERS |  | TABLE | SHOP_DATA | 2 MiB |
| SHOPAPP | ORDERS_STATUS_IX |  | INDEX | SHOP_DATA | 2 MiB |
| SHOPAPP | ORDERS_CUSTOMER_IX |  | INDEX | SHOP_DATA | 896 KiB |
| SHOPAPP | SYS_C007668 |  | INDEX | SHOP_DATA | 576 KiB |
| SHOPAPP | SYS_C007660 |  | INDEX | SHOP_DATA | 320 KiB |
| SHOPAPP | CUSTOMERS |  | TABLE | SHOP_DATA | 256 KiB |
| SHOPAPP | PRODUCTS |  | TABLE | SHOP_DATA | 128 KiB |
| SHOPAPP | SYS_C007659 |  | INDEX | SHOP_DATA | 128 KiB |
| SHOPAPP | SYS_C007664 |  | INDEX | SHOP_DATA | 128 KiB |

## Temp

Current PDB visibility only; file visibility and temporary/undo allocation depend on container configuration.

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| TEMP | /opt/oracle/oradata/CDB19/PIPDB1/temp01.dbf | 382 MiB | 32 GiB |

**Usage**

| Tablespace | Total Bytes | Used | Free | Usage |
| --- | --- | --- | --- | --- |
| TEMP | 381 MiB | 0 B | 381 MiB | ░░░░░░░░░░ 0.0% |

## Undo (last 24 h)

Container: PIPDB1. PDB-local (local undo). Empty rows do not establish absence.

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/CDB19/PIPDB1/undotbs01.dbf | 200 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 9.69 MiB |
| UNDOTBS1 | UNEXPIRED | 189.31 MiB |

**Last 24 h**

| Max Query Seconds | Snapshot Too Old Count | No Space Count | Min Tuned Retention Seconds | Max Tuned Retention Seconds | Retention Seconds |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 900 | 900 | 900 |

## Online redo

Container: PIPDB1. CDB-wide (shared by all PDBs in this CDB). Empty rows do not establish absence.
Log mode: ARCHIVELOG.

**Group**

| Group | Thread | Bytes | Members | Status | Archived |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 200 MiB | 1 | INACTIVE | YES |
| 2 | 1 | 200 MiB | 1 | INACTIVE | YES |
| 3 | 1 | 200 MiB | 1 | CURRENT | NO |

**Member**

| Group | Path | Type |
| --- | --- | --- |
| 1 | /opt/oracle/oradata/CDB19/redo01.log | ONLINE |
| 2 | /opt/oracle/oradata/CDB19/redo02.log | ONLINE |
| 3 | /opt/oracle/oradata/CDB19/redo03.log | ONLINE |

## Recovery area

Container: PIPDB1. CDB-wide (shared by all PDBs in this CDB). Empty rows do not establish absence.

**Area**

| Path | Limit Bytes | Used | Reclaimable Bytes | File Count | Usage |
| --- | --- | --- | --- | --- | --- |
| /opt/oracle/oradata/fra | 20 GiB | 1.03 GiB | 114.04 MiB | 9 | ░░░░░░░░░░ 4.6% |

**File type**

| Type | Usage | Reclaimable Percent | File Count |
| --- | --- | --- | --- |
| ARCHIVED LOG | ░░░░░░░░░░ 0.6% | ░░░░░░░░░░ 0.6% | 3 |
| BACKUP PIECE | ░░░░░░░░░░ 1.2% | ░░░░░░░░░░ 0.0% | 3 |

```

### `jobs --target c1-19c-pdb`

Exit: 0

```text
# Jobs: c1-19c-pdb

2026-11-07T06:12:15.339Z to 2026-11-08T06:12:15.339Z (exclusive; UTC)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history. Current PDB visibility only; empty rows do not establish CDB-wide absence.

## jobs (DBA_SCHEDULER_JOBS): ok
| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | TRUE | SCHEDULED | none | 2026-11-10T02:00:00.923Z | 0 | 0 |
| SHOPAPP | PLACE_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-08T06:11:28.180Z | 2026-11-08T06:12:28.197Z | 2 | 0 |
| SHOPAPP | REPORT_EXPORT_JOB | TRUE | SCHEDULED | 2026-11-08T06:09:28.938Z | 2026-11-09T06:09:28.924Z | 1 | 1 |
| SHOPAPP | SHIP_ORDERS_JOB | TRUE | SCHEDULED | none | 2026-11-08T06:14:28.922Z | 0 | 0 |
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-08T06:03:27.847Z | 2026-11-08T07:00:00.870Z | 1 | 0 |
| SYS | CLEANUP_NON_EXIST_OBJ | TRUE | SCHEDULED | 2026-11-08T06:03:27.789Z | 2026-11-08T18:03:31.531Z | 1 | 0 |
| SYS | CLEANUP_ONLINE_IND_BUILD | TRUE | SCHEDULED | 2026-11-08T06:03:27.789Z | 2026-11-08T06:32:46.880Z | 1 | 0 |
| SYS | CLEANUP_ONLINE_PMO | TRUE | SCHEDULED | 2026-11-08T06:03:27.789Z | 2026-11-08T06:33:26.870Z | 1 | 0 |
| SYS | CLEANUP_TAB_IOT_PMO | TRUE | SCHEDULED | 2026-11-08T06:03:27.789Z | 2026-11-08T06:32:56.870Z | 1 | 0 |
| SYS | CLEANUP_TRANSIENT_PKG | TRUE | SCHEDULED | 2026-11-08T06:03:27.789Z | 2026-11-08T06:33:16.000Z | 1 | 0 |
| SYS | CLEANUP_TRANSIENT_TYPE | TRUE | SCHEDULED | 2026-11-08T06:03:27.815Z | 2026-11-08T18:03:28.083Z | 1 | 0 |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | TRUE | SCHEDULED | none | none | 0 | 0 |
| SYS | FGR$AUTOPURGE_JOB | FALSE | DISABLED | none | none | 0 | 0 |
| SYS | FILE_SIZE_UPD | TRUE | SCHEDULED | 2026-11-08T06:03:27.788Z | 2027-11-08T06:03:28.057Z | 1 | 0 |
| SYS | FILE_WATCHER | FALSE | DISABLED | none | none | 0 | 0 |
| SYS | HM_CREATE_OFFLINE_DICTIONARY | FALSE | DISABLED | none | none | 0 | 0 |
| SYS | LOAD_OPATCH_INVENTORY | FALSE | DISABLED | none | none | 0 | 0 |
| SYS | ORA$AUTOTASK_CLEAN | TRUE | SCHEDULED | 2026-11-08T06:03:27.810Z | 2026-11-08T11:00:00.870Z | 1 | 0 |
| SYS | ORA$PREPLUGIN_BACKUP_JOB | FALSE | DISABLED | none | none | 0 | 0 |
| SYS | PMO_DEFERRED_GIDX_MAINT_JOB | TRUE | SCHEDULED | 2026-11-08T06:03:27.826Z | 2026-11-08T10:00:00.880Z | 1 | 0 |
| SYS | PURGE_LOG | TRUE | SCHEDULED | 2026-11-08T06:03:27.809Z | 2026-11-08T11:00:00.870Z | 1 | 0 |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | TRUE | SCHEDULED | 2026-11-08T06:03:27.790Z | 2026-11-08T08:00:00.870Z | 1 | 0 |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | TRUE | SCHEDULED | 2026-11-08T06:03:27.790Z | 2026-11-08T08:00:00.870Z | 1 | 0 |
| SYS | XMLDB_NFS_CLEANUP_JOB | FALSE | DISABLED | none | none | 0 | 0 |

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | REPORT_EXPORT_JOB | 206 | 2026-11-08T06:09:29.116Z | FAILED | 20001 | ORA-20001: C1 intentional report export failure<br>ORA-06512: at line 1<br> |

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 244 | 2026-11-08T06:11:28.278Z | SUCCEEDED | 0 | 2026-11-08T06:11:28.180Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 242 | 2026-11-08T06:10:29.198Z | SUCCEEDED | 0 | 2026-11-08T06:10:29.066Z | 0:00:00 | none |
| SHOPAPP | REPORT_EXPORT_JOB | 206 | 2026-11-08T06:09:29.116Z | FAILED | 20001 | 2026-11-08T06:09:28.938Z | 0:00:00 | ORA-20001: C1 intentional report export failure<br>ORA-06512: at line 1<br> |
| SHOPAPP | REPORT_EXPORT_JOB | 162 | 2026-11-08T06:09:01.139Z | FAILED | 20001 | 2026-11-08T06:09:01.046Z | 0:00:00 | ORA-20001: C1 intentional report export failure<br>ORA-06512: at line 1<br> |
| SYS | PURGE_LOG | 98 | 2026-11-08T06:03:31.338Z | SUCCEEDED | 0 | 2026-11-08T06:03:27.809Z | 0:00:03 | none |
| SYS | BSLN_MAINTAIN_STATS_JOB | 106 | 2026-11-08T06:03:29.357Z | SUCCEEDED | 0 | 2026-11-08T06:03:27.847Z | 0:00:01 | none |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 86 | 2026-11-08T06:03:29.004Z | SUCCEEDED | 0 | 2026-11-08T06:03:27.798Z | 0:00:01 | none |
| SYS | ORA$AUTOTASK_CLEAN | 100 | 2026-11-08T06:03:28.736Z | SUCCEEDED | 0 | 2026-11-08T06:03:27.810Z | 0:00:00 | none |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 92 | 2026-11-08T06:03:28.321Z | SUCCEEDED | 0 | 2026-11-08T06:03:27.798Z | 0:00:00 | none |

## jobLog (DBA_SCHEDULER_JOB_LOG): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | OPERATION | STATUS |
| --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 244 | 2026-11-08T06:11:28.276Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 242 | 2026-11-08T06:10:29.196Z | RUN | SUCCEEDED |
| SHOPAPP | REPORT_EXPORT_JOB | 206 | 2026-11-08T06:09:29.114Z | RUN | FAILED |
| SHOPAPP | REPORT_EXPORT_JOB | 202 | 2026-11-08T06:09:28.911Z | DROP | none |
| SHOPAPP | REPORT_EXPORT_JOB | 162 | 2026-11-08T06:09:01.136Z | RUN | FAILED |
| SYS | PURGE_LOG | 98 | 2026-11-08T06:03:31.334Z | RUN | SUCCEEDED |
| SYS | BSLN_MAINTAIN_STATS_JOB | 106 | 2026-11-08T06:03:29.345Z | RUN | SUCCEEDED |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 86 | 2026-11-08T06:03:28.997Z | RUN | SUCCEEDED |
| SYS | ORA$AUTOTASK_CLEAN | 100 | 2026-11-08T06:03:28.727Z | RUN | SUCCEEDED |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 92 | 2026-11-08T06:03:28.098Z | RUN | SUCCEEDED |

## windows (DBA_SCHEDULER_WINDOWS): ok
| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE | none | 2026-11-14T06:00:00.000Z | 4:00:00 |
| MONDAY_WINDOW | TRUE | FALSE | none | 2026-11-10T06:00:00.000Z | 4:00:00 |
| SATURDAY_WINDOW | TRUE | FALSE | none | 2026-11-14T14:00:00.000Z | 20:00:00 |
| SUNDAY_WINDOW | TRUE | FALSE | none | 2026-11-08T14:00:00.000Z | 20:00:00 |
| THURSDAY_WINDOW | TRUE | FALSE | none | 2026-11-13T06:00:00.000Z | 4:00:00 |
| TUESDAY_WINDOW | TRUE | FALSE | none | 2026-11-11T06:00:00.000Z | 4:00:00 |
| WEDNESDAY_WINDOW | TRUE | FALSE | none | 2026-11-12T06:00:00.000Z | 4:00:00 |
| WEEKEND_WINDOW | FALSE | FALSE | none | 2019-04-20T07:00:00.000Z | 2d 00:00:00 |
| WEEKNIGHT_WINDOW | FALSE | FALSE | none | 2019-04-18T05:00:00.000Z | 8:00:00 |

## autotaskClients (DBA_AUTOTASK_CLIENT): ok
| CLIENT_NAME | STATUS | WINDOW_GROUP |
| --- | --- | --- |
| auto optimizer stats collection | ENABLED | ORA$AT_WGRP_OS |
| auto space advisor | ENABLED | ORA$AT_WGRP_SA |
| sql tuning advisor | ENABLED | ORA$AT_WGRP_SQ |

## autotaskHistory (DBA_AUTOTASK_JOB_HISTORY): ok
No rows returned within visible scope.

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok
| ID | OPERATION | TARGET | START_TIME | END_TIME | STATUS |
| --- | --- | --- | --- | --- | --- |
| 342 | lock_table_stats | "SHOPAPP"."PRODUCTS" | 2026-11-08T06:09:27.927Z | 2026-11-08T06:09:27.937Z | COMPLETED |
| 323 | gather_schema_stats | SHOPAPP | 2026-11-08T06:09:23.719Z | 2026-11-08T06:09:27.894Z | COMPLETED |
| 322 | unlock_table_stats | "SHOPAPP"."PRODUCTS" | 2026-11-08T06:09:23.569Z | 2026-11-08T06:09:23.701Z | COMPLETED |
| 302 | lock_table_stats | "SHOPAPP"."PRODUCTS" | 2026-11-08T06:08:59.749Z | 2026-11-08T06:08:59.763Z | COMPLETED |
| 283 | gather_schema_stats | SHOPAPP | 2026-11-08T06:08:57.815Z | 2026-11-08T06:08:59.713Z | COMPLETED |
| 282 | unlock_table_stats | "SHOPAPP"."PRODUCTS" | 2026-11-08T06:08:57.753Z | 2026-11-08T06:08:57.806Z | COMPLETED |
| 281 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:02:05.241Z | 2026-11-08T06:02:05.263Z | COMPLETED |
| 280 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:02:05.109Z | 2026-11-08T06:02:05.147Z | COMPLETED |
| 279 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:02:04.828Z | 2026-11-08T06:02:04.877Z | COMPLETED |
| 278 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:02:04.679Z | 2026-11-08T06:02:04.758Z | COMPLETED |
| 277 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:02:01.951Z | 2026-11-08T06:02:01.973Z | COMPLETED |
| 276 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:02:01.814Z | 2026-11-08T06:02:01.855Z | COMPLETED |
| 275 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:02:01.617Z | 2026-11-08T06:02:01.646Z | COMPLETED |
| 274 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:02:01.378Z | 2026-11-08T06:02:01.560Z | COMPLETED |
| 273 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:59.879Z | 2026-11-08T06:01:59.901Z | COMPLETED |
| 272 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:59.437Z | 2026-11-08T06:01:59.761Z | COMPLETED |
| 271 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:57.237Z | 2026-11-08T06:01:57.395Z | COMPLETED |
| 270 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:57.143Z | 2026-11-08T06:01:57.160Z | COMPLETED |
| 269 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:56.807Z | 2026-11-08T06:01:56.824Z | COMPLETED |
| 268 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:56.355Z | 2026-11-08T06:01:56.722Z | COMPLETED |
| 249 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:34.552Z | 2026-11-08T06:01:34.562Z | COMPLETED |
| 248 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:34.265Z | 2026-11-08T06:01:34.502Z | COMPLETED |
| 231 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:17.894Z | 2026-11-08T06:01:18.048Z | COMPLETED |
| 230 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:17.748Z | 2026-11-08T06:01:17.768Z | COMPLETED |
| 229 | gather_table_stats | "SYS"."UTL_RECOMP_SORTED" | 2026-11-08T06:01:17.663Z | 2026-11-08T06:01:17.671Z | COMPLETED |
| 228 | gather_table_stats | "SYS"."UTL_RECOMP_COMPILED" | 2026-11-08T06:01:17.126Z | 2026-11-08T06:01:17.563Z | COMPLETED |
| 208 | gather_dictionary_stats | XOQ | 2026-11-08T06:00:34.029Z | 2026-11-08T06:00:49.120Z | COMPLETED |

## invalidObjects (DBA_OBJECTS): ok
| OWNER | OBJECT_TYPE | OBJECT_COUNT |
| --- | --- | --- |
| SHOPAPP | VIEW | 1 |

## indexes (DBA_INDEXES): ok
No rows returned within visible scope.

## indexPartitions (DBA_IND_PARTITIONS): ok
| INDEX_OWNER | INDEX_NAME | PARTITION_NAME | STATUS |
| --- | --- | --- | --- |
| SHOPAPP | HISTORY_ORDER_IX | P_202601 | UNUSABLE |

## indexSubpartitions (DBA_IND_SUBPARTITIONS): ok
No rows returned within visible scope.

## staleStatistics (DBA_TAB_STATISTICS): ok
| OWNER | OBJECT_TYPE | STALE_COUNT |
| --- | --- | --- |
| DVSYS | TABLE | 1 |
| LBACSYS | TABLE | 2 |
| MDSYS | TABLE | 20 |
| SHOPAPP | TABLE | 1 |
| SYS | PARTITION | 2 |
| SYS | TABLE | 76 |
| SYSTEM | TABLE | 1 |
| XDB | TABLE | 1 |

```

## Findings for WP-31A / coordinator

- **Release blocker:** `src/config/approvedTargets.ts` lacks C1, and
  `src/config/targets.ts:73` requires exactly two packaged targets. Both must be
  updated by the product owner WP. The new packaged entry alone consequently
  breaks default configuration loading across many tests and commands. The
  private-file CLI results above verify C1 independently without product changes.
- `targets check` with the adapter accepts Oracle 19.9.1, identifies CDB/PDB and
  PIPDB1, and passes the account check. `check` exits 1 with 2 WARN, 4 UNKNOWN,
  10 OK. WARNs correctly detect failed runs and two maintenance units.
- `blocking` is UNKNOWN with `V$LOCK: query failed` despite the exact SELECT
  grant. Investigate query compatibility/scope; no product fix attempted here.
- FRA/recovery is correctly OK (20 GiB limit, 4.6% used), and ARCHIVELOG is
  visible. Backup age/archive gaps remain UNKNOWN. There is a real new lab
  prerequisite: SHOP_DATA is file 13, created **after** the coordinator's backup;
  its level-0 coverage is absent. Coordinator should take a fresh backup including
  SHOP_DATA before expecting these to be OK. Do not treat that missing coverage
  as a product bug. This WP used only the authorized SQL*Plus administration
  path and did not run RMAN or alter root backup settings.
- `V$RMAN_BACKUP_JOB_DETAILS` is empty in PIPDB1 despite visible backup sets,
  pieces and per-file level-0 metadata. The product reports the PDB visibility
  limitation. No incremental rows were visible in the captured per-file evidence.
- Backup DATE values render around 12:06Z while capture/scheduler timestamps are
  around 06:12Z; verify timezone handling before interpreting backup age.
- `alertErrors` is UNKNOWN because the alert view row cap was reached. It should
  not be reported as clean solely because the bounded sample contains no ORAs.
- Scope labels correctly distinguish PDB-local objects and shared redo/FRA in
  these captures. The general tablespace table shows TEMP/UNDO as 100% allocated
  while their specialized usage panels show no active TEMP usage / expired undo;
  verify presentation to avoid implying active exhaustion.

## Validation and limits

- Seed executed twice successfully, preserving data and passwords. One invalid
  view, one unusable local index partition, stale locked PRODUCTS statistics,
  and recorded ORA-20001 scheduler failures verified directly.
- Exact grant comparison: 128 template SELECT grants + 5 SHOPAPP table SELECT
  grants; CREATE SESSION only, no roles, no grant option, root service refused.
- `npm run typecheck`: PASS (also rerun after adding C1 tests).
- `npm test -- --maxWorkers=2`: FAIL; 47 files failed, 93 passed; 363 tests
  failed, 2,300 passed. The packaged config pin prevents config loading broadly;
  no out-of-scope product changes were made to force this suite green.
- Focused C1 unit tests: 2/2 PASS. Focused live C1 seed test: 1/1 PASS with
  PIAGENT_SECRET_DIR set. These tests do not need an LLM.
- `npm run test:integration`: FAIL; 3 files failed, 33 passed; 2 tests failed,
  82 skipped. Run without PIAGENT_SECRET_DIR so DB/LLM-dependent tests skip;
  failures are packaged-pin errors (including setup-error assertions). The
  separate live C1 test above ran with secrets enabled. No LLM calls made.
- Initial dependency commands lacked installed tools; `npm ci --ignore-scripts`
  installed the locked existing dependencies, without dependency changes.
- During initial setup Oracle rejected an overlong generated password and
  SQL*Plus echoed its failed statement. Both unused initial credentials were
  replaced before account creation; the runner now redacts captured SQL*Plus
  output and generates 24-character passwords. No current secrets are in repo.
- No shared TypeScript contract changes needed. Coordinator/WP-31A must update
  the two packaged-target restrictions above. End-to-end default packaged CLI
  acceptance and full green suites remain blocked until that change.
