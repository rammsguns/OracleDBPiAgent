# WP-31A: live Oracle 19c PDB verification

Verified 2026-11-08 on branch wp-31a-pdb-live. C1: oracle19c-cdb, localhost:1524/PIPDB1, Oracle 19.9.1, PDB-local PIAGENT_RO. No LLM calls. No other containers were administered. Passwords were read only from PIAGENT_SECRET_DIR; none are included here.

## Changes and findings

- Packaged identities now pin all three approved labs. The exact endpoint/username/password-file/schema/environment checks and private owner-approved target path are unchanged. Expectations that encoded two packaged targets were updated.
- The session provider obtains the server offset from SYSTIMESTAMP for each new session. Following review, the provider fetches DATE/plain TIMESTAMP wall clocks as explicit server-side TO_CHAR text and interprets that text with the offset before constructing a Date. No host-local Date is used to decode those fields. TIMESTAMP WITH TIME ZONE/LOCAL TIME ZONE retain driver instant semantics. Tool text uses ISO UTC too. This covers backup/check, jobs, sessions, alerts, space/undo, source metadata, report/history and drift centrally; existing SQL that already uses SYS_EXTRACT_UTC remains unchanged.
- **1.6.0 backup age was wrong when host and database timezones differed.** UTC database DATE fetched on this CST host became six hours too late. Other DATE-based ages/rendering had the same problem. **Scheduler failed-job windows were not host-timezone shifted:** jobs/check already bind explicit UTC TIMESTAMP WITH TIME ZONE windows; report history filters run in the database. Scheduler zone-aware timestamps were already instants. Session TIME_ZONE=UTC alone did not fix DATE decoding.
- The normalization uses the database server offset at session creation. It does not reconstruct historical server daylight-saving rules from zone-less DATE values; DATE itself carries no timezone. No shared contract or dependency change is needed.
- Empty PDB RMAN job details now permit a labelled full/level-0 per-datafile fallback, only with complete visible file/set/piece/incarnation evidence. Missing coverage remains UNKNOWN. Backup output explains the fallback and does not claim restore/media verification.
- Despite the setup handoff, the 06:15 level-1 included SHOP_DATA but no full/level-0 row existed for file 13. A fresh C1-only RMAN level-0 database plus archivelog backup completed during this verification. No earlier backups/data were deleted. All five PDB datafiles now have level-0 coverage.
- archiveGaps is measured OK: ARCHIVELOG, visible archived logs/history and full-file checkpoints, zero measured sequence gaps. This remains metadata evidence, not media validation.
- Blocking failure was **NJS-123 (30-second call timeout), not an ORA privilege error**. The same V$LOCK query stalled as SYS in PIPDB1 and spilled to TEMP. A query-local RULE hint returned the same columns in ~0.18 seconds; no grants/session optimizer settings changed. The schema-drift constraints join had a similar slow dictionary plan and now uses a query-local RULE hint too.
- Alert collection restricts time and includes the current CON_ID plus CDB-wide/instance CON_ID 0/1; health additionally filters ORA text before bounding the result. Lower-bound verdict behavior is retained. C1 has real ORAs from the intentional scheduler failures and initial seed tablespace recreation, so alertErrors is measured WARN, not clean/UNKNOWN.
- General TEMP usage measures used sort blocks; UNDO measures ACTIVE + UNEXPIRED extents, excluding reusable EXPIRED bytes. Check does not warn merely because extents are allocated.
- Web diagnostic and drift API/selector pins also encoded two labs; all three packaged labs are now available.
- C1 hides LONG text for inherited SYS.ALL_CUBE_DEPENDENCIES even though its DBA_VIEWS length is visible. The source tool correctly refuses an incomplete fetch; integration now asserts this PDB visibility restriction. C1 WORKLOAD has a shorter body than p1, so its source fixture checks lines 1–6 rather than absent lines 24–29.

## Live health output

Command: `TZ=America/Mexico_City PIAGENT_SECRET_DIR=… npx tsx src/cli/index.ts check --target c1-19c-pdb --json`. Exit 1 (measured WARN).
Captured 2026-11-08T06:24:35.852Z.

| Check | Result | Value | Scope |
| --- | --- | --- | --- |
| tablespace:SHOP_DATA | OK | 9.5 % | This PDB (PIPDB1) |
| tablespace:SYSAUX | OK | 1.2 % | This PDB (PIPDB1) |
| tablespace:SYSTEM | OK | 1.0 % | This PDB (PIPDB1) |
| tablespace:USERS | OK | 0.0 % | This PDB (PIPDB1) |
| undo:UNDOTBS1 | OK | 0.0 % | This PDB (PIPDB1) (local undo) |
| temp:TEMP | OK | 13.2 % | This PDB (PIPDB1) |
| recovery | OK | 9.6 % | CDB-wide (shared by all PDBs) |
| blocking | OK | 0 seconds | This PDB (PIPDB1) |
| backupAge | OK | 0.1 hours | CDB-wide (shared by all PDBs) |
| archiveGaps | OK | 0 gaps | CDB-wide (shared by all PDBs) |
| failedJobs | WARN | 2 runs | This PDB (PIPDB1) |
| maintenance | WARN | 2 objects/index units | This PDB (PIPDB1) |
| alertErrors | WARN | 5 errors | This PDB (PIPDB1) |
| incidents | OK | 0 incidents | This PDB (PIPDB1) |
| expiry | OK | 180.0 days | This PDB (PIPDB1) |
| defaultPasswords | OK | 0 accounts | This PDB (PIPDB1) |

The deliberate REPORT_EXPORT_JOB failures, one invalid VIEW, one unusable index partition, and stale PRODUCTS statistics remain visible in Jobs/Report. CDB/PDB labels distinguish local objects/sessions from shared redo/FRA/backup metadata; PDB-hidden evidence never establishes CDB-wide absence. The initial ADR health snapshot below predates review; current ADR scope includes the PDB plus visible CDB-wide/instance rows, with an explicit Oracle visibility caveat.

## Live commands

All commands below ran using the packaged target and PIAGENT_SECRET_DIR. These are bounded output excerpts (first 100 lines or 12,000 characters per command); the automated integration tests exercise full structured responses. SQL has no list subcommand: the supported cache search is `sql --text SHOPAPP`. Top's minimum interval is five seconds.

### `npx tsx src/cli/index.ts targets check --target c1-19c-pdb`

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

### `npx tsx src/cli/index.ts backup --target c1-19c-pdb`

Exit: 0

```text
# Backup — c1-19c-pdb

CDB-wide (shared by all PDBs). Current PDB visibility only; empty rows do not establish absence.

Captured 2026-11-08T06:24:39.968Z. Sequential bounded SELECT snapshots.

## Restore-to-time estimate
Status: Not verifiable with the available evidence.

- From: 2026-11-08T06:21:34.000Z.
- Through: not established.
- Evidence: database, datafiles, backups, sets, pieces, archives, history, corruption, recoverFiles.

Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.

## Per-datafile backups

| file | level0 | incremental | checkpointScn |
| --- | --- | --- | --- |
| 9 | 2026-11-08T06:21:33.000Z | 2026-11-08T06:15:06.000Z | 2528256 |
| 10 | 2026-11-08T06:21:34.000Z | 2026-11-08T06:15:06.000Z | 2528256 |
| 11 | 2026-11-08T06:21:19.000Z | 2026-11-08T06:15:06.000Z | 2528256 |
| 12 | 2026-11-08T06:21:01.000Z | 2026-11-08T06:15:03.000Z | 2528256 |
| 13 | 2026-11-08T06:21:04.000Z | 2026-11-08T06:15:05.000Z | 2528256 |

## Archive gaps

None.

## Recovery-area balance (bytes)

| limitBytes | usedBytes | reclaimableBytes | nonReclaimableBytes | availableAfterReclaimBytes |
| --- | --- | --- | --- | --- |
| 20 GiB | 2.08 GiB | 168.86 MiB | 1.92 GiB | 18.08 GiB |

## Evidence jobs (V$RMAN_BACKUP_JOB_DETAILS): ok — RMAN job details hidden/empty in PDB; use visible per-datafile full/level-0 completion metadata for backup age.

None.

## Evidence sets (V$BACKUP_SET): ok

| SET_STAMP | SET_COUNT | BACKUP_TYPE | INCREMENTAL_LEVEL | START_TIME | COMPLETION_TIME | PIECES |
| --- | --- | --- | --- | --- | --- | --- |
| 1248762142 | 18 | L | none | 2026-11-08T06:22:22.000Z | 2026-11-08T06:22:22.000Z | 1 |
| 1248762060 | 16 | I | 0 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:34.000Z | 1 |
| 1248761957 | 14 | L | none | 2026-11-08T06:19:17.000Z | 2026-11-08T06:19:24.000Z | 1 |
| 1248761711 | 12 | L | none | 2026-11-08T06:15:11.000Z | 2026-11-08T06:15:11.000Z | 1 |
| 1248761703 | 10 | I | 1 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:06.000Z | 1 |
| 1248761692 | 8 | L | none | 2026-11-08T06:14:52.000Z | 2026-11-08T06:14:57.000Z | 1 |
| 1248761209 | 5 | L | none | 2026-11-08T06:06:49.000Z | 2026-11-08T06:06:50.000Z | 1 |
| 1248761158 | 3 | I | 0 | 2026-11-08T06:05:58.000Z | 2026-11-08T06:06:17.000Z | 1 |
| 1248761085 | 1 | L | none | 2026-11-08T06:04:45.000Z | 2026-11-08T06:04:50.000Z | 1 |

## Evidence pieces (V$BACKUP_PIECE): ok

| SET_STAMP | SET_COUNT | PIECE# | COPY# | STATUS | DELETED | COMPLETION_TIME |
| --- | --- | --- | --- | --- | --- | --- |
| 1248762142 | 18 | 1 | 1 | A | NO | 2026-11-08T06:22:22.000Z |
| 1248762060 | 16 | 1 | 1 | A | NO | 2026-11-08T06:21:34.000Z |
| 1248761957 | 14 | 1 | 1 | A | NO | 2026-11-08T06:19:24.000Z |
| 1248761711 | 12 | 1 | 1 | A | NO | 2026-11-08T06:15:11.000Z |
| 1248761703 | 10 | 1 | 1 | A | NO | 2026-11-08T06:15:06.000Z |
| 1248761692 | 8 | 1 | 1 | A | NO | 2026-11-08T06:14:57.000Z |
| 1248761209 | 5 | 1 | 1 | A | NO | 2026-11-08T06:06:50.000Z |
| 1248761158 | 3 | 1 | 1 | A | NO | 2026-11-08T06:06:17.000Z |
| 1248761085 | 1 | 1 | 1 | A | NO | 2026-11-08T06:04:50.000Z |

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
| 10 | 1248762060 | 16 | 0 | 2528256 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:34.000Z | 1920977 | 2506376 |
| 9 | 1248762060 | 16 | 0 | 2528256 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:33.000Z | 1920977 | 2506372 |
| 11 | 1248762060 | 16 | 0 | 2528256 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:19.000Z | 1920977 | 2506379 |
| 13 | 1248762060 | 16 | 0 | 2528256 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:04.000Z | 1920977 | 2512544 |
| 12 | 1248762060 | 16 | 0 | 2528256 | 2026-11-08T06:21:00.000Z | 2026-11-08T06:21:01.000Z | 1920977 | 2507274 |
| 10 | 1248761703 | 10 | 1 | 2521114 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:06.000Z | 1920977 | 2506376 |
| 9 | 1248761703 | 10 | 1 | 2521114 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:06.000Z | 1920977 | 2506372 |
| 11 | 1248761703 | 10 | 1 | 2521114 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:06.000Z | 1920977 | 2506379 |
| 13 | 1248761703 | 10 | 1 | 2521114 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:05.000Z | 1920977 | 2512544 |
| 12 | 1248761703 | 10 | 1 | 2521114 | 2026-11-08T06:15:03.000Z | 2026-11-08T06:15:03.000Z | 1920977 | 2507274 |
| 10 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T06:05:58.000Z | 2026-11-08T06:06:17.000Z | 1920977 | 2506376 |
| 9 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T06:05:58.000Z | 2026-11-08T06:06:16.000Z | 1920977 | 2506372 |
| 11 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T06:05:58.000Z | 2026-11-08T06:06:09.000Z | 1920977 | 2506379 |
| 12 | 1248761158 | 3 | 0 | 2512437 | 2026-11-08T06:05:58.000Z | 2026-11-08T06:05:59.000Z | 1920977 | 2507274 |

## Evidence archives (V$ARCHIVED_LOG): ok

| THREAD# | SEQUENCE# | RESETLOGS_CHANGE# | FIRST_CHANGE# | NEXT_CHANGE# | FIRST_TIME | NEXT_TIME | STATUS | DELETED | NAME |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

Excerpt ends here; additional output omitted.

### `npx tsx src/cli/index.ts space --target c1-19c-pdb`

Exit: 0

```text
# Space — c1-19c-pdb

Captured at 2026-11-08T06:21:21.067Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **medium: TEMP** — Temp above 80% used right now. Review current temp consumers and their SQL_IDs.
- **info: Redo** — CDB-wide (shared by all PDBs in this CDB). A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

Current PDB visibility only; file visibility and temporary/undo allocation depend on container configuration.
| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SHOP_DATA | 256 MiB | 24.38 MiB | 256 MiB | █░░░░░░░░░ 9.5% | █░░░░░░░░░ 9.5% | 231.63 MiB |
| SYSAUX | 410 MiB | 387.5 MiB | 32 GiB | █████████░ 94.5% | ░░░░░░░░░░ 1.2% | 31.62 GiB |
| SYSTEM | 320 MiB | 316.63 MiB | 32 GiB | ██████████ 98.9% | ░░░░░░░░░░ 1.0% | 31.69 GiB |
| TEMP | 1.76 GiB | 1.76 GiB | 32 GiB | ██████████ 99.9% | █░░░░░░░░░ 5.5% | 30.24 GiB |
| UNDOTBS1 | 200 MiB | 41.88 MiB | 32 GiB | ██░░░░░░░░ 20.9% | ░░░░░░░░░░ 0.1% | 31.96 GiB |
| USERS | 5 MiB | 1 MiB | 32 GiB | ██░░░░░░░░ 20.0% | ░░░░░░░░░░ 0.0% | 32 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SHOP_DATA | PERMANENT | false | 1 | 231.63 MiB |
| SYSAUX | PERMANENT | false | 1 | 22.5 MiB |
| SYSTEM | PERMANENT | false | 1 | 3.38 MiB |
| TEMP | TEMPORARY | false | 1 | 1 MiB |
| UNDOTBS1 | UNDO | false | 1 | 158.13 MiB |
| USERS | PERMANENT | false | 1 | 4 MiB |

| Tablespace | Path | Bytes | Maximum | Autoextend |
| --- | --- | --- | --- | --- |
| SHOP_DATA | /opt/oracle/oradata/CDB19/PIPDB1/shop_data01.dbf | 256 MiB | 0 B | false |
| SYSAUX | /opt/oracle/oradata/CDB19/PIPDB1/sysaux01.dbf | 410 MiB | 32 GiB | true |
| SYSTEM | /opt/oracle/oradata/CDB19/PIPDB1/system01.dbf | 320 MiB | 32 GiB | true |
| TEMP | /opt/oracle/oradata/CDB19/PIPDB1/temp01.dbf | 1.76 GiB | 32 GiB | true |
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
| TEMP | /opt/oracle/oradata/CDB19/PIPDB1/temp01.dbf | 1.77 GiB | 32 GiB |

**Usage**

| Tablespace | Total Bytes | Used | Free | Usage |
| --- | --- | --- | --- | --- |
| TEMP | 1.77 GiB | 1.77 GiB | 0 B | ██████████ 100.0% |

**Consumer**

| SID | Username | SQL_ID | Segment Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- | --- |
| 2547 | SYS | ct78468spkzrt | HASH | TEMP | 1.77 GiB |

## Undo (last 24 h)

Container: PIPDB1. PDB-local (local undo). Empty rows do not establish absence.

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/CDB19/PIPDB1/undotbs01.dbf | 200 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 157.13 MiB |
```

Excerpt ends here; additional output omitted.

### `npx tsx src/cli/index.ts jobs --target c1-19c-pdb`

Exit: 0

```text
# Jobs: c1-19c-pdb

2026-11-07T06:21:24.356Z to 2026-11-08T06:21:24.356Z (exclusive; UTC)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history. Current PDB visibility only; empty rows do not establish CDB-wide absence.

## jobs (DBA_SCHEDULER_JOBS): ok
| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | TRUE | SCHEDULED | none | 2026-11-10T02:00:00.923Z | 0 | 0 |
| SHOPAPP | PLACE_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-08T06:20:28.752Z | 2026-11-08T06:21:28.757Z | 11 | 0 |
| SHOPAPP | REPORT_EXPORT_JOB | TRUE | SCHEDULED | 2026-11-08T06:09:28.938Z | 2026-11-09T06:09:28.924Z | 1 | 1 |
| SHOPAPP | SHIP_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-08T06:19:29.099Z | 2026-11-08T06:24:28.000Z | 2 | 0 |
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
| SHOPAPP | PLACE_ORDERS_JOB | 266 | 2026-11-08T06:20:28.767Z | SUCCEEDED | 0 | 2026-11-08T06:20:28.752Z | 0:00:00 | none |
| SHOPAPP | SHIP_ORDERS_JOB | 264 | 2026-11-08T06:19:29.145Z | SUCCEEDED | 0 | 2026-11-08T06:19:29.099Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 262 | 2026-11-08T06:19:28.700Z | SUCCEEDED | 0 | 2026-11-08T06:19:28.687Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 260 | 2026-11-08T06:18:28.496Z | SUCCEEDED | 0 | 2026-11-08T06:18:28.482Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 258 | 2026-11-08T06:17:28.296Z | SUCCEEDED | 0 | 2026-11-08T06:17:28.282Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 256 | 2026-11-08T06:16:29.078Z | SUCCEEDED | 0 | 2026-11-08T06:16:29.065Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 254 | 2026-11-08T06:15:28.848Z | SUCCEEDED | 0 | 2026-11-08T06:15:28.840Z | 0:00:00 | none |
| SHOPAPP | SHIP_ORDERS_JOB | 252 | 2026-11-08T06:14:29.339Z | SUCCEEDED | 0 | 2026-11-08T06:14:29.050Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 250 | 2026-11-08T06:14:28.725Z | SUCCEEDED | 0 | 2026-11-08T06:14:28.715Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 248 | 2026-11-08T06:13:28.579Z | SUCCEEDED | 0 | 2026-11-08T06:13:28.503Z | 0:00:00 | none |
| SHOPAPP | PLACE_ORDERS_JOB | 246 | 2026-11-08T06:12:28.392Z | SUCCEEDED | 0 | 2026-11-08T06:12:28.304Z | 0:00:00 | none |
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
| SHOPAPP | PLACE_ORDERS_JOB | 266 | 2026-11-08T06:20:28.767Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 264 | 2026-11-08T06:19:29.144Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 262 | 2026-11-08T06:19:28.699Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 260 | 2026-11-08T06:18:28.495Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 258 | 2026-11-08T06:17:28.296Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 256 | 2026-11-08T06:16:29.077Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 254 | 2026-11-08T06:15:28.848Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 252 | 2026-11-08T06:14:29.338Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 250 | 2026-11-08T06:14:28.725Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 248 | 2026-11-08T06:13:28.577Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 246 | 2026-11-08T06:12:28.390Z | RUN | SUCCEEDED |
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
```

Excerpt ends here; additional output omitted.

### `npx tsx src/cli/index.ts top --target c1-19c-pdb --seconds 5`

Exit: 0

```text
# Top — c1-19c-pdb: ok; requested 5s

CDB-wide (shared by all PDBs)

Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

## sql: ok; 5.260s

Current PDB visibility; empty rows do not prove absence.

### elapsedUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| g4jnjjrvxddqn | 6001733 | 1140985.359 | measured | piagent sql --target c1-19c-pdb --sql-id g4jnjjrvxddqn |
| 0r730t6vgdh89 | 993281 | 188831.972 | measured | piagent sql --target c1-19c-pdb --sql-id 0r730t6vgdh89 |
| 9mdaa41nupt2f | 379958 | 72233.556 | measured | piagent sql --target c1-19c-pdb --sql-id 9mdaa41nupt2f |
| 1mvwb0ah65rw0 | 145075 | 27580.109 | measured | piagent sql --target c1-19c-pdb --sql-id 1mvwb0ah65rw0 |
| 2rs36av3juhnr | 50949 | 9685.88 | measured | piagent sql --target c1-19c-pdb --sql-id 2rs36av3juhnr |
| dcs11f9gutsbh | 47597 | 9048.633 | measured | piagent sql --target c1-19c-pdb --sql-id dcs11f9gutsbh |
| 9zg9qd9bm4spu | 33722 | 6410.866 | measured | piagent sql --target c1-19c-pdb --sql-id 9zg9qd9bm4spu |
| 9gvx0xgn1n793 | 27636 | 5253.861 | measured | piagent sql --target c1-19c-pdb --sql-id 9gvx0xgn1n793 |
| 0k8522rmdzg4k | 22417 | 4261.681 | measured | piagent sql --target c1-19c-pdb --sql-id 0k8522rmdzg4k |
| f0h5rpzmhju11 | 21492 | 4085.829 | measured | piagent sql --target c1-19c-pdb --sql-id f0h5rpzmhju11 |

### cpuUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| g4jnjjrvxddqn | 1389205 | 264100.813 | measured | piagent sql --target c1-19c-pdb --sql-id g4jnjjrvxddqn |
| 0r730t6vgdh89 | 1027123 | 195265.652 | measured | piagent sql --target c1-19c-pdb --sql-id 0r730t6vgdh89 |
| 9mdaa41nupt2f | 334804 | 63649.36 | measured | piagent sql --target c1-19c-pdb --sql-id 9mdaa41nupt2f |
| 1mvwb0ah65rw0 | 117919 | 22417.501 | measured | piagent sql --target c1-19c-pdb --sql-id 1mvwb0ah65rw0 |
| 2rs36av3juhnr | 51107 | 9715.917 | measured | piagent sql --target c1-19c-pdb --sql-id 2rs36av3juhnr |
| dcs11f9gutsbh | 46954 | 8926.393 | measured | piagent sql --target c1-19c-pdb --sql-id dcs11f9gutsbh |
| 9zg9qd9bm4spu | 34833 | 6622.078 | measured | piagent sql --target c1-19c-pdb --sql-id 9zg9qd9bm4spu |
| 9gvx0xgn1n793 | 27646 | 5255.762 | measured | piagent sql --target c1-19c-pdb --sql-id 9gvx0xgn1n793 |
| f0h5rpzmhju11 | 22531 | 4283.353 | measured | piagent sql --target c1-19c-pdb --sql-id f0h5rpzmhju11 |
| a62fbfyqb88qc | 20199 | 3840.018 | measured | piagent sql --target c1-19c-pdb --sql-id a62fbfyqb88qc |

### bufferGets

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 9mdaa41nupt2f | 7585 | 1441.979 | measured | piagent sql --target c1-19c-pdb --sql-id 9mdaa41nupt2f |
| 0r730t6vgdh89 | 1989 | 378.127 | measured | piagent sql --target c1-19c-pdb --sql-id 0r730t6vgdh89 |
| 9gvx0xgn1n793 | 690 | 131.175 | measured | piagent sql --target c1-19c-pdb --sql-id 9gvx0xgn1n793 |
| g4jnjjrvxddqn | 390 | 74.143 | measured | piagent sql --target c1-19c-pdb --sql-id g4jnjjrvxddqn |
| 0k8522rmdzg4k | 168 | 31.938 | measured | piagent sql --target c1-19c-pdb --sql-id 0k8522rmdzg4k |
| 9zg9qd9bm4spu | 165 | 31.368 | measured | piagent sql --target c1-19c-pdb --sql-id 9zg9qd9bm4spu |
| 5x2x7y2umr3y7 | 84 | 15.969 | measured | piagent sql --target c1-19c-pdb --sql-id 5x2x7y2umr3y7 |
| 865qwpcdyggkk | 82 | 15.589 | measured | piagent sql --target c1-19c-pdb --sql-id 865qwpcdyggkk |
| 0sbbcuruzd66f | 24 | 4.563 | measured | piagent sql --target c1-19c-pdb --sql-id 0sbbcuruzd66f |

### physicalReads

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 0r730t6vgdh89 | 40 | 7.604 | measured | piagent sql --target c1-19c-pdb --sql-id 0r730t6vgdh89 |

### executions

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 896y3kr66cfdm | 47 | 8.935 | measured | piagent sql --target c1-19c-pdb --sql-id 896y3kr66cfdm |
| 0k8522rmdzg4k | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 0k8522rmdzg4k |
| 0mnkrf2k46gv5 | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 0mnkrf2k46gv5 |
| 1mvwb0ah65rw0 | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 1mvwb0ah65rw0 |
| 1n3pbucraq0vc | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 1n3pbucraq0vc |
| 5x2x7y2umr3y7 | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 5x2x7y2umr3y7 |
| 9gvx0xgn1n793 | 42 | 7.985 | measured | piagent sql --target c1-19c-pdb --sql-id 9gvx0xgn1n793 |
| 0r730t6vgdh89 | 41 | 7.794 | measured | piagent sql --target c1-19c-pdb --sql-id 0r730t6vgdh89 |
| 865qwpcdyggkk | 41 | 7.794 | measured | piagent sql --target c1-19c-pdb --sql-id 865qwpcdyggkk |
| 9mdaa41nupt2f | 41 | 7.794 | measured | piagent sql --target c1-19c-pdb --sql-id 9mdaa41nupt2f |

new: 2

aged-out: 0

reset: 0

## load: ok; 5.184s

CDB-wide (shared by all PDBs)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| parse count (hard) | 1 | 0.193 | measured |
| parse count (total) | 948 | 182.856 | measured |
| physical reads | 43 | 8.294 | measured |
| redo size | 24568 | 4738.816 | measured |
| session logical reads | 10519 | 2028.965 | measured |
| user calls | 1758 | 339.093 | measured |
| user commits | 0 | 0 | measured |

## host: ok; 5.168s

CDB-wide (shared by all PDBs)

| statistic | delta | perSecond | state |
```

Excerpt ends here; additional output omitted.

### `npx tsx src/cli/index.ts sessions --target c1-19c-pdb`

Exit: 0

```text
# Sessions — c1-19c-pdb

Captured at 2026-11-08T06:21:29.962Z (UTC). Status: ok.

Snapshot is a short sequence of queries, not one consistent read. Sessions may vanish between queries.

## Findings

- **info: User I/O** — 90.0% of non-idle wait time since startup. For a human DBA: Inspect top SQL by physical reads via piagent sql and review datafile read latency. This figure is cumulative since startup, not current activity.

## Active sessions

Current PDB visibility only; instance background activity and blockers in other containers may be unavailable.

| SID | User | Status | SQL_ID | Event | Wait class | Seconds in wait |
| --- | --- | --- | --- | --- | --- | --- |
| 2547 | SYS | ACTIVE | g4jnjjrvxddqn | direct path write temp | User I/O | 0 |

## Blocking tree

Current PDB visibility only; instance background activity and blockers in other containers may be unavailable.
None in this snapshot.

## Waits since instance startup (cumulative, not current)

Current PDB visibility only; instance background activity and blockers in other containers may be unavailable.

**User I/O**: 184.99 s; 90.0%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| direct path write temp | 46622 | 147.03 | 71.5 | 3.15 |
| local write wait | 8146 | 18.26 | 8.9 | 2.24 |
| db file single write | 1892 | 13.37 | 6.5 | 7.07 |
| Disk file operations I/O | 5867 | 5.72 | 2.8 | 0.97 |

**System I/O**: 13.84 s; 6.7%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| control file parallel write | 5714 | 11.94 | 5.8 | 2.09 |
| RMAN backup &amp; recovery I/O | 4722 | 1.79 | 0.9 | 0.38 |

**Concurrency**: 3.09 s; 1.5%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| buffer busy waits | 421 | 2.67 | 1.3 | 6.35 |

**Other**: 1.87 s; 0.9%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| DLM cross inst call completion | 1896 | 0.69 | 0.3 | 0.36 |

**Configuration**: 1.00 s; 0.5%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| sort segment request | 1 | 1.00 | 0.5 | 1000.11 |

**Commit**: 0.80 s; 0.4%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |
| log file sync | 319 | 0.80 | 0.4 | 2.51 |

**Application**: 0.01 s; 0.0%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |

**Network**: 0.00 s; 0.0%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |

**Administrative**: 0.00 s; 0.0%

| Event | Waits | Seconds | % non-idle | Average ms |
| --- | --- | --- | --- | --- |

## Time model since instance startup (cumulative, not current)

Current PDB visibility only; instance background activity and blockers in other containers may be unavailable.

| Name | Seconds |
| --- | --- |
| DB CPU | 179.874801 |
| DB time | 372.793217 |
| background cpu time | 124.454891 |
| background elapsed time | 127.877322 |

## Long transactions (UTC)

Current PDB visibility only; instance background activity and blockers in other containers may be unavailable.
None in this snapshot.

```

### `npx tsx src/cli/index.ts security --target c1-19c-pdb`

Exit: 0

```text
# Security Posture: c1-19c-pdb

Status: ok. Read-only findings; no database changes.

## Medium Severity

### PUBLIC Grants (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| SYS.DBMS_JAVA | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_LDAP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SCHEDULER | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.DBMS_SQL | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_FILE | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_HTTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_INADDR | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_SMTP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |
| SYS.UTL_TCP | PUBLIC EXECUTE (PACKAGE) | DBA_TAB_PRIVS, DBA_OBJECTS, DBA_USERS |

For a human DBA: review PUBLIC access to network, file and dynamic SQL packages and application data; prefer narrowly scoped access where practical.

### Password Profiles for Open Users (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| Profile DEFAULT | PASSWORD_VERIFY_FUNCTION=NULL; Affected Open Users (3): PDBADMIN, PIAGENT_RO, SHOPAPP | DBA_PROFILES |

For a human DBA: review effective profile limits, password verification and application authentication requirements with a DBA.

## Low Severity

### Security Parameters (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| audit_trail | NONE | V$PARAMETER |
| remote_login_passwordfile | EXCLUSIVE | V$PARAMETER |
| sec_case_sensitive_logon | TRUE | V$PARAMETER |

For a human DBA: review password-file administration, case-sensitive authentication and audit mode with a DBA against the site security policy.

## Info Severity

### Account Lifecycle (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| PDBADMIN | OPEN; expiry=2027-05-07T06:03:09.000Z; last login=not recorded (does not prove the password was never used) | DBA_USERS |
| SHOPAPP | OPEN; expiry=2027-05-07T06:08:44.000Z; last login=not recorded (does not prove the password was never used) | DBA_USERS |

For a human DBA: confirm unused accounts and retained object ownership with application owners before planning account lifecycle changes.

### Audit Configuration (ok)

| Subject | Finding | Evidence |
| --- | --- | --- |
| ORA_LOGON_FAILURES | Enabled BY USER ALL USERS (USER); success=NO, failure=YES; 1 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| ORA_SECURECONFIG | Enabled BY USER ALL USERS (USER); success=YES, failure=YES; 49 configured options; no condition observed | AUDIT_UNIFIED_ENABLED_POLICIES |
| Logon coverage | ORA_LOGON_FAILURES: success=NO, failure=YES, scope=BY USER ALL USERS; policy scope and conditions require review. | AUDIT_UNIFIED_POLICIES |
| Privilege-use coverage | 30 distinct system privilege options in enabled policies: ADMINISTER KEY MANAGEMENT, ALTER ANY PROCEDURE, ALTER ANY SQL TRANSLATION PROFILE, ALTER ANY TABLE, … (complete list in JSON evidence). This does not establish coverage of all privilege use. | AUDIT_UNIFIED_POLICIES |

For a human DBA: validate logon and privilege-use coverage for every relevant principal, including success and failure, policy conditions and the active audit mode. Policy configuration does not prove events are being collected.

## Check Status

- Open Accounts with Default Passwords [default-passwords]: ok; no findings in available evidence.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Powerful Privileges [powerful-privileges]: ok; no findings in available evidence.
  Role reachability includes grants regardless of default/enabled role state; roles may require activation. Expansion stops at ten role edges.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- PUBLIC Grants [public-grants]: ok.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Password Profiles for Open Users [profiles]: ok.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Account Lifecycle [accounts]: ok.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Audit Configuration [audit]: ok.
  No traditional statement audit options observed in available evidence.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Security Parameters [parameters]: ok.
  O7_DICTIONARY_ACCESSIBILITY: N/A (not exposed on this Oracle 19c target).
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.
- Who Can Access an Object [who-can]: skipped.
  Supply --who-can OWNER.OBJECT.
  Current PDB grants and policies only; inherited common grants may appear. Password-file administration and instance parameters are CDB-wide where visible; absence does not establish CDB security posture.

```

### `npx tsx src/cli/index.ts alertlog --target c1-19c-pdb`

Exit: 0

```text
# Alert log: c1-19c-pdb

ok; V$DIAG_ALERT_EXT; 2026-11-07T06:21:42.772Z to 2026-11-08T06:21:42.772Z (exclusive)

Current PDB ADR visibility only; empty results do not establish absence of CDB incidents or alerts. Not available / not granted when the PDB cannot expose this view.

| First / last time | Level | Codes | Count | Problem | Incident | Trace | Message |
|---|---|---|---|---|---|---|---|
| 2026-11-08T06:09:01.112Z / 2026-11-08T06:09:29.095Z | 16 | ORA-12012, ORA-20001, ORA-06512 | 2 |  |  | /opt/oracle/diag/rdbms/cdb19/CDB19/trace/CDB19_j001_7116.trc, /opt/oracle/diag/rdbms/cdb19/CDB19/trace/CDB19_j000_7114.trc | Errors in file /opt/oracle/diag/rdbms/cdb19/CDB19/trace/CDB19_j001_7116.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."REPORT_EXPORT_JOB"<br>ORA-20001: C1 intentional report export failure<br>ORA-06512: at line 1 |
| 2026-11-08T06:08:44.824Z / 2026-11-08T06:09:23.202Z | 16 | ORA-01543 | 3 |  |  |  | ORA-1543 signalled during: create tablespace SHOP_DATA datafile '/opt/oracle/oradata/CDB19/PIPDB1/shop_data01.dbf' size 256M autoextend off... |

```

### `npx tsx src/cli/index.ts sql --target c1-19c-pdb --text SHOPAPP`

Exit: 0

```text
0 diagnostic statements excluded (session user).
# SQL Insight: c1-19c-pdb / 5h12fspngw94z

ok; all times UTC; time per execution in ms (3 significant digits).

DECLARE job BINARY_INTEGER := :job;  next_date TIMESTAMP WITH TIME ZONE := :mydate;  broken BOOLEAN := FALSE;  job_name VARCHAR2(128) := :job_name;  job_subname VARCHAR2(128) := :job_subname;  job_owner VARCHAR2(128) := :job_owner;  job_start TIMESTAMP WITH TIME ZONE := :job_start;  job_scheduled_start TIMESTAMP WITH TIME ZONE := :job_scheduled_start;  window_start TIMESTAMP WITH TIME ZONE := :window_start;  window_end TIMESTAMP WITH TIME ZONE := :window_end;  chain_id VARCHAR2(14) :=  :chainid;  credential_owner VARCHAR2(128) := :credown;  credential_name  VARCHAR2(128) := :crednam;  destination_owner VARCHAR2(128) := :destown;  destination_name VARCHAR2(128) := :destnam;  job_dest_id varchar2(14) := :jdestid;  log_id number := :log_id;  BEGIN  begin SHOPAPP.workload.place_orders(20); end;  :mydate := next_date; IF broken THEN :b := 1; ELSE :b := 0; END IF; END; 

## Findings

No findings in available evidence.

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: skipped · Indexes: skipped · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Tables: skipped; 
- Indexes: skipped; 
- Mismatches: skipped; V$SQL_SHARED_CURSOR

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 9 | 135326 | 134433 | 4920 | 0 | 9 | 15.0 | 14.9 | 547 | 0 | 1 | 2026-11-08T06:10:29Z | 2026-11-08T06:21:28Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 0 | 9 | 2026-11-08T06:10:29Z | 2026-11-08T06:21:28Z | 15.0 |

## Binds

| Child | Name | Position | Type | Captured |
| --- | --- | --- | --- | --- |
| 0 | :JOB | 1 | NUMBER | NO |
| 0 | :MYDATE | 2 | TIMESTAMP (TZ) | NO |
| 0 | :JOB_NAME | 3 | VARCHAR2(32) | NO |
| 0 | :JOB_SUBNAME | 4 | VARCHAR2(32) | NO |
| 0 | :JOB_OWNER | 5 | VARCHAR2(32) | NO |
| 0 | :JOB_START | 6 | TIMESTAMP (TZ) | NO |
| 0 | :JOB_SCHEDULED_START | 7 | TIMESTAMP (TZ) | NO |
| 0 | :WINDOW_START | 8 | TIMESTAMP (TZ) | NO |
| 0 | :WINDOW_END | 9 | TIMESTAMP (TZ) | NO |
| 0 | :CHAINID | 10 | VARCHAR2(32) | NO |
| 0 | :CREDOWN | 11 | VARCHAR2(32) | NO |
| 0 | :CREDNAM | 12 | VARCHAR2(32) | NO |
| 0 | :DESTOWN | 13 | VARCHAR2(32) | NO |
| 0 | :DESTNAM | 14 | VARCHAR2(32) | NO |
| 0 | :JDESTID | 15 | VARCHAR2(32) | NO |
| 0 | :LOG_ID | 16 | NUMBER | NO |
| 0 | :B | 17 | NUMBER | NO |

## Plan 0 (v$sql_plan)

```

```

```

### `npx tsx src/cli/index.ts sql --target c1-19c-pdb --text SHOPAPP`

Exit: 0

```text
0 diagnostic statements excluded (session user).
# SQL Insight: c1-19c-pdb / 5h12fspngw94z

ok; all times UTC; time per execution in ms (3 significant digits).

DECLARE job BINARY_INTEGER := :job;  next_date TIMESTAMP WITH TIME ZONE := :mydate;  broken BOOLEAN := FALSE;  job_name VARCHAR2(128) := :job_name;  job_subname VARCHAR2(128) := :job_subname;  job_owner VARCHAR2(128) := :job_owner;  job_start TIMESTAMP WITH TIME ZONE := :job_start;  job_scheduled_start TIMESTAMP WITH TIME ZONE := :job_scheduled_start;  window_start TIMESTAMP WITH TIME ZONE := :window_start;  window_end TIMESTAMP WITH TIME ZONE := :window_end;  chain_id VARCHAR2(14) :=  :chainid;  credential_owner VARCHAR2(128) := :credown;  credential_name  VARCHAR2(128) := :crednam;  destination_owner VARCHAR2(128) := :destown;  destination_name VARCHAR2(128) := :destnam;  job_dest_id varchar2(14) := :jdestid;  log_id number := :log_id;  BEGIN  begin SHOPAPP.workload.place_orders(20); end;  :mydate := next_date; IF broken THEN :b := 1; ELSE :b := 0; END IF; END; 

## Findings

No findings in available evidence.

## Sections

Children: ok · Plans: ok · Plan Objects: ok · Plan Changes: ok · Tables: skipped · Indexes: skipped · Baselines: ok · Profiles: ok · Binds: ok · Mismatches: skipped
- Tables: skipped; 
- Indexes: skipped; 
- Mismatches: skipped; V$SQL_SHARED_CURSOR

## Children

| Child | Plan Hash Value | Executions | Elapsed | Cpu | Buffer Gets | Disk Reads | Rows Processed | Elapsed / Exec (ms) | CPU / Exec (ms) | Buffer Gets Per Exec | Disk Reads Per Exec | Rows Per Exec | First Load | Last Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 9 | 135326 | 134433 | 4920 | 0 | 9 | 15.0 | 14.9 | 547 | 0 | 1 | 2026-11-08T06:10:29Z | 2026-11-08T06:21:28Z |

## Plan Changes

| Plan Hash Value | Executions | First Load | Last Active | Elapsed / Exec (ms) |
| --- | --- | --- | --- | --- |
| 0 | 9 | 2026-11-08T06:10:29Z | 2026-11-08T06:21:28Z | 15.0 |

## Binds

| Child | Name | Position | Type | Captured |
| --- | --- | --- | --- | --- |
| 0 | :JOB | 1 | NUMBER | NO |
| 0 | :MYDATE | 2 | TIMESTAMP (TZ) | NO |
| 0 | :JOB_NAME | 3 | VARCHAR2(32) | NO |
| 0 | :JOB_SUBNAME | 4 | VARCHAR2(32) | NO |
| 0 | :JOB_OWNER | 5 | VARCHAR2(32) | NO |
| 0 | :JOB_START | 6 | TIMESTAMP (TZ) | NO |
| 0 | :JOB_SCHEDULED_START | 7 | TIMESTAMP (TZ) | NO |
| 0 | :WINDOW_START | 8 | TIMESTAMP (TZ) | NO |
| 0 | :WINDOW_END | 9 | TIMESTAMP (TZ) | NO |
| 0 | :CHAINID | 10 | VARCHAR2(32) | NO |
| 0 | :CREDOWN | 11 | VARCHAR2(32) | NO |
| 0 | :CREDNAM | 12 | VARCHAR2(32) | NO |
| 0 | :DESTOWN | 13 | VARCHAR2(32) | NO |
| 0 | :DESTNAM | 14 | VARCHAR2(32) | NO |
| 0 | :JDESTID | 15 | VARCHAR2(32) | NO |
| 0 | :LOG_ID | 16 | NUMBER | NO |
| 0 | :B | 17 | NUMBER | NO |

## Plan 0 (v$sql_plan)

```

```

```

### `npx tsx src/cli/index.ts report --target c1-19c-pdb`

Exit: 0

```text
# Oracle 19c report: c1-19c-pdb

Generated: 2026-11-08T06:22:36.495Z

## identity

Source: PRODUCT_COMPONENT_VERSION, SYS_CONTEXT

Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers.

| DB_NAME | VERSION_FULL | INSTANCE_NAME | HOST_NAME | CURRENT_SCHEMA |
| --- | --- | --- | --- | --- |
| PIPDB1 | 19.9.1.0.0 | CDB19 | bddb6a9b3b5f | SHOPAPP |

## tablespaces

Source: DBA_DATA_FILES, DBA_FREE_SPACE

Permanent/undo allocated datafiles; bytes, not MB. Temporary files excluded. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers.

| TABLESPACE_NAME | ALLOCATED_BYTES | FREE_BYTES | USED_BYTES | MAX_BYTES | AUTOEXTEND_FILES |
| --- | --- | --- | --- | --- | --- |
| SHOP_DATA | 268435456 | 242876416 | 25559040 | 268435456 | 0 |
| SYSAUX | 429916160 | 23592960 | 406323200 | 34359721984 | 1 |
| SYSTEM | 335544320 | 3538944 | 332005376 | 34359721984 | 1 |
| UNDOTBS1 | 209715200 | 0 | 209715200 | 34359721984 | 1 |
| USERS | 5242880 | 4194304 | 1048576 | 34359721984 | 1 |

## waits

Source: V$SYSTEM_EVENT

Cumulative since instance startup; microseconds, not interval rates. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers. Row limit reached; additional matching rows may exist.

| EVENT | WAIT_CLASS | TOTAL_WAITS | TIME_WAITED_MICRO |
| --- | --- | --- | --- |
| direct path write temp | User I/O | 53588 | 184943359 |
| local write wait | User I/O | 11630 | 23953413 |
| db file single write | User I/O | 2762 | 17957206 |
| control file parallel write | System I/O | 8336 | 15788325 |
| Disk file operations I/O | User I/O | 8504 | 7159680 |
| buffer busy waits | Concurrency | 422 | 2684772 |
| RMAN backup &amp; recovery I/O | System I/O | 5010 | 1960234 |
| log file sync | Commit | 679 | 1444461 |
| DLM cross inst call completion | Other | 2766 | 1083981 |
| sort segment request | Configuration | 1 | 1000106 |

## top_sql

Source: V$SQLSTATS

Cached cumulative statistics; elapsed and CPU time in microseconds. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers. Row limit reached; additional matching rows may exist.

| SQL_ID | EXECUTIONS | ELAPSED_TIME | CPU_TIME | BUFFER_GETS | SQL_TEXT |
| --- | --- | --- | --- | --- | --- |
| g4jnjjrvxddqn | 1 | 127783310 | 43322102 | 5707 | select sid,type,lmode,request from v$lock where lmode&gt;0 or request&gt;0 order by sid,type,id1,id2 fetch first 2 rows only |
| arqgmbysp7659 | 2 | 59915589 | 22418570 | 2092 | SELECT SID, TYPE, LMODE, REQUEST FROM V$LOCK WHERE LMODE &gt; 0 OR REQUEST &gt; 0 ORDER BY SID, TYPE, ID1, ID2 |
| 0r730t6vgdh89 | 357 | 9568354 | 9380263 | 18562 | SELECT TYPE, LINE, TEXT FROM DBA_SOURCE WHERE OWNER = :owner AND NAME = :name AND (TYPE &gt; :afterType OR (TYPE = :afterType AND LINE &gt; :afterLine)) ORDER BY TYPE, LINE |
| 0tqa6y08r56dq | 1 | 6618711 | 7034990 | 19267 | SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJECT_NAME FROM AUDIT_UNIFIED_POLICIES ORDER BY POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, OBJECT_SCHEMA, OBJECT_NAME |
| 6j2hqx9mavvjw | 12 | 5186593 | 5179690 | 35310 | SELECT /*+ NO_STATEMENT_QUEUING RESULT_CACHE (SYSOBJ=TRUE SHELFLIFE=30) OPT_PARAM('_ENABLE_VIEW_PDB', 'FALSE') */ "POLICY_NAME","AUDIT_CONDITION","CONDITION_EVAL_OPT","AUDIT_OPTION","AUDIT_OPTION_TYPE","OBJECT_SCHEMA","OBJECT_NAME" FROM NO_CROSS_CONTAINER("SYS"."INT$AUDIT_UNIFIED_POLICIES") "INT$AUD |
| 9mdaa41nupt2f | 381 | 4269233 | 3841137 | 70550 | SELECT p.privilege, p.owner, u.oracle_maintained FROM (SELECT privilege, owner FROM user_tab_privs WHERE grantee = SYS_CONTEXT('USERENV','SESSION_USER') UNION ALL SELECT privilege, owner FROM role_tab_privs WHERE role IN (SELECT role FROM session_roles)) p LEFT JOIN all_users u ON u.username=p.owner |
| 7h87kzmnp8a02 | 1 | 1480070 | 1478236 | 407905 | SELECT P.OWNER, P.TABLE_NAME, P.PRIVILEGE, O.OBJECT_TYPE FROM DBA_TAB_PRIVS P LEFT JOIN DBA_OBJECTS O ON O.OWNER = P.OWNER AND O.OBJECT_NAME = P.TABLE_NAME AND O.SUBOBJECT_NAME IS NULL AND O.OBJECT_TYPE NOT IN ('PACKAGE BODY','TYPE BODY') JOIN DBA_USERS U ON U.USERNAME = P.OWNER WHERE P.GRANTEE = 'P |
| 09suztxfhxg7u | 0 | 1380204 | 1378659 | 761 | SELECT /*CROSSCON*/ /* */ /*"INT$AUDIT_UNIFIED_POLICIES"*/ /* NONE */ * FROM NO_COMMON_DATA("SYS"."INT$AUDIT_UNIFIED_POLICIES") |
| 1mvwb0ah65rw0 | 382 | 1317780 | 1091817 | 6 | SELECT PRIVILEGE FROM SESSION_PRIVS |
| 5b379n192pbph | 11 | 1105545 | 1503466 | 17452 | SELECT POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, AUDIT_CONDITION, CONDITION_EVAL_OPT, OBJECT_SCHEMA, OBJECT_NAME FROM AUDIT_UNIFIED_POLICIES ORDER BY POLICY_NAME, AUDIT_OPTION, AUDIT_OPTION_TYPE, OBJECT_SCHEMA, OBJECT_NAME OFFSET :securityOffset ROWS |

## optimizer_stats

Source: DBA_TAB_STATISTICS

Table-level estimates; stale, locked or never analyzed only. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers. Owner: SHOPAPP.

| OWNER | TABLE_NAME | NUM_ROWS | BLOCKS | LAST_ANALYZED | STALE_STATS | STATTYPE_LOCKED |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | ORDERS | 30000 | 244 | 2026-11-08T06:09:25.000Z | YES | NULL |
| SHOPAPP | PRODUCTS | 2000 | 13 | 2026-11-08T06:09:27.000Z | YES | ALL |
| SHOPAPP | VIEW_SOURCE | NULL | NULL | NULL | NULL | NULL |

## index_health

Source: ALL_INDEXES

Only indexes visible to this login. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers. Owner: SHOPAPP.

No matching rows.

## index_partitions

Source: ALL_IND_PARTITIONS, ALL_INDEXES

Only visible partitions; subpartitions reported separately. Container: PIPDB1. Evidence visible in the current PDB; does not describe other containers. Owner: SHOPAPP.

| INDEX_OWNER | INDEX_NAME | PARTITION_NAME | STATUS |
| --- | --- | --- | --- |
| SHOPAPP | HISTORY_ORDER_IX | P_202601 | UNUSABLE |

## index_subpartitions

Source: ALL_IND_SUBPARTITIONS, ALL_INDEXES

```

Excerpt ends here; additional output omitted.

### `drift --left c1-19c-pdb --right c1-19c-pdb --scope schema:SHOPAPP`

Exit: 0

```text
# Drift: c1-19c-pdb → c1-19c-pdb

Scope: schema:SHOPAPP. Complete comparison.

## tables

Source: SYS.ALL_TABLES

### onlyLeft

None.

### onlyRight

None.

### different

None.

## columns

Source: SYS.ALL_TAB_COLUMNS

### onlyLeft

None.

### onlyRight

None.

### different

None.

## constraints

Source: SYS.ALL_CONSTRAINTS, SYS.ALL_CONS_COLUMNS

### onlyLeft

None.

### onlyRight

None.

### different

None.

## indexes

Source: SYS.ALL_INDEXES, SYS.ALL_IND_COLUMNS, SYS.ALL_IND_EXPRESSIONS

### onlyLeft

None.

### onlyRight

None.

### different

None.

## object_counts

Source: SYS.ALL_OBJECTS

### onlyLeft

None.

### onlyRight

None.

### different

None.

## invalid_objects

Source: SYS.ALL_OBJECTS

### onlyLeft

None.

### onlyRight

None.

### different

None.

```

## Web API and root refusal

The live C1 integration test starts the real authenticated HTTP server and reads /api/targets, /api/check, /api/backup, /api/space, /api/jobs, /api/top (5 seconds), /api/db-sessions, /api/security, /api/alertlog, /api/sql (SHOPAPP search), /api/plsql/list, /api/report, /api/report/history and POST /api/drift (C1-to-C1 SHOPAPP schema). Expected HTTP status: 200 throughout; schema self-drift must be complete with no drift. The browser suite separately exercises rendering, authentication and input validation with fakes.

The C1 seed integration test connects to PIPDB1, checks exact grants/deliberate fixtures, then verifies the same PIAGENT_RO credentials cannot connect to localhost:1524/CDB19 (ORA-01017). The session provider separately rejects CDB$ROOT identities as before.

## Validation

Final results:

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: PASS, 141 files, 2,679 tests (100.77 s).
- `npx playwright test`: PASS, 89 passed, 7 optional live-capture tests skipped (1.1 min). Regenerated docs/img screenshots restored with git checkout.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: PASS, 38 files, 91 passed, 1 skipped (the excluded LLM e2e), 546.21 s. This includes all three targets and C1 seed/root-refusal, UTC-date/backup-age, measured health, web tabs and complete schema self-drift.
- Focused live timestamp-rendering test: PASS, 1/1.
- `git diff --check`: PASS.

The initial runs exposed old two-target expectations, fixture assumptions and old wall-clock text expectations; each was corrected to assert the intended three-lab/UTC behavior. An earlier full integration run with those known fixture failures was stopped and replaced by the complete green run above. The timezone fake explicitly sets TZ=America/Mexico_City with a UTC database; the live test compares the latest backup age with (CAST(SYSTIMESTAMP AS DATE)-MAX(COMPLETION_TIME))*24.

Previously saved 1.6.0 report timestamps are not rewritten; an incorrectly persisted instant cannot be reconstructed without the original database wall time and timezone context.

No contract changes requested. No LLM/eval gate performed (Strata reserved for coordinator). Restore/media validity and historical server DST reconstruction are not verified.

## Files changed

- `docs/alertlog.md`
- `docs/backup.md`
- `docs/check.md`
- `docs/drift.md`
- `docs/jobs.md`
- `docs/real-targets.md`
- `docs/report.md`
- `docs/sessions.md`
- `docs/space.md`
- `docs/sqlperf.md`
- `docs/web-ui.md`
- `src/alertlog/index.ts`
- `src/backup/index.ts`
- `src/check/index.ts`
- `src/config/approvedTargets.ts`
- `src/config/safeErrors.ts`
- `src/config/targets.ts`
- `src/drift/queries.ts`
- `src/oracle/index.ts`
- `src/sessions/sql.ts`
- `src/space/sql.ts`
- `src/tools/index.ts`
- `src/web/server.ts`
- `src/web/static/drift.js`
- `src/web/static/panel.js`
- `tests/browser/drift.spec.ts`
- `tests/integration/c1-pdb-live.test.ts`
- `tests/integration/oracle.test.ts`
- `tests/integration/session-utc.test.ts`
- `tests/integration/tool-dictionary-fallback.test.ts`
- `tests/integration/tool-timestamps.test.ts`
- `tests/unit/alertlog.test.ts`
- `tests/unit/backup-cli.test.ts`
- `tests/unit/check.test.ts`
- `tests/unit/fixtures/chat-master.json`
- `tests/unit/fixtures/triage-before-sessions.json`
- `tests/unit/real-targets.test.ts`
- `tests/unit/safe-config-errors.test.ts`
- `tests/unit/session.test.ts`
- `tests/unit/short-prefix.test.ts`
- `tests/unit/space.test.ts`
- `tests/unit/target-usage-cli.test.ts`
- `tests/unit/tool-timestamps.test.ts`
- `tests/unit/top-cli.test.ts`
- `tests/unit/web-check.test.ts`
- `docs/wp-31a-pdb-live.md`


## Antigravity review follow-up (2026-11-08)

Read the approved review in the separate review-wp-31a-pdb-live worktree without modifying it.

- Minor 1 fixed: DATE/plain TIMESTAMP never pass through a host-local Date while decoding. Sessions set fixed NLS_DATE_FORMAT/NLS_TIMESTAMP_FORMAT, and the fetchTypeHandler requests STRING. Live testing demonstrated that installed thin driver 26 still decodes a Date before locally stringifying it, so STRING alone is insufficient. The provider describes SELECT metadata and explicitly projects date columns through Oracle TO_CHAR before fetching. Existing WITH clauses are hoisted to avoid Oracle 19c's nested-WITH restriction; generated aliases avoid name collisions and preserve column order, duplicate-name behavior and original database type metadata. Nulls and other column types remain intact. This adds a metadata-describe round trip per query; the complete integration run below covers the existing bounded collectors.
- Consumers still receive normalized Date instants, retaining their existing API. Reviewed Date consumers in backup/check, jobs, space/undo, sessions, source/tool rendering, report/history and drift. Their date arithmetic, instanceof Date checks and ISO rendering continue to work; no shared contract changes are needed.
- Added fake and live America/New_York tests for the missing local hour 2026-03-08 02:30, including DATE, TIMESTAMP fractional milliseconds, CTEs, duplicate names, nulls and numeric columns. Mexico City tests remain.
- Info 4 fixed: alerts and incidents include CON_ID 0/1 plus the current container, with CDB-wide/instance row labels and explicit scope notes in check. Folding includes container identity. UI/Markdown/JSON retain scope labels; lower-bound cap rules are unchanged.
- C1 visibility verification: SYS in root sees alert counts for CON_ID 1/2/3; SYS in PIPDB1 and PIAGENT_RO in PIPDB1 expose only CON_ID 3. The product cannot recover hidden root rows through a local login; notes explicitly state this limitation. The live test compares the complete visible ORA window with a direct grouped count, verifies the inclusive predicate and labels, and checks incident scope. Unit fakes prove 0/1 evidence is retained and never folded into a PDB row.
- RULE retained. docs/sessions.md explains the Oracle 19c-specific CBO stall, deprecated query-local workaround and need to revalidate on another 19c release update.
- Historical server DST reconstruction remains out of scope: normalization still uses the server offset sampled at session creation. Previously persisted 1.6.0 instants are not rewritten.

Final follow-up validation:

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: PASS, 141 files, 2,683 tests (97.27 s).
- `npx playwright test`: PASS, 89 passed, 7 optional live-capture tests skipped (1.1 min); regenerated docs/img screenshots restored.
- Focused new C1 review tests: PASS, 2/2, covering the New York gap and inclusive ADR predicates/visible counts.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: PASS, 39 files, 93 passed, 1 skipped (excluded Strata e2e), 770.77 s. Existing d1/p1 and C1 collectors, Date arithmetic/rendering, report/history, scope labels and web tabs pass.
- `git diff --check`: PASS.
- No LLM calls, push or merge. No dependencies or shared contracts changed.

Follow-up changed files:


- `docs/alertlog.md`
- `docs/check.md`
- `docs/sessions.md`
- `docs/wp-31a-pdb-live.md`
- `src/alertlog/index.ts`
- `src/check/index.ts`
- `src/oracle/index.ts`
- `src/web/static/alertlog.js`
- `tests/integration/c1-review.test.ts`
- `tests/unit/alertlog.test.ts`
- `tests/unit/check.test.ts`
- `tests/unit/fixtures/triage-before-sessions.json`
- `tests/unit/pdb-audit.test.ts`
- `tests/unit/preflight-catalog.test.ts`
- `tests/unit/session.test.ts`
