# Scheduler jobs and maintenance health

`piagent jobs --target T [--since 24h] [--owner SH] [--failed-only] [--json]`

This deterministic command only SELECTs dictionary views through the normal
19c gate, read-only account check, SQL policy and bounded query session. It never
runs, enables, disables or changes a job and never calls an LLM.

`--since` accepts positive integer minutes, hours or days (`30m`, `12h`, `7d`),
up to 30 days. History uses the UTC interval `[from, to)`; displayed timestamp
strings preserve Oracle timezone offsets. Current state and maintenance debt
are snapshots, independent of this history window. Next-run dates are scheduler
estimates and may be null; they do not guarantee a future execution.

`--owner` accepts an unquoted Oracle identifier, normalized to uppercase and
bound as a value. It filters jobs, run details, job logs, objects, indexes and
statistics counts. Autotask clients, windows and statistics-operation history
have no owner column and remain visible as maintenance context.

`--failed-only` selects current jobs whose FAILURE_COUNT is positive or whose
state is FAILED, BROKEN or RETRY SCHEDULED, or whose latest retained run failed;
it also selects non-successful scheduler runs, failed/stopped/broken job logs,
non-successful autotask jobs and failed statistics operations. It retains current
maintenance context and debt. A positive current failure count does not mean a
failure occurred within the selected history window. The latest-run status check
is independent of that window, uses LOG_DATE then LOG_ID to break ties, and
falls back to state/failure count with an explicit note if run details are unavailable.

The JSON result has `target`, `identity`, `window`, `owner`, `failedOnly`, `note`
and `sections`. Each section carries its source `view`, executed `sql`, `status`,
`rows` and `truncated` flag. Row keys follow Oracle column names. Last errors
are the newest FAILED run per owner/job **inside the history window**, chosen
before the row cap; a later successful run does not hide a previous error.
The separate run timeline can be capped independently. Rows are evidence, not
an assertion that missing jobs or failures do not exist.

Sections cover scheduler jobs, latest failed runs, recent runs and job logs;
maintenance windows, autotask clients and history; statistics operations;
invalid-object counts; unusable/invalid indexes, partitions and subpartitions;
and stale-statistics counts per owner and object type. Counts include the stated
object type, so table and partition statistics are not silently combined.
Unknown or missing statistics are not counted as explicitly stale.

All returned string fields pass through the existing triage credential redactor
and a jobs-local second pass before a 2,048-byte UTF-8 cap. The local pass masks
Authorization/Bearer tokens, connection-string userinfo, and assignments whose
keys contain PASSWORD, PASSWD, PWD, PASS, SECRET, TOKEN, KEY or CREDENTIAL
(case-insensitive, including prefixes and suffixes). A clipped field has a companion
`<COLUMN>_TRUNCATED` flag. The credential redactor preserves business literals;
it is not a general anonymizer. Treat JSON job error fields such as
`ADDITIONAL_INFO` and `JOB_ERROR` as **application text, may contain data**,
including business identifiers or personal information that credential matching
does not remove. Audit events contain SQL hashes, counts and
Oracle error codes; they contain no bind values or job-error text.

Each view degrades separately for ORA-00942, ORA-01031 and ORA-65040. Other errors
propagate, and sessions close on either path. Unavailable evidence is never
reported as a zero count. In a 19c PDB these DBA views describe current-container
visibility; no CDB-wide claims are made. Empty rows may reflect retention or PDB
visibility. Live PDB behavior remains unverified because both approved labs are
non-CDB databases. No CDB-wide or licensed history views are queried.

Preflight includes the `jobs` group. The PDB grant template covers every view.
The proposed p1-only grants are in
`grants-request-2026-11-06-jobs.sql`; they have not been applied. A human DBA and
coordinator must review the target/version/grantee and grant-limited eval
premises before applying any SELECT grants.
