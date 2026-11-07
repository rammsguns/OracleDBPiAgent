Top — p1-19c-prod: ok; requested 5s
Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

sql: ok; 6.037s; Current instance cursor cache
elapsedUs:
dcs11f9gutsbh delta=860311 — piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh
cvkqvyj6q81ph delta=250668 — piagent sql --target p1-19c-prod --sql-id cvkqvyj6q81ph
2rs36av3juhnr delta=38494 — piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr
9mdaa41nupt2f delta=13462 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
3u99narb2a5dq delta=4412 — piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq
9x2prazfz86dz delta=2925 — piagent sql --target p1-19c-prod --sql-id 9x2prazfz86dz
772s25v1y0x8k delta=1297 — piagent sql --target p1-19c-prod --sql-id 772s25v1y0x8k
1mvwb0ah65rw0 delta=922 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
5yv7yvjgjxugg delta=811 — piagent sql --target p1-19c-prod --sql-id 5yv7yvjgjxugg
aykvshm7zsabd delta=719 — piagent sql --target p1-19c-prod --sql-id aykvshm7zsabd
cpuUs:
dcs11f9gutsbh delta=843460 — piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh
cvkqvyj6q81ph delta=249435 — piagent sql --target p1-19c-prod --sql-id cvkqvyj6q81ph
2rs36av3juhnr delta=37250 — piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr
9mdaa41nupt2f delta=11816 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
3u99narb2a5dq delta=4015 — piagent sql --target p1-19c-prod --sql-id 3u99narb2a5dq
9x2prazfz86dz delta=2461 — piagent sql --target p1-19c-prod --sql-id 9x2prazfz86dz
772s25v1y0x8k delta=1063 — piagent sql --target p1-19c-prod --sql-id 772s25v1y0x8k
5yv7yvjgjxugg delta=758 — piagent sql --target p1-19c-prod --sql-id 5yv7yvjgjxugg
aykvshm7zsabd delta=718 — piagent sql --target p1-19c-prod --sql-id aykvshm7zsabd
9zg9qd9bm4spu delta=584 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
bufferGets:
cvkqvyj6q81ph delta=1278 — piagent sql --target p1-19c-prod --sql-id cvkqvyj6q81ph
9mdaa41nupt2f delta=818 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
9x2prazfz86dz delta=363 — piagent sql --target p1-19c-prod --sql-id 9x2prazfz86dz
1mvwb0ah65rw0 delta=12 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
0k8522rmdzg4k delta=10 — piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k
9zg9qd9bm4spu delta=8 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
grwydz59pu6mc delta=8 — piagent sql --target p1-19c-prod --sql-id grwydz59pu6mc
5dqz0hqtp9fru delta=4 — piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru
5x2x7y2umr3y7 delta=4 — piagent sql --target p1-19c-prod --sql-id 5x2x7y2umr3y7
865qwpcdyggkk delta=4 — piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk
physicalReads:
executions:
896y3kr66cfdm delta=22 — piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm
dcs11f9gutsbh delta=17 — piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh
grwydz59pu6mc delta=3 — piagent sql --target p1-19c-prod --sql-id grwydz59pu6mc
06ar6qtgjuzj8 delta=2 — piagent sql --target p1-19c-prod --sql-id 06ar6qtgjuzj8
0k8522rmdzg4k delta=2 — piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k
1mvwb0ah65rw0 delta=2 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
1n3pbucraq0vc delta=2 — piagent sql --target p1-19c-prod --sql-id 1n3pbucraq0vc
5dqz0hqtp9fru delta=2 — piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru
5x2x7y2umr3y7 delta=2 — piagent sql --target p1-19c-prod --sql-id 5x2x7y2umr3y7
865qwpcdyggkk delta=2 — piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk
new: 1
aged-out: 0
reset: 0

load: ok; 6.042s; CDB-wide (shared by all PDBs)
parse count (hard): delta=2; /s=0.331 (measured)
parse count (total): delta=39; /s=6.454 (measured)
physical reads: delta=0; /s=0.000 (measured)
redo size: delta=1352; /s=223.754 (measured)
session logical reads: delta=2505; /s=414.575 (measured)
user calls: delta=160; /s=26.480 (measured)
user commits: delta=0; /s=0.000 (measured)

host: ok; 6.044s; CDB-wide (shared by all PDBs)
BUSY_TIME: delta=6148; /s=1017.156 (measured)
IDLE_TIME: delta=13142; /s=2174.278 (measured)
IOWAIT_TIME: delta=15; /s=2.482 (measured)
NICE_TIME: delta=0; /s=0.000 (measured)
RSRC_MGR_CPU_WAIT_TIME: delta=0; /s=0.000 (measured)
SYS_TIME: delta=66; /s=10.919 (measured)
USER_TIME: delta=6078; /s=1005.574 (measured)
VM_IN_BYTES: delta=0; /s=0.000 (measured)
VM_OUT_BYTES: delta=0; /s=0.000 (measured)
Host CPU busy: 31.87%
FREE_MEMORY_BYTES: 1297072128
GLOBAL_RECEIVE_SIZE_MAX: 4194304
GLOBAL_SEND_SIZE_MAX: 4194304
INACTIVE_MEMORY_BYTES: 101832847360
LOAD: 12.19921875
NUM_CPUS: 32
NUM_CPU_CORES: 16
NUM_CPU_SOCKETS: 1
PHYSICAL_MEMORY_BYTES: 132267380736
SWAP_FREE_BYTES: 6733524992
TCP_RECEIVE_SIZE_DEFAULT: 131072
TCP_RECEIVE_SIZE_MAX: 33554432
TCP_RECEIVE_SIZE_MIN: 4096
TCP_SEND_SIZE_DEFAULT: 16384
TCP_SEND_SIZE_MAX: 4194304
TCP_SEND_SIZE_MIN: 4096
