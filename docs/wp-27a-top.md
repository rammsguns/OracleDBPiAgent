# WP-27A report

Built `piagent top --target T [--seconds N] [--json]`: one gated session,
Node sleep, two bounded snapshots; top ten per five SQL metrics, load rates,
host CPU and endpoint gauges. SQL text is never fetched. New, aged-out and
reset counters are unknown, never fabricated as interval work. Missing views
degrade independently. CDB-wide facts are labelled and PDB empty results do
not establish absence. SQL paging is capped at 10,000 rows, marked partial.
Both lab commands ran successfully; d1 hits the SQL cap, while p1 SQL is
readable and system/host counters degrade with ORA-00942 as expected.

No LLM calls, database writes, grant application, container changes or pushes.
The missing node_modules was symlinked to ../needlefish/node_modules as authorized.
Work is on branch wp-27a-top.

## Files

- `src/oracle/sqlPolicy.ts`
- `tests/unit/sqlPolicy.test.ts`
- `tests/unit/triage-sqlperf.test.ts`
- `src/top/index.ts`
- `src/top/cli.ts`
- `src/cli/index.ts`
- `src/preflight/views.ts`
- `tests/unit/top.test.ts`
- `tests/unit/top-cli.test.ts`
- `tests/unit/preflight-catalog.test.ts`
- `tests/unit/release-help.test.ts`
- `tests/integration/top.test.ts`
- `docs/top.md`
- `docs/grants-template-pdb.sql`
- `docs/grants-request-2026-11-06-top.sql`
- `docs/wp-27a-top.md`

## Contract changes / coordinator action

No src/contracts.ts, package.json or PLAN.md changes needed or made.
The fixed reader and result types are exported from src/top/index.ts for
WP-27B/WP-27C. JSON rankings use elapsedUs, cpuUs, bufferGets, physicalReads,
executions; nullable delta/perSecond and state describe unmeasurable baselines.

The coordinator authorized src/oracle/sqlPolicy.ts and policy test changes in
this session. The metric-family gap is now closed. The guard examines complete
executable identifier tokens after comments and literals are removed, before
other refusal checks, and names the Diagnostics Pack with `piagent top` as the
alternative. It covers V$/GV$/V_$/GV_$ forms, quotes, schema qualification,
CTEs, subqueries, joins and comma joins. It also closes the underlying ASH
name gaps, blocks X$ASH, DBA_HIST_*, DBA_ADVISOR_*, DBA_ADDM_*,
DBMS_WORKLOAD_REPOSITORY and DBMS_ADDM.

Oracle's current 19c licensing guide does not enumerate V$ metric names.
The full metric family is an explicit coordinator restriction, documented
separately from Oracle's licensing claims in docs/top.md. The 27 current
matching view names were enumerated from the 19c Database Reference contents.
DBA_ADVISOR_* appears conditionally in the licensing guide; the policy blocks
it conservatively because row contents cannot be verified before execution.
Existing blanket DBA_HIST_* refusal is retained even for Oracle's six exceptions.

The policy suite exercises every enumerated metric name in all four prefixes,
quoted/unquoted and SYS/PUBLIC-qualified, at every requested nesting position.
It verifies inert comments/literals, normal counter views, tablespace usage
metrics and DISPLAY_CURSOR stay allowed. A source relation scan and every
MVP/hard-suite groundTruth.sql pass the classifier; an eval case text scan found
no newly blocked names. No fixed source query or eval case needed modification.
No remaining coordinator policy change or shared contract change is required.

The p1 grant request is proposed only, not applied. It requests SELECT on
V_$SYSSTAT and V_$OSSTAT only. The review removed the unused follow-on
V_$SESSTAT/V_$STATNAME grants. The preflight top group contains exactly
the three queried views. The PDB template includes all requested SELECTs.

## Verification

Initial unit run found the expected registered-command help list omission
and a conservative preflight scanner reading prose as a view name. Both were
fixed; the final full unit result follows. Focused tests cover snapshot order,
one supplied session, timer, elapsed rate denominator, paging, row caps,
new/aged-out/reset deltas, CPU, gauges, PDB labels, missing grants/PDB errors,
unexpected failures, policy and preflight coverage.

```text

> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit


> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  109 passed (109)
      Tests  1854 passed (1854)
   Start at  14:51:48
   Duration  68.38s (tests 75%, import 23%, worker 1%, transform 1%)

    Isolate  109 workers spawned · ~288ms startup each (spawn + environment, per file)
             at least ~15.41s faster with isolate: false — reuses workers across files instead of one per file


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  2 passed (2)
      Tests  26 passed (26)
   Start at  14:52:13
   Duration  538ms (tests 42%, transform 30%, import 23%, worker 4%)

```

Integration command (Strata e2e excluded):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets PIAGENT_TARGETS_FILE="$PWD/config/targets.json" npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

```text

> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  14:50:42
   Duration  253.92s (tests 96%, import 3%, transform 1%)

```

Integration passed: 67 tests, 29 files; the one skipped test is the excluded Strata e2e.

## Live output

Both commands explicitly pinned PIAGENT_TARGETS_FILE to this checkout's
config/targets.json and PIAGENT_SECRET_DIR to the authorized lab secret directory.

```text

> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts top --target d1-19c-lab --seconds 5

Top — d1-19c-lab: partial; requested 5s
Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

sql: partial; 18.061s; Current instance cursor cache
Row cap reached; coverage incomplete and missing rows do not prove cursor aging.
elapsedUs:
3rw10sfqdkfcx delta=406233 — piagent sql --target d1-19c-lab --sql-id 3rw10sfqdkfcx
8nwrvs5szhrtc delta=373135 — piagent sql --target d1-19c-lab --sql-id 8nwrvs5szhrtc
2rs36av3juhnr delta=310680 — piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr
1mvwb0ah65rw0 delta=233587 — piagent sql --target d1-19c-lab --sql-id 1mvwb0ah65rw0
29utj3ka25cu5 delta=200610 — piagent sql --target d1-19c-lab --sql-id 29utj3ka25cu5
67skf3phgtbtw delta=182391 — piagent sql --target d1-19c-lab --sql-id 67skf3phgtbtw
0psufyyap7vcs delta=181154 — piagent sql --target d1-19c-lab --sql-id 0psufyyap7vcs
3u99narb2a5dq delta=123385 — piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq
5dqz0hqtp9fru delta=108507 — piagent sql --target d1-19c-lab --sql-id 5dqz0hqtp9fru
163s9pcsxcpfb delta=108360 — piagent sql --target d1-19c-lab --sql-id 163s9pcsxcpfb
cpuUs:
3rw10sfqdkfcx delta=403965 — piagent sql --target d1-19c-lab --sql-id 3rw10sfqdkfcx
8nwrvs5szhrtc delta=371205 — piagent sql --target d1-19c-lab --sql-id 8nwrvs5szhrtc
2rs36av3juhnr delta=309179 — piagent sql --target d1-19c-lab --sql-id 2rs36av3juhnr
29utj3ka25cu5 delta=200406 — piagent sql --target d1-19c-lab --sql-id 29utj3ka25cu5
67skf3phgtbtw delta=181207 — piagent sql --target d1-19c-lab --sql-id 67skf3phgtbtw
0psufyyap7vcs delta=180046 — piagent sql --target d1-19c-lab --sql-id 0psufyyap7vcs
1mvwb0ah65rw0 delta=143630 — piagent sql --target d1-19c-lab --sql-id 1mvwb0ah65rw0
5dqz0hqtp9fru delta=126582 — piagent sql --target d1-19c-lab --sql-id 5dqz0hqtp9fru
3u99narb2a5dq delta=122998 — piagent sql --target d1-19c-lab --sql-id 3u99narb2a5dq
163s9pcsxcpfb delta=105066 — piagent sql --target d1-19c-lab --sql-id 163s9pcsxcpfb
bufferGets:
3rw10sfqdkfcx delta=27475 — piagent sql --target d1-19c-lab --sql-id 3rw10sfqdkfcx
67skf3phgtbtw delta=1989 — piagent sql --target d1-19c-lab --sql-id 67skf3phgtbtw
0psufyyap7vcs delta=1987 — piagent sql --target d1-19c-lab --sql-id 0psufyyap7vcs
437acgfwmfd9v delta=1331 — piagent sql --target d1-19c-lab --sql-id 437acgfwmfd9v
5dqz0hqtp9fru delta=1112 — piagent sql --target d1-19c-lab --sql-id 5dqz0hqtp9fru
8nwrvs5szhrtc delta=964 — piagent sql --target d1-19c-lab --sql-id 8nwrvs5szhrtc
1mvwb0ah65rw0 delta=828 — piagent sql --target d1-19c-lab --sql-id 1mvwb0ah65rw0
09yjdfn35vy1x delta=734 — piagent sql --target d1-19c-lab --sql-id 09yjdfn35vy1x
0k8522rmdzg4k delta=650 — piagent sql --target d1-19c-lab --sql-id 0k8522rmdzg4k
29utj3ka25cu5 delta=521 — piagent sql --target d1-19c-lab --sql-id 29utj3ka25cu5
physicalReads:
executions:
896y3kr66cfdm delta=184 — piagent sql --target d1-19c-lab --sql-id 896y3kr66cfdm
5x2x7y2umr3y7 delta=140 — piagent sql --target d1-19c-lab --sql-id 5x2x7y2umr3y7
5dqz0hqtp9fru delta=139 — piagent sql --target d1-19c-lab --sql-id 5dqz0hqtp9fru
1mvwb0ah65rw0 delta=138 — piagent sql --target d1-19c-lab --sql-id 1mvwb0ah65rw0
1n3pbucraq0vc delta=138 — piagent sql --target d1-19c-lab --sql-id 1n3pbucraq0vc
865qwpcdyggkk delta=133 — piagent sql --target d1-19c-lab --sql-id 865qwpcdyggkk
0k8522rmdzg4k delta=130 — piagent sql --target d1-19c-lab --sql-id 0k8522rmdzg4k
06ar6qtgjuzj8 delta=126 — piagent sql --target d1-19c-lab --sql-id 06ar6qtgjuzj8
7ykawc7v0hc24 delta=70 — piagent sql --target d1-19c-lab --sql-id 7ykawc7v0hc24
0b639nx4zdzxr delta=18 — piagent sql --target d1-19c-lab --sql-id 0b639nx4zdzxr
new: 0
aged-out: 0
reset: 0

load: ok; 17.976s; CDB-wide (shared by all PDBs)
parse count (hard): delta=0; /s=0.000 (measured)
parse count (total): delta=2324; /s=129.282 (measured)
physical reads: delta=0; /s=0.000 (measured)
redo size: delta=78644; /s=4374.900 (measured)
session logical reads: delta=680837; /s=37874.392 (measured)
user calls: delta=9031; /s=502.387 (measured)
user commits: delta=0; /s=0.000 (measured)

host: ok; 17.969s; CDB-wide (shared by all PDBs)
BUSY_TIME: delta=21391; /s=1190.416 (measured)
IDLE_TIME: delta=35388; /s=1969.354 (measured)
IOWAIT_TIME: delta=64; /s=3.562 (measured)
NICE_TIME: delta=0; /s=0.000 (measured)
RSRC_MGR_CPU_WAIT_TIME: delta=0; /s=0.000 (measured)
SYS_TIME: delta=3612; /s=201.009 (measured)
USER_TIME: delta=17672; /s=983.453 (measured)
VM_IN_BYTES: delta=0; /s=0.000 (measured)
VM_OUT_BYTES: delta=0; /s=0.000 (measured)
Host CPU busy: 37.67%
FREE_MEMORY_BYTES: 972017664
GLOBAL_RECEIVE_SIZE_MAX: 4194304
GLOBAL_SEND_SIZE_MAX: 4194304
INACTIVE_MEMORY_BYTES: 102701776896
LOAD: 9.51953125
NUM_CPUS: 32
NUM_CPU_CORES: 16
NUM_CPU_SOCKETS: 1
PHYSICAL_MEMORY_BYTES: 132267380736
SWAP_FREE_BYTES: 6427881472
TCP_RECEIVE_SIZE_DEFAULT: 131072
TCP_RECEIVE_SIZE_MAX: 33554432
TCP_RECEIVE_SIZE_MIN: 4096
TCP_SEND_SIZE_DEFAULT: 16384
TCP_SEND_SIZE_MAX: 4194304
TCP_SEND_SIZE_MIN: 4096

> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts top --target p1-19c-prod --seconds 5

Top — p1-19c-prod: partial; requested 5s
Sequential live reads, not atomic snapshots. New, aged-out and reset counters have unknown deltas and are excluded in rankings. Sampling includes observer overhead. SQL cache statistics may lag execution.

sql: ok; 6.045s; Current instance cursor cache
elapsedUs:
dcs11f9gutsbh delta=857183 — piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh
1zbyda0ww6t2m delta=382431 — piagent sql --target p1-19c-prod --sql-id 1zbyda0ww6t2m
9mdaa41nupt2f delta=363377 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
f1s6bnrv8hdkm delta=340531 — piagent sql --target p1-19c-prod --sql-id f1s6bnrv8hdkm
2rs36av3juhnr delta=55969 — piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr
1mvwb0ah65rw0 delta=27460 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
9zg9qd9bm4spu delta=13945 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
dj8wat6uz8h9j delta=13802 — piagent sql --target p1-19c-prod --sql-id dj8wat6uz8h9j
f0h5rpzmhju11 delta=9845 — piagent sql --target p1-19c-prod --sql-id f0h5rpzmhju11
0k8522rmdzg4k delta=9097 — piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k
cpuUs:
dcs11f9gutsbh delta=844477 — piagent sql --target p1-19c-prod --sql-id dcs11f9gutsbh
1zbyda0ww6t2m delta=380406 — piagent sql --target p1-19c-prod --sql-id 1zbyda0ww6t2m
9mdaa41nupt2f delta=355838 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
f1s6bnrv8hdkm delta=338804 — piagent sql --target p1-19c-prod --sql-id f1s6bnrv8hdkm
2rs36av3juhnr delta=55343 — piagent sql --target p1-19c-prod --sql-id 2rs36av3juhnr
1mvwb0ah65rw0 delta=17233 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
9zg9qd9bm4spu delta=14007 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
dj8wat6uz8h9j delta=12947 — piagent sql --target p1-19c-prod --sql-id dj8wat6uz8h9j
5dqz0hqtp9fru delta=9804 — piagent sql --target p1-19c-prod --sql-id 5dqz0hqtp9fru
f0h5rpzmhju11 delta=9544 — piagent sql --target p1-19c-prod --sql-id f0h5rpzmhju11
bufferGets:
1zbyda0ww6t2m delta=45420 — piagent sql --target p1-19c-prod --sql-id 1zbyda0ww6t2m
f1s6bnrv8hdkm delta=28920 — piagent sql --target p1-19c-prod --sql-id f1s6bnrv8hdkm
9mdaa41nupt2f delta=6256 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
dj8wat6uz8h9j delta=405 — piagent sql --target p1-19c-prod --sql-id dj8wat6uz8h9j
1mvwb0ah65rw0 delta=96 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
g7v8u84kb4nyj delta=85 — piagent sql --target p1-19c-prod --sql-id g7v8u84kb4nyj
0k8522rmdzg4k delta=75 — piagent sql --target p1-19c-prod --sql-id 0k8522rmdzg4k
a1dfhaubjxhq8 delta=68 — piagent sql --target p1-19c-prod --sql-id a1dfhaubjxhq8
9zg9qd9bm4spu delta=64 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
865qwpcdyggkk delta=32 — piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk
physicalReads:
executions:
896y3kr66cfdm delta=33 — piagent sql --target p1-19c-prod --sql-id 896y3kr66cfdm
f0h5rpzmhju11 delta=18 — piagent sql --target p1-19c-prod --sql-id f0h5rpzmhju11
1mvwb0ah65rw0 delta=16 — piagent sql --target p1-19c-prod --sql-id 1mvwb0ah65rw0
1n3pbucraq0vc delta=16 — piagent sql --target p1-19c-prod --sql-id 1n3pbucraq0vc
865qwpcdyggkk delta=16 — piagent sql --target p1-19c-prod --sql-id 865qwpcdyggkk
9mdaa41nupt2f delta=16 — piagent sql --target p1-19c-prod --sql-id 9mdaa41nupt2f
9s5cdq3h4nfbj delta=16 — piagent sql --target p1-19c-prod --sql-id 9s5cdq3h4nfbj
9zg9qd9bm4spu delta=16 — piagent sql --target p1-19c-prod --sql-id 9zg9qd9bm4spu
a62fbfyqb88qc delta=16 — piagent sql --target p1-19c-prod --sql-id a62fbfyqb88qc
06ar6qtgjuzj8 delta=15 — piagent sql --target p1-19c-prod --sql-id 06ar6qtgjuzj8
new: 0
aged-out: 0
reset: 0

load: unavailable; 6.041s; CDB-wide (shared by all PDBs)
load: not granted / not available in a PDB (ORA-00942).

host: unavailable; 6.038s; CDB-wide (shared by all PDBs)
host: not granted / not available in a PDB (ORA-00942).
Host CPU busy: unavailable
```

JSON command also ran on p1 and parsed successfully: target p1-19c-prod,
status partial, sql ok, load unavailable, host unavailable.

## Unverified / limits

Live PDB, RAC, standby and other release updates are unverified. The labs are
non-CDB 19.9.1. Counter reset and aging cases are simulated in unit tests; no
workloads, database resets or cursor flushes were induced. Cache replacement
whose counters are larger than the old values is undetectable. Snapshot pages
are not atomic and can move during capture. d1 exceeds 10,000 SQL rows, so its
rankings cover only the sampled cache subset. Counters include observer overhead.
Owner must review grant/eval premises before any p1 grants. The metric-history
global policy gap is closed by the coordinator-authorized follow-up.

## Coordinator-authorized policy follow-up validation

The first full unit run identified a historical phase 19 source-hash test.
It now normalizes only the authorized Diagnostics Pack change and retains the
original baseline SHA-256 for the rest of the policy, preserving its protection.
The final focused policy/triage/top/preflight suite passes 345 tests.

```text

> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  5 passed (5)
      Tests  345 passed (345)
   Start at  15:14:15
   Duration  1.51s (tests 42%, import 32%, transform 24%, worker 3%)


> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  109 passed (109)
      Tests  1990 passed (1990)
   Start at  15:14:18
   Duration  69.47s (tests 75%, import 22%, worker 1%, transform 1%)

    Isolate  109 workers spawned · ~288ms startup each (spawn + environment, per file)
             at least ~15.42s faster with isolate: false — reuses workers across files instead of one per file

```

```text

> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  15:12:51
   Duration  253.73s (tests 97%, import 3%)

```

Follow-up integration passed: 67 tests, 29 files; one Strata e2e excluded.
No LLM calls or database changes were made.

## Review REQUEST CHANGES follow-up

Read ../review-wp-27a-top/docs/review-wp-27a-top.md and addressed every finding.

- Critical: refused ALL_ACTIVE_SESSION_HISTORY, CDB_HIST_/ADVISOR_/ADDM_,
  AWR_CDB_/PDB_/ROOT_ families and AWR/advisor underlying table families.
  Re-read Oracle 19c licensing Diagnostics/Tuning lists; added listed Streams
  diagnostics, MGMT$ repository views, SQL Monitor views and the remaining
  listed APIs. Conditional licensed objects are conservatively blocked whole.
  Each family has quoted/unquoted, SYS/PUBLIC-qualified and nested/CTE/join
  bypass tests. ASH and SQL Monitor cover V$/GV$/V_$/GV_$ forms.
- Major: TopUsageError plus the sessions-style CLI handler prints specific
  validation guidance with exit 2; commander errors/help match sessions too.
  Five subprocess tests prove invalid intervals, unknown target, missing target
  and unknown option behavior without database connections or LLM calls.
- Minor: reset summary counts unique SQL_IDs across all five counter metrics.
  Regression tests force a reset in each metric while checking the text output.
- Info: removed unused SESSTAT/STATNAME grants from request and PDB template;
  preflight top already contained only the three queried views.

No contract changes, grants applied, database changes, or LLM calls.
The source relation scan and all eval ground-truth queries remain policy-valid.
No live PDB was available; the refusal bypass tests are local classifier tests
and never query licensed data.

```text

> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  6 passed (6)
      Tests  416 passed (416)
   Start at  15:34:46
   Duration  4.19s (tests 81%, import 12%, transform 6%, worker 1%)


> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  110 passed (110)
      Tests  2061 passed (2061)
   Start at  15:34:15
   Duration  65.26s (tests 77%, import 21%, worker 1%, transform 1%)

    Isolate  110 workers spawned · ~254ms startup each (spawn + environment, per file)
             at least ~13.70s faster with isolate: false — reuses workers across files instead of one per file

```

```text

> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-27a-top


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  15:33:40
   Duration  244.28s (tests 97%, import 3%)

```

All review-fix checks passed: typecheck, 416 focused tests, 2,061 unit tests,
and 67 filtered integration tests (one Strata e2e excluded).
