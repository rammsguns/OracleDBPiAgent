# Backup — p1-19c-prod

Database-wide (non-CDB).

Captured 2026-11-07T02:36:10.321Z. Sequential bounded SELECT snapshots.

## Restore-to-time estimate
Status: Not verifiable with the available evidence.

- From: not established.
- Through: not established.
- Evidence: database, datafiles, backups, sets, pieces, archives, history, corruption, recoverFiles.

The database is in NOARCHIVELOG mode: point-in-time recovery is not possible. Only consistent (cold/mounted) backups can be restored. Metadata estimate only; no restore or media validation performed. Time X is a candidate only within the reported bounds, with every datafile and redo thread covered. Incremental times do not prove an applicable chain. Control-file history can age out; archived-log rows do not prove backup-media readability. Online redo, external catalogs, encryption keys, storage and restore duration are unverified.

high: No backups recorded at all in the visible control-file history; external catalogs and aged-out records are not checked. Evidence: backups, jobs, sets. For a human DBA: review the cited metadata and validate the restore plan and backup media using RMAN in an approved recovery environment.

## Per-datafile backups:

| file | level0 | incremental | checkpointScn |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 3 |  |  |  |
| 4 |  |  |  |
| 5 |  |  |  |
| 7 |  |  |  |

## Archive gaps:

None.

## Recovery-area balance (bytes):

None.

## Evidence jobs (V$RMAN_BACKUP_JOB_DETAILS): ok

None.

## Evidence sets (V$BACKUP_SET): ok

None.

## Evidence pieces (V$BACKUP_PIECE): ok

None.

## Evidence datafiles (V$DATAFILE): ok

| FILE# | NAME | CREATION_CHANGE# |
| --- | --- | --- |
| 1 | /opt/oracle/oradata/PRODCDB/system01.dbf | 9 |
| 3 | /opt/oracle/oradata/PRODCDB/sysaux01.dbf | 5480 |
| 4 | /opt/oracle/oradata/PRODCDB/undotbs01.dbf | 1920446 |
| 5 | /opt/oracle/oradata/PRODCDB/shop_data01.dbf | 2213148 |
| 7 | /opt/oracle/oradata/PRODCDB/users01.dbf | 32876 |

## Evidence backups (V$BACKUP_DATAFILE): ok

None.

## Evidence archives (V$ARCHIVED_LOG): ok

None.

## Evidence history (V$LOG_HISTORY): ok

| THREAD# | SEQUENCE# | FIRST_CHANGE# | NEXT_CHANGE# | FIRST_TIME | RESETLOGS_CHANGE# |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1920977 | 1968771 | 2026-10-25T05:27:32.000Z | 1920977 |
| 1 | 2 | 1968771 | 1983607 | 2026-10-25T05:29:59.000Z | 1920977 |
| 1 | 3 | 1983607 | 1987825 | 2026-10-25T05:31:05.000Z | 1920977 |
| 1 | 4 | 1987825 | 1992479 | 2026-10-25T05:31:29.000Z | 1920977 |
| 1 | 5 | 1992479 | 1999626 | 2026-10-25T05:31:51.000Z | 1920977 |
| 1 | 6 | 1999626 | 2040833 | 2026-10-25T05:32:27.000Z | 1920977 |
| 1 | 7 | 2040833 | 2070219 | 2026-10-25T05:33:18.000Z | 1920977 |
| 1 | 8 | 2070219 | 2120767 | 2026-10-25T05:33:51.000Z | 1920977 |
| 1 | 9 | 2120767 | 2150347 | 2026-10-25T05:34:27.000Z | 1920977 |
| 1 | 10 | 2150347 | 2172676 | 2026-10-25T05:35:09.000Z | 1920977 |
| 1 | 11 | 2172676 | 2190583 | 2026-10-25T05:35:51.000Z | 1920977 |
| 1 | 12 | 2190583 | 2196753 | 2026-10-25T05:36:39.000Z | 1920977 |
| 1 | 13 | 2196753 | 2265943 | 2026-10-25T05:37:12.000Z | 1920977 |
| 1 | 14 | 2265943 | 2333963 | 2026-10-25T09:45:10.000Z | 1920977 |
| 1 | 15 | 2333963 | 2404700 | 2026-10-25T12:01:08.000Z | 1920977 |
| 1 | 16 | 2404700 | 2468931 | 2026-10-25T16:53:12.000Z | 1920977 |
| 1 | 17 | 2468931 | 2534344 | 2026-10-25T22:12:40.000Z | 1920977 |
| 1 | 18 | 2534344 | 2598152 | 2026-10-26T03:45:11.000Z | 1920977 |
| 1 | 19 | 2598152 | 2668069 | 2026-10-26T09:00:36.000Z | 1920977 |
| 1 | 20 | 2668069 | 2737954 | 2026-10-26T15:31:10.000Z | 1920977 |
| 1 | 21 | 2737954 | 2815692 | 2026-10-26T22:01:11.000Z | 1920977 |
| 1 | 22 | 2815692 | 2884668 | 2026-10-27T04:00:16.000Z | 1920977 |
| 1 | 23 | 2884668 | 2955603 | 2026-10-27T10:00:35.000Z | 1920977 |
| 1 | 24 | 2955603 | 3025610 | 2026-10-27T16:29:39.000Z | 1920977 |
| 1 | 25 | 3025610 | 3093040 | 2026-10-27T22:46:41.000Z | 1920977 |
| 1 | 26 | 3093040 | 3155237 | 2026-10-28T04:00:20.000Z | 1920977 |
| 1 | 27 | 3155237 | 3231732 | 2026-10-28T08:03:39.000Z | 1920977 |
| 1 | 28 | 3231732 | 3306598 | 2026-10-28T14:50:41.000Z | 1920977 |
| 1 | 29 | 3306598 | 3382612 | 2026-10-28T21:36:39.000Z | 1920977 |
| 1 | 30 | 3382612 | 3446640 | 2026-10-29T04:00:07.000Z | 1920977 |
| 1 | 31 | 3446640 | 3518264 | 2026-10-29T08:00:47.000Z | 1920977 |
| 1 | 32 | 3518264 | 3588744 | 2026-10-29T14:17:09.000Z | 1920977 |
| 1 | 33 | 3588744 | 3662061 | 2026-10-29T20:41:40.000Z | 1920977 |
| 1 | 34 | 3662061 | 3723771 | 2026-10-30T02:51:12.000Z | 1920977 |
| 1 | 35 | 3723771 | 3796002 | 2026-10-30T06:38:39.000Z | 1920977 |
| 1 | 36 | 3796002 | 3866610 | 2026-10-30T13:00:13.000Z | 1920977 |
| 1 | 37 | 3866610 | 4028452 | 2026-10-30T19:26:09.000Z | 1920977 |
| 1 | 38 | 4028452 | 4030466 | 2026-11-04T10:29:56.000Z | 1920977 |
| 1 | 39 | 4030466 | 4032456 | 2026-11-04T10:30:08.000Z | 1920977 |
| 1 | 40 | 4032456 | 4035932 | 2026-11-04T10:30:12.000Z | 1920977 |
| 1 | 41 | 4035932 | 4036759 | 2026-11-04T10:30:19.000Z | 1920977 |
| 1 | 42 | 4036759 | 4040159 | 2026-11-04T10:30:29.000Z | 1920977 |
| 1 | 43 | 4040159 | 4041113 | 2026-11-04T10:30:39.000Z | 1920977 |
| 1 | 44 | 4041113 | 4043148 | 2026-11-04T10:30:46.000Z | 1920977 |
| 1 | 45 | 4043148 | 4099161 | 2026-11-04T10:30:55.000Z | 1920977 |
| 1 | 46 | 4099161 | 4170968 | 2026-11-04T15:00:12.000Z | 1920977 |
| 1 | 47 | 4170968 | 4253048 | 2026-11-04T20:56:40.000Z | 1920977 |
| 1 | 48 | 4253048 | 4306809 | 2026-11-05T02:41:56.000Z | 1920977 |
| 1 | 49 | 4306809 | 4364792 | 2026-11-05T05:00:32.000Z | 1920977 |
| 1 | 50 | 4364792 | 4365566 | 2026-11-05T09:41:42.000Z | 1920977 |
| 1 | 51 | 4365566 | 4366368 | 2026-11-05T09:41:46.000Z | 1920977 |
| 1 | 52 | 4366368 | 4367163 | 2026-11-05T09:41:56.000Z | 1920977 |
| 1 | 53 | 4367163 | 4368004 | 2026-11-05T09:42:05.000Z | 1920977 |
| 1 | 54 | 4368004 | 4368858 | 2026-11-05T09:42:17.000Z | 1920977 |
| 1 | 55 | 4368858 | 4449915 | 2026-11-05T09:42:24.000Z | 1920977 |
| 1 | 56 | 4449915 | 4525462 | 2026-11-05T15:41:10.000Z | 1920977 |
| 1 | 57 | 4525462 | 4606880 | 2026-11-05T22:00:33.000Z | 1920977 |
| 1 | 58 | 4606880 | 4643593 | 2026-11-06T03:45:57.000Z | 1920977 |
| 1 | 59 | 4643593 | 4708785 | 2026-11-06T05:00:31.000Z | 1920977 |
| 1 | 60 | 4708785 | 4709593 | 2026-11-06T09:41:41.000Z | 1920977 |
| 1 | 61 | 4709593 | 4798775 | 2026-11-06T09:41:47.000Z | 1920977 |
| 1 | 62 | 4798775 | 4881899 | 2026-11-06T15:55:39.000Z | 1920977 |
| 1 | 63 | 4881899 | 4996634 | 2026-11-06T22:02:40.000Z | 1920977 |
| 1 | 64 | 4996634 | 5055662 | 2026-11-07T03:37:20.000Z | 1920977 |

## Evidence controlfiles (V$CONTROLFILE): ok

| NAME | STATUS | IS_RECOVERY_DEST_FILE |
| --- | --- | --- |
| /opt/oracle/oradata/PRODCDB/control01.ctl |  | NO |

## Evidence configuration (V$RMAN_CONFIGURATION): ok — No explicit control-file autobackup setting visible; effective default not inferred (depends on database configuration).

None.

## Evidence recoveryArea (V$RECOVERY_FILE_DEST): ok

None.

## Evidence corruption (V$DATABASE_BLOCK_CORRUPTION): ok

None.

## Evidence recoverFiles (V$RECOVER_FILE): ok

None.

## Evidence database (V$DATABASE): ok

| DBID | NAME | LOG_MODE | RESETLOGS_CHANGE# | CURRENT_SCN |
| --- | --- | --- | --- | --- |
| 3245601634 | PRODCDB | NOARCHIVELOG | 1920977 | 5099616 |
