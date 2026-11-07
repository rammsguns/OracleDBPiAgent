# Top — p1-19c-prod: ok; requested 5s

Database-wide (non-CDB)

Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

## sql: ok; 5.756s

Current instance cursor cache

### elapsedUs

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| dcs11f9gutsbh | 633213 | 110009.64130449855 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 2rs36av3juhnr | 47434 | 8240.824691908701 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 3995 | 694.0611089972438 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 2m0auxz017ukb | 1120 | 194.5803359391522 | measured | piagent sql --target p1-19c-prod --sql-id 2m0auxz017ukb |
| 72cnnbdaw0bu2 | 746 | 129.6044023308996 | measured | piagent sql --target p1-19c-prod --sql-id 72cnnbdaw0bu2 |
| 896y3kr66cfdm | 578 | 100.41735194002676 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| 9zg9qd9bm4spu | 290 | 50.3824084128162 | measured | piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu |
| 0k8522rmdzg4k | 226 | 39.26353207343607 | measured | piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k |
| 5dqz0hqtp9fru | 180 | 31.271839704506604 | measured | piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru |
| f0h5rpzmhju11 | 177 | 30.75064237609816 | measured | piagent sql --target p1-19c-prod --sql-id f0h5rpzmhju11 |

### cpuUs

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| dcs11f9gutsbh | 615352 | 106906.60614359748 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 2rs36av3juhnr | 46677 | 8109.309232706971 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 2446 | 424.94955509568416 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 2m0auxz017ukb | 568 | 98.68002751199862 | measured | piagent sql --target p1-19c-prod --sql-id 2m0auxz017ukb |
| 896y3kr66cfdm | 391 | 67.92938513590046 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| 9zg9qd9bm4spu | 290 | 50.3824084128162 | measured | piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu |
| 0k8522rmdzg4k | 227 | 39.43726451623888 | measured | piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k |
| 5dqz0hqtp9fru | 180 | 31.271839704506604 | measured | piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru |
| f0h5rpzmhju11 | 177 | 30.75064237609816 | measured | piagent sql --target p1-19c-prod --sql-id f0h5rpzmhju11 |
| f4ym3gp21dar9 | 117 | 20.326695807929294 | measured | piagent sql --target p1-19c-prod --sql-id f4ym3gp21dar9 |

### bufferGets

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 0k8522rmdzg4k | 5 | 0.8686622140140723 | measured | piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k |
| 9zg9qd9bm4spu | 4 | 0.6949297712112579 | measured | piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu |
| 5dqz0hqtp9fru | 2 | 0.34746488560562894 | measured | piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru |
| 5x2x7y2umr3y7 | 2 | 0.34746488560562894 | measured | piagent sql --target p1-19c-prod --sql-id 5x2x7y2umr3y7 |
| 865qwpcdyggkk | 2 | 0.34746488560562894 | measured | piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk |

### physicalReads

none in this interval

### executions

| name | delta | perSecond | state | command |
| --- | --- | --- | --- | --- |
| 896y3kr66cfdm | 21 | 3.648381298859104 | measured | piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm |
| dcs11f9gutsbh | 17 | 2.953451527647846 | measured | piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh |
| 0k8522rmdzg4k | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k |
| 2m0auxz017ukb | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 2m0auxz017ukb |
| 2rs36av3juhnr | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr |
| 3u99narb2a5dq | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq |
| 5dqz0hqtp9fru | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru |
| 5x2x7y2umr3y7 | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 5x2x7y2umr3y7 |
| 72cnnbdaw0bu2 | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 72cnnbdaw0bu2 |
| 865qwpcdyggkk | 1 | 0.17373244280281447 | measured | piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk |

new: 0

aged-out: 0

reset: 0

## load: ok; 5.755s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| parse count (hard) | 0 | 0.000 | measured |
| parse count (total) | 13 | 2.259 | measured |
| physical reads | 0 | 0.000 | measured |
| redo size | 676 | 117.456 | measured |
| session logical reads | 16 | 2.780 | measured |
| user calls | 108 | 18.765 | measured |
| user commits | 0 | 0.000 | measured |

## host: ok; 5.755s

Database-wide (non-CDB)

| statistic | delta | perSecond | state |
| --- | --- | --- | --- |
| BUSY_TIME | 7262 | 1261.886 | measured |
| IDLE_TIME | 11074 | 1924.280 | measured |
| IOWAIT_TIME | 15 | 2.606 | measured |
| NICE_TIME | 0 | 0.000 | measured |
| RSRC_MGR_CPU_WAIT_TIME | 0 | 0.000 | measured |
| SYS_TIME | 226 | 39.271 | measured |
| USER_TIME | 7030 | 1221.572 | measured |
| VM_IN_BYTES | 0 B | 0 B/s | measured |
| VM_OUT_BYTES | 0 B | 0 B/s | measured |

Host CPU busy: 39.61%

| statistic | value |
| --- | --- |
| FREE_MEMORY_BYTES | 1.94 GiB |
| GLOBAL_RECEIVE_SIZE_MAX | 4194304 |
| GLOBAL_SEND_SIZE_MAX | 4194304 |
| INACTIVE_MEMORY_BYTES | 94.65 GiB |
| LOAD | 17.189453125 |
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
