# Check: UNKNOWN
Captured 2026-11-07T19:17:13.989Z (UTC). Sequential snapshots; windowed history is not a continuous monitor.

| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lab-d1 | tablespace:SYSAUX | OK | 3.7128466190560436 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target lab-d1 |  |
| lab-d1 | tablespace:SYSTEM | OK | 3.0097975777614487 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target lab-d1 |  |
| lab-d1 | tablespace:USERS | OK | 0.9559635906045869 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target lab-d1 |  |
| lab-d1 | undo:UNDOTBS1 | OK | 0.06847384856884411 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target lab-d1 |  |
| lab-d1 | temp:TEMP | OK | 0.024414074141537734 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target lab-d1 |  |
| lab-d1 | recovery | UNKNOWN | UNKNOWN | 80 / 90 | Database-wide (non-CDB) | piagent space --target lab-d1 | Evidence unavailable, incomplete or inapplicable; no OK inferred. |
| lab-d1 | blocking | OK | 0 seconds | 60 / 300 | Database-wide (non-CDB) | piagent sessions --target lab-d1 |  |
| lab-d1 | backupAge | UNKNOWN | UNKNOWN | 26 / 50 | Database-wide (non-CDB) | piagent backup --target lab-d1 | Oldest latest full/level-0 completion across visible datafiles; missing history is UNKNOWN. |
| lab-d1 | archiveGaps | UNKNOWN | UNKNOWN | any &gt; 0 = CRIT | Database-wide (non-CDB) | piagent backup --target lab-d1 | Evidence unavailable, incomplete or inapplicable; no OK inferred. |
| lab-d1 | failedJobs | OK | 0 runs | 1 / 3 | Database-wide (non-CDB) | piagent jobs --target lab-d1 |  |
| lab-d1 | maintenance | WARN | 3 objects/index units | 1 / 20 | Database-wide (non-CDB) | piagent jobs --target lab-d1 | Index, partition and subpartition units counted separately. |
| lab-d1 | alertErrors | OK | 0 errors | 1 / incident only | Database-wide (non-CDB) | piagent alertlog --target lab-d1 | ORA occurrences in the lookback window. |
| lab-d1 | incidents | OK | 0 incidents | any &gt; 0 = CRIT | Database-wide (non-CDB) | piagent alertlog --target lab-d1 |  |
| lab-d1 | expiry | OK | 123.20446771990741 days | 14 / 3 | Database-wide (non-CDB) | piagent security --target lab-d1 |  |
| lab-d1 | defaultPasswords | CRIT | 5 accounts | any &gt; 0 = CRIT | Database-wide (non-CDB) | piagent security --target lab-d1 |  |

