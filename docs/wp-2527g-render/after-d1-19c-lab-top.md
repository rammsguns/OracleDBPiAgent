# Top — d1-19c-lab: partial; requested 5s

Database-wide (non-CDB)

Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

## sql: partial; 14.197s

Current instance cursor cache

Row cap reached; coverage incomplete and missing rows do not prove cursor aging.

### elapsedUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 164552 | 11591.004 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 42364 | 2984.11 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 3415 | 240.552 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 1157 | 81.499 | measured | piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k |
| 5yv7yvjgjxugg | 223 | 15.708 | measured | piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg |

### cpuUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 164337 | 11575.859 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 41131 | 2897.258 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 2969 | 209.136 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 565 | 39.798 | measured | piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k |
| 5yv7yvjgjxugg | 224 | 15.779 | measured | piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg |

### bufferGets

none in this interval

### physicalReads

none in this interval

### executions

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 2rs36av3juhnr | 1 | 0.07 | measured | piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 1 | 0.07 | measured | piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq |
| 5yv7yvjgjxugg | 1 | 0.07 | measured | piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg |
| 72cnnbdaw0bu2 | 1 | 0.07 | measured | piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 1 | 0.07 | measured | piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k |

new: 0

aged-out: 0

reset: 0

## load: ok; 14.239s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| parse count (hard) | 0 | 0 | measured |
| parse count (total) | 13 | 0.913 | measured |
| physical reads | 0 | 0 | measured |
| redo size | 676 | 47.475 | measured |
| session logical reads | 67 | 4.705 | measured |
| user calls | 270 | 18.962 | measured |
| user commits | 0 | 0 | measured |

## host: ok; 14.238s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| BUSY_TIME | 26322 | 1848.728 | measured |
| IDLE_TIME | 19012 | 1335.31 | measured |
| IOWAIT_TIME | 46 | 3.231 | measured |
| NICE_TIME | 0 | 0 | measured |
| RSRC_MGR_CPU_WAIT_TIME | 0 | 0 | measured |
| SYS_TIME | 1139 | 79.998 | measured |
| USER_TIME | 25169 | 1767.747 | measured |
| VM_IN_BYTES | 0 B | 0 B/s | measured |
| VM_OUT_BYTES | 0 B | 0 B/s | measured |

Host CPU busy: 58.06%

| statistic | value |
| --- | --- |
| FREE_MEMORY_BYTES | 1.16 GiB |
| GLOBAL_RECEIVE_SIZE_MAX | 4194304 |
| GLOBAL_SEND_SIZE_MAX | 4194304 |
| INACTIVE_MEMORY_BYTES | 94.79 GiB |
| LOAD | 14.149 |
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
