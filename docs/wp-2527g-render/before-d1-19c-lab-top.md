Top — d1-19c-lab: partial; requested 5s
Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

sql: partial; 13.347s; Current instance cursor cache
Row cap reached; coverage incomplete and missing rows do not prove cursor aging.
elapsedUs:
2rs36av3juhnr delta=189343 — piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr
3u99narb2a5dq delta=30660 — piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq
72cnnbdaw0bu2 delta=2343 — piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2
772s25v1y0x8k delta=2228 — piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k
5yv7yvjgjxugg delta=791 — piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg
cpuUs:
2rs36av3juhnr delta=188648 — piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr
3u99narb2a5dq delta=30297 — piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq
772s25v1y0x8k delta=2052 — piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k
72cnnbdaw0bu2 delta=1334 — piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2
5yv7yvjgjxugg delta=684 — piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg
bufferGets:
physicalReads:
executions:
2rs36av3juhnr delta=1 — piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr
3u99narb2a5dq delta=1 — piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq
5yv7yvjgjxugg delta=1 — piagent sql --target d1-19c-lab --sql-id 5yv7yvjgjxugg
72cnnbdaw0bu2 delta=1 — piagent sql --target d1-19c-lab --sql-id 72cnnbdaw0bu2
772s25v1y0x8k delta=1 — piagent sql --target d1-19c-lab --sql-id 772s25v1y0x8k
new: 0
aged-out: 0
reset: 0

load: ok; 13.340s; CDB-wide (shared by all PDBs)
parse count (hard): delta=0; /s=0.000 (measured)
parse count (total): delta=1; /s=0.075 (measured)
physical reads: delta=0; /s=0.000 (measured)
redo size: delta=0; /s=0.000 (measured)
session logical reads: delta=0; /s=0.000 (measured)
user calls: delta=258; /s=19.340 (measured)
user commits: delta=0; /s=0.000 (measured)

host: ok; 13.338s; CDB-wide (shared by all PDBs)
BUSY_TIME: delta=16439; /s=1232.483 (measured)
IDLE_TIME: delta=26144; /s=1960.097 (measured)
IOWAIT_TIME: delta=48; /s=3.599 (measured)
NICE_TIME: delta=1; /s=0.075 (measured)
RSRC_MGR_CPU_WAIT_TIME: delta=0; /s=0.000 (measured)
SYS_TIME: delta=218; /s=16.344 (measured)
USER_TIME: delta=16210; /s=1215.314 (measured)
VM_IN_BYTES: delta=0; /s=0.000 (measured)
VM_OUT_BYTES: delta=1482752; /s=111166.554 (measured)
Host CPU busy: 38.60%
FREE_MEMORY_BYTES: 1411362816
GLOBAL_RECEIVE_SIZE_MAX: 4194304
GLOBAL_SEND_SIZE_MAX: 4194304
INACTIVE_MEMORY_BYTES: 101832683520
LOAD: 12.119140625
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
