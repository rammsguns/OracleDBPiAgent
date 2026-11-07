# Jobs: p1-19c-prod

2026-11-05T21:57:34.031Z to 2026-11-06T21:57:34.031Z (exclusive; UTC)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok
| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORACLE_OCM | MGMT_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-06T01:01:01.174Z | 2026-11-07T01:01:01.186Z | 8 | 0 |
| ORACLE_OCM | MGMT_STATS_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.120Z | 2026-12-01T01:01:01.124Z | 1 | 0 |
| SHOPAPP | NIGHTLY_PURGE_JOB | TRUE | SCHEDULED | 2026-11-06T03:41:39.238Z | 2026-11-07T03:41:39.239Z | 9 | 1 |
| SHOPAPP | PLACE_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-06T21:57:09.171Z | 2026-11-06T21:57:39.000Z | 24581 | 0 |
| SHOPAPP | SHIP_ORDERS_JOB | TRUE | SCHEDULED | 2026-11-06T21:56:39.171Z | 2026-11-06T22:01:39.000Z | 2460 | 0 |
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.108Z | 2026-11-08T07:00:00.110Z | 3 | 0 |
| SYS | CLEANUP_NON_EXIST_OBJ | TRUE | SCHEDULED | 2026-11-06T16:30:03.926Z | 2026-11-07T04:30:03.952Z | 18 | 0 |
| SYS | CLEANUP_ONLINE_IND_BUILD | TRUE | SCHEDULED | 2026-11-06T21:14:27.707Z | 2026-11-06T22:14:27.709Z | 206 | 0 |
| SYS | CLEANUP_ONLINE_PMO | TRUE | SCHEDULED | 2026-11-06T21:15:07.714Z | 2026-11-06T22:15:07.724Z | 206 | 0 |
| SYS | CLEANUP_TAB_IOT_PMO | TRUE | SCHEDULED | 2026-11-06T21:14:37.913Z | 2026-11-06T22:14:37.915Z | 206 | 0 |
| SYS | CLEANUP_TRANSIENT_PKG | TRUE | SCHEDULED | 2026-11-06T20:14:57.053Z | 2026-11-06T22:14:57.000Z | 104 | 0 |
| SYS | CLEANUP_TRANSIENT_TYPE | TRUE | SCHEDULED | 2026-11-06T16:30:03.926Z | 2026-11-07T04:30:03.954Z | 18 | 0 |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | TRUE | SCHEDULED | 2026-11-05T22:00:01.209Z |  | 7 | 0 |
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
No rows returned within visible scope.

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 56246 | 2026-11-06T21:57:09.194Z | SUCCEEDED | 0 | 2026-11-06T21:57:09.172Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56242 | 2026-11-06T21:56:39.193Z | SUCCEEDED | 0 | 2026-11-06T21:56:39.171Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56244 | 2026-11-06T21:56:39.184Z | SUCCEEDED | 0 | 2026-11-06T21:56:39.171Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56240 | 2026-11-06T21:56:09.195Z | SUCCEEDED | 0 | 2026-11-06T21:56:09.174Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56238 | 2026-11-06T21:55:39.194Z | SUCCEEDED | 0 | 2026-11-06T21:55:39.169Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56236 | 2026-11-06T21:55:09.191Z | SUCCEEDED | 0 | 2026-11-06T21:55:09.170Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56234 | 2026-11-06T21:54:39.198Z | SUCCEEDED | 0 | 2026-11-06T21:54:39.174Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56232 | 2026-11-06T21:54:09.194Z | SUCCEEDED | 0 | 2026-11-06T21:54:09.173Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56230 | 2026-11-06T21:53:39.209Z | SUCCEEDED | 0 | 2026-11-06T21:53:39.175Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56228 | 2026-11-06T21:53:09.193Z | SUCCEEDED | 0 | 2026-11-06T21:53:09.172Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56226 | 2026-11-06T21:52:39.197Z | SUCCEEDED | 0 | 2026-11-06T21:52:39.163Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56224 | 2026-11-06T21:52:09.182Z | SUCCEEDED | 0 | 2026-11-06T21:52:09.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56220 | 2026-11-06T21:51:39.174Z | SUCCEEDED | 0 | 2026-11-06T21:51:39.155Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56222 | 2026-11-06T21:51:39.170Z | SUCCEEDED | 0 | 2026-11-06T21:51:39.156Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56218 | 2026-11-06T21:51:09.179Z | SUCCEEDED | 0 | 2026-11-06T21:51:09.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56216 | 2026-11-06T21:50:39.179Z | SUCCEEDED | 0 | 2026-11-06T21:50:39.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56214 | 2026-11-06T21:50:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:50:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56212 | 2026-11-06T21:49:39.179Z | SUCCEEDED | 0 | 2026-11-06T21:49:39.160Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56210 | 2026-11-06T21:49:09.180Z | SUCCEEDED | 0 | 2026-11-06T21:49:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56208 | 2026-11-06T21:48:39.180Z | SUCCEEDED | 0 | 2026-11-06T21:48:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56206 | 2026-11-06T21:48:09.180Z | SUCCEEDED | 0 | 2026-11-06T21:48:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56204 | 2026-11-06T21:47:39.181Z | SUCCEEDED | 0 | 2026-11-06T21:47:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56202 | 2026-11-06T21:47:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:47:09.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56200 | 2026-11-06T21:46:39.189Z | SUCCEEDED | 0 | 2026-11-06T21:46:39.165Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56198 | 2026-11-06T21:46:39.185Z | SUCCEEDED | 0 | 2026-11-06T21:46:39.162Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56196 | 2026-11-06T21:46:09.182Z | SUCCEEDED | 0 | 2026-11-06T21:46:09.160Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56194 | 2026-11-06T21:45:39.180Z | SUCCEEDED | 0 | 2026-11-06T21:45:39.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56192 | 2026-11-06T21:45:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:45:09.160Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56190 | 2026-11-06T21:44:39.188Z | SUCCEEDED | 0 | 2026-11-06T21:44:39.165Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56188 | 2026-11-06T21:44:09.175Z | SUCCEEDED | 0 | 2026-11-06T21:44:09.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56186 | 2026-11-06T21:43:39.178Z | SUCCEEDED | 0 | 2026-11-06T21:43:39.156Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56184 | 2026-11-06T21:43:09.175Z | SUCCEEDED | 0 | 2026-11-06T21:43:09.155Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56182 | 2026-11-06T21:42:39.184Z | SUCCEEDED | 0 | 2026-11-06T21:42:39.163Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56180 | 2026-11-06T21:42:09.177Z | SUCCEEDED | 0 | 2026-11-06T21:42:09.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56176 | 2026-11-06T21:41:39.183Z | SUCCEEDED | 0 | 2026-11-06T21:41:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56178 | 2026-11-06T21:41:39.169Z | SUCCEEDED | 0 | 2026-11-06T21:41:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56174 | 2026-11-06T21:41:09.179Z | SUCCEEDED | 0 | 2026-11-06T21:41:09.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56172 | 2026-11-06T21:40:39.197Z | SUCCEEDED | 0 | 2026-11-06T21:40:39.164Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56170 | 2026-11-06T21:40:09.186Z | SUCCEEDED | 0 | 2026-11-06T21:40:09.166Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56168 | 2026-11-06T21:39:39.178Z | SUCCEEDED | 0 | 2026-11-06T21:39:39.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56166 | 2026-11-06T21:39:09.180Z | SUCCEEDED | 0 | 2026-11-06T21:39:09.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56164 | 2026-11-06T21:38:39.184Z | SUCCEEDED | 0 | 2026-11-06T21:38:39.162Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56162 | 2026-11-06T21:38:09.182Z | SUCCEEDED | 0 | 2026-11-06T21:38:09.162Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56160 | 2026-11-06T21:37:39.193Z | SUCCEEDED | 0 | 2026-11-06T21:37:39.160Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56158 | 2026-11-06T21:37:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:37:09.162Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56156 | 2026-11-06T21:36:39.209Z | SUCCEEDED | 0 | 2026-11-06T21:36:39.188Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56154 | 2026-11-06T21:36:39.191Z | SUCCEEDED | 0 | 2026-11-06T21:36:39.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56152 | 2026-11-06T21:36:09.180Z | SUCCEEDED | 0 | 2026-11-06T21:36:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56150 | 2026-11-06T21:35:39.179Z | SUCCEEDED | 0 | 2026-11-06T21:35:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56148 | 2026-11-06T21:35:09.189Z | SUCCEEDED | 0 | 2026-11-06T21:35:09.162Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56146 | 2026-11-06T21:34:39.178Z | SUCCEEDED | 0 | 2026-11-06T21:34:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56144 | 2026-11-06T21:34:09.185Z | SUCCEEDED | 0 | 2026-11-06T21:34:09.163Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56142 | 2026-11-06T21:33:39.182Z | SUCCEEDED | 0 | 2026-11-06T21:33:39.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56140 | 2026-11-06T21:33:09.178Z | SUCCEEDED | 0 | 2026-11-06T21:33:09.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56138 | 2026-11-06T21:32:39.188Z | SUCCEEDED | 0 | 2026-11-06T21:32:39.165Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56136 | 2026-11-06T21:32:09.179Z | SUCCEEDED | 0 | 2026-11-06T21:32:09.156Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56132 | 2026-11-06T21:31:39.180Z | SUCCEEDED | 0 | 2026-11-06T21:31:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56134 | 2026-11-06T21:31:39.172Z | SUCCEEDED | 0 | 2026-11-06T21:31:39.158Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56130 | 2026-11-06T21:31:09.183Z | SUCCEEDED | 0 | 2026-11-06T21:31:09.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56128 | 2026-11-06T21:30:39.178Z | SUCCEEDED | 0 | 2026-11-06T21:30:39.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56126 | 2026-11-06T21:30:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:30:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56124 | 2026-11-06T21:29:39.178Z | SUCCEEDED | 0 | 2026-11-06T21:29:39.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56122 | 2026-11-06T21:29:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:29:09.157Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56120 | 2026-11-06T21:28:39.184Z | SUCCEEDED | 0 | 2026-11-06T21:28:39.160Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56118 | 2026-11-06T21:28:09.182Z | SUCCEEDED | 0 | 2026-11-06T21:28:09.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56116 | 2026-11-06T21:27:39.176Z | SUCCEEDED | 0 | 2026-11-06T21:27:39.156Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56114 | 2026-11-06T21:27:09.183Z | SUCCEEDED | 0 | 2026-11-06T21:27:09.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56110 | 2026-11-06T21:26:39.181Z | SUCCEEDED | 0 | 2026-11-06T21:26:39.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56112 | 2026-11-06T21:26:39.175Z | SUCCEEDED | 0 | 2026-11-06T21:26:39.159Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56108 | 2026-11-06T21:26:09.200Z | SUCCEEDED | 0 | 2026-11-06T21:26:09.168Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56106 | 2026-11-06T21:25:39.184Z | SUCCEEDED | 0 | 2026-11-06T21:25:39.161Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56104 | 2026-11-06T21:25:09.173Z | SUCCEEDED | 0 | 2026-11-06T21:25:09.149Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56102 | 2026-11-06T21:24:39.172Z | SUCCEEDED | 0 | 2026-11-06T21:24:39.149Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56100 | 2026-11-06T21:24:09.181Z | SUCCEEDED | 0 | 2026-11-06T21:24:09.146Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56098 | 2026-11-06T21:23:39.166Z | SUCCEEDED | 0 | 2026-11-06T21:23:39.142Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56096 | 2026-11-06T21:23:09.162Z | SUCCEEDED | 0 | 2026-11-06T21:23:09.129Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56094 | 2026-11-06T21:22:39.156Z | SUCCEEDED | 0 | 2026-11-06T21:22:39.134Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56092 | 2026-11-06T21:22:09.146Z | SUCCEEDED | 0 | 2026-11-06T21:22:09.126Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56090 | 2026-11-06T21:21:39.164Z | SUCCEEDED | 0 | 2026-11-06T21:21:39.151Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56088 | 2026-11-06T21:21:39.145Z | SUCCEEDED | 0 | 2026-11-06T21:21:39.124Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56086 | 2026-11-06T21:21:09.133Z | SUCCEEDED | 0 | 2026-11-06T21:21:09.110Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56084 | 2026-11-06T21:20:39.130Z | SUCCEEDED | 0 | 2026-11-06T21:20:39.107Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56082 | 2026-11-06T21:20:09.127Z | SUCCEEDED | 0 | 2026-11-06T21:20:09.106Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56080 | 2026-11-06T21:19:39.130Z | SUCCEEDED | 0 | 2026-11-06T21:19:39.107Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56078 | 2026-11-06T21:19:09.129Z | SUCCEEDED | 0 | 2026-11-06T21:19:09.108Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56076 | 2026-11-06T21:18:39.132Z | SUCCEEDED | 0 | 2026-11-06T21:18:39.110Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56074 | 2026-11-06T21:18:09.131Z | SUCCEEDED | 0 | 2026-11-06T21:18:09.108Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56072 | 2026-11-06T21:17:39.140Z | SUCCEEDED | 0 | 2026-11-06T21:17:39.113Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56070 | 2026-11-06T21:17:09.137Z | SUCCEEDED | 0 | 2026-11-06T21:17:09.114Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56068 | 2026-11-06T21:16:39.143Z | SUCCEEDED | 0 | 2026-11-06T21:16:39.109Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56066 | 2026-11-06T21:16:39.121Z | SUCCEEDED | 0 | 2026-11-06T21:16:39.106Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56064 | 2026-11-06T21:16:09.132Z | SUCCEEDED | 0 | 2026-11-06T21:16:09.110Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56062 | 2026-11-06T21:15:39.122Z | SUCCEEDED | 0 | 2026-11-06T21:15:39.096Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56060 | 2026-11-06T21:15:09.127Z | SUCCEEDED | 0 | 2026-11-06T21:15:09.103Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56056 | 2026-11-06T21:14:39.117Z | SUCCEEDED | 0 | 2026-11-06T21:14:39.102Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56050 | 2026-11-06T21:14:09.121Z | SUCCEEDED | 0 | 2026-11-06T21:14:09.101Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56048 | 2026-11-06T21:13:39.119Z | SUCCEEDED | 0 | 2026-11-06T21:13:39.096Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56046 | 2026-11-06T21:13:09.114Z | SUCCEEDED | 0 | 2026-11-06T21:13:09.095Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56044 | 2026-11-06T21:12:39.117Z | SUCCEEDED | 0 | 2026-11-06T21:12:39.095Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56042 | 2026-11-06T21:12:09.138Z | SUCCEEDED | 0 | 2026-11-06T21:12:09.105Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56040 | 2026-11-06T21:11:39.144Z | SUCCEEDED | 0 | 2026-11-06T21:11:39.130Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56038 | 2026-11-06T21:11:39.124Z | SUCCEEDED | 0 | 2026-11-06T21:11:39.103Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56036 | 2026-11-06T21:11:09.113Z | SUCCEEDED | 0 | 2026-11-06T21:11:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56034 | 2026-11-06T21:10:39.110Z | SUCCEEDED | 0 | 2026-11-06T21:10:39.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56032 | 2026-11-06T21:10:09.126Z | SUCCEEDED | 0 | 2026-11-06T21:10:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56030 | 2026-11-06T21:09:39.112Z | SUCCEEDED | 0 | 2026-11-06T21:09:39.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56028 | 2026-11-06T21:09:09.114Z | SUCCEEDED | 0 | 2026-11-06T21:09:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56026 | 2026-11-06T21:08:39.112Z | SUCCEEDED | 0 | 2026-11-06T21:08:39.091Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56024 | 2026-11-06T21:08:09.113Z | SUCCEEDED | 0 | 2026-11-06T21:08:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56022 | 2026-11-06T21:07:39.107Z | SUCCEEDED | 0 | 2026-11-06T21:07:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56020 | 2026-11-06T21:07:09.109Z | SUCCEEDED | 0 | 2026-11-06T21:07:09.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56016 | 2026-11-06T21:06:39.107Z | SUCCEEDED | 0 | 2026-11-06T21:06:39.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 56018 | 2026-11-06T21:06:39.102Z | SUCCEEDED | 0 | 2026-11-06T21:06:39.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56014 | 2026-11-06T21:06:09.109Z | SUCCEEDED | 0 | 2026-11-06T21:06:09.088Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56012 | 2026-11-06T21:05:39.111Z | SUCCEEDED | 0 | 2026-11-06T21:05:39.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56010 | 2026-11-06T21:05:09.111Z | SUCCEEDED | 0 | 2026-11-06T21:05:09.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56008 | 2026-11-06T21:04:39.113Z | SUCCEEDED | 0 | 2026-11-06T21:04:39.091Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56006 | 2026-11-06T21:04:09.119Z | SUCCEEDED | 0 | 2026-11-06T21:04:09.088Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56004 | 2026-11-06T21:03:39.108Z | SUCCEEDED | 0 | 2026-11-06T21:03:39.088Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56002 | 2026-11-06T21:03:09.115Z | SUCCEEDED | 0 | 2026-11-06T21:03:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 56000 | 2026-11-06T21:02:39.107Z | SUCCEEDED | 0 | 2026-11-06T21:02:39.086Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55998 | 2026-11-06T21:02:09.105Z | SUCCEEDED | 0 | 2026-11-06T21:02:09.085Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55994 | 2026-11-06T21:01:39.118Z | SUCCEEDED | 0 | 2026-11-06T21:01:39.090Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55996 | 2026-11-06T21:01:39.113Z | SUCCEEDED | 0 | 2026-11-06T21:01:39.093Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55992 | 2026-11-06T21:01:09.115Z | SUCCEEDED | 0 | 2026-11-06T21:01:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55990 | 2026-11-06T21:00:39.106Z | SUCCEEDED | 0 | 2026-11-06T21:00:39.086Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55988 | 2026-11-06T21:00:09.107Z | SUCCEEDED | 0 | 2026-11-06T21:00:09.086Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55986 | 2026-11-06T20:59:39.109Z | SUCCEEDED | 0 | 2026-11-06T20:59:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55984 | 2026-11-06T20:59:09.107Z | SUCCEEDED | 0 | 2026-11-06T20:59:09.085Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55982 | 2026-11-06T20:58:39.108Z | SUCCEEDED | 0 | 2026-11-06T20:58:39.088Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55980 | 2026-11-06T20:58:09.109Z | SUCCEEDED | 0 | 2026-11-06T20:58:09.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55978 | 2026-11-06T20:57:39.112Z | SUCCEEDED | 0 | 2026-11-06T20:57:39.092Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55976 | 2026-11-06T20:57:09.116Z | SUCCEEDED | 0 | 2026-11-06T20:57:09.092Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55972 | 2026-11-06T20:56:39.113Z | SUCCEEDED | 0 | 2026-11-06T20:56:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55974 | 2026-11-06T20:56:39.104Z | SUCCEEDED | 0 | 2026-11-06T20:56:39.089Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55970 | 2026-11-06T20:56:09.108Z | SUCCEEDED | 0 | 2026-11-06T20:56:09.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55968 | 2026-11-06T20:55:39.112Z | SUCCEEDED | 0 | 2026-11-06T20:55:39.088Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55966 | 2026-11-06T20:55:09.111Z | SUCCEEDED | 0 | 2026-11-06T20:55:09.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55964 | 2026-11-06T20:54:39.126Z | SUCCEEDED | 0 | 2026-11-06T20:54:39.096Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55962 | 2026-11-06T20:54:09.119Z | SUCCEEDED | 0 | 2026-11-06T20:54:09.094Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55960 | 2026-11-06T20:53:39.118Z | SUCCEEDED | 0 | 2026-11-06T20:53:39.087Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55958 | 2026-11-06T20:53:09.104Z | SUCCEEDED | 0 | 2026-11-06T20:53:09.083Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55956 | 2026-11-06T20:52:39.102Z | SUCCEEDED | 0 | 2026-11-06T20:52:39.075Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55954 | 2026-11-06T20:52:09.105Z | SUCCEEDED | 0 | 2026-11-06T20:52:09.083Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55952 | 2026-11-06T20:51:39.108Z | SUCCEEDED | 0 | 2026-11-06T20:51:39.085Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55950 | 2026-11-06T20:51:39.105Z | SUCCEEDED | 0 | 2026-11-06T20:51:39.082Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55948 | 2026-11-06T20:51:09.101Z | SUCCEEDED | 0 | 2026-11-06T20:51:09.079Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55946 | 2026-11-06T20:50:39.106Z | SUCCEEDED | 0 | 2026-11-06T20:50:39.083Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55944 | 2026-11-06T20:50:09.105Z | SUCCEEDED | 0 | 2026-11-06T20:50:09.082Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55942 | 2026-11-06T20:49:39.099Z | SUCCEEDED | 0 | 2026-11-06T20:49:39.080Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55940 | 2026-11-06T20:49:09.090Z | SUCCEEDED | 0 | 2026-11-06T20:49:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55938 | 2026-11-06T20:48:39.091Z | SUCCEEDED | 0 | 2026-11-06T20:48:39.072Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55936 | 2026-11-06T20:48:09.092Z | SUCCEEDED | 0 | 2026-11-06T20:48:09.071Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55934 | 2026-11-06T20:47:39.093Z | SUCCEEDED | 0 | 2026-11-06T20:47:39.070Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55932 | 2026-11-06T20:47:09.095Z | SUCCEEDED | 0 | 2026-11-06T20:47:09.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55928 | 2026-11-06T20:46:39.085Z | SUCCEEDED | 0 | 2026-11-06T20:46:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55930 | 2026-11-06T20:46:39.082Z | SUCCEEDED | 0 | 2026-11-06T20:46:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55926 | 2026-11-06T20:46:09.095Z | SUCCEEDED | 0 | 2026-11-06T20:46:09.073Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55924 | 2026-11-06T20:45:39.094Z | SUCCEEDED | 0 | 2026-11-06T20:45:39.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55922 | 2026-11-06T20:45:09.091Z | SUCCEEDED | 0 | 2026-11-06T20:45:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55920 | 2026-11-06T20:44:39.090Z | SUCCEEDED | 0 | 2026-11-06T20:44:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55918 | 2026-11-06T20:44:09.087Z | SUCCEEDED | 0 | 2026-11-06T20:44:09.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55916 | 2026-11-06T20:43:39.087Z | SUCCEEDED | 0 | 2026-11-06T20:43:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55914 | 2026-11-06T20:43:09.085Z | SUCCEEDED | 0 | 2026-11-06T20:43:09.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55912 | 2026-11-06T20:42:39.086Z | SUCCEEDED | 0 | 2026-11-06T20:42:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55910 | 2026-11-06T20:42:09.086Z | SUCCEEDED | 0 | 2026-11-06T20:42:09.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55906 | 2026-11-06T20:41:39.092Z | SUCCEEDED | 0 | 2026-11-06T20:41:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55908 | 2026-11-06T20:41:39.086Z | SUCCEEDED | 0 | 2026-11-06T20:41:39.067Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55904 | 2026-11-06T20:41:09.092Z | SUCCEEDED | 0 | 2026-11-06T20:41:09.072Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55902 | 2026-11-06T20:40:39.096Z | SUCCEEDED | 0 | 2026-11-06T20:40:39.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55900 | 2026-11-06T20:40:09.105Z | SUCCEEDED | 0 | 2026-11-06T20:40:09.072Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55898 | 2026-11-06T20:39:39.087Z | SUCCEEDED | 0 | 2026-11-06T20:39:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55896 | 2026-11-06T20:39:09.075Z | SUCCEEDED | 0 | 2026-11-06T20:39:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55894 | 2026-11-06T20:38:39.096Z | SUCCEEDED | 0 | 2026-11-06T20:38:39.073Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55892 | 2026-11-06T20:38:09.077Z | SUCCEEDED | 0 | 2026-11-06T20:38:09.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55890 | 2026-11-06T20:37:39.095Z | SUCCEEDED | 0 | 2026-11-06T20:37:39.070Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55888 | 2026-11-06T20:37:09.087Z | SUCCEEDED | 0 | 2026-11-06T20:37:09.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55886 | 2026-11-06T20:36:39.090Z | SUCCEEDED | 0 | 2026-11-06T20:36:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55884 | 2026-11-06T20:36:39.086Z | SUCCEEDED | 0 | 2026-11-06T20:36:39.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55882 | 2026-11-06T20:36:09.098Z | SUCCEEDED | 0 | 2026-11-06T20:36:09.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55880 | 2026-11-06T20:35:39.078Z | SUCCEEDED | 0 | 2026-11-06T20:35:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55878 | 2026-11-06T20:35:09.085Z | SUCCEEDED | 0 | 2026-11-06T20:35:09.072Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55876 | 2026-11-06T20:34:39.073Z | SUCCEEDED | 0 | 2026-11-06T20:34:39.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55874 | 2026-11-06T20:34:09.074Z | SUCCEEDED | 0 | 2026-11-06T20:34:09.066Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55872 | 2026-11-06T20:33:39.092Z | SUCCEEDED | 0 | 2026-11-06T20:33:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55870 | 2026-11-06T20:33:09.102Z | SUCCEEDED | 0 | 2026-11-06T20:33:09.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55868 | 2026-11-06T20:32:39.088Z | SUCCEEDED | 0 | 2026-11-06T20:32:39.074Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55866 | 2026-11-06T20:32:09.092Z | SUCCEEDED | 0 | 2026-11-06T20:32:09.073Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | SHIP_ORDERS_JOB | 55864 | 2026-11-06T20:31:39.085Z | SUCCEEDED | 0 | 2026-11-06T20:31:39.071Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55862 | 2026-11-06T20:31:39.083Z | SUCCEEDED | 0 | 2026-11-06T20:31:39.069Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55860 | 2026-11-06T20:31:09.082Z | SUCCEEDED | 0 | 2026-11-06T20:31:09.075Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55858 | 2026-11-06T20:30:39.088Z | SUCCEEDED | 0 | 2026-11-06T20:30:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55856 | 2026-11-06T20:30:09.090Z | SUCCEEDED | 0 | 2026-11-06T20:30:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55854 | 2026-11-06T20:29:39.088Z | SUCCEEDED | 0 | 2026-11-06T20:29:39.073Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55852 | 2026-11-06T20:29:09.076Z | SUCCEEDED | 0 | 2026-11-06T20:29:09.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55850 | 2026-11-06T20:28:39.090Z | SUCCEEDED | 0 | 2026-11-06T20:28:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55848 | 2026-11-06T20:28:09.077Z | SUCCEEDED | 0 | 2026-11-06T20:28:09.070Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55846 | 2026-11-06T20:27:39.075Z | SUCCEEDED | 0 | 2026-11-06T20:27:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55844 | 2026-11-06T20:27:09.084Z | SUCCEEDED | 0 | 2026-11-06T20:27:09.065Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SHOPAPP | PLACE_ORDERS_JOB | 55840 | 2026-11-06T20:26:39.092Z | SUCCEEDED | 0 | 2026-11-06T20:26:39.068Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |

Row cap reached; partial evidence.

## jobLog (DBA_SCHEDULER_JOB_LOG): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | OPERATION | STATUS |
| --- | --- | --- | --- | --- | --- |
| SHOPAPP | PLACE_ORDERS_JOB | 56246 | 2026-11-06T21:57:09.194Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56242 | 2026-11-06T21:56:39.193Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56244 | 2026-11-06T21:56:39.184Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56240 | 2026-11-06T21:56:09.195Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56238 | 2026-11-06T21:55:39.193Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56236 | 2026-11-06T21:55:09.190Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56234 | 2026-11-06T21:54:39.198Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56232 | 2026-11-06T21:54:09.194Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56230 | 2026-11-06T21:53:39.208Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56228 | 2026-11-06T21:53:09.193Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56226 | 2026-11-06T21:52:39.197Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56224 | 2026-11-06T21:52:09.182Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56220 | 2026-11-06T21:51:39.174Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56222 | 2026-11-06T21:51:39.169Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56218 | 2026-11-06T21:51:09.179Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56216 | 2026-11-06T21:50:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56214 | 2026-11-06T21:50:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56212 | 2026-11-06T21:49:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56210 | 2026-11-06T21:49:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56208 | 2026-11-06T21:48:39.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56206 | 2026-11-06T21:48:09.179Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56204 | 2026-11-06T21:47:39.181Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56202 | 2026-11-06T21:47:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56200 | 2026-11-06T21:46:39.188Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56198 | 2026-11-06T21:46:39.185Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56196 | 2026-11-06T21:46:09.182Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56194 | 2026-11-06T21:45:39.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56192 | 2026-11-06T21:45:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56190 | 2026-11-06T21:44:39.188Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56188 | 2026-11-06T21:44:09.175Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56186 | 2026-11-06T21:43:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56184 | 2026-11-06T21:43:09.175Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56182 | 2026-11-06T21:42:39.184Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56180 | 2026-11-06T21:42:09.177Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56176 | 2026-11-06T21:41:39.182Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56178 | 2026-11-06T21:41:39.169Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56174 | 2026-11-06T21:41:09.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56172 | 2026-11-06T21:40:39.197Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56170 | 2026-11-06T21:40:09.185Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56168 | 2026-11-06T21:39:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56166 | 2026-11-06T21:39:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56164 | 2026-11-06T21:38:39.184Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56162 | 2026-11-06T21:38:09.182Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56160 | 2026-11-06T21:37:39.193Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56158 | 2026-11-06T21:37:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56156 | 2026-11-06T21:36:39.208Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56154 | 2026-11-06T21:36:39.191Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56152 | 2026-11-06T21:36:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56150 | 2026-11-06T21:35:39.179Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56148 | 2026-11-06T21:35:09.188Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56146 | 2026-11-06T21:34:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56144 | 2026-11-06T21:34:09.185Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56142 | 2026-11-06T21:33:39.182Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56140 | 2026-11-06T21:33:09.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56138 | 2026-11-06T21:32:39.188Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56136 | 2026-11-06T21:32:09.179Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56132 | 2026-11-06T21:31:39.179Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56134 | 2026-11-06T21:31:39.171Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56130 | 2026-11-06T21:31:09.183Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56128 | 2026-11-06T21:30:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56126 | 2026-11-06T21:30:09.181Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56124 | 2026-11-06T21:29:39.178Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56122 | 2026-11-06T21:29:09.181Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56120 | 2026-11-06T21:28:39.184Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56118 | 2026-11-06T21:28:09.182Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56116 | 2026-11-06T21:27:39.176Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56114 | 2026-11-06T21:27:09.183Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56110 | 2026-11-06T21:26:39.181Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56112 | 2026-11-06T21:26:39.174Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56108 | 2026-11-06T21:26:09.200Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56106 | 2026-11-06T21:25:39.184Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56104 | 2026-11-06T21:25:09.173Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56102 | 2026-11-06T21:24:39.172Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56100 | 2026-11-06T21:24:09.180Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56098 | 2026-11-06T21:23:39.166Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56096 | 2026-11-06T21:23:09.162Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56094 | 2026-11-06T21:22:39.155Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56092 | 2026-11-06T21:22:09.145Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56090 | 2026-11-06T21:21:39.164Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56088 | 2026-11-06T21:21:39.145Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56086 | 2026-11-06T21:21:09.133Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56084 | 2026-11-06T21:20:39.129Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56082 | 2026-11-06T21:20:09.127Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56080 | 2026-11-06T21:19:39.129Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56078 | 2026-11-06T21:19:09.128Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56076 | 2026-11-06T21:18:39.132Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56074 | 2026-11-06T21:18:09.130Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56072 | 2026-11-06T21:17:39.140Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56070 | 2026-11-06T21:17:09.136Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56068 | 2026-11-06T21:16:39.143Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56066 | 2026-11-06T21:16:39.121Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56064 | 2026-11-06T21:16:09.132Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56062 | 2026-11-06T21:15:39.122Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56060 | 2026-11-06T21:15:09.127Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56056 | 2026-11-06T21:14:39.117Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56050 | 2026-11-06T21:14:09.120Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56048 | 2026-11-06T21:13:39.119Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56046 | 2026-11-06T21:13:09.114Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56044 | 2026-11-06T21:12:39.116Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56042 | 2026-11-06T21:12:09.137Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56040 | 2026-11-06T21:11:39.144Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56038 | 2026-11-06T21:11:39.124Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56036 | 2026-11-06T21:11:09.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56034 | 2026-11-06T21:10:39.109Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56032 | 2026-11-06T21:10:09.126Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56030 | 2026-11-06T21:09:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56028 | 2026-11-06T21:09:09.113Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56026 | 2026-11-06T21:08:39.111Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56024 | 2026-11-06T21:08:09.113Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56022 | 2026-11-06T21:07:39.107Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56020 | 2026-11-06T21:07:09.109Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56016 | 2026-11-06T21:06:39.107Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 56018 | 2026-11-06T21:06:39.102Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56014 | 2026-11-06T21:06:09.108Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56012 | 2026-11-06T21:05:39.111Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56010 | 2026-11-06T21:05:09.110Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56008 | 2026-11-06T21:04:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56006 | 2026-11-06T21:04:09.119Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56004 | 2026-11-06T21:03:39.108Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56002 | 2026-11-06T21:03:09.114Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 56000 | 2026-11-06T21:02:39.107Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55998 | 2026-11-06T21:02:09.105Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55994 | 2026-11-06T21:01:39.118Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55996 | 2026-11-06T21:01:39.113Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55992 | 2026-11-06T21:01:09.114Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55990 | 2026-11-06T21:00:39.106Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55988 | 2026-11-06T21:00:09.107Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55986 | 2026-11-06T20:59:39.109Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55984 | 2026-11-06T20:59:09.106Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55982 | 2026-11-06T20:58:39.108Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55980 | 2026-11-06T20:58:09.109Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55978 | 2026-11-06T20:57:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55976 | 2026-11-06T20:57:09.116Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55972 | 2026-11-06T20:56:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55974 | 2026-11-06T20:56:39.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55970 | 2026-11-06T20:56:09.108Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55968 | 2026-11-06T20:55:39.112Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55966 | 2026-11-06T20:55:09.110Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55964 | 2026-11-06T20:54:39.125Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55962 | 2026-11-06T20:54:09.119Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55960 | 2026-11-06T20:53:39.117Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55958 | 2026-11-06T20:53:09.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55956 | 2026-11-06T20:52:39.101Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55954 | 2026-11-06T20:52:09.104Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55952 | 2026-11-06T20:51:39.108Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55950 | 2026-11-06T20:51:39.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55948 | 2026-11-06T20:51:09.100Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55946 | 2026-11-06T20:50:39.105Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55944 | 2026-11-06T20:50:09.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55942 | 2026-11-06T20:49:39.099Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55940 | 2026-11-06T20:49:09.090Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55938 | 2026-11-06T20:48:39.091Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55936 | 2026-11-06T20:48:09.092Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55934 | 2026-11-06T20:47:39.093Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55932 | 2026-11-06T20:47:09.095Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55928 | 2026-11-06T20:46:39.084Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55930 | 2026-11-06T20:46:39.081Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55926 | 2026-11-06T20:46:09.095Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55924 | 2026-11-06T20:45:39.094Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55922 | 2026-11-06T20:45:09.091Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55920 | 2026-11-06T20:44:39.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55918 | 2026-11-06T20:44:09.086Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55916 | 2026-11-06T20:43:39.087Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55914 | 2026-11-06T20:43:09.085Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55912 | 2026-11-06T20:42:39.086Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55910 | 2026-11-06T20:42:09.086Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55906 | 2026-11-06T20:41:39.091Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55908 | 2026-11-06T20:41:39.086Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55904 | 2026-11-06T20:41:09.092Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55902 | 2026-11-06T20:40:39.096Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55900 | 2026-11-06T20:40:09.104Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55898 | 2026-11-06T20:39:39.087Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55896 | 2026-11-06T20:39:09.075Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55894 | 2026-11-06T20:38:39.096Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55892 | 2026-11-06T20:38:09.076Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55890 | 2026-11-06T20:37:39.095Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55888 | 2026-11-06T20:37:09.087Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55886 | 2026-11-06T20:36:39.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55884 | 2026-11-06T20:36:39.086Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55882 | 2026-11-06T20:36:09.098Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55880 | 2026-11-06T20:35:39.078Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55878 | 2026-11-06T20:35:09.084Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55876 | 2026-11-06T20:34:39.073Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55874 | 2026-11-06T20:34:09.073Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55872 | 2026-11-06T20:33:39.092Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55870 | 2026-11-06T20:33:09.102Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55868 | 2026-11-06T20:32:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55866 | 2026-11-06T20:32:09.092Z | RUN | SUCCEEDED |
| SHOPAPP | SHIP_ORDERS_JOB | 55864 | 2026-11-06T20:31:39.085Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55862 | 2026-11-06T20:31:39.082Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55860 | 2026-11-06T20:31:09.082Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55858 | 2026-11-06T20:30:39.088Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55856 | 2026-11-06T20:30:09.089Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55854 | 2026-11-06T20:29:39.087Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55852 | 2026-11-06T20:29:09.076Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55850 | 2026-11-06T20:28:39.090Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55848 | 2026-11-06T20:28:09.077Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55846 | 2026-11-06T20:27:39.075Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55844 | 2026-11-06T20:27:09.084Z | RUN | SUCCEEDED |
| SHOPAPP | PLACE_ORDERS_JOB | 55840 | 2026-11-06T20:26:39.092Z | RUN | SUCCEEDED |

Row cap reached; partial evidence.

## windows (DBA_SCHEDULER_WINDOWS): ok
| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE |  | 2026-11-06T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
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
| auto optimizer stats collection | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_OS_OPT_SY_101 | SUCCEEDED | 2026-11-05T22:00:01.206Z | {"fseconds":0,"seconds":40,"minutes":0,"hours":0,"days":0} | 0 |
| auto space advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_SA_SPC_SY_102 | SUCCEEDED | 2026-11-05T22:00:01.218Z | {"fseconds":0,"seconds":4,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.019Z | ORA$AT_SQ_SQL_SW_103 | SUCCEEDED | 2026-11-05T22:00:01.226Z | {"fseconds":0,"seconds":58,"minutes":3,"hours":0,"days":0} | 0 |

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok
| ID | OPERATION | TARGET | START_TIME | END_TIME | STATUS |
| --- | --- | --- | --- | --- | --- |
| 382 | purge_stats |  | 2026-11-05T22:00:34.930Z | 2026-11-05T22:00:35.101Z | COMPLETED |
| 381 | purge_stats |  | 2026-11-05T22:00:34.798Z | 2026-11-05T22:00:34.929Z | COMPLETED |
| 380 | gather_database_stats (auto) | AUTO | 2026-11-05T22:00:01.242Z | 2026-11-05T22:00:34.798Z | COMPLETED |

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
| SHOPAPP | TABLE | 3 |
| SYS | PARTITION | 28 |
| SYS | TABLE | 134 |

