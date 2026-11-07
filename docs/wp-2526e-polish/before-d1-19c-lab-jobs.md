# Jobs: d1-19c-lab

2026-11-05T21:57:21.496Z to 2026-11-06T21:57:21.496Z (exclusive)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures, failed/broken/retry states or a latest retained failed run and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok


| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORACLE_OCM | MGMT_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-06T01:01:01.466+00:00 | 2026-11-07T01:01:01.472+00:00 | 39 | 0 |
| ORACLE_OCM | MGMT_STATS_CONFIG_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.185+00:00 | 2026-12-01T01:01:01.189+00:00 | 2 | 0 |
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-03T21:30:03.224-07:00 | 2026-11-08T00:00:00.227-07:00 | 8 | 0 |
| SYS | CLEANUP_NON_EXIST_OBJ | TRUE | SCHEDULED | 2026-11-06T16:30:03.917+00:00 | 2026-11-07T04:30:03.958+00:00 | 75 | 0 |
| SYS | CLEANUP_ONLINE_IND_BUILD | TRUE | SCHEDULED | 2026-11-06T14:14:27.508-07:00 | 2026-11-06T15:14:27.513-07:00 | 876 | 0 |
| SYS | CLEANUP_ONLINE_PMO | TRUE | SCHEDULED | 2026-11-06T14:15:07.678-07:00 | 2026-11-06T15:15:07.680-07:00 | 876 | 0 |
| SYS | CLEANUP_TAB_IOT_PMO | TRUE | SCHEDULED | 2026-11-06T14:14:37.674-07:00 | 2026-11-06T15:14:37.676-07:00 | 876 | 0 |
| SYS | CLEANUP_TRANSIENT_PKG | TRUE | SCHEDULED | 2026-11-06T13:14:57.018-07:00 | 2026-11-06T15:14:57.000-07:00 | 440 | 0 |
| SYS | CLEANUP_TRANSIENT_TYPE | TRUE | SCHEDULED | 2026-11-06T16:30:04.152+00:00 | 2026-11-07T04:30:04.185+00:00 | 75 | 0 |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | TRUE | SCHEDULED | 2026-11-05T14:00:02.127-08:00 |  | 36 | 0 |
| SYS | FGR$AUTOPURGE_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | FILE_SIZE_UPD | TRUE | SCHEDULED | 2026-09-11T10:42:52.457-07:00 | 2027-09-11T17:42:52.460+00:00 | 1 | 0 |
| SYS | FILE_WATCHER | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | HM_CREATE_OFFLINE_DICTIONARY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | LOAD_OPATCH_INVENTORY | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | ORA$AUTOTASK_CLEAN | TRUE | SCHEDULED | 2026-11-06T03:00:00.372-08:00 | 2026-11-07T03:00:00.377-08:00 | 42 | 0 |
| SYS | ORA$PREPLUGIN_BACKUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |
| SYS | PMO_DEFERRED_GIDX_MAINT_JOB | TRUE | SCHEDULED | 2026-11-06T02:00:00.618-08:00 | 2026-11-07T02:00:00.623-08:00 | 42 | 0 |
| SYS | PURGE_LOG | TRUE | SCHEDULED | 2026-11-06T03:00:00.398-08:00 | 2026-11-07T03:00:00.403-08:00 | 42 | 0 |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | TRUE | SCHEDULED | 2026-11-06T00:00:00.398-08:00 | 2026-11-07T00:00:00.403-08:00 | 42 | 0 |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | TRUE | SCHEDULED | 2026-11-06T00:00:00.420-08:00 | 2026-11-07T00:00:00.422-08:00 | 42 | 0 |
| SYS | XMLDB_NFS_CLEANUP_JOB | FALSE | DISABLED |  |  | 0 | 0 |

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


No rows returned within visible scope.

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYS | PURGE_LOG | 9886 | 2026-11-06T11:00:00.883+00:00 | SUCCEEDED | 0 | 2026-11-06T03:00:00.398-08:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AUTOTASK_CLEAN | 9884 | 2026-11-06T11:00:00.392+00:00 | SUCCEEDED | 0 | 2026-11-06T03:00:00.372-08:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 9858 | 2026-11-06T08:00:00.424+00:00 | SUCCEEDED | 0 | 2026-11-06T00:00:00.420-08:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 9856 | 2026-11-06T08:00:00.411+00:00 | SUCCEEDED | 0 | 2026-11-06T00:00:00.398-08:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| ORACLE_OCM | MGMT_CONFIG_JOB_1 | 9800 | 2026-11-06T01:01:01.833+00:00 | SUCCEEDED | 0 | 2026-11-06T01:01:01.800+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| ORACLE_OCM | MGMT_CONFIG_JOB | 9798 | 2026-11-06T01:01:01.715+00:00 | SUCCEEDED | 0 | 2026-11-06T01:01:01.467+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9760 | 2026-11-05T22:05:22.839+00:00 | SUCCEEDED | 0 | 2026-11-05T22:00:02.145+00:00 | {"fseconds":0,"seconds":21,"minutes":5,"hours":0,"days":0} |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9758 | 2026-11-05T22:00:50.891+00:00 | SUCCEEDED | 0 | 2026-11-05T22:00:02.135+00:00 | {"fseconds":0,"seconds":49,"minutes":0,"hours":0,"days":0} |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9762 | 2026-11-05T22:00:04.918+00:00 | SUCCEEDED | 0 | 2026-11-05T22:00:02.147+00:00 | {"fseconds":0,"seconds":3,"minutes":0,"hours":0,"days":0} |  |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | 9756 | 2026-11-05T22:00:02.140+00:00 | SUCCEEDED | 0 | 2026-11-05T14:00:02.127-08:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":0} |  |

## jobLog (DBA_SCHEDULER_JOB_LOG): ok


| OWNER | JOB_NAME | LOG_ID | LOG_DATE | OPERATION | STATUS |
| --- | --- | --- | --- | --- | --- |
| SYS | PURGE_LOG | 9886 | 2026-11-06T11:00:00.882+00:00 | RUN | SUCCEEDED |
| SYS | ORA$AUTOTASK_CLEAN | 9884 | 2026-11-06T11:00:00.391+00:00 | RUN | SUCCEEDED |
| SYS | SM$CLEAN_AUTO_SPLIT_MERGE | 9858 | 2026-11-06T08:00:00.423+00:00 | RUN | SUCCEEDED |
| SYS | RSE$CLEAN_RECOVERABLE_SCRIPT | 9856 | 2026-11-06T08:00:00.406+00:00 | RUN | SUCCEEDED |
| ORACLE_OCM | MGMT_CONFIG_JOB_1 | 9800 | 2026-11-06T01:01:01.833+00:00 | RUN | SUCCEEDED |
| ORACLE_OCM | MGMT_CONFIG_JOB | 9798 | 2026-11-06T01:01:01.714+00:00 | RUN | SUCCEEDED |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9774 | 2026-11-05T22:05:22.840+00:00 | DROP |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9772 | 2026-11-05T22:05:22.840+00:00 | COMPLETED |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9760 | 2026-11-05T22:05:22.839+00:00 | RUN | SUCCEEDED |
| SYS | ORA$AT_OS_OPT_SY_224 | 9770 | 2026-11-05T22:00:50.891+00:00 | DROP |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9768 | 2026-11-05T22:00:50.891+00:00 | COMPLETED |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9758 | 2026-11-05T22:00:50.890+00:00 | RUN | SUCCEEDED |
| SYS | ORA$AT_SA_SPC_SY_225 | 9766 | 2026-11-05T22:00:04.919+00:00 | DROP |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9764 | 2026-11-05T22:00:04.919+00:00 | COMPLETED |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9762 | 2026-11-05T22:00:04.917+00:00 | RUN | SUCCEEDED |
| SYS | DRA_REEVALUATE_OPEN_FAILURES | 9756 | 2026-11-05T22:00:02.140+00:00 | RUN | SUCCEEDED |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9754 | 2026-11-05T22:00:00.176+00:00 | ENABLE |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9752 | 2026-11-05T22:00:00.175+00:00 | ENABLE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9750 | 2026-11-05T22:00:00.174+00:00 | ENABLE |  |
| SYS | ORA$AT_SQ_SQL_SW_226 | 9748 | 2026-11-05T22:00:00.172+00:00 | UPDATE |  |
| SYS | ORA$AT_SA_SPC_SY_225 | 9746 | 2026-11-05T22:00:00.170+00:00 | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9744 | 2026-11-05T22:00:00.168+00:00 | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9742 | 2026-11-05T22:00:00.167+00:00 | UPDATE |  |
| SYS | ORA$AT_OS_OPT_SY_224 | 9740 | 2026-11-05T22:00:00.166+00:00 | UPDATE |  |

## windows (DBA_SCHEDULER_WINDOWS): ok


| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE | 2026-10-23T22:00:00.070+00:00 | 2026-11-06T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| MONDAY_WINDOW | TRUE | FALSE | 2026-10-26T22:00:00.007+00:00 | 2026-11-09T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| SATURDAY_WINDOW | TRUE | FALSE | 2026-10-24T06:00:00.005+00:00 | 2026-11-07T06:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| SUNDAY_WINDOW | TRUE | FALSE | 2026-10-25T06:00:00.161+00:00 | 2026-11-08T06:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| THURSDAY_WINDOW | TRUE | FALSE | 2026-11-05T22:00:00.090+00:00 | 2026-11-12T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| TUESDAY_WINDOW | TRUE | FALSE | 2026-10-27T22:00:00.149+00:00 | 2026-11-10T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEDNESDAY_WINDOW | TRUE | FALSE | 2026-11-04T22:00:00.173+00:00 | 2026-11-11T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEEKEND_WINDOW | FALSE | FALSE |  | 2019-04-20T00:00:00.000-07:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":2} |
| WEEKNIGHT_WINDOW | FALSE | FALSE |  | 2019-04-17T22:00:00.000-07:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":8,"days":0} |

## autotaskClients (DBA_AUTOTASK_CLIENT): ok


| CLIENT_NAME | STATUS | WINDOW_GROUP |
| --- | --- | --- |
| auto optimizer stats collection | ENABLED | ORA$AT_WGRP_OS |
| auto space advisor | ENABLED | ORA$AT_WGRP_SA |
| sql tuning advisor | ENABLED | ORA$AT_WGRP_SQ |

## autotaskHistory (DBA_AUTOTASK_JOB_HISTORY): ok


| CLIENT_NAME | WINDOW_NAME | WINDOW_START_TIME | JOB_NAME | JOB_STATUS | JOB_START_TIME | JOB_DURATION | JOB_ERROR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auto optimizer stats collection | THURSDAY_WINDOW | 2026-11-05T22:00:00.092+00:00 | ORA$AT_OS_OPT_SY_224 | SUCCEEDED | 2026-11-05T22:00:02.135+00:00 | {"fseconds":0,"seconds":49,"minutes":0,"hours":0,"days":0} | 0 |
| auto space advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.092+00:00 | ORA$AT_SA_SPC_SY_225 | SUCCEEDED | 2026-11-05T22:00:02.147+00:00 | {"fseconds":0,"seconds":3,"minutes":0,"hours":0,"days":0} | 0 |
| sql tuning advisor | THURSDAY_WINDOW | 2026-11-05T22:00:00.092+00:00 | ORA$AT_SQ_SQL_SW_226 | SUCCEEDED | 2026-11-05T22:00:02.145+00:00 | {"fseconds":0,"seconds":21,"minutes":5,"hours":0,"days":0} | 0 |

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok


| ID | OPERATION | TARGET | START_TIME | END_TIME | STATUS |
| --- | --- | --- | --- | --- | --- |
| 824 | purge_stats |  | 2026-11-05T22:00:39.075+00:00 | 2026-11-05T22:00:39.252+00:00 | COMPLETED |
| 823 | purge_stats |  | 2026-11-05T22:00:38.959+00:00 | 2026-11-05T22:00:39.075+00:00 | COMPLETED |
| 822 | gather_database_stats (auto) | AUTO | 2026-11-05T22:00:02.147+00:00 | 2026-11-05T22:00:38.958+00:00 | COMPLETED |

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

