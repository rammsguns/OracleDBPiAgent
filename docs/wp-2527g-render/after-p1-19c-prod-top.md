# Top — p1-19c-prod: ok; requested 5s

Database-wide (non-CDB)

Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

## sql: ok; 5.873s

Current instance cursor cache

### elapsedUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| dcs11f9gutsbh | 672053 | 114426.263 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 2rs36av3juhnr | 38106 | 6488.07 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 8024 | 1366.196 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 1292 | 219.981 | measured | piagent sql --target p1-19c-prod --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 677 | 115.269 | measured | piagent sql --target p1-19c-prod --sql-id 772s25v1y0x8k |
| 896y3kr66cfdm | 552 | 93.986 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| aykvshm7zsabd | 386 | 65.722 | measured | piagent sql --target p1-19c-prod --sql-id aykvshm7zsabd |
| 5yv7yvjgjxugg | 259 | 44.098 | measured | piagent sql --target p1-19c-prod --sql-id 5yv7yvjgjxugg |

### cpuUs

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| dcs11f9gutsbh | 654924 | 111509.816 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 2rs36av3juhnr | 38071 | 6482.111 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 6935 | 1180.779 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 72cnnbdaw0bu2 | 605 | 103.01 | measured | piagent sql --target p1-19c-prod --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 467 | 79.513 | measured | piagent sql --target p1-19c-prod --sql-id 772s25v1y0x8k |
| 896y3kr66cfdm | 405 | 68.957 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| aykvshm7zsabd | 387 | 65.892 | measured | piagent sql --target p1-19c-prod --sql-id aykvshm7zsabd |
| 5yv7yvjgjxugg | 258 | 43.928 | measured | piagent sql --target p1-19c-prod --sql-id 5yv7yvjgjxugg |

### bufferGets

none in this interval

### physicalReads

none in this interval

### executions

| SQL_ID | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 896y3kr66cfdm | 19 | 3.235 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| dcs11f9gutsbh | 16 | 2.724 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 2rs36av3juhnr | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 5yv7yvjgjxugg | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id 5yv7yvjgjxugg |
| 72cnnbdaw0bu2 | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id 72cnnbdaw0bu2 |
| 772s25v1y0x8k | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id 772s25v1y0x8k |
| aykvshm7zsabd | 1 | 0.17 | measured | piagent sql --target p1-19c-prod --sql-id aykvshm7zsabd |

new: 0

aged-out: 0

reset: 0

## load: ok; 5.875s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| parse count (hard) | 0 | 0 | measured |
| parse count (total) | 1 | 0.17 | measured |
| physical reads | 0 | 0 | measured |
| redo size | 124 | 21.108 | measured |
| session logical reads | 0 | 0 | measured |
| user calls | 92 | 15.661 | measured |
| user commits | 0 | 0 | measured |

## host: ok; 5.876s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| BUSY_TIME | 8578 | 1459.852 | measured |
| IDLE_TIME | 10123 | 1722.789 | measured |
| IOWAIT_TIME | 25 | 4.255 | measured |
| NICE_TIME | 0 | 0 | measured |
| RSRC_MGR_CPU_WAIT_TIME | 0 | 0 | measured |
| SYS_TIME | 374 | 63.649 | measured |
| USER_TIME | 8199 | 1395.352 | measured |
| VM_IN_BYTES | 0 B | 0 B/s | measured |
| VM_OUT_BYTES | 0 B | 0 B/s | measured |

Host CPU busy: 45.87%

| statistic | value |
| --- | --- |
| FREE_MEMORY_BYTES | 1.67 GiB |
| GLOBAL_RECEIVE_SIZE_MAX | 4194304 |
| GLOBAL_SEND_SIZE_MAX | 4194304 |
| INACTIVE_MEMORY_BYTES | 94.79 GiB |
| LOAD | 14.729 |
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

SQL drill-down: piagent sql --target p1-19c-prod --sql-id <SQL_ID>
