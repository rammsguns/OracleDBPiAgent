# Jobs: p1-19c-prod

2026-10-31T02:34:46.685Z to 2026-11-07T02:34:46.685Z (exclusive; UTC)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok
| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORACLE_OCM | MGMT_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-07T01:01:01.240Z | 2026-11-08T01:01:01.249Z | 9 | 0 |
| ORACLE_OCM | MGMT_STATS_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.120Z | 2026-12-01T01:01:01.124Z | 1 | 0 |
| SHOPAPP | NIGHTLY_PURGE_JOB | TRUE | SCHEDULED | 2026-11-06T03:41:39.238Z | 2026-11-07T03:41:39.239Z | 9 | 1 |
| SHOPAPP | PLACE_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-07T02:34:39.092Z | 2026-11-07T02:35:09.000Z | 25136 | 0 |
| SHOPAPP | SHIP_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-07T02:31:39.113Z | 2026-11-07T02:36:39.000Z | 2515 | 0 |
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.108Z | 2026-11-08T07:00:00.110Z | 3 | 0 |
| SYS | CLEANUP_NON_EXIST_OBJ | TRUE | SCHEDULED | 2026-11-06T16:30:03.926Z | 2026-11-07T04:30:03.952Z | 18 | 0 |
| SYS | CLEANUP_ONLINE_IND_BUILD | TRUE | SCHEDULED | 2026-11-07T02:14:27.066Z | 2026-11-07T03:14:27.068Z | 211 | 0 |
| SYS | CLEANUP_ONLINE_PMO | TRUE | SCHEDULED | 2026-11-07T02:15:07.069Z | 2026-11-07T03:15:07.071Z | 211 | 0 |
| SYS | CLEANUP_TAB_IOT_PMO | TRUE | SCHEDULED | 2026-11-07T02:14:37.271Z | 2026-11-07T03:14:37.273Z | 211 | 0 |
| SYS | CLEANUP_TRANSIENT_PKG | TRUE | SCHEDULED | 2026-11-07T02:14:57.063Z | 2026-11-07T04:14:57.000Z | 107 | 0 |
| SYS | CLEANUP_TRANSIENT_TYPE | TRUE | SCHEDULED | 2026-11-06T16:30:03.926Z | 2026-11-07T04:30:03.954Z | 18 | 0 |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | TRUE | SCHEDULED | 2026-11-06T22:00:02.252Z |  | 8 | 0 |
| SYS | FGR$AUTOPURGE_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | FILE_SIZE_UPD | TRUE | SCHEDULED | 2026-10-24T23:39:27.362Z | 2027-10-24T23:39:27.367Z | 1 | 0 |
| SYS | FILE_WATCHER | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | HM_CREATE_OFFLINE_DICTIONARY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | LOAD_OPATCH_INVENTORY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | ORA$AUTOTASK_CLEAN | TRUE | SCHEDULED | 2026-11-06T11:00:00.437Z | 2026-11-07T11:00:00.439Z | 11 | 0 |
| SYS | ORA$PREPLUGIN_BACKUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | PMO_DEFERRED_GIDX_MAINT_JOB | TRUE | SCHEDULED | 2026-11-06T10:00:00.511Z | 2026-11-07T10:00:00.513Z | 11 | 0 |
| SYS | PURGE_LOG | TRUE | SCHEDULED | 2026-11-06T11:00:00.437Z | 2026-11-07T11:00:00.439Z | 11 | 0 |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | TRUE | SCHEDULED | 2026-11-06T08:00:00.235Z | 2026-11-07T08:00:00.237Z | 11 | 0 |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | TRUE | SCHEDULED | 2026-11-06T08:00:00.235Z | 2026-11-07T08:00:00.237Z | 11 | 0 |
| SYS | XMLDB_NFS_CLEANUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | 38342 | 2026-11-04T04:30:56.304Z | FAILED | 2292 | ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1<br> |

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 57546 | 2026-11-07T02:34:39.113Z | SUCCEEDED | 0 | 2026-11-07T02:34:39.092Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57544 | 2026-11-07T02:34:09.097Z | SUCCEEDED | 0 | 2026-11-07T02:34:09.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57542 | 2026-11-07T02:33:39.096Z | SUCCEEDED | 0 | 2026-11-07T02:33:39.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57540 | 2026-11-07T02:33:09.101Z | SUCCEEDED | 0 | 2026-11-07T02:33:09.091Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57538 | 2026-11-07T02:32:39.112Z | SUCCEEDED | 0 | 2026-11-07T02:32:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57536 | 2026-11-07T02:32:09.117Z | SUCCEEDED | 0 | 2026-11-07T02:32:09.093Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57534 | 2026-11-07T02:31:39.123Z | SUCCEEDED | 0 | 2026-11-07T02:31:39.113Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57532 | 2026-11-07T02:31:39.108Z | SUCCEEDED | 0 | 2026-11-07T02:31:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57530 | 2026-11-07T02:31:09.104Z | SUCCEEDED | 0 | 2026-11-07T02:31:09.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57528 | 2026-11-07T02:30:39.099Z | SUCCEEDED | 0 | 2026-11-07T02:30:39.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57526 | 2026-11-07T02:30:09.098Z | SUCCEEDED | 0 | 2026-11-07T02:30:09.080Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57524 | 2026-11-07T02:29:39.084Z | SUCCEEDED | 0 | 2026-11-07T02:29:39.075Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57522 | 2026-11-07T02:29:09.092Z | SUCCEEDED | 0 | 2026-11-07T02:29:09.080Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57520 | 2026-11-07T02:28:39.098Z | SUCCEEDED | 0 | 2026-11-07T02:28:39.078Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57518 | 2026-11-07T02:28:09.097Z | SUCCEEDED | 0 | 2026-11-07T02:28:09.084Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57516 | 2026-11-07T02:27:39.099Z | SUCCEEDED | 0 | 2026-11-07T02:27:39.079Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57514 | 2026-11-07T02:27:09.108Z | SUCCEEDED | 0 | 2026-11-07T02:27:09.081Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57512 | 2026-11-07T02:26:39.105Z | SUCCEEDED | 0 | 2026-11-07T02:26:39.098Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57510 | 2026-11-07T02:26:39.094Z | SUCCEEDED | 0 | 2026-11-07T02:26:39.083Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57508 | 2026-11-07T02:26:09.089Z | SUCCEEDED | 0 | 2026-11-07T02:26:09.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57506 | 2026-11-07T02:25:39.089Z | SUCCEEDED | 0 | 2026-11-07T02:25:39.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57504 | 2026-11-07T02:25:09.089Z | SUCCEEDED | 0 | 2026-11-07T02:25:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57502 | 2026-11-07T02:24:39.103Z | SUCCEEDED | 0 | 2026-11-07T02:24:39.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57500 | 2026-11-07T02:24:09.101Z | SUCCEEDED | 0 | 2026-11-07T02:24:09.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57498 | 2026-11-07T02:23:39.088Z | SUCCEEDED | 0 | 2026-11-07T02:23:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57496 | 2026-11-07T02:23:09.089Z | SUCCEEDED | 0 | 2026-11-07T02:23:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57494 | 2026-11-07T02:22:39.089Z | SUCCEEDED | 0 | 2026-11-07T02:22:39.069Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57492 | 2026-11-07T02:22:09.091Z | SUCCEEDED | 0 | 2026-11-07T02:22:09.070Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57488 | 2026-11-07T02:21:39.080Z | SUCCEEDED | 0 | 2026-11-07T02:21:39.058Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57490 | 2026-11-07T02:21:39.072Z | SUCCEEDED | 0 | 2026-11-07T02:21:39.059Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57486 | 2026-11-07T02:21:09.081Z | SUCCEEDED | 0 | 2026-11-07T02:21:09.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57484 | 2026-11-07T02:20:39.082Z | SUCCEEDED | 0 | 2026-11-07T02:20:39.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57482 | 2026-11-07T02:20:09.084Z | SUCCEEDED | 0 | 2026-11-07T02:20:09.059Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57480 | 2026-11-07T02:19:39.081Z | SUCCEEDED | 0 | 2026-11-07T02:19:39.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57478 | 2026-11-07T02:19:09.081Z | SUCCEEDED | 0 | 2026-11-07T02:19:09.057Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57476 | 2026-11-07T02:18:39.081Z | SUCCEEDED | 0 | 2026-11-07T02:18:39.061Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57474 | 2026-11-07T02:18:09.075Z | SUCCEEDED | 0 | 2026-11-07T02:18:09.055Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57472 | 2026-11-07T02:17:39.076Z | SUCCEEDED | 0 | 2026-11-07T02:17:39.055Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57470 | 2026-11-07T02:17:09.086Z | SUCCEEDED | 0 | 2026-11-07T02:17:09.064Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57466 | 2026-11-07T02:16:39.080Z | SUCCEEDED | 0 | 2026-11-07T02:16:39.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57468 | 2026-11-07T02:16:39.073Z | SUCCEEDED | 0 | 2026-11-07T02:16:39.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57464 | 2026-11-07T02:16:09.077Z | SUCCEEDED | 0 | 2026-11-07T02:16:09.057Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57462 | 2026-11-07T02:15:39.088Z | SUCCEEDED | 0 | 2026-11-07T02:15:39.062Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57460 | 2026-11-07T02:15:09.080Z | SUCCEEDED | 0 | 2026-11-07T02:15:09.060Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57454 | 2026-11-07T02:14:39.088Z | SUCCEEDED | 0 | 2026-11-07T02:14:39.062Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57448 | 2026-11-07T02:14:09.080Z | SUCCEEDED | 0 | 2026-11-07T02:14:09.059Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57446 | 2026-11-07T02:13:39.091Z | SUCCEEDED | 0 | 2026-11-07T02:13:39.055Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57444 | 2026-11-07T02:13:09.083Z | SUCCEEDED | 0 | 2026-11-07T02:13:09.063Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57442 | 2026-11-07T02:12:39.084Z | SUCCEEDED | 0 | 2026-11-07T02:12:39.061Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57440 | 2026-11-07T02:12:09.088Z | SUCCEEDED | 0 | 2026-11-07T02:12:09.061Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57438 | 2026-11-07T02:11:39.098Z | SUCCEEDED | 0 | 2026-11-07T02:11:39.084Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57436 | 2026-11-07T02:11:39.085Z | SUCCEEDED | 0 | 2026-11-07T02:11:39.063Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57434 | 2026-11-07T02:11:09.076Z | SUCCEEDED | 0 | 2026-11-07T02:11:09.055Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57432 | 2026-11-07T02:10:39.083Z | SUCCEEDED | 0 | 2026-11-07T02:10:39.062Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57430 | 2026-11-07T02:10:09.081Z | SUCCEEDED | 0 | 2026-11-07T02:10:09.062Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57428 | 2026-11-07T02:09:39.079Z | SUCCEEDED | 0 | 2026-11-07T02:09:39.061Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57426 | 2026-11-07T02:09:09.085Z | SUCCEEDED | 0 | 2026-11-07T02:09:09.063Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57424 | 2026-11-07T02:08:39.079Z | SUCCEEDED | 0 | 2026-11-07T02:08:39.058Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57422 | 2026-11-07T02:08:09.072Z | SUCCEEDED | 0 | 2026-11-07T02:08:09.053Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57420 | 2026-11-07T02:07:39.076Z | SUCCEEDED | 0 | 2026-11-07T02:07:39.053Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57418 | 2026-11-07T02:07:09.074Z | SUCCEEDED | 0 | 2026-11-07T02:07:09.051Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57416 | 2026-11-07T02:06:39.072Z | SUCCEEDED | 0 | 2026-11-07T02:06:39.050Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57414 | 2026-11-07T02:06:39.069Z | SUCCEEDED | 0 | 2026-11-07T02:06:39.047Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57412 | 2026-11-07T02:06:09.066Z | SUCCEEDED | 0 | 2026-11-07T02:06:09.047Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57410 | 2026-11-07T02:05:39.059Z | SUCCEEDED | 0 | 2026-11-07T02:05:39.037Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57408 | 2026-11-07T02:05:09.066Z | SUCCEEDED | 0 | 2026-11-07T02:05:09.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57406 | 2026-11-07T02:04:39.060Z | SUCCEEDED | 0 | 2026-11-07T02:04:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57404 | 2026-11-07T02:04:09.060Z | SUCCEEDED | 0 | 2026-11-07T02:04:09.041Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57402 | 2026-11-07T02:03:39.055Z | SUCCEEDED | 0 | 2026-11-07T02:03:39.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57400 | 2026-11-07T02:03:09.062Z | SUCCEEDED | 0 | 2026-11-07T02:03:09.041Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57398 | 2026-11-07T02:02:39.058Z | SUCCEEDED | 0 | 2026-11-07T02:02:39.037Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57396 | 2026-11-07T02:02:09.059Z | SUCCEEDED | 0 | 2026-11-07T02:02:09.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57394 | 2026-11-07T02:01:39.065Z | SUCCEEDED | 0 | 2026-11-07T02:01:39.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57392 | 2026-11-07T02:01:39.057Z | SUCCEEDED | 0 | 2026-11-07T02:01:39.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57390 | 2026-11-07T02:01:09.063Z | SUCCEEDED | 0 | 2026-11-07T02:01:09.041Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57388 | 2026-11-07T02:00:39.063Z | SUCCEEDED | 0 | 2026-11-07T02:00:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57386 | 2026-11-07T02:00:09.063Z | SUCCEEDED | 0 | 2026-11-07T02:00:09.037Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57382 | 2026-11-07T01:59:39.065Z | SUCCEEDED | 0 | 2026-11-07T01:59:39.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57380 | 2026-11-07T01:59:09.064Z | SUCCEEDED | 0 | 2026-11-07T01:59:09.041Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57378 | 2026-11-07T01:58:39.062Z | SUCCEEDED | 0 | 2026-11-07T01:58:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57376 | 2026-11-07T01:58:09.061Z | SUCCEEDED | 0 | 2026-11-07T01:58:09.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57374 | 2026-11-07T01:57:39.063Z | SUCCEEDED | 0 | 2026-11-07T01:57:39.039Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57372 | 2026-11-07T01:57:09.054Z | SUCCEEDED | 0 | 2026-11-07T01:57:09.035Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57368 | 2026-11-07T01:56:39.060Z | SUCCEEDED | 0 | 2026-11-07T01:56:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57370 | 2026-11-07T01:56:39.052Z | SUCCEEDED | 0 | 2026-11-07T01:56:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57366 | 2026-11-07T01:56:09.057Z | SUCCEEDED | 0 | 2026-11-07T01:56:09.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57364 | 2026-11-07T01:55:39.060Z | SUCCEEDED | 0 | 2026-11-07T01:55:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57362 | 2026-11-07T01:55:09.058Z | SUCCEEDED | 0 | 2026-11-07T01:55:09.034Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57360 | 2026-11-07T01:54:39.063Z | SUCCEEDED | 0 | 2026-11-07T01:54:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57358 | 2026-11-07T01:54:09.067Z | SUCCEEDED | 0 | 2026-11-07T01:54:09.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57356 | 2026-11-07T01:53:39.064Z | SUCCEEDED | 0 | 2026-11-07T01:53:39.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57354 | 2026-11-07T01:53:09.056Z | SUCCEEDED | 0 | 2026-11-07T01:53:09.037Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57352 | 2026-11-07T01:52:39.060Z | SUCCEEDED | 0 | 2026-11-07T01:52:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57350 | 2026-11-07T01:52:09.067Z | SUCCEEDED | 0 | 2026-11-07T01:52:09.044Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57346 | 2026-11-07T01:51:39.059Z | SUCCEEDED | 0 | 2026-11-07T01:51:39.037Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57348 | 2026-11-07T01:51:39.052Z | SUCCEEDED | 0 | 2026-11-07T01:51:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57344 | 2026-11-07T01:51:09.075Z | SUCCEEDED | 0 | 2026-11-07T01:51:09.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57342 | 2026-11-07T01:50:39.068Z | SUCCEEDED | 0 | 2026-11-07T01:50:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57340 | 2026-11-07T01:50:09.058Z | SUCCEEDED | 0 | 2026-11-07T01:50:09.035Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57338 | 2026-11-07T01:49:39.067Z | SUCCEEDED | 0 | 2026-11-07T01:49:39.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57336 | 2026-11-07T01:49:09.072Z | SUCCEEDED | 0 | 2026-11-07T01:49:09.044Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57334 | 2026-11-07T01:48:39.088Z | SUCCEEDED | 0 | 2026-11-07T01:48:39.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57332 | 2026-11-07T01:48:09.065Z | SUCCEEDED | 0 | 2026-11-07T01:48:09.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57330 | 2026-11-07T01:47:39.074Z | SUCCEEDED | 0 | 2026-11-07T01:47:39.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57328 | 2026-11-07T01:47:09.061Z | SUCCEEDED | 0 | 2026-11-07T01:47:09.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57326 | 2026-11-07T01:46:39.077Z | SUCCEEDED | 0 | 2026-11-07T01:46:39.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57324 | 2026-11-07T01:46:39.061Z | SUCCEEDED | 0 | 2026-11-07T01:46:39.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57322 | 2026-11-07T01:46:09.057Z | SUCCEEDED | 0 | 2026-11-07T01:46:09.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57320 | 2026-11-07T01:45:39.057Z | SUCCEEDED | 0 | 2026-11-07T01:45:39.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57318 | 2026-11-07T01:45:09.060Z | SUCCEEDED | 0 | 2026-11-07T01:45:09.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57316 | 2026-11-07T01:44:39.060Z | SUCCEEDED | 0 | 2026-11-07T01:44:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57314 | 2026-11-07T01:44:09.065Z | SUCCEEDED | 0 | 2026-11-07T01:44:09.044Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57312 | 2026-11-07T01:43:39.064Z | SUCCEEDED | 0 | 2026-11-07T01:43:39.043Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57310 | 2026-11-07T01:43:09.063Z | SUCCEEDED | 0 | 2026-11-07T01:43:09.042Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57308 | 2026-11-07T01:42:39.062Z | SUCCEEDED | 0 | 2026-11-07T01:42:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57306 | 2026-11-07T01:42:09.063Z | SUCCEEDED | 0 | 2026-11-07T01:42:09.039Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57304 | 2026-11-07T01:41:39.089Z | SUCCEEDED | 0 | 2026-11-07T01:41:39.069Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57302 | 2026-11-07T01:41:39.074Z | SUCCEEDED | 0 | 2026-11-07T01:41:39.041Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57300 | 2026-11-07T01:41:09.060Z | SUCCEEDED | 0 | 2026-11-07T01:41:09.038Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57298 | 2026-11-07T01:40:39.060Z | SUCCEEDED | 0 | 2026-11-07T01:40:39.036Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57296 | 2026-11-07T01:40:09.060Z | SUCCEEDED | 0 | 2026-11-07T01:40:09.035Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57294 | 2026-11-07T01:39:39.065Z | SUCCEEDED | 0 | 2026-11-07T01:39:39.044Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57292 | 2026-11-07T01:39:09.063Z | SUCCEEDED | 0 | 2026-11-07T01:39:09.044Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57290 | 2026-11-07T01:38:39.062Z | SUCCEEDED | 0 | 2026-11-07T01:38:39.040Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57288 | 2026-11-07T01:38:09.053Z | SUCCEEDED | 0 | 2026-11-07T01:38:09.031Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57286 | 2026-11-07T01:37:39.053Z | SUCCEEDED | 0 | 2026-11-07T01:37:39.031Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57284 | 2026-11-07T01:37:09.051Z | SUCCEEDED | 0 | 2026-11-07T01:37:09.031Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57280 | 2026-11-07T01:36:39.052Z | SUCCEEDED | 0 | 2026-11-07T01:36:39.028Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57282 | 2026-11-07T01:36:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:36:39.028Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57278 | 2026-11-07T01:36:09.049Z | SUCCEEDED | 0 | 2026-11-07T01:36:09.030Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57276 | 2026-11-07T01:35:39.062Z | SUCCEEDED | 0 | 2026-11-07T01:35:39.033Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57274 | 2026-11-07T01:35:09.053Z | SUCCEEDED | 0 | 2026-11-07T01:35:09.033Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57272 | 2026-11-07T01:34:39.053Z | SUCCEEDED | 0 | 2026-11-07T01:34:39.034Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57270 | 2026-11-07T01:34:09.055Z | SUCCEEDED | 0 | 2026-11-07T01:34:09.033Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57268 | 2026-11-07T01:33:39.053Z | SUCCEEDED | 0 | 2026-11-07T01:33:39.029Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57266 | 2026-11-07T01:33:09.050Z | SUCCEEDED | 0 | 2026-11-07T01:33:09.028Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57264 | 2026-11-07T01:32:39.046Z | SUCCEEDED | 0 | 2026-11-07T01:32:39.025Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57262 | 2026-11-07T01:32:09.045Z | SUCCEEDED | 0 | 2026-11-07T01:32:09.025Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57260 | 2026-11-07T01:31:39.057Z | SUCCEEDED | 0 | 2026-11-07T01:31:39.030Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57258 | 2026-11-07T01:31:39.054Z | SUCCEEDED | 0 | 2026-11-07T01:31:39.029Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57256 | 2026-11-07T01:31:09.050Z | SUCCEEDED | 0 | 2026-11-07T01:31:09.029Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57254 | 2026-11-07T01:30:39.052Z | SUCCEEDED | 0 | 2026-11-07T01:30:39.028Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57252 | 2026-11-07T01:30:09.047Z | SUCCEEDED | 0 | 2026-11-07T01:30:09.027Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57250 | 2026-11-07T01:29:39.065Z | SUCCEEDED | 0 | 2026-11-07T01:29:39.031Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57248 | 2026-11-07T01:29:09.040Z | SUCCEEDED | 0 | 2026-11-07T01:29:09.026Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57246 | 2026-11-07T01:28:39.056Z | SUCCEEDED | 0 | 2026-11-07T01:28:39.033Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57244 | 2026-11-07T01:28:09.035Z | SUCCEEDED | 0 | 2026-11-07T01:28:09.014Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57242 | 2026-11-07T01:27:39.036Z | SUCCEEDED | 0 | 2026-11-07T01:27:39.015Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57240 | 2026-11-07T01:27:09.037Z | SUCCEEDED | 0 | 2026-11-07T01:27:09.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57236 | 2026-11-07T01:26:39.039Z | SUCCEEDED | 0 | 2026-11-07T01:26:39.016Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57238 | 2026-11-07T01:26:39.029Z | SUCCEEDED | 0 | 2026-11-07T01:26:39.016Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57234 | 2026-11-07T01:26:09.039Z | SUCCEEDED | 0 | 2026-11-07T01:26:09.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57232 | 2026-11-07T01:25:39.039Z | SUCCEEDED | 0 | 2026-11-07T01:25:39.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57230 | 2026-11-07T01:25:09.041Z | SUCCEEDED | 0 | 2026-11-07T01:25:09.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57228 | 2026-11-07T01:24:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:24:39.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57226 | 2026-11-07T01:24:09.043Z | SUCCEEDED | 0 | 2026-11-07T01:24:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57224 | 2026-11-07T01:23:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:23:39.023Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57222 | 2026-11-07T01:23:09.043Z | SUCCEEDED | 0 | 2026-11-07T01:23:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57220 | 2026-11-07T01:22:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:22:39.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57218 | 2026-11-07T01:22:09.039Z | SUCCEEDED | 0 | 2026-11-07T01:22:09.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57216 | 2026-11-07T01:21:39.036Z | SUCCEEDED | 0 | 2026-11-07T01:21:39.014Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57214 | 2026-11-07T01:21:39.031Z | SUCCEEDED | 0 | 2026-11-07T01:21:39.014Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57212 | 2026-11-07T01:21:09.038Z | SUCCEEDED | 0 | 2026-11-07T01:21:09.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57210 | 2026-11-07T01:20:39.040Z | SUCCEEDED | 0 | 2026-11-07T01:20:39.017Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57208 | 2026-11-07T01:20:09.041Z | SUCCEEDED | 0 | 2026-11-07T01:20:09.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57206 | 2026-11-07T01:19:39.033Z | SUCCEEDED | 0 | 2026-11-07T01:19:39.015Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57204 | 2026-11-07T01:19:09.038Z | SUCCEEDED | 0 | 2026-11-07T01:19:09.017Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57202 | 2026-11-07T01:18:39.039Z | SUCCEEDED | 0 | 2026-11-07T01:18:39.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57200 | 2026-11-07T01:18:09.040Z | SUCCEEDED | 0 | 2026-11-07T01:18:09.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57198 | 2026-11-07T01:17:39.040Z | SUCCEEDED | 0 | 2026-11-07T01:17:39.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57196 | 2026-11-07T01:17:09.041Z | SUCCEEDED | 0 | 2026-11-07T01:17:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57192 | 2026-11-07T01:16:39.038Z | SUCCEEDED | 0 | 2026-11-07T01:16:39.016Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57194 | 2026-11-07T01:16:39.030Z | SUCCEEDED | 0 | 2026-11-07T01:16:39.017Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57190 | 2026-11-07T01:16:09.038Z | SUCCEEDED | 0 | 2026-11-07T01:16:09.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57188 | 2026-11-07T01:15:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:15:39.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57186 | 2026-11-07T01:15:09.042Z | SUCCEEDED | 0 | 2026-11-07T01:15:09.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57182 | 2026-11-07T01:14:39.041Z | SUCCEEDED | 0 | 2026-11-07T01:14:39.022Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57176 | 2026-11-07T01:14:09.036Z | SUCCEEDED | 0 | 2026-11-07T01:14:09.015Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57174 | 2026-11-07T01:13:39.039Z | SUCCEEDED | 0 | 2026-11-07T01:13:39.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57172 | 2026-11-07T01:13:09.040Z | SUCCEEDED | 0 | 2026-11-07T01:13:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57170 | 2026-11-07T01:12:39.035Z | SUCCEEDED | 0 | 2026-11-07T01:12:39.015Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57168 | 2026-11-07T01:12:09.041Z | SUCCEEDED | 0 | 2026-11-07T01:12:09.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57166 | 2026-11-07T01:11:39.043Z | SUCCEEDED | 0 | 2026-11-07T01:11:39.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57164 | 2026-11-07T01:11:39.041Z | SUCCEEDED | 0 | 2026-11-07T01:11:39.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57162 | 2026-11-07T01:11:09.035Z | SUCCEEDED | 0 | 2026-11-07T01:11:09.016Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57160 | 2026-11-07T01:10:39.043Z | SUCCEEDED | 0 | 2026-11-07T01:10:39.022Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57158 | 2026-11-07T01:10:09.037Z | SUCCEEDED | 0 | 2026-11-07T01:10:09.016Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57156 | 2026-11-07T01:09:39.042Z | SUCCEEDED | 0 | 2026-11-07T01:09:39.023Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57154 | 2026-11-07T01:09:09.045Z | SUCCEEDED | 0 | 2026-11-07T01:09:09.022Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57152 | 2026-11-07T01:08:39.033Z | SUCCEEDED | 0 | 2026-11-07T01:08:39.015Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57150 | 2026-11-07T01:08:09.040Z | SUCCEEDED | 0 | 2026-11-07T01:08:09.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57148 | 2026-11-07T01:07:39.044Z | SUCCEEDED | 0 | 2026-11-07T01:07:39.023Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57146 | 2026-11-07T01:07:09.044Z | SUCCEEDED | 0 | 2026-11-07T01:07:09.024Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57142 | 2026-11-07T01:06:39.043Z | SUCCEEDED | 0 | 2026-11-07T01:06:39.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 57144 | 2026-11-07T01:06:39.036Z | SUCCEEDED | 0 | 2026-11-07T01:06:39.020Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57140 | 2026-11-07T01:06:09.043Z | SUCCEEDED | 0 | 2026-11-07T01:06:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57138 | 2026-11-07T01:05:39.043Z | SUCCEEDED | 0 | 2026-11-07T01:05:39.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57136 | 2026-11-07T01:05:09.041Z | SUCCEEDED | 0 | 2026-11-07T01:05:09.018Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57134 | 2026-11-07T01:04:39.038Z | SUCCEEDED | 0 | 2026-11-07T01:04:39.019Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 57132 | 2026-11-07T01:04:09.040Z | SUCCEEDED | 0 | 2026-11-07T01:04:09.021Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |

Row cap reached; partial evidence.

## jobLog (DBA_SCHEDULER_JOB_LOG): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | OPERATION | STATUS |
| --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 57546 | 2026-11-07T02:34:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57544 | 2026-11-07T02:34:09.097Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57542 | 2026-11-07T02:33:39.095Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57540 | 2026-11-07T02:33:09.101Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57538 | 2026-11-07T02:32:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57536 | 2026-11-07T02:32:09.117Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57534 | 2026-11-07T02:31:39.123Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57532 | 2026-11-07T02:31:39.107Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57530 | 2026-11-07T02:31:09.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57528 | 2026-11-07T02:30:39.099Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57526 | 2026-11-07T02:30:09.098Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57524 | 2026-11-07T02:29:39.084Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57522 | 2026-11-07T02:29:09.092Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57520 | 2026-11-07T02:28:39.097Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57518 | 2026-11-07T02:28:09.097Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57516 | 2026-11-07T02:27:39.098Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57514 | 2026-11-07T02:27:09.107Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57512 | 2026-11-07T02:26:39.105Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57510 | 2026-11-07T02:26:39.094Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57508 | 2026-11-07T02:26:09.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57506 | 2026-11-07T02:25:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57504 | 2026-11-07T02:25:09.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57502 | 2026-11-07T02:24:39.103Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57500 | 2026-11-07T02:24:09.100Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57498 | 2026-11-07T02:23:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57496 | 2026-11-07T02:23:09.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57494 | 2026-11-07T02:22:39.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57492 | 2026-11-07T02:22:09.091Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57488 | 2026-11-07T02:21:39.080Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57490 | 2026-11-07T02:21:39.072Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57486 | 2026-11-07T02:21:09.080Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57484 | 2026-11-07T02:20:39.082Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57482 | 2026-11-07T02:20:09.083Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57480 | 2026-11-07T02:19:39.080Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57478 | 2026-11-07T02:19:09.081Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57476 | 2026-11-07T02:18:39.081Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57474 | 2026-11-07T02:18:09.074Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57472 | 2026-11-07T02:17:39.076Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57470 | 2026-11-07T02:17:09.085Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57466 | 2026-11-07T02:16:39.080Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57468 | 2026-11-07T02:16:39.073Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57464 | 2026-11-07T02:16:09.077Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57462 | 2026-11-07T02:15:39.087Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57460 | 2026-11-07T02:15:09.080Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57454 | 2026-11-07T02:14:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57448 | 2026-11-07T02:14:09.080Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57446 | 2026-11-07T02:13:39.091Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57444 | 2026-11-07T02:13:09.082Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57442 | 2026-11-07T02:12:39.083Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57440 | 2026-11-07T02:12:09.088Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57438 | 2026-11-07T02:11:39.097Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57436 | 2026-11-07T02:11:39.085Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57434 | 2026-11-07T02:11:09.075Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57432 | 2026-11-07T02:10:39.083Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57430 | 2026-11-07T02:10:09.081Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57428 | 2026-11-07T02:09:39.079Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57426 | 2026-11-07T02:09:09.084Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57424 | 2026-11-07T02:08:39.078Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57422 | 2026-11-07T02:08:09.072Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57420 | 2026-11-07T02:07:39.076Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57418 | 2026-11-07T02:07:09.074Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57416 | 2026-11-07T02:06:39.072Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57414 | 2026-11-07T02:06:39.069Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57412 | 2026-11-07T02:06:09.066Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57410 | 2026-11-07T02:05:39.059Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57408 | 2026-11-07T02:05:09.066Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57406 | 2026-11-07T02:04:39.059Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57404 | 2026-11-07T02:04:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57402 | 2026-11-07T02:03:39.055Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57400 | 2026-11-07T02:03:09.062Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57398 | 2026-11-07T02:02:39.058Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57396 | 2026-11-07T02:02:09.059Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57394 | 2026-11-07T02:01:39.064Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57392 | 2026-11-07T02:01:39.057Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57390 | 2026-11-07T02:01:09.062Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57388 | 2026-11-07T02:00:39.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57386 | 2026-11-07T02:00:09.062Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57382 | 2026-11-07T01:59:39.065Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57380 | 2026-11-07T01:59:09.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57378 | 2026-11-07T01:58:39.061Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57376 | 2026-11-07T01:58:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57374 | 2026-11-07T01:57:39.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57372 | 2026-11-07T01:57:09.054Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57368 | 2026-11-07T01:56:39.059Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57370 | 2026-11-07T01:56:39.051Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57366 | 2026-11-07T01:56:09.057Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57364 | 2026-11-07T01:55:39.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57362 | 2026-11-07T01:55:09.058Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57360 | 2026-11-07T01:54:39.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57358 | 2026-11-07T01:54:09.067Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57356 | 2026-11-07T01:53:39.064Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57354 | 2026-11-07T01:53:09.056Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57352 | 2026-11-07T01:52:39.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57350 | 2026-11-07T01:52:09.066Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57346 | 2026-11-07T01:51:39.059Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57348 | 2026-11-07T01:51:39.052Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57344 | 2026-11-07T01:51:09.075Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57342 | 2026-11-07T01:50:39.068Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57340 | 2026-11-07T01:50:09.058Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57338 | 2026-11-07T01:49:39.067Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57336 | 2026-11-07T01:49:09.072Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57334 | 2026-11-07T01:48:39.084Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57332 | 2026-11-07T01:48:09.064Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57330 | 2026-11-07T01:47:39.073Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57328 | 2026-11-07T01:47:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57326 | 2026-11-07T01:46:39.077Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57324 | 2026-11-07T01:46:39.061Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57322 | 2026-11-07T01:46:09.057Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57320 | 2026-11-07T01:45:39.056Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57318 | 2026-11-07T01:45:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57316 | 2026-11-07T01:44:39.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57314 | 2026-11-07T01:44:09.064Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57312 | 2026-11-07T01:43:39.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57310 | 2026-11-07T01:43:09.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57308 | 2026-11-07T01:42:39.062Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57306 | 2026-11-07T01:42:09.062Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57304 | 2026-11-07T01:41:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57302 | 2026-11-07T01:41:39.074Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57300 | 2026-11-07T01:41:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57298 | 2026-11-07T01:40:39.059Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57296 | 2026-11-07T01:40:09.060Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57294 | 2026-11-07T01:39:39.065Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57292 | 2026-11-07T01:39:09.063Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57290 | 2026-11-07T01:38:39.061Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57288 | 2026-11-07T01:38:09.052Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57286 | 2026-11-07T01:37:39.053Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57284 | 2026-11-07T01:37:09.051Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57280 | 2026-11-07T01:36:39.052Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57282 | 2026-11-07T01:36:39.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57278 | 2026-11-07T01:36:09.049Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57276 | 2026-11-07T01:35:39.062Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57274 | 2026-11-07T01:35:09.053Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57272 | 2026-11-07T01:34:39.053Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57270 | 2026-11-07T01:34:09.054Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57268 | 2026-11-07T01:33:39.053Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57266 | 2026-11-07T01:33:09.050Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57264 | 2026-11-07T01:32:39.045Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57262 | 2026-11-07T01:32:09.044Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57260 | 2026-11-07T01:31:39.056Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57258 | 2026-11-07T01:31:39.054Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57256 | 2026-11-07T01:31:09.050Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57254 | 2026-11-07T01:30:39.052Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57252 | 2026-11-07T01:30:09.047Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57250 | 2026-11-07T01:29:39.064Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57248 | 2026-11-07T01:29:09.040Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57246 | 2026-11-07T01:28:39.055Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57244 | 2026-11-07T01:28:09.035Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57242 | 2026-11-07T01:27:39.036Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57240 | 2026-11-07T01:27:09.036Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57236 | 2026-11-07T01:26:39.039Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57238 | 2026-11-07T01:26:39.029Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57234 | 2026-11-07T01:26:09.038Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57232 | 2026-11-07T01:25:39.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57230 | 2026-11-07T01:25:09.041Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57228 | 2026-11-07T01:24:39.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57226 | 2026-11-07T01:24:09.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57224 | 2026-11-07T01:23:39.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57222 | 2026-11-07T01:23:09.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57220 | 2026-11-07T01:22:39.041Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57218 | 2026-11-07T01:22:09.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57216 | 2026-11-07T01:21:39.035Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57214 | 2026-11-07T01:21:39.031Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57212 | 2026-11-07T01:21:09.038Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57210 | 2026-11-07T01:20:39.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57208 | 2026-11-07T01:20:09.041Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57206 | 2026-11-07T01:19:39.033Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57204 | 2026-11-07T01:19:09.037Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57202 | 2026-11-07T01:18:39.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57200 | 2026-11-07T01:18:09.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57198 | 2026-11-07T01:17:39.040Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57196 | 2026-11-07T01:17:09.040Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57192 | 2026-11-07T01:16:39.038Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57194 | 2026-11-07T01:16:39.029Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57190 | 2026-11-07T01:16:09.038Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57188 | 2026-11-07T01:15:39.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57186 | 2026-11-07T01:15:09.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57182 | 2026-11-07T01:14:39.041Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57176 | 2026-11-07T01:14:09.036Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57174 | 2026-11-07T01:13:39.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57172 | 2026-11-07T01:13:09.040Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57170 | 2026-11-07T01:12:39.035Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57168 | 2026-11-07T01:12:09.041Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57166 | 2026-11-07T01:11:39.043Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57164 | 2026-11-07T01:11:39.040Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57162 | 2026-11-07T01:11:09.035Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57160 | 2026-11-07T01:10:39.043Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57158 | 2026-11-07T01:10:09.036Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57156 | 2026-11-07T01:09:39.042Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57154 | 2026-11-07T01:09:09.045Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57152 | 2026-11-07T01:08:39.033Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57150 | 2026-11-07T01:08:09.039Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57148 | 2026-11-07T01:07:39.044Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57146 | 2026-11-07T01:07:09.044Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57142 | 2026-11-07T01:06:39.043Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 57144 | 2026-11-07T01:06:39.036Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57140 | 2026-11-07T01:06:09.043Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57138 | 2026-11-07T01:05:39.043Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57136 | 2026-11-07T01:05:09.041Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57134 | 2026-11-07T01:04:39.038Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 57132 | 2026-11-07T01:04:09.040Z | RUN | SUCCEEDED |

Row cap reached; partial evidence.

## windows (DBA_SCHEDULER_WINDOWS): ok
| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE | 2026-11-06T22:00:00.177Z | 2026-11-13T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| MONDAY_WINDOW | TRUE | FALSE | 2026-10-26T22:00:00.163Z | 2026-11-09T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| SATURDAY_WINDOW | TRUE | FALSE |  | 2026-11-07T06:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| SUNDAY_WINDOW | TRUE | FALSE | 2026-10-25T06:00:00.180Z | 2026-11-08T06:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| THURSDAY_WINDOW | TRUE | FALSE | 2026-11-05T22:00:00.012Z | 2026-11-12T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| TUESDAY_WINDOW | TRUE | FALSE | 2026-10-27T22:00:00.138Z | 2026-11-10T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEDNESDAY_WINDOW | TRUE | FALSE | 2026-11-04T22:00:00.094Z | 2026-11-11T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEEKEND_WINDOW | FALSE | FALSE |  | 2019-04-20T07:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":2} |
| WEEKNIGHT_WINDOW | FALSE | FALSE |  | 2019-04-18T05:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":8,"days":0} |

## autotaskClients (DBA_AUTOTASK_CLIENT): ok
| CLIENT_NAME | STATUS | WINDOW_GROUP |
| --- | --- | --- |
| auto optimizer stats collection | ENABLED | ORA$AT_WGRP_OS |
| auto space advisor | ENABLED | ORA$AT_WGRP_SA |
| sql tuning advisor | ENABLED | ORA$AT_WGRP_SQ |

## autotaskHistory (DBA_AUTOTASK_JOB_HISTORY): ok
| CLIENT_NAME | WINDOW_NAME | WINDOW_START_TIME | JOB_NAME | JOB_STATUS | JOB_START_TIME | JOB_DURATION | JOB_ERROR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auto optimizer stats collection | FRIDAY_WINDOW | 2026-11-06T22:00:00.187Z | ORA$AT_OS_OPT_SY_121 | SUCCEEDED | 2026-11-06T22:00:02.241Z | {"fseconds":0,"seconds":59,"minutes":0,"hours":0,"days":0} | 0 |
| auto space advisor | FRIDAY_WINDOW | 2026-11-06T22:00:00.187Z | ORA$AT_SA_SPC_SY_122 | SUCCEEDED | 2026-11-06T22:00:02.245Z | {"fseconds":0,"seconds":4,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | FRIDAY_WINDOW | 2026-11-06T22:00:00.187Z | ORA$AT_SQ_SQL_SW_123 | SUCCEEDED | 2026-11-06T22:00:02.287Z | {"fseconds":0,"seconds":58,"minutes":1,"hours":0,"days":0} | 0 |
| auto optimizer stats collection | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_OS_OPT_SY_101 | SUCCEEDED | 2026-11-05T22:00:01.206Z | {"fseconds":0,"seconds":40,"minutes":0,"hours":0,"days":0} | 0 |
| auto space advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_SA_SPC_SY_102 | SUCCEEDED | 2026-11-05T22:00:01.218Z | {"fseconds":0,"seconds":4,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_SQ_SQL_SW_103 | SUCCEEDED | 2026-11-05T22:00:01.226Z | {"fseconds":0,"seconds":58,"minutes":3,"hours":0,"days":0} | 0 |
| auto optimizer stats collection | WEDNESDAY_WINDOW | 2026-11-04T22:00:00.100Z | ORA$AT_OS_OPT_SY_81 | SUCCEEDED | 2026-11-04T22:00:02.158Z | {"fseconds":0,"seconds":33,"minutes":2,"hours":0,"days":0} | 0 |
| auto space advisor | WEDNESDAY_WINDOW | 2026-11-04T22:00:00.100Z | ORA$AT_SA_SPC_SY_82 | SUCCEEDED | 2026-11-04T22:00:02.169Z | {"fseconds":0,"seconds":4,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | WEDNESDAY_WINDOW | 2026-11-04T22:00:00.100Z | ORA$AT_SQ_SQL_SW_83 | SUCCEEDED | 2026-11-04T22:00:02.178Z | {"fseconds":0,"seconds":11,"minutes":49,"hours":0,"days":0} | 0 |

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok
| ID | OPERATION | TARGET | START_TIME | END_TIME | STATUS |
| --- | --- | --- | --- | --- | --- |
| 402 | purge_stats |  | 2026-11-06T22:00:53.184Z | 2026-11-06T22:00:53.501Z | COMPLETED |
| 401 | purge_stats |  | 2026-11-06T22:00:52.912Z | 2026-11-06T22:00:53.184Z | COMPLETED |
| 400 | gather_database_stats (auto) | AUTO | 2026-11-06T22:00:02.375Z | 2026-11-06T22:00:52.911Z | COMPLETED |
| 382 | purge_stats |  | 2026-11-05T22:00:34.930Z | 2026-11-05T22:00:35.101Z | COMPLETED |
| 381 | purge_stats |  | 2026-11-05T22:00:34.798Z | 2026-11-05T22:00:34.929Z | COMPLETED |
| 380 | gather_database_stats (auto) | AUTO | 2026-11-05T22:00:01.242Z | 2026-11-05T22:00:34.798Z | COMPLETED |
| 362 | purge_stats |  | 2026-11-04T22:02:29.686Z | 2026-11-04T22:02:29.900Z | COMPLETED |
| 361 | purge_stats |  | 2026-11-04T22:02:29.510Z | 2026-11-04T22:02:29.685Z | COMPLETED |
| 360 | gather_database_stats (auto) | AUTO | 2026-11-04T22:00:02.205Z | 2026-11-04T22:02:29.510Z | COMPLETED |

## invalidObjects (DBA_OBJECTS): ok
No rows returned within visible scope.

## indexes (DBA_INDEXES): ok
No rows returned within visible scope.

## indexPartitions (DBA_IND_PARTITIONS): ok
No rows returned within visible scope.

## indexSubpartitions (DBA_IND_SUBPARTITIONS): ok
No rows returned within visible scope.

## staleStatistics (DBA_TAB_STATISTICS): ok
| OWNER | OBJECT_TYPE | STALE_COUNT |
| --- | --- | --- |
| SHOPAPP | TABLE | 2 |
| SYS | PARTITION | 1 |
| SYS | TABLE | 115 |
