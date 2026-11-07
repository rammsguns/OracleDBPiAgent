# Top — d1-19c-lab: partial; requested 5s

Database-wide (non-CDB)

Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

## sql: partial; 14.266s

Current instance cursor cache

Row cap reached; coverage incomplete and missing rows do not prove cursor aging.

### elapsedUs

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 349558 | 24503.25445870932 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 30116 | 2111.0660070102526 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 2377 | 166.62252286702653 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |

### cpuUs

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 346130 | 24262.959124932222 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 28728 | 2013.7702300900035 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 1676 | 117.48394965298127 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |

### bufferGets

none in this interval

### physicalReads

none in this interval

### executions

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 1 | 0.0700978219886523 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 1 | 0.0700978219886523 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 1 | 0.0700978219886523 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |

new: 0

aged-out: 0

reset: 0

## load: ok; 14.262s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| parse count (hard) | 0 | 0.000 | measured |
| parse count (total) | 1 | 0.070 | measured |
| physical reads | 0 | 0.000 | measured |
| redo size | 0 | 0.000 | measured |
| session logical reads | 0 | 0.000 | measured |
| user calls | 258 | 18.090 | measured |
| user commits | 0 | 0.000 | measured |

## host: ok; 14.260s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| BUSY_TIME | 22522 | 1579.377 | measured |
| IDLE_TIME | 22925 | 1607.638 | measured |
| IOWAIT_TIME | 36 | 2.525 | measured |
| NICE_TIME | 0 | 0.000 | measured |
| RSRC_MGR_CPU_WAIT_TIME | 0 | 0.000 | measured |
| SYS_TIME | 765 | 53.646 | measured |
| USER_TIME | 21745 | 1524.889 | measured |
| VM_IN_BYTES | 0 B | 0 B/s | measured |
| VM_OUT_BYTES | 0 B | 0 B/s | measured |

Host CPU busy: 49.56%

| statistic | value |
| --- | --- |
| FREE_MEMORY_BYTES | 1.32 GiB |
| GLOBAL_RECEIVE_SIZE_MAX | 4194304 |
| GLOBAL_SEND_SIZE_MAX | 4194304 |
| INACTIVE_MEMORY_BYTES | 94.65 GiB |
| LOAD | 16.5 |
| NUM_CPUS | 32 |
| NUM_CPU_CORES | 16 |
| NUM_CPU_SOCKETS | 1 |
| PHYSICAL_MEMORY_BYTES | 123.18 GiB |
| SWAP_FREE_BYTES | 6.26 GiB |
| TCP_RECEIVE_SIZE_DEFAULT | 131072 |
| TCP_RECEIVE_SIZE_MAX | 33554432 |
| TCP_RECEIVE_SIZE_MIN | 4096 |
| TCP_SEND_SIZE_DEFAULT | 16384 |
| TCP_SEND_SIZE_MAX | 4194304 |
| TCP_SEND_SIZE_MIN | 4096 |

SQL drill-down: piagent sql --target d1-19c-lab --sql-id <SQL_ID>
