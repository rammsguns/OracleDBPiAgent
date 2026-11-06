# Live SQL and load sampling

`piagent top --target d1-19c-lab --seconds 15` prints one sample. Add
`--json` for structured output. Seconds defaults to 15 and must be an integer
from 5 through 120. Invalid intervals, unknown targets and command usage errors
print specific guidance and exit 2. There is no LLM call, SQL text, automatic polling or database sleep.

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
Diagnostics Pack history. Oracle's [19c licensing guide](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html)
identifies ASH, AWR and DBMS_WORKLOAD_REPOSITORY as Diagnostics Pack features;
these current counter views are not in that restricted list. See the
[statistics reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/statistics-descriptions-2.html)
and [OSSTAT reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-OSSTAT.html)
for counter semantics. This command never accesses ASH, DBA_HIST_*, metric
history, DBMS_WORKLOAD_REPOSITORY, DBMS_SCHEDULER or DBMS_LOCK.

The reset summary counts each SQL_ID once if any of the five SQL metrics resets.

The global SQL policy refuses these identifiers wherever they occur in executable
SQL, including nested queries, CTEs, joins, quoted names and SYS/PUBLIC qualification.
V$, GV$, V_$ and GV_$ forms are covered. Refusals name the Diagnostics Pack
and suggest `piagent top`. Literal strings and comments remain inert.

The [Oracle 19c licensing guide, Diagnostics Pack section](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html)
explicitly names ASH (including X$ASH), DBMS_WORKLOAD_REPOSITORY, DBMS_ADDM,
DBA_ADDM_* and DBA_HIST_* (with six documented licensing exceptions). It also
lists DBA_ADVISOR_* **conditionally** when results contain ADDM-related advisor,
task or task-ID data. This project's conservative policy blocks all DBA_HIST_*
and DBA_ADVISOR_* access: it cannot determine future result contents, and keeps
its existing blanket AWR refusal even for the documented licensing exceptions.

The licensing guide lists metric history as a feature, but its current 19c text
**does not enumerate V$ metric view names**. The owner explicitly requires a
broader block on every V$*METRIC* identifier, including current values and name
metadata. This is a project restriction, not a claim that Oracle individually
lists every such view as licensed. [V$METRIC](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-METRIC.html)
and [V$METRIC_HISTORY](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-METRIC_HISTORY.html)
are described as AWR infrastructure by the Database Reference. The exact matching
names in the [19c Database Reference contents](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/toc.htm)
are V$CHUNK_METRIC, V$CON_SYSMETRIC, V$CON_SYSMETRIC_HISTORY,
V$CON_SYSMETRIC_SUMMARY, V$EVENTMETRIC, V$FILEMETRIC, V$FILEMETRIC_HISTORY,
V$GCR_METRICS, V$IOFUNCMETRIC, V$IOFUNCMETRIC_HISTORY, V$METRIC,
V$METRICGROUP, V$METRICNAME, V$METRIC_HISTORY, V$RSRCMGRMETRIC,
V$RSRCMGRMETRIC_HISTORY, V$RSRCPDBMETRIC, V$RSRCPDBMETRIC_HISTORY,
V$SERVICEMETRIC, V$SERVICEMETRIC_HISTORY, V$SERVICE_REGION_METRIC,
V$SESSMETRIC, V$SYSMETRIC, V$SYSMETRIC_HISTORY, V$SYSMETRIC_SUMMARY,
V$WAITCLASSMETRIC and V$WAITCLASSMETRIC_HISTORY. The family rule also refuses
future matching names. DBA_TABLESPACE_USAGE_METRICS remains allowed.

p1 currently has V$SQLSTATS only. The proposed SELECT-only request is
`docs/grants-request-2026-11-06-top.sql`; it has not been applied. The PDB template
and preflight `top` group include the sampler's three views.

## Review hardening

The refusal also covers V$ALL_ACTIVE_SESSION_HISTORY (and GV$/V_$/GV_$
variants), CDB_HIST_*, CDB_ADVISOR_*, CDB_ADDM_*, AWR_CDB_*, AWR_PDB_* and
AWR_ROOT_*. Snapshot views are included. WRH$_* and WRM$_* AWR tables and
WRI$_ADV_* advisor tables are conservatively refused too. Oracle documents
[ALL_ACTIVE_SESSION_HISTORY](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-ALL_ACTIVE_SESSION_HISTORY.html)
as sampled activity and identifies AWR table examples in
[DBMS_WORKLOAD_CAPTURE](https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_WORKLOAD_CAPTURE.html).

Re-reading the [19c Diagnostics and Tuning Pack lists](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html)
also identified Streams diagnostics, the listed MGMT$ monitoring/template
repository views, AWR Hub, performance/UMF APIs and Tuning Pack SQL Monitor
views and APIs. These are now refused explicitly, including SQL_MONITOR and
SQL_PLAN_MONITOR in all four dynamic-view prefixes. The named packages are
DBMS_WORKLOAD_REPOSITORY, DBMS_ADDM, DBMS_PERF, DBMS_UMF, DBMS_ADVISOR,
DBMS_WORKLOAD_REPLAY, DBMS_AWRHUB, DBMS_AUTO_SQLTUNE, DBMS_SQL_MONITOR and
DBMS_SQLTUNE. The message names both packs and suggests `piagent top`.

Some listed functionality is conditional (Streams component statistics,
advisor data, DBMS_ADVISOR, DBMS_WORKLOAD_REPLAY.COMPARE_PERIOD_REPORT), and
the guide notes DBMS_SQLTUNE exceptions. The project conservatively refuses
these entire objects/packages rather than evaluating data or package arguments.
This does not prohibit reading SQL profile metadata through existing allowed
views or the exact allowed DBMS_XPLAN.DISPLAY_CURSOR form.

Only V$SQLSTATS, V$SYSSTAT and V$OSSTAT are in the top preflight group.
The grant request and PDB template no longer request unused V$SESSTAT or
V$STATNAME privileges for this feature.
