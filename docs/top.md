# Live SQL and load sampling

`piagent top --target d1-19c-lab --seconds 15` prints one sample. Add
`--json` for structured output. Seconds defaults to 15 and must be an integer
from 5 through 120. There is no LLM call, SQL text, automatic polling or database sleep.

The reader uses one already gated, read-only session. It captures V$SQLSTATS,
V$SYSSTAT and V$OSSTAT twice, sleeping in Node between snapshots. Each view's
rates use its measured monotonic interval, including query overhead, rather than
assuming the requested sleep is the whole interval. Reads are sequential and
not atomic. SQL snapshots page in SQL_ID order up to 10,000 rows using the
session's normal row limit per query. A cap is marked partial; concurrent cache
changes can affect pagination, so this is approximate live evidence.

Each of elapsed microseconds, CPU microseconds, buffer gets, disk reads and
executions has its own top ten ranking. Every ranked SQL_ID carries the command
`piagent sql --target T --sql-id ID`. JSON also includes all observed counters
and their states. No SQL text is collected. New SQL_IDs have unknown baselines;
aged-out SQL_IDs have unknown final values. Decreasing counters indicate a reset.
These unknown deltas are null and excluded from rankings, rather than inventing
zero or counting lifetime activity as interval activity. Cache replacement whose
new counters exceed old counters cannot be detected by these views. SQLSTATS is
aggregated by SQL_ID, not an individual child-cursor history, and updates can lag.
An empty ranking does not prove the database was idle.

Load rates cover user calls, logical reads, physical reads, redo bytes, total
parses, hard parses and commits. Host counters preserve Oracle's native units:
CPU TIME values are hundredths of a second, memory and VM values are bytes.
Noncumulative OS statistics are endpoint gauges (including LOAD and CPU count),
not rates. Host CPU busy percentage is delta BUSY_TIME / (delta BUSY_TIME + delta
IDLE_TIME); it is unavailable if either counter is missing/reset or total is zero.

V$SQLSTATS has current-container visibility in a PDB. V$SYSSTAT and V$OSSTAT are
labelled **CDB-wide (shared by all PDBs)**; host activity is not attributable to
a PDB. Missing grants, ORA-00942, ORA-01031 and ORA-65040 degrade each view
separately. Empty PDB results never prove absence. Live PDB, RAC and standby
behaviour remain unverified; the labs are non-CDB 19.9.1.

## Licensing

This sampler uses current V$SQLSTATS, V$SYSSTAT and V$OSSTAT counters, not
Diagnostics Pack history. V$SESSTAT is also a current session statistics view,
although this command does not need it. Oracle's [19c licensing guide](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html)
identifies ASH, AWR and DBMS_WORKLOAD_REPOSITORY as Diagnostics Pack features;
these current counter views are not in that restricted list. See the
[statistics reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/statistics-descriptions-2.html)
and [OSSTAT reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-OSSTAT.html)
for counter semantics. This command never accesses ASH, DBA_HIST_*, metric
history, DBMS_WORKLOAD_REPOSITORY, DBMS_SCHEDULER or DBMS_LOCK.

Unit tests prove the existing global ASH/AWR/package refusals. The global policy
currently does not refuse V$METRIC* history: extending that denylist is a
coordinator prerequisite outside WP-27A ownership, recorded in the branch report.
The top reader accepts only fixed queries and exposes no ad hoc SQL interface.

p1 currently has V$SQLSTATS only. The proposed SELECT-only request is
`docs/grants-request-2026-11-06-top.sql`; it has not been applied. The PDB template
and preflight `top` group include the sampler's three views.
