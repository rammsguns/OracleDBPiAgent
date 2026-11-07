I can't generate an AWR report. AWR reports rely on the Diagnostics Pack (and the report itself via `DBMS_WORKLOAD_REPOSITORY` / `AWRPT` scripts), which is outside the read-only scope of these tools — I'm restricted from invoking any Pack-based functionality, historical snapshots (`DBA_HIST*`, `V$ACTIVE_SESSION_HISTORY`), or advisor/ADDM routines.

**What I *can* do instead (read-only, no Pack required):**

| Need | Alternative |
|------|-------------|
| Current top SQL by elapsed time / CPU / buffer gets / executions | `top_sql` tool |
| Current active sessions & their waits | `session_activity` tool |
| System-level wait events right now | `wait_events` tool |
| Execution plan for a specific SQL or sql_id | `explain_plan` tool |
| Live load snapshot (5–120 s) | `piagent top --target lab-p1 --seconds 30` |

Would you like me to pull any of these for **lab-p1**? For example, I can show the current top SQL by elapsed time and the active-session/wait profile in a couple of calls.I can't generate an AWR report. AWR reports require the Oracle Diagnostics Pack and access to historical snapshot data (`DBA_HIST*`, `V$ACTIVE_SESSION_HISTORY`), which falls outside the read-only scope of these tools. I'm also restricted from invoking any Pack-based packages, advisors, or ADDM routines as alternatives.

**What I can offer instead:**

A single live sampling interval via **`piagent top --target lab-p1 --seconds N`** (or `/top` in chat), where N is between 5 and 120 seconds (default 15). This captures:

- Top SQL deltas (elapsed time, CPU, buffer gets, executions)
- Database load deltas
- Host CPU deltas

This is a point-in-time snapshot of the *current* moment — it carries no historical data.

Would you like me to run a live interval now? If so, tell me how many seconds (5–120) or I'll use the default 15.
