# WP-25A backup and recoverability core / CLI

Branch: `wp-25a-backup`. No database writes, grants, RMAN executions or LLM calls were made. Only approved d1/p1 accounts were used with the requested secret directory. Grants remain proposed and WP-25D must complete the eval-premise work first.

Built: deterministic per-view evidence reader; bounded SELECTs; backup-set/piece availability and per-file full/level-0/incremental inventory; current-incarnation per-thread archive gaps and conservative restore-to-time bounds; configuration/control-file/job evidence; FRA reclaimable balance; all six PLAN finding classes; per-view missing-access/PDB degradation; no absence inference from empty PDB rows; JSON and readable CLI output; hash-only query audit wrapper; preflight and SELECT-only grants inventory.

Files: `src/backup/{index,sql,cli}.ts`, minimal `src/cli/index.ts` registration, `src/preflight/views.ts`, `docs/backup.md`, `docs/grants-template-pdb.sql`, `docs/grants-request-2026-11-06-backup.sql`, `tests/unit/backup.test.ts`, `tests/unit/release-help.test.ts` (help inventory), `tests/integration/backup.test.ts`, and this report.

Contract changes needed: none. Downstream packages can import the local exported BackupReport/Evidence/Finding types, readBackup and renderBackupMarkdown. No shared contracts, PLAN, package metadata or dependencies changed.

Unverified: live PDB and RAC visibility, actual recovery, media readability, encryption keys, image copies/external recovery catalogs, positive live backup chains (neither lab records backups), p1 behaviour after the proposed grants. The effective autobackup default is deliberately unknown when no explicit configuration row is visible. A positive candidate is withheld for PDB snapshots and incomplete evidence. Zero gaps without a full baseline does not establish recoverability. The Strata e2e was deliberately excluded; evals and browser tests are coordinator work, not run here.

Initial validation found and corrected an oversized query-limit request, the help-smoke inventory, and a preflight scanner false positive on the prose phrase “from this database.” No shared scanner rules were widened. Final outputs follow.

## d1 live output: npm run piagent -- backup --target d1-19c-lab

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`

```text

> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts backup --target d1-19c-lab

# Backup — d1-19c-lab

Database-wide (non-CDB).

Captured 2026-11-06T20:52:51.493Z. Sequential bounded SELECT snapshots.

Restore-to-time estimate: {"status":"not-verifiable","from":null,"through":null,"detail":"Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.","evidence":["database","datafiles","backups","sets","pieces","archives","history","corruption","recoverFiles"]}

high: No backups recorded at all in the visible control-file history; external catalogs and aged-out records are not checked. Evidence: backups, jobs, sets. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

high: Datafile 1: no available full / level 0 backup completed in 7 days. Evidence: database, datafiles, backups, sets, pieces. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

high: Datafile 3: no available full / level 0 backup completed in 7 days. Evidence: database, datafiles, backups, sets, pieces. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

high: Datafile 4: no available full / level 0 backup completed in 7 days. Evidence: database, datafiles, backups, sets, pieces. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

high: Datafile 7: no available full / level 0 backup completed in 7 days. Evidence: database, datafiles, backups, sets, pieces. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

Per-datafile backups: [{"file":1,"level0":null,"incremental":null,"checkpointScn":null},{"file":3,"level0":null,"incremental":null,"checkpointScn":null},{"file":4,"level0":null,"incremental":null,"checkpointScn":null},{"file":7,"level0":null,"incremental":null,"checkpointScn":null}]

Archive gaps: []

Recovery-area balance (bytes): []

Evidence jobs (V$RMAN_BACKUP_JOB_DETAILS): ok
[]

Evidence sets (V$BACKUP_SET): ok
[]

Evidence pieces (V$BACKUP_PIECE): ok
[]

Evidence datafiles (V$DATAFILE): ok
[{"FILE#":1,"NAME":"/opt/oracle/oradata/ORCL/system01.dbf","CREATION_CHANGE#":9},{"FILE#":3,"NAME":"/opt/oracle/oradata/ORCL/sysaux01.dbf","CREATION_CHANGE#":5480},{"FILE#":4,"NAME":"/opt/oracle/oradata/ORCL/undotbs01.dbf","CREATION_CHANGE#":1920446},{"FILE#":7,"NAME":"/opt/oracle/oradata/ORCL/users01.dbf","CREATION_CHANGE#":32876}]

Evidence backups (V$BACKUP_DATAFILE): ok
[]

Evidence archives (V$ARCHIVED_LOG): ok
[]

Evidence history (V$LOG_HISTORY): ok
[{"THREAD#":1,"SEQUENCE#":1,"FIRST_CHANGE#":1920977,"NEXT_CHANGE#":1964941,"FIRST_TIME":"2026-09-11T23:36:38.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":2,"FIRST_CHANGE#":1964941,"NEXT_CHANGE#":1980052,"FIRST_TIME":"2026-09-11T23:37:30.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":3,"FIRST_CHANGE#":1980052,"NEXT_CHANGE#":1984910,"FIRST_TIME":"2026-09-11T23:38:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":4,"FIRST_CHANGE#":1984910,"NEXT_CHANGE#":1990284,"FIRST_TIME":"2026-09-11T23:38:14.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":5,"FIRST_CHANGE#":1990284,"NEXT_CHANGE#":2003673,"FIRST_TIME":"2026-09-11T23:38:28.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":6,"FIRST_CHANGE#":2003673,"NEXT_CHANGE#":2057775,"FIRST_TIME":"2026-09-11T23:38:45.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":7,"FIRST_CHANGE#":2057775,"NEXT_CHANGE#":2098013,"FIRST_TIME":"2026-09-11T23:39:06.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":8,"FIRST_CHANGE#":2098013,"NEXT_CHANGE#":2136844,"FIRST_TIME":"2026-09-11T23:39:24.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":9,"FIRST_CHANGE#":2136844,"NEXT_CHANGE#":2155465,"FIRST_TIME":"2026-09-11T23:39:48.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":10,"FIRST_CHANGE#":2155465,"NEXT_CHANGE#":2177459,"FIRST_TIME":"2026-09-11T23:40:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":11,"FIRST_CHANGE#":2177459,"NEXT_CHANGE#":2185647,"FIRST_TIME":"2026-09-11T23:40:39.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":12,"FIRST_CHANGE#":2185647,"NEXT_CHANGE#":2217707,"FIRST_TIME":"2026-09-11T23:40:57.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":13,"FIRST_CHANGE#":2217707,"NEXT_CHANGE#":2222208,"FIRST_TIME":"2026-09-12T00:19:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":14,"FIRST_CHANGE#":2222208,"NEXT_CHANGE#":2227124,"FIRST_TIME":"2026-09-12T00:21:15.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":15,"FIRST_CHANGE#":2227124,"NEXT_CHANGE#":2227512,"FIRST_TIME":"2026-09-12T00:40:14.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":16,"FIRST_CHANGE#":2227512,"NEXT_CHANGE#":2232875,"FIRST_TIME":"2026-09-12T00:40:18.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":17,"FIRST_CHANGE#":2232875,"NEXT_CHANGE#":2234759,"FIRST_TIME":"2026-09-12T00:43:24.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":18,"FIRST_CHANGE#":2234759,"NEXT_CHANGE#":2241824,"FIRST_TIME":"2026-09-12T00:44:42.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":19,"FIRST_CHANGE#":2241824,"NEXT_CHANGE#":2242461,"FIRST_TIME":"2026-09-12T00:55:06.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":20,"FIRST_CHANGE#":2242461,"NEXT_CHANGE#":2243342,"FIRST_TIME":"2026-09-12T00:55:32.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":21,"FIRST_CHANGE#":2243342,"NEXT_CHANGE#":2247706,"FIRST_TIME":"2026-09-12T00:55:45.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":22,"FIRST_CHANGE#":2247706,"NEXT_CHANGE#":2251595,"FIRST_TIME":"2026-09-12T01:02:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":23,"FIRST_CHANGE#":2251595,"NEXT_CHANGE#":2252390,"FIRST_TIME":"2026-09-12T01:04:57.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":24,"FIRST_CHANGE#":2252390,"NEXT_CHANGE#":2259638,"FIRST_TIME":"2026-09-12T01:05:04.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":25,"FIRST_CHANGE#":2259638,"NEXT_CHANGE#":2260123,"FIRST_TIME":"2026-09-12T01:36:02.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":26,"FIRST_CHANGE#":2260123,"NEXT_CHANGE#":2265335,"FIRST_TIME":"2026-09-12T01:36:04.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":27,"FIRST_CHANGE#":2265335,"NEXT_CHANGE#":2266365,"FIRST_TIME":"2026-09-12T01:40:34.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":28,"FIRST_CHANGE#":2266365,"NEXT_CHANGE#":2286210,"FIRST_TIME":"2026-09-12T01:41:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":29,"FIRST_CHANGE#":2286210,"NEXT_CHANGE#":2324607,"FIRST_TIME":"2026-09-12T04:00:13.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":30,"FIRST_CHANGE#":2324607,"NEXT_CHANGE#":2366960,"FIRST_TIME":"2026-09-12T04:01:07.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":31,"FIRST_CHANGE#":2366960,"NEXT_CHANGE#":2407037,"FIRST_TIME":"2026-09-12T15:00:13.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":32,"FIRST_CHANGE#":2407037,"NEXT_CHANGE#":2446025,"FIRST_TIME":"2026-09-13T00:06:33.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":33,"FIRST_CHANGE#":2446025,"NEXT_CHANGE#":2478968,"FIRST_TIME":"2026-09-13T10:00:50.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":34,"FIRST_CHANGE#":2478968,"NEXT_CHANGE#":2513948,"FIRST_TIME":"2026-09-13T16:23:13.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":35,"FIRST_CHANGE#":2513948,"NEXT_CHANGE#":2559451,"FIRST_TIME":"2026-09-14T02:00:21.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":36,"FIRST_CHANGE#":2559451,"NEXT_CHANGE#":2603862,"FIRST_TIME":"2026-09-14T20:01:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":37,"FIRST_CHANGE#":2603862,"NEXT_CHANGE#":2651261,"FIRST_TIME":"2026-09-15T10:00:28.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":38,"FIRST_CHANGE#":2651261,"NEXT_CHANGE#":2706529,"FIRST_TIME":"2026-09-16T04:00:07.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":39,"FIRST_CHANGE#":2706529,"NEXT_CHANGE#":2742426,"FIRST_TIME":"2026-09-17T01:00:45.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":40,"FIRST_CHANGE#":2742426,"NEXT_CHANGE#":2795919,"FIRST_TIME":"2026-09-17T10:00:02.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":41,"FIRST_CHANGE#":2795919,"NEXT_CHANGE#":2848054,"FIRST_TIME":"2026-09-18T04:00:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":42,"FIRST_CHANGE#":2848054,"NEXT_CHANGE#":2883539,"FIRST_TIME":"2026-09-19T02:00:23.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":43,"FIRST_CHANGE#":2883539,"NEXT_CHANGE#":2911285,"FIRST_TIME":"2026-09-19T11:00:43.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":44,"FIRST_CHANGE#":2911285,"NEXT_CHANGE#":2937965,"FIRST_TIME":"2026-09-19T18:00:57.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":45,"FIRST_CHANGE#":2937965,"NEXT_CHANGE#":2981040,"FIRST_TIME":"2026-09-20T02:00:11.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":46,"FIRST_CHANGE#":2981040,"NEXT_CHANGE#":3010145,"FIRST_TIME":"2026-09-20T12:00:13.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":47,"FIRST_CHANGE#":3010145,"NEXT_CHANGE#":3041373,"FIRST_TIME":"2026-09-20T20:02:54.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":48,"FIRST_CHANGE#":3041373,"NEXT_CHANGE#":3094408,"FIRST_TIME":"2026-09-21T06:03:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":49,"FIRST_CHANGE#":3094408,"NEXT_CHANGE#":3125556,"FIRST_TIME":"2026-09-22T04:00:07.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":50,"FIRST_CHANGE#":3125556,"NEXT_CHANGE#":3166200,"FIRST_TIME":"2026-09-22T12:00:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":51,"FIRST_CHANGE#":3166200,"NEXT_CHANGE#":3201973,"FIRST_TIME":"2026-09-23T04:00:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":52,"FIRST_CHANGE#":3201973,"NEXT_CHANGE#":3317651,"FIRST_TIME":"2026-09-23T14:01:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":53,"FIRST_CHANGE#":3317651,"NEXT_CHANGE#":3338886,"FIRST_TIME":"2026-09-26T12:53:54.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":54,"FIRST_CHANGE#":3338886,"NEXT_CHANGE#":3366928,"FIRST_TIME":"2026-09-26T13:23:55.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":55,"FIRST_CHANGE#":3366928,"NEXT_CHANGE#":3397964,"FIRST_TIME":"2026-09-26T20:54:15.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":56,"FIRST_CHANGE#":3397964,"NEXT_CHANGE#":3436826,"FIRST_TIME":"2026-09-27T06:24:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":57,"FIRST_CHANGE#":3436826,"NEXT_CHANGE#":3473719,"FIRST_TIME":"2026-09-27T16:04:52.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":58,"FIRST_CHANGE#":3473719,"NEXT_CHANGE#":3512878,"FIRST_TIME":"2026-09-28T04:05:16.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":59,"FIRST_CHANGE#":3512878,"NEXT_CHANGE#":3548239,"FIRST_TIME":"2026-09-28T19:00:40.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":60,"FIRST_CHANGE#":3548239,"NEXT_CHANGE#":3595815,"FIRST_TIME":"2026-09-29T05:01:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":61,"FIRST_CHANGE#":3595815,"NEXT_CHANGE#":3626580,"FIRST_TIME":"2026-09-30T01:00:38.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":62,"FIRST_CHANGE#":3626580,"NEXT_CHANGE#":3680176,"FIRST_TIME":"2026-09-30T06:26:48.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":63,"FIRST_CHANGE#":3680176,"NEXT_CHANGE#":3723329,"FIRST_TIME":"2026-10-01T04:00:08.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":64,"FIRST_CHANGE#":3723329,"NEXT_CHANGE#":3760964,"FIRST_TIME":"2026-10-01T17:27:59.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":65,"FIRST_CHANGE#":3760964,"NEXT_CHANGE#":3876107,"FIRST_TIME":"2026-10-02T04:00:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":66,"FIRST_CHANGE#":3876107,"NEXT_CHANGE#":3979380,"FIRST_TIME":"2026-10-13T09:05:08.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":67,"FIRST_CHANGE#":3979380,"NEXT_CHANGE#":3987467,"FIRST_TIME":"2026-10-13T09:31:34.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":68,"FIRST_CHANGE#":3987467,"NEXT_CHANGE#":4018735,"FIRST_TIME":"2026-10-13T10:00:56.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":69,"FIRST_CHANGE#":4018735,"NEXT_CHANGE#":4045278,"FIRST_TIME":"2026-10-13T23:00:14.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":70,"FIRST_CHANGE#":4045278,"NEXT_CHANGE#":4063903,"FIRST_TIME":"2026-10-14T04:00:24.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":71,"FIRST_CHANGE#":4063903,"NEXT_CHANGE#":4072547,"FIRST_TIME":"2026-10-14T10:21:52.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":72,"FIRST_CHANGE#":4072547,"NEXT_CHANGE#":4076227,"FIRST_TIME":"2026-10-14T12:00:32.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":73,"FIRST_CHANGE#":4076227,"NEXT_CHANGE#":4076832,"FIRST_TIME":"2026-10-14T12:02:25.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":74,"FIRST_CHANGE#":4076832,"NEXT_CHANGE#":4084908,"FIRST_TIME":"2026-10-14T12:02:32.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":75,"FIRST_CHANGE#":4084908,"NEXT_CHANGE#":4087782,"FIRST_TIME":"2026-10-14T12:06:53.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":76,"FIRST_CHANGE#":4087782,"NEXT_CHANGE#":4091896,"FIRST_TIME":"2026-10-14T12:07:14.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":77,"FIRST_CHANGE#":4091896,"NEXT_CHANGE#":4095309,"FIRST_TIME":"2026-10-14T12:08:26.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":78,"FIRST_CHANGE#":4095309,"NEXT_CHANGE#":4097028,"FIRST_TIME":"2026-10-14T12:09:59.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":79,"FIRST_CHANGE#":4097028,"NEXT_CHANGE#":4103762,"FIRST_TIME":"2026-10-14T12:10:08.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":80,"FIRST_CHANGE#":4103762,"NEXT_CHANGE#":4111532,"FIRST_TIME":"2026-10-14T12:12:02.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":81,"FIRST_CHANGE#":4111532,"NEXT_CHANGE#":4117505,"FIRST_TIME":"2026-10-14T12:38:53.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":82,"FIRST_CHANGE#":4117505,"NEXT_CHANGE#":4142390,"FIRST_TIME":"2026-10-14T12:41:02.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":83,"FIRST_CHANGE#":4142390,"NEXT_CHANGE#":4149934,"FIRST_TIME":"2026-10-14T20:00:55.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":84,"FIRST_CHANGE#":4149934,"NEXT_CHANGE#":4155604,"FIRST_TIME":"2026-10-14T21:12:37.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":85,"FIRST_CHANGE#":4155604,"NEXT_CHANGE#":4165878,"FIRST_TIME":"2026-10-14T21:13:25.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":86,"FIRST_CHANGE#":4165878,"NEXT_CHANGE#":4172030,"FIRST_TIME":"2026-10-14T23:35:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":87,"FIRST_CHANGE#":4172030,"NEXT_CHANGE#":4182382,"FIRST_TIME":"2026-10-15T00:00:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":88,"FIRST_CHANGE#":4182382,"NEXT_CHANGE#":4189280,"FIRST_TIME":"2026-10-15T02:11:20.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":89,"FIRST_CHANGE#":4189280,"NEXT_CHANGE#":4196067,"FIRST_TIME":"2026-10-15T02:43:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":90,"FIRST_CHANGE#":4196067,"NEXT_CHANGE#":4201316,"FIRST_TIME":"2026-10-15T03:05:09.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":91,"FIRST_CHANGE#":4201316,"NEXT_CHANGE#":4215480,"FIRST_TIME":"2026-10-15T03:47:57.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":92,"FIRST_CHANGE#":4215480,"NEXT_CHANGE#":4265136,"FIRST_TIME":"2026-10-15T04:00:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":93,"FIRST_CHANGE#":4265136,"NEXT_CHANGE#":4297555,"FIRST_TIME":"2026-10-15T21:00:51.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":94,"FIRST_CHANGE#":4297555,"NEXT_CHANGE#":4351185,"FIRST_TIME":"2026-10-16T05:05:11.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":95,"FIRST_CHANGE#":4351185,"NEXT_CHANGE#":4479056,"FIRST_TIME":"2026-10-17T03:00:57.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":96,"FIRST_CHANGE#":4479056,"NEXT_CHANGE#":4524696,"FIRST_TIME":"2026-10-17T05:36:56.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":97,"FIRST_CHANGE#":4524696,"NEXT_CHANGE#":4565883,"FIRST_TIME":"2026-10-17T16:07:21.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":98,"FIRST_CHANGE#":4565883,"NEXT_CHANGE#":4603923,"FIRST_TIME":"2026-10-18T04:07:42.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":99,"FIRST_CHANGE#":4603923,"NEXT_CHANGE#":4637697,"FIRST_TIME":"2026-10-18T12:00:07.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":100,"FIRST_CHANGE#":4637697,"NEXT_CHANGE#":4664800,"FIRST_TIME":"2026-10-18T20:08:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":101,"FIRST_CHANGE#":4664800,"NEXT_CHANGE#":4719036,"FIRST_TIME":"2026-10-19T04:08:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":102,"FIRST_CHANGE#":4719036,"NEXT_CHANGE#":4741516,"FIRST_TIME":"2026-10-20T01:00:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":103,"FIRST_CHANGE#":4741516,"NEXT_CHANGE#":4780303,"FIRST_TIME":"2026-10-20T04:00:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":104,"FIRST_CHANGE#":4780303,"NEXT_CHANGE#":4814707,"FIRST_TIME":"2026-10-20T17:54:34.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":105,"FIRST_CHANGE#":4814707,"NEXT_CHANGE#":4935604,"FIRST_TIME":"2026-10-21T04:00:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":106,"FIRST_CHANGE#":4935604,"NEXT_CHANGE#":5037472,"FIRST_TIME":"2026-10-21T09:15:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":107,"FIRST_CHANGE#":5037472,"NEXT_CHANGE#":5055474,"FIRST_TIME":"2026-10-21T09:38:19.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":108,"FIRST_CHANGE#":5055474,"NEXT_CHANGE#":5097655,"FIRST_TIME":"2026-10-23T05:21:44.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":109,"FIRST_CHANGE#":5097655,"NEXT_CHANGE#":5133597,"FIRST_TIME":"2026-10-23T15:58:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":110,"FIRST_CHANGE#":5133597,"NEXT_CHANGE#":5144015,"FIRST_TIME":"2026-10-24T04:00:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":111,"FIRST_CHANGE#":5144015,"NEXT_CHANGE#":5156095,"FIRST_TIME":"2026-10-24T06:34:37.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":112,"FIRST_CHANGE#":5156095,"NEXT_CHANGE#":5164918,"FIRST_TIME":"2026-10-24T06:50:46.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":113,"FIRST_CHANGE#":5164918,"NEXT_CHANGE#":5172851,"FIRST_TIME":"2026-10-24T06:56:52.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":114,"FIRST_CHANGE#":5172851,"NEXT_CHANGE#":5182152,"FIRST_TIME":"2026-10-24T07:00:20.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":115,"FIRST_CHANGE#":5182152,"NEXT_CHANGE#":5190186,"FIRST_TIME":"2026-10-24T07:07:02.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":116,"FIRST_CHANGE#":5190186,"NEXT_CHANGE#":5196746,"FIRST_TIME":"2026-10-24T07:36:59.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":117,"FIRST_CHANGE#":5196746,"NEXT_CHANGE#":5202650,"FIRST_TIME":"2026-10-24T08:06:47.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":118,"FIRST_CHANGE#":5202650,"NEXT_CHANGE#":5205066,"FIRST_TIME":"2026-10-24T08:07:38.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":119,"FIRST_CHANGE#":5205066,"NEXT_CHANGE#":5207366,"FIRST_TIME":"2026-10-24T08:08:23.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":120,"FIRST_CHANGE#":5207366,"NEXT_CHANGE#":5244974,"FIRST_TIME":"2026-10-24T08:08:50.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":121,"FIRST_CHANGE#":5244974,"NEXT_CHANGE#":5295799,"FIRST_TIME":"2026-10-24T12:00:33.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":122,"FIRST_CHANGE#":5295799,"NEXT_CHANGE#":5313066,"FIRST_TIME":"2026-10-24T20:02:50.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":123,"FIRST_CHANGE#":5313066,"NEXT_CHANGE#":5320524,"FIRST_TIME":"2026-10-24T23:08:41.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":124,"FIRST_CHANGE#":5320524,"NEXT_CHANGE#":5324984,"FIRST_TIME":"2026-10-24T23:13:41.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":125,"FIRST_CHANGE#":5324984,"NEXT_CHANGE#":5332573,"FIRST_TIME":"2026-10-24T23:20:59.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":126,"FIRST_CHANGE#":5332573,"NEXT_CHANGE#":5340935,"FIRST_TIME":"2026-10-24T23:26:53.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":127,"FIRST_CHANGE#":5340935,"NEXT_CHANGE#":5350354,"FIRST_TIME":"2026-10-24T23:39:17.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":128,"FIRST_CHANGE#":5350354,"NEXT_CHANGE#":5376139,"FIRST_TIME":"2026-10-25T00:04:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":129,"FIRST_CHANGE#":5376139,"NEXT_CHANGE#":5389388,"FIRST_TIME":"2026-10-25T04:03:12.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":130,"FIRST_CHANGE#":5389388,"NEXT_CHANGE#":5391121,"FIRST_TIME":"2026-10-25T07:21:51.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":131,"FIRST_CHANGE#":5391121,"NEXT_CHANGE#":5399268,"FIRST_TIME":"2026-10-25T07:21:58.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":132,"FIRST_CHANGE#":5399268,"NEXT_CHANGE#":5400517,"FIRST_TIME":"2026-10-25T07:26:34.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":133,"FIRST_CHANGE#":5400517,"NEXT_CHANGE#":5410401,"FIRST_TIME":"2026-10-25T07:26:55.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":134,"FIRST_CHANGE#":5410401,"NEXT_CHANGE#":5415897,"FIRST_TIME":"2026-10-25T08:31:46.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":135,"FIRST_CHANGE#":5415897,"NEXT_CHANGE#":5416802,"FIRST_TIME":"2026-10-25T08:41:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":136,"FIRST_CHANGE#":5416802,"NEXT_CHANGE#":5423019,"FIRST_TIME":"2026-10-25T08:41:52.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":137,"FIRST_CHANGE#":5423019,"NEXT_CHANGE#":5425878,"FIRST_TIME":"2026-10-25T08:45:19.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":138,"FIRST_CHANGE#":5425878,"NEXT_CHANGE#":5453012,"FIRST_TIME":"2026-10-25T08:46:04.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":139,"FIRST_CHANGE#":5453012,"NEXT_CHANGE#":5488950,"FIRST_TIME":"2026-10-25T12:00:29.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":140,"FIRST_CHANGE#":5488950,"NEXT_CHANGE#":5514467,"FIRST_TIME":"2026-10-26T00:00:56.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":141,"FIRST_CHANGE#":5514467,"NEXT_CHANGE#":5572635,"FIRST_TIME":"2026-10-26T06:24:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":142,"FIRST_CHANGE#":5572635,"NEXT_CHANGE#":5598960,"FIRST_TIME":"2026-10-27T04:00:10.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":143,"FIRST_CHANGE#":5598960,"NEXT_CHANGE#":5622111,"FIRST_TIME":"2026-10-27T08:00:41.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":144,"FIRST_CHANGE#":5622111,"NEXT_CHANGE#":5659804,"FIRST_TIME":"2026-10-27T17:21:58.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":145,"FIRST_CHANGE#":5659804,"NEXT_CHANGE#":5679232,"FIRST_TIME":"2026-10-28T04:00:15.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":146,"FIRST_CHANGE#":5679232,"NEXT_CHANGE#":5718897,"FIRST_TIME":"2026-10-28T05:22:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":147,"FIRST_CHANGE#":5718897,"NEXT_CHANGE#":5754998,"FIRST_TIME":"2026-10-28T17:22:00.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":148,"FIRST_CHANGE#":5754998,"NEXT_CHANGE#":5780078,"FIRST_TIME":"2026-10-29T04:00:26.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":149,"FIRST_CHANGE#":5780078,"NEXT_CHANGE#":5832076,"FIRST_TIME":"2026-10-29T06:26:35.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":150,"FIRST_CHANGE#":5832076,"NEXT_CHANGE#":5860205,"FIRST_TIME":"2026-10-30T01:00:39.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":151,"FIRST_CHANGE#":5860205,"NEXT_CHANGE#":5907215,"FIRST_TIME":"2026-10-30T04:00:34.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":152,"FIRST_CHANGE#":5907215,"NEXT_CHANGE#":6018361,"FIRST_TIME":"2026-10-30T20:00:22.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":153,"FIRST_CHANGE#":6018361,"NEXT_CHANGE#":6028286,"FIRST_TIME":"2026-11-04T10:29:56.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":154,"FIRST_CHANGE#":6028286,"NEXT_CHANGE#":6080811,"FIRST_TIME":"2026-11-04T11:03:17.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":155,"FIRST_CHANGE#":6080811,"NEXT_CHANGE#":6134955,"FIRST_TIME":"2026-11-05T00:00:23.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":156,"FIRST_CHANGE#":6134955,"NEXT_CHANGE#":6168850,"FIRST_TIME":"2026-11-05T04:00:36.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":157,"FIRST_CHANGE#":6168850,"NEXT_CHANGE#":6225134,"FIRST_TIME":"2026-11-05T10:15:41.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":158,"FIRST_CHANGE#":6225134,"NEXT_CHANGE#":6265962,"FIRST_TIME":"2026-11-06T00:32:19.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":159,"FIRST_CHANGE#":6265962,"NEXT_CHANGE#":6290090,"FIRST_TIME":"2026-11-06T04:00:47.000Z","RESETLOGS_CHANGE#":1920977},{"THREAD#":1,"SEQUENCE#":160,"FIRST_CHANGE#":6290090,"NEXT_CHANGE#":6378581,"FIRST_TIME":"2026-11-06T07:06:03.000Z","RESETLOGS_CHANGE#":1920977}]

Evidence controlfiles (V$CONTROLFILE): ok
[{"NAME":"/opt/oracle/oradata/ORCL/control01.ctl","STATUS":null,"IS_RECOVERY_DEST_FILE":"NO"}]

Evidence configuration (V$RMAN_CONFIGURATION): ok — No explicit control-file autobackup setting visible; effective default not inferred (depends on database configuration).
[]

Evidence recoveryArea (V$RECOVERY_FILE_DEST): ok
[]

Evidence corruption (V$DATABASE_BLOCK_CORRUPTION): ok
[]

Evidence recoverFiles (V$RECOVER_FILE): ok
[]

Evidence database (V$DATABASE): ok
[{"DBID":1771485732,"NAME":"ORCL","LOG_MODE":"NOARCHIVELOG","RESETLOGS_CHANGE#":1920977,"CURRENT_SCN":6413249}]

```

## p1 live output: npm run piagent -- backup --target p1-19c-prod

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`

```text

> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts backup --target p1-19c-prod

# Backup — p1-19c-prod

Database-wide (non-CDB).

Captured 2026-11-06T20:52:53.589Z. Sequential bounded SELECT snapshots.

Restore-to-time estimate: {"status":"not-verifiable","from":null,"through":null,"detail":"Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.","evidence":["database","datafiles","backups","sets","pieces","archives","history","corruption","recoverFiles"]}

high: Backup history is not verifiable from this database: required views are unreadable or incomplete. Evidence: database, datafiles, backups, sets, pieces, jobs. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

Per-datafile backups: [{"file":1,"level0":null,"incremental":null,"checkpointScn":null},{"file":3,"level0":null,"incremental":null,"checkpointScn":null},{"file":4,"level0":null,"incremental":null,"checkpointScn":null},{"file":5,"level0":null,"incremental":null,"checkpointScn":null},{"file":7,"level0":null,"incremental":null,"checkpointScn":null}]

Archive gaps: []

Recovery-area balance (bytes): []

Evidence jobs (V$RMAN_BACKUP_JOB_DETAILS): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence sets (V$BACKUP_SET): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence pieces (V$BACKUP_PIECE): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence datafiles (V$DATAFILE): ok
[{"FILE#":1,"NAME":"/opt/oracle/oradata/PRODCDB/system01.dbf","CREATION_CHANGE#":9},{"FILE#":3,"NAME":"/opt/oracle/oradata/PRODCDB/sysaux01.dbf","CREATION_CHANGE#":5480},{"FILE#":4,"NAME":"/opt/oracle/oradata/PRODCDB/undotbs01.dbf","CREATION_CHANGE#":1920446},{"FILE#":5,"NAME":"/opt/oracle/oradata/PRODCDB/shop_data01.dbf","CREATION_CHANGE#":2213148},{"FILE#":7,"NAME":"/opt/oracle/oradata/PRODCDB/users01.dbf","CREATION_CHANGE#":32876}]

Evidence backups (V$BACKUP_DATAFILE): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence archives (V$ARCHIVED_LOG): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence history (V$LOG_HISTORY): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence controlfiles (V$CONTROLFILE): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence configuration (V$RMAN_CONFIGURATION): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence recoveryArea (V$RECOVERY_FILE_DEST): ok
[]

Evidence corruption (V$DATABASE_BLOCK_CORRUPTION): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence recoverFiles (V$RECOVER_FILE): unavailable — Not available in a PDB / not granted (ORA-00942).
[]

Evidence database (V$DATABASE): ok
[{"DBID":3245601634,"NAME":"PRODCDB","LOG_MODE":"NOARCHIVELOG","RESETLOGS_CHANGE#":1920977,"CURRENT_SCN":4973940}]

```

## p1 JSON smoke: npm run piagent -- backup --target p1-19c-prod --json

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`

```text

> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts backup --target p1-19c-prod --json

{"target":"p1-19c-prod","capturedAt":"2026-11-06T20:52:55.913Z","scope":"Database-wide (non-CDB).","status":"partial","evidence":{"jobs":{"view":"V$RMAN_BACKUP_JOB_DETAILS","sql":"SELECT SESSION_KEY, INPUT_TYPE, STATUS, START_TIME, END_TIME, OUTPUT_BYTES FROM V$RMAN_BACKUP_JOB_DETAILS ORDER BY START_TIME DESC","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"sets":{"view":"V$BACKUP_SET","sql":"SELECT SET_STAMP, SET_COUNT, BACKUP_TYPE, INCREMENTAL_LEVEL, START_TIME, COMPLETION_TIME, PIECES FROM V$BACKUP_SET ORDER BY COMPLETION_TIME DESC","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"pieces":{"view":"V$BACKUP_PIECE","sql":"SELECT SET_STAMP, SET_COUNT, PIECE#, COPY#, STATUS, DELETED, COMPLETION_TIME FROM V$BACKUP_PIECE ORDER BY COMPLETION_TIME DESC","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"datafiles":{"view":"V$DATAFILE","sql":"SELECT FILE#, NAME, CREATION_CHANGE# FROM V$DATAFILE ORDER BY FILE#","status":"ok","columns":["FILE#","NAME","CREATION_CHANGE#"],"rows":[{"FILE#":1,"NAME":"/opt/oracle/oradata/PRODCDB/system01.dbf","CREATION_CHANGE#":9},{"FILE#":3,"NAME":"/opt/oracle/oradata/PRODCDB/sysaux01.dbf","CREATION_CHANGE#":5480},{"FILE#":4,"NAME":"/opt/oracle/oradata/PRODCDB/undotbs01.dbf","CREATION_CHANGE#":1920446},{"FILE#":5,"NAME":"/opt/oracle/oradata/PRODCDB/shop_data01.dbf","CREATION_CHANGE#":2213148},{"FILE#":7,"NAME":"/opt/oracle/oradata/PRODCDB/users01.dbf","CREATION_CHANGE#":32876}],"truncated":false},"backups":{"view":"V$BACKUP_DATAFILE","sql":"SELECT FILE#, SET_STAMP, SET_COUNT, INCREMENTAL_LEVEL, CHECKPOINT_CHANGE#, CHECKPOINT_TIME, COMPLETION_TIME, RESETLOGS_CHANGE#, CREATION_CHANGE# FROM V$BACKUP_DATAFILE WHERE FILE# > 0 ORDER BY COMPLETION_TIME DESC","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"archives":{"view":"V$ARCHIVED_LOG","sql":"SELECT THREAD#, SEQUENCE#, RESETLOGS_CHANGE#, FIRST_CHANGE#, NEXT_CHANGE#, FIRST_TIME, NEXT_TIME, STATUS, DELETED, NAME FROM V$ARCHIVED_LOG ORDER BY RESETLOGS_CHANGE#, THREAD#, SEQUENCE#","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"history":{"view":"V$LOG_HISTORY","sql":"SELECT THREAD#, SEQUENCE#, FIRST_CHANGE#, NEXT_CHANGE#, FIRST_TIME, RESETLOGS_CHANGE# FROM V$LOG_HISTORY ORDER BY RESETLOGS_CHANGE#, THREAD#, SEQUENCE#","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"controlfiles":{"view":"V$CONTROLFILE","sql":"SELECT NAME, STATUS, IS_RECOVERY_DEST_FILE FROM V$CONTROLFILE ORDER BY NAME","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"configuration":{"view":"V$RMAN_CONFIGURATION","sql":"SELECT NAME, VALUE FROM V$RMAN_CONFIGURATION ORDER BY CONF#","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"recoveryArea":{"view":"V$RECOVERY_FILE_DEST","sql":"SELECT NAME, SPACE_LIMIT, SPACE_USED, SPACE_RECLAIMABLE, NUMBER_OF_FILES FROM V$RECOVERY_FILE_DEST","status":"ok","columns":["NAME","SPACE_LIMIT","SPACE_USED","SPACE_RECLAIMABLE","NUMBER_OF_FILES"],"rows":[],"truncated":false},"corruption":{"view":"V$DATABASE_BLOCK_CORRUPTION","sql":"SELECT FILE#, BLOCK#, BLOCKS, CORRUPTION_CHANGE#, CORRUPTION_TYPE FROM V$DATABASE_BLOCK_CORRUPTION ORDER BY FILE#, BLOCK#","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"recoverFiles":{"view":"V$RECOVER_FILE","sql":"SELECT FILE#, ONLINE_STATUS, ERROR, CHANGE#, TIME FROM V$RECOVER_FILE ORDER BY FILE#","status":"unavailable","columns":[],"rows":[],"truncated":false,"note":"Not available in a PDB / not granted (ORA-00942)."},"database":{"view":"V$DATABASE","sql":"SELECT DBID, NAME, LOG_MODE, RESETLOGS_CHANGE#, CURRENT_SCN FROM V$DATABASE","status":"ok","columns":["DBID","NAME","LOG_MODE","RESETLOGS_CHANGE#","CURRENT_SCN"],"rows":[{"DBID":3245601634,"NAME":"PRODCDB","LOG_MODE":"NOARCHIVELOG","RESETLOGS_CHANGE#":1920977,"CURRENT_SCN":4973959}],"truncated":false}},"findings":[{"id":"no-backups","severity":"high","detail":"Backup history is not verifiable from this database: required views are unreadable or incomplete.","evidence":["database","datafiles","backups","sets","pieces","jobs"],"advice":"For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment."}],"files":[{"file":1,"level0":null,"incremental":null,"checkpointScn":null},{"file":3,"level0":null,"incremental":null,"checkpointScn":null},{"file":4,"level0":null,"incremental":null,"checkpointScn":null},{"file":5,"level0":null,"incremental":null,"checkpointScn":null},{"file":7,"level0":null,"incremental":null,"checkpointScn":null}],"gaps":[],"restoreEstimate":{"status":"not-verifiable","from":null,"through":null,"detail":"Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.","evidence":["database","datafiles","backups","sets","pieces","archives","history","corruption","recoverFiles"]},"recoveryArea":[]}
```

## Final validation output

### npm run typecheck

```text

> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit

```

### npm test -- --maxWorkers=2

```text

> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25a-backup


 Test Files  109 passed (109)
      Tests  1854 passed (1854)
   Start at  14:54:13
   Duration  68.84s (tests 75%, import 23%, worker 1%, transform 1%)

    Isolate  109 workers spawned · ~291ms startup each (spawn + environment, per file)
             at least ~15.57s faster with isolate: false — reuses workers across files instead of one per file

```

### PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'

```text

> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25a-backup


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  14:50:52
   Duration  213.89s (tests 96%, import 4%, transform 1%)

```

### Focused backup integration (both approved labs)

```text

 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25a-backup


 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  14:53:46
   Duration  1.24s (tests 71%, import 16%, transform 12%, worker 1%)

```

Final results: typecheck clean; 109 unit files / 1,854 tests passed; 29 integration files / 67 tests passed, one Strata e2e intentionally skipped. Focused backup integration: both labs passed. Both live text commands and the p1 JSON command exited 0. `git diff --check` is clean. No requested contract changes or unapplied code fixes remain.

## Approved-review follow-up (2026-11-06)

Addressed all three observations from `../review-wp-25a-backup/docs/review-wp-25a-backup.md`:

- Normalize SET_STAMP and SET_COUNT numerically when matching datafile backups to sets and pieces. Null, nonnumeric and unsafe-integer identifiers do not match. Mixed number/string/BigInt fixtures retain valid backup associations.
- Sort invalid/null completion times after valid dates using a finite lower-bound sentinel, so comparators never return NaN and malformed rows cannot displace the newest valid full or incremental. Wholly invalid times still withhold a restore candidate.
- Throw local BackupUsageError before creating the session provider for an unknown target; the backup CLI prints the error and exits 2, matching sessions. Commander usage errors also exit 2. No database/LLM access is needed by these CLI regression tests.

Changed in this follow-up: `src/backup/index.ts`, `src/backup/cli.ts`, minimal backup-only wiring in `src/cli/index.ts`, `tests/unit/backup.test.ts`, new `tests/unit/backup-cli.test.ts`, and this report. Contract changes: none. No dependencies, SQL, grants or database state changed. Earlier live-output evidence and unverified limitations still apply.

### Review follow-up: npm run typecheck

```text

> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit

```

### Review follow-up: npm test -- --maxWorkers=2

```text

> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25a-backup


 Test Files  110 passed (110)
      Tests  1861 passed (1861)
   Start at  15:34:02
   Duration  64.98s (tests 76%, import 21%, transform 1%, worker 1%)

    Isolate  110 workers spawned · ~255ms startup each (spawn + environment, per file)
             at least ~13.76s faster with isolate: false — reuses workers across files instead of one per file

```

### Review follow-up: filtered integration

Command: `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`

```text

> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25a-backup


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  15:34:06
   Duration  207.00s (tests 96%, import 4%)

```

Review follow-up final results: typecheck clean; 110 unit files / 1,861 tests passed; 29 integration files / 67 tests passed, with the single Strata e2e intentionally skipped. All checks exited 0. No LLM calls, grants or database writes were made. Implementation commit: `012e550`. All three approved-review observations are resolved; no new contract changes or verification limitations. `git diff --check` is clean.
