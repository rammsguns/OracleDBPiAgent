# C1 Oracle 19c multitenant lab

C1 is the dedicated `oracle19c-cdb` container, host port 1524, CDB `CDB19`,
PDB/service `PIPDB1`. Never run these scripts against other containers.
The coordinator created it from the existing Oracle 19c image with persistent
`/home/kiwi/oracle19c-cdb/oradata` storage mounted at `/opt/oracle/oradata`.
The mounted, modified DBCA response template is
`/home/kiwi/oracle19c-cdb/config/dbca.rsp.tmpl`: General_Purpose.dbc,
`createAsContainerDatabase=true`, `numberOfPDBs=1`, `pdbName=PIPDB1`,
`automaticMemoryManagement=FALSE`, `totalMemory=4096`, AL16UTF16 national
character set. The image substitutes SID, character set and password placeholders.
Use the coordinator's private container setup for creation; never copy or display
`c1.env` or a substituted response file. ARCHIVELOG, FRA, control-file autobackup
and RMAN level-0/incremental backups were configured by the coordinator.

Run from the repository with Docker access and Python 3:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets ./lab/c1/seed.sh
```

The runner uses only OS authentication through `docker exec -i oracle19c-cdb`
and switches to PIPDB1 before changes. New 24-character alphanumeric passwords
(letter first) go directly into `c1_shopapp.pw` and `c1_piagent_ro.pw`, mode 0600.
Existing credentials are retained. SQL is sent on stdin; SQL*Plus output is
captured and secrets redacted before display. Never run with shell tracing.

Reruns preserve app data and the fixed initial seed (DBMS_RANDOM seed 31031),
replace the package and four jobs, recreate the invalid-view source, reset stale
PRODUCTS statistics, mark HISTORY_ORDER_IX/P_202601 unusable, and submit a fresh
intentional REPORT_EXPORT_JOB failure asynchronously. REPORT_EXPORT_JOB starts
immediately and fails with ORA-20001 every 30 minutes
(`FREQ=MINUTELY;INTERVAL=30`), with full scheduler logging. While the scheduler
is running, this keeps intentional failure evidence inside the health check's
one-hour window instead of aging out between daily runs. Initial data: 3,000 customers,
2,000 products, 30,000 orders and 90,000 lines; monthly history begins January 2026.
The live scheduler changes counts after seeding. SHOP_DATA is 256 MiB with
autoextend off. Statistics on PRODUCTS are locked to retain the stale fixture;
`refresh_stats` respects that lock. The purge retains two years and archives old
shipped orders before removing their lines and headers.

Diagnostic grants are extracted directly from the executable GRANT statements in
`docs/grants-template-pdb.sql`, plus SELECT on the five app tables. PIAGENT_RO
gets CREATE SESSION only as a system privilege, no roles, no package EXECUTE,
and zero tablespace quota. The disposable VIEW_SOURCE table is not granted.
This seed owns fresh accounts; reruns do not remove unexpected grants manually
added by an administrator. Review grants before using an altered lab.

Live outputs and product follow-ups: [verification](../../docs/wp-31-lab-seed.md).

The packaged loader includes `c1-19c-pdb` and `c1s-19c-stby`; no private
file override is required. Set PIAGENT_SECRET_DIR and use the PDB target directly.

SHOP_DATA is created after the initial coordinator backup. A new RMAN backup
covering this file is required before backup-age/archive-gap OK expectations.

## C1S physical standby (coordinator build)

`oracle19c-cdb-stby` listens on host port 1525. Database unique name CDB19S
is a physical standby of CDB19 (`oracle19c-cdb`, port 1524). Docker network
`c1-dg` provides aliases `c1p` and `c1s`. The coordinator configured standby
redo logs (SRLs), LOG_ARCHIVE_CONFIG/DG_CONFIG, primary LOG_ARCHIVE_DEST_2
for redo transport, and FAL for missing redo retrieval, then performed RMAN
active duplicate. Both databases have four thread-1 SRLs (groups 11–14),
200 MiB each, and `LOG_ARCHIVE_CONFIG=DG_CONFIG=(CDB19,CDB19S)`. Primary dest 2
is `SERVICE=C1S ASYNC NOAFFIRM VALID_FOR=(ONLINE_LOGFILES,PRIMARY_ROLE)
DB_UNIQUE_NAME=CDB19S`; the standby has the reverse `SERVICE=C1P` destination
with `DB_UNIQUE_NAME=CDB19`. FAL_SERVER is C1S on the primary and C1P on the
standby; FAL_CLIENT is unset. These are observations, not product setup steps. The duplicate intentionally omitted the SPFILE clause:
the auxiliary restart with that clause hit ORA-00600
[ksb_shut_detached_process3] in SMCO.

The standby runs real-time managed recovery (MRP0) and opens PIPDB1 READ ONLY
with Active Data Guard; root OPEN_MODE is READ ONLY WITH APPLY. Primary dest 2
reports VALID / NO GAP. The existing PIAGENT_RO account and password replicate.
The startup hook at
`/home/kiwi/oracle19c-cdb-stby/scripts/startup/01-standby-apply.sh`
resumes apply and opens the PDB after image startup. The worker did not restart
or reconfigure either container or Data Guard. Only three diagnostic SELECT
grants were applied on the primary PDB and replicated. Use packaged target
`c1s-19c-stby`; see [monitoring semantics](../../docs/check.md#physical-standby-phase-32).
