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
intentional REPORT_EXPORT_JOB failure asynchronously. Initial data: 3,000 customers,
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

The packaged loader currently pins exactly two targets; see the verification
report for the required WP-31A change. Until merged, use the supported private
file override to verify C1 (the copy contains no credentials):

```sh
c1_targets=$(mktemp)
chmod 600 "$c1_targets"
cp config/targets.json "$c1_targets"
PIAGENT_TARGETS_FILE="$c1_targets" \
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
  npx tsx src/cli/index.ts targets check --target c1-19c-pdb
unlink "$c1_targets"
```

SHOP_DATA is created after the initial coordinator backup. A new RMAN backup
covering this file is required before backup-age/archive-gap OK expectations.
