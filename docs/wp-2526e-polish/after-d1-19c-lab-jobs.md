# Jobs: d1-19c-lab

2026-11-05T21:57:30.194Z to 2026-11-06T21:57:30.194Z (exclusive; UTC)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok
| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORACLE_OCM | MGMT_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-06T01:01:01.466Z | 2026-11-07T01:01:01.472Z | 39 | 0 |
| ORACLE_OCM | MGMT_STATS_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.185Z | 2026-12-01T01:01:01.189Z | 2 | 0 |
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.224Z | 2026-11-08T07:00:00.227Z | 8 | 0 |
| SYS | CLEANUP_NON_EXIST_OBJ | TRUE | SCHEDULED | 2026-11-06T16:30:03.917Z | 2026-11-07T04:30:03.958Z | 75 | 0 |
| SYS | CLEANUP_ONLINE_IND_BUILD | TRUE | SCHEDULED | 2026-11-06T21:14:27.508Z | 2026-11-06T22:14:27.513Z | 876 | 0 |
| SYS | CLEANUP_ONLINE_PMO | TRUE | SCHEDULED | 2026-11-06T21:15:07.678Z | 2026-11-06T22:15:07.680Z | 876 | 0 |
| SYS | CLEANUP_TAB_IOT_PMO | TRUE | SCHEDULED | 2026-11-06T21:14:37.674Z | 2026-11-06T22:14:37.676Z | 876 | 0 |
| SYS | CLEANUP_TRANSIENT_PKG | TRUE | SCHEDULED | 2026-11-06T20:14:57.018Z | 2026-11-06T22:14:57.000Z | 440 | 0 |
| SYS | CLEANUP_TRANSIENT_TYPE | TRUE | SCHEDULED | 2026-11-06T16:30:04.152Z | 2026-11-07T04:30:04.185Z | 75 | 0 |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | TRUE | SCHEDULED | 2026-11-05T22:00:02.127Z |  | 36 | 0 |
| SYS | FGR$AUTOPURGE_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | FILE_SIZE_UPD | TRUE | SCHEDULED | 2026-09-11T17:42:52.457Z | 2027-09-11T17:42:52.460Z | 1 | 0 |
| SYS | FILE_WATCHER | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | HM_CREATE_OFFLINE_DICTIONARY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | LOAD_OPATCH_INVENTORY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | ORA$AUTOTASK_CLEAN | TRUE | SCHEDULED | 2026-11-06T11:00:00.372Z | 2026-11-07T11:00:00.377Z | 42 | 0 |
| SYS | ORA$PREPLUGIN_BACKUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | PMO_DEFERRED_GIDX_MAINT_JOB | TRUE | SCHEDULED | 2026-11-06T10:00:00.618Z | 2026-11-07T10:00:00.623Z | 42 | 0 |
| SYS | PURGE_LOG | TRUE | SCHEDULED | 2026-11-06T11:00:00.398Z | 2026-11-07T11:00:00.403Z | 42 | 0 |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | TRUE | SCHEDULED | 2026-11-06T08:00:00.398Z | 2026-11-07T08:00:00.403Z | 42 | 0 |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | TRUE | SCHEDULED | 2026-11-06T08:00:00.420Z | 2026-11-07T08:00:00.422Z | 42 | 0 |
| SYS | XMLDB_NFS_CLEANUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
No rows returned within visible scope.

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYS | PURGE_LOG | 9886 | 2026-11-06T11:00:00.883Z | SUCCEEDED | 0 | 2026-11-06T11:00:00.398Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AUTOTASK_CLEAN | 9884 | 2026-11-06T11:00:00.392Z | SUCCEEDED | 0 | 2026-11-06T11:00:00.372Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 9858 | 2026-11-06T08:00:00.424Z | SUCCEEDED | 0 | 2026-11-06T08:00:00.420Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 9856 | 2026-11-06T08:00:00.411Z | SUCCEEDED | 0 | 2026-11-06T08:00:00.398Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| ORACLE_OCM | MGMT_CONFIG_JOB_1 | 9800 | 2026-11-06T01:01:01.833Z | SUCCEEDED | 0 | 2026-11-06T01:01:01.800Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| ORACLE_OCM | MGMT_CONFIG_JOB | 9798 | 2026-11-06T01:01:01.715Z | SUCCEEDED | 0 | 2026-11-06T01:01:01.467Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9760 | 2026-11-05T22:05:22.839Z | SUCCEEDED | 0 | 2026-11-05T22:00:02.145Z | {"fseconds":0,"seconds":21,"minutes":5,"hours":0,"days":0} |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9758 | 2026-11-05T22:00:50.891Z | SUCCEEDED | 0 | 2026-11-05T22:00:02.135Z | {"fseconds":0,"seconds":49,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9762 | 2026-11-05T22:00:04.918Z | SUCCEEDED | 0 | 2026-11-05T22:00:02.147Z | {"fseconds":0,"seconds":3,"minutes":0,"hours":0,"days":0} |  |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | 9756 | 2026-11-05T22:00:02.140Z | SUCCEEDED | 0 | 2026-11-05T22:00:02.127Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |

## jobLog (DBA_SCHEDULER_JOB_LOG): ok
| OWNER | JOB_NAME | LOG_ID | LOG_DATE | OPERATION | STATUS |
| --- | --- | --- | --- | --- | --- |
| SYS | PURGE_LOG | 9886 | 2026-11-06T11:00:00.882Z | RUN | SUCCEEDED |
| SYS | ORA$AUTOTASK_CLEAN | 9884 | 2026-11-06T11:00:00.391Z | RUN | SUCCEEDED |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 9858 | 2026-11-06T08:00:00.423Z | RUN | SUCCEEDED |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 9856 | 2026-11-06T08:00:00.406Z | RUN | SUCCEEDED |
| ORACLE_OCM | MGMT_CONFIG_JOB_1 | 9800 | 2026-11-06T01:01:01.833Z | RUN | SUCCEEDED |
| ORACLE_OCM | MGMT_CONFIG_JOB | 9798 | 2026-11-06T01:01:01.714Z | RUN | SUCCEEDED |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9774 | 2026-11-05T22:05:22.840Z | DROP |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9772 | 2026-11-05T22:05:22.840Z | COMPLETED |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9760 | 2026-11-05T22:05:22.839Z | RUN | SUCCEEDED |
| SYS | ORA$AT_OS_OPT_SY_224 | 9770 | 2026-11-05T22:00:50.891Z | DROP |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9768 | 2026-11-05T22:00:50.891Z | COMPLETED |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9758 | 2026-11-05T22:00:50.890Z | RUN | SUCCEEDED |
| SYS | ORA$AT_SA_SPC_SY_225 | 9766 | 2026-11-05T22:00:04.919Z | DROP |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9764 | 2026-11-05T22:00:04.919Z | COMPLETED |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9762 | 2026-11-05T22:00:04.917Z | RUN | SUCCEEDED |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | 9756 | 2026-11-05T22:00:02.140Z | RUN | SUCCEEDED |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9754 | 2026-11-05T22:00:00.176Z | ENABLE |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9752 | 2026-11-05T22:00:00.175Z | ENABLE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9750 | 2026-11-05T22:00:00.174Z | ENABLE |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9748 | 2026-11-05T22:00:00.172Z | UPDATE |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9746 | 2026-11-05T22:00:00.170Z | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9744 | 2026-11-05T22:00:00.168Z | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9742 | 2026-11-05T22:00:00.167Z | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9740 | 2026-11-05T22:00:00.166Z | UPDATE |  |

## windows (DBA_SCHEDULER_WINDOWS): ok
| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE | 2026-10-23T22:00:00.070Z | 2026-11-06T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| MONDAY_WINDOW | TRUE | FALSE | 2026-10-26T22:00:00.007Z | 2026-11-09T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| SATURDAY_WINDOW | TRUE | FALSE | 2026-10-24T06:00:00.005Z | 2026-11-07T06:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| SUNDAY_WINDOW | TRUE | FALSE | 2026-10-25T06:00:00.161Z | 2026-11-08T06:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| THURSDAY_WINDOW | TRUE | FALSE | 2026-11-05T22:00:00.090Z | 2026-11-12T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| TUESDAY_WINDOW | TRUE | FALSE | 2026-10-27T22:00:00.149Z | 2026-11-10T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEDNESDAY_WINDOW | TRUE | FALSE | 2026-11-04T22:00:00.173Z | 2026-11-11T22:00:00.000Z | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
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
| auto optimizer stats collection | THURSDAY_WINDOW | 2026-11-05T22:00:00.092Z | ORA$AT_OS_OPT_SY_224 | SUCCEEDED | 2026-11-05T22:00:02.135Z | {"fseconds":0,"seconds":49,"minutes":0,"hours":0,"days":0} | 0 |
| auto space advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.092Z | ORA$AT_SA_SPC_SY_225 | SUCCEEDED | 2026-11-05T22:00:02.147Z | {"fseconds":0,"seconds":3,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.092Z | ORA$AT_SQ_SQL_SW_226 | SUCCEEDED | 2026-11-05T22:00:02.145Z | {"fseconds":0,"seconds":21,"minutes":5,"hours":0,"days":0} | 0 |

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok
| ID | OPERATION | TARGET | START_TIME | END_TIME | STATUS |
| --- | --- | --- | --- | --- | --- |
| 824 | purge_stats |  | 2026-11-05T22:00:39.075Z | 2026-11-05T22:00:39.252Z | COMPLETED |
| 823 | purge_stats |  | 2026-11-05T22:00:38.959Z | 2026-11-05T22:00:39.075Z | COMPLETED |
| 822 | gather_database_stats (auto) | AUTO | 2026-11-05T22:00:02.147Z | 2026-11-05T22:00:38.958Z | COMPLETED |

## invalidObjects (DBA_OBJECTS): ok
| OWNER | OBJECT_TYPE | OBJECT_COUNT |
| --- | --- | --- |
| CO | VIEW | 3 |

## indexes (DBA_INDEXES): ok
No rows returned within visible scope.

## indexPartitions (DBA_IND_PARTITIONS): ok
No rows returned within visible scope.

## indexSubpartitions (DBA_IND_SUBPARTITIONS): ok
No rows returned within visible scope.

## staleStatistics (DBA_TAB_STATISTICS): ok
| OWNER | OBJECT_TYPE | STALE_COUNT |
| --- | --- | --- |
| SYS | PARTITION | 28 |
| SYS | TABLE | 132 |

