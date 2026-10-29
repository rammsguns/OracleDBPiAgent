# Read-only Oracle 19c reports (WP-2B)

`npm run piagent -- report --target d1-19c-lab` prints Markdown without contacting
Strata. `--md` is explicit Markdown; `--json` emits one stable JSON object.
`--sections identity,tablespaces,top_sql` selects sections in canonical order.
`--owner HR` overrides the target's default schema for optimizer and index checks.
Owner identifiers are validated and bound, never interpolated into SQL.

The public API is `generateReport(ctx, options)` and `renderMarkdown(report)` from
`src/report/index.ts`; `summarizeReport(markdown, config)` is separate. No agent
tools, shared contracts, dependencies or agent prompts changed.

## Output contract

```ts
{ target: string, generatedAt: string, sections: Array<{
  name: string, status: 'ok' | 'unavailable', source: string,
  columns: string[], rows: unknown[][], note: string
}> }
```

Dates serialize as ISO strings; NULL remains JSON null. Empty successful sections
have empty rows and mean no matching *visible* rows. Unavailable sections have
empty columns/rows and a sanitized `not available: ...` note. SQL text from cached
statements is limited to 300 characters. Markdown escapes HTML, pipes and newlines.

Section names: `identity`, `tablespaces`, `waits`, `top_sql`, `optimizer_stats`,
`index_health`, `index_partitions`, `index_subpartitions`, `parameters`,
`scheduler_jobs`, `scheduler_failures`, `long_operations`, `backups`,
`archive_switches`. Selecting `index_health`, `scheduler_jobs` or `backups` also
selects their related partition, failed-run or archive sections. Each result keeps
its own source, columns and availability, including when a related grant is absent.

`--summarize` prints a short Strata summary **after** the report (including after
the JSON line with `--json`). Omit it when consuming stdout as a single JSON value.
It sends the rendered Markdown to the existing local provider once, with no tools,
and requests prioritised findings citing sections and read-only diagnostic next
steps (what to query or check, and what to ask a DBA to review), explicitly
forbidding parameter changes, ALTER/DDL/DML, PL/SQL, restarts or any other database
modifications.
The caller must share the LLM slot with other eval/report processes. After the one
summary call, the deterministic `checkFacts` checker compares numeric claims with
the full rendered Markdown sent to the model plus one header-first evidence copy
per Markdown table (including tables with blank lines between rows). Only in those
copies, exact `ELAPSED_TIME` and `CPU_TIME` header cells become
`ELAPSED_TIME_MICRO` and `CPU_TIME_MICRO`, allowing the existing microsecond
conversion rules to apply to V$SQL timings as well as `TIME_WAITED_MICRO`.
The summary copy checked excludes `ORA-` followed by exactly five digits: Oracle
error codes are not numeric report facts. The displayed summary and Markdown
sent to Strata remain unchanged. Unsupported numbers with four or
more significant digits appear after the CLI summary as `Unverified: ...`; there
is no correction call. Rounded values and byte conversions follow the existing
grounding checker rules. Identifiers are not flagged for report summaries.
`PIAGENT_GROUNDING_CHECK=0` skips this check and produces an empty unverified list.
With `--json --summarize`, the report remains one JSON line followed by summary
text and, when needed, the Unverified line.

The web `/api/report?...&summarize=1` response includes `summary: string` and
`unverified: string[]` alongside `report`, including an empty list when supported
or checking is disabled. Without `summarize=1`, both summary fields are omitted.
The Report tab displays a visible Unverified note below the summary using only
`textContent`. This lexical check does not prove row attribution or reasoning;
small numbers and nonnumeric claims remain outside its summary scope.

## Safety and interpretation

Queries are fixed SELECTs, explicitly classified by the existing SQL policy and
executed through the existing session provider (approved endpoints/accounts, 19c
gate, read-only transaction, rollback and bounded fetch). Every query attempt is
audited as `report:<section>` with SQL hash, counts and timing on success, or a
fixed error class on failure. No binds or driver diagnostics enter output/audit.
Raw driver messages are mapped to allowlisted grant/timeout/service reasons,
following the existing CLI suppression of driver error text; there was no shared
exported sanitizer to reuse.

Each section has a two-second query budget (also capped by configured statement
timeout); fallback shares the deadline. Query timeouts use whole seconds to satisfy
node-oracledb's integer-millisecond `callTimeout`. Connections/cleanup remain
subject to the existing provider, so the 30-second full-report budget is a live
integration assertion, not a new connection-cancellation mechanism.

At most 100 rows are fetched per section, further capped by configured maxRows;
identity returns one, top SQL/waits/RMAN/failed runs ten, archive hours 25. At a
SQL row limit the note warns that more matches may exist. DBA-to-ALL fallbacks
explicitly narrow visibility. No ASH/AWR or database-changing operations are used.

SQL and fallbacks were adapted with `git show` from
`rammsguns/wp-w-schema-health:src/tools/schemaHealth.ts`,
`rammsguns/wp-x-instance-ops:src/tools/instanceOps.ts`, and `src/tools/index.ts`.
Statistics report only table-level stale/locked/never-analyzed rows. `NUM_ROWS` is
an optimizer estimate, not an actual current table count. Index checks include
unusable partitions and subpartitions. Scheduler checks cover broken/failed jobs
or positive failure counts plus the most recent failed runs. Waits and SQL timings
are cumulative, in microseconds; they are not interval rates. Datafile tablespace
numbers are bytes and exclude temporary files; the metrics fallback includes
potential autoextension and explicitly says so. Archive switches deduplicate
thread/sequence/resetlogs; zero-switch hours are omitted.

## Live samples and independent verification

Verified 2026-10-29 UTC using only the approved read-only accounts. A full JSON CLI
run completed for each target; the sample row counts were:

| Section | d1-19c-lab | p1-19c-prod |
| --- | ---: | ---: |
| identity | 1 | 1 |
| tablespaces | 4 | 5 |
| waits | 10 | 10 |
| top_sql | 10 | 10 |
| optimizer_stats | 4 | 2 |
| index_health / partitions / subpartitions | 0 / 0 / 0 | 0 / 0 / 0 |
| parameters | 18 | unavailable |
| scheduler_jobs / scheduler_failures | 0 / 10 | 0 / 0 |
| long_operations | 0 | 0 |
| backups | 0 | unavailable |
| archive_switches | 0 | unavailable |

p1 notes are exactly:

- `not available: needs SELECT on SYS.V_$PARAMETER`
- `not available: needs SELECT on SYS.V_$RMAN_BACKUP_JOB_DETAILS`
- `not available: needs SELECT on SYS.V_$ARCHIVED_LOG or SYS.V_$LOG_HISTORY`

The integration test independently checks the optimizer result count with a
COUNT query, and each reported NUM_ROWS estimate against ALL_TABLES. The d1
matches were four never-analyzed SH text-index backing tables (NULL estimates);
p1 matched SHOPAPP.ORDERS (282950 estimated rows) and PRODUCTS (5000 estimated
rows), both stale. These are not asserted as current actual row counts.

Tablespace allocated bytes are checked using a separate grouped DBA_DATA_FILES
query, free bytes with a separate DBA_FREE_SPACE query, and used bytes by
subtracting the two. For example, d1 USERS had 382730240 allocated, 54263808 free,
328466432 used; p1 SHOP_DATA had 536870912 allocated, 428343296 free, 108527616 used.
Numbers can change as the production-shaped workload runs.

Each reported top SQL ID is independently looked up in V$SQL with a bound ID.
The d1 sample included `4xm1ruvkx3awx`, `b6usrg82hwsa3`, `7nw1k2nucff6n`;
p1 included `5z4rs78fgav3w`, `28bg1w216a5ua`, `54x8br9b0szpk`.
This verifies cursor identity; cumulative elapsed totals and ranks can change
between the report and verification queries. No cached statement text is copied
into this document.

## Validation

- `npm run typecheck`: PASS.
- `npm test`: 22 files, 419 tests passed.
- `set -a; . ./.env; set +a; npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  6 files passed, 22 passed / 1 skipped (the excluded live LLM end-to-end test),
  6.85 seconds for the whole suite. Both full report tests and independent facts
  passed; each report was below the 30-second budget.
- Unit coverage includes every fixed SQL shape, owner binds, bounds, policy,
  missing grants, timeout/generic error sanitization, every fallback, stable JSON,
  Markdown, grouped selection and CLI summary sequencing with a fake summary.

Live summaries were verified by the coordinator on both targets on 2026-10-29.

## WP-3A summary grounding validation (2026-10-29)

- `npm run typecheck`: passed.
- `npm test`: 25 files, 534 tests passed.
- `npm run build && npm run test:browser`: build passed; 11 tests passed,
  1 opt-in live smoke skipped.
- With `/home/kiwi/orca/workspaces/OracleDBPiAgent/needlefish/.env` loaded,
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'`:
  6 files passed; 22 tests passed, 1 live LLM test excluded.
- Fake summaries cover supported and unsupported numbers, rounding, byte
  conversion, identifier exclusion and the disabled grounding switch. Route
  tests cover populated/empty lists and omission without a summary; Playwright
  checks the visible note with a fake report and hostile summary text.
- Coordinator live verification subsequently completed on both targets; see below.
- No shared contract, dependency or grounding checker changes are needed.

### WP-3A live false-positive fix (2026-10-29)

- Added header-first table evidence and exact V$SQL timing aliases without
  changing `src/agent/grounding.ts`; stripped Oracle error codes only from the
  summary copy passed to the checker.
- Regression fixtures reproduce `ORA-01653/ORA-01654`, d1's 1105786158 µs wait
  as 1,106 s, p1's 1537388159 µs wait as 1,537 s, and SQL `4xm1ruvkx3awx`
  elapsed/CPU 1421306349/1402265374 µs as 1,421/1,402 s. All six formerly flagged
  values are accepted; an incorrect 1,206 s remains flagged. Tests also verify
  exact header matching and table boundaries.
- `npm run typecheck`: passed.
- `npm test`: 25 files, 541 tests passed.
- `npm run build && npm run test:browser`: build passed; 11 browser tests passed,
  1 opt-in live smoke skipped.
- Coordinator live reruns on both targets produced **0 flags** after the fix
  (the first run had flagged 5 correct values on d1 and 1 on p1). Both Antigravity
  reviews approved. No contract or dependency changes were needed.

## Saved reports and scheduled diffs (WP-4A)

```sh
npm run piagent -- report --target d1-19c-lab --out /private/reports
npm run piagent -- report --target d1-19c-lab --diff
npm run piagent -- report --target p1-19c-prod --out /private/reports --diff-only
npm run piagent -- report --target p1-19c-prod --diff --json
```

`--out <dir>` saves the ordinary report JSON and Markdown under
`<dir>/<target>/<UTC timestamp>.json` and `.md` (timestamp colons become hyphens).
`--diff` and `--diff-only` imply saving, defaulting to `var/reports`; `--out`
overrides that directory. Comparison loads the latest run **before** saving the
current one. Without these options, output and saving behavior are unchanged.
Target names must be configured and match `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`.
Directories have mode 0700 and files 0600; each file is written to a unique temp
file then renamed, with JSON published last as the run's commit marker. The newest
30 timestamped runs per target are retained, deleting both files of older runs.
Use a private directory owned by the invoking account. Target directory symlinks
are rejected. Repeated saves with the same millisecond timestamp replace that run;
concurrent writers to the same history directory are not coordinated.

`--diff` appends “Changes since <timestamp>” to Markdown; JSON adds a `diff`
object with `target`, `previousGeneratedAt`, `currentGeneratedAt`, `changes` and
`notes`. Each change has `section`, `rule`, `key` and `message`. `--diff-only`
prints only that Markdown section (or `{ "diff": ... }` with `--json`), exiting
0 for no changes and 3 for changes. It cannot be combined with `--summarize`.
A first run establishes a baseline with no changes and exit 0. Other failures
retain the CLI's exit 1. No LLM is used by saving or comparing.

All thresholds are named in `DIFF_THRESHOLDS` in `src/report/diff.ts`:

- New failed runs: match `OWNER`, `JOB_NAME`, `LOG_DATE` in `scheduler_failures`.
- Tablespaces: match `TABLESPACE_NAME`; alert for a rise of at least **5 percentage
  points** or crossing from below **85%** to at least 85%. Primary usage is
  `100 * USED_BYTES / ALLOCATED_BYTES`; the metrics fallback uses `USED_PERCENT`.
  A newly appearing tablespace has no prior usage to compare.
- Top SQL: new `SQL_ID` values only; rank and cumulative counter churn is ignored.
- Optimizer statistics: newly `STALE_STATS=YES` or newly nonempty
  `STATTYPE_LOCKED`, matched by `OWNER`, `TABLE_NAME`; never-analyzed alone is not
  a change. Existing stale tables becoming locked can produce a locked alert.
- Indexes: newly `STATUS=UNUSABLE` or `VISIBILITY=INVISIBLE`, matched by
  `OWNER`, `INDEX_NAME`; partition/subpartition checks also include `INDEX_OWNER`,
  `PARTITION_NAME` and `SUBPARTITION_NAME` as applicable.
- Backups: alert when a completed backup existed within **24 hours** at the
  previous report timestamp but none does at the current timestamp. Uses
  `END_TIME` and `STATUS` beginning with `COMPLETED` (including RMAN warnings).
  Empty-to-empty and already-old-to-still-old do not repeat alerts.
- Availability: alert on either `ok` → `unavailable` or the reverse. Rows are
  compared only when both sections are ok and their source is unchanged.
  Missing sections and changed sources produce notes, without assuming recovery
  or new problems. Notes do not cause exit 3. Unchanged unavailable sections do
  not repeat alerts.

Comparisons use bounded visible snapshots, not a full database change log.
Rows leaving a top-N list and resolved findings are not alerts. Waits, parameters,
long operations and archive counter changes are intentionally outside the rules.
An owner/section selection should remain consistent within a history directory;
use separate output directories for different report scopes.

For cron, load the same environment used for the CLI (including
`PIAGENT_SECRET_DIR`), use absolute paths, and a private output directory. For
example, this emits only changes/baseline information for cron mail:

```cron
0 * * * * /bin/bash -c 'cd /path/to/OracleDBPiAgent && set -a && . /private/piagent.env && set +a && npm run --silent piagent -- report --target p1-19c-prod --out /private/piagent-reports --diff-only'
```

No scheduler, daemon or notification sender is added. Back-to-back integration
checks save only in temporary directories and permit new top SQL IDs from cache
churn; waits are ignored by the deterministic rules.

The public history API is `saveReport(dir, report, config.targets)` and
`loadLatestReport(dir, target, config.targets)` (returns a report or null).
The pure diff API is `diff(previousOrNull, current)` and
`renderDiffMarkdown(result)`. These are separate report modules and require no
shared contract changes.

### WP-4A validation (2026-10-29)

- `npm run typecheck`: passed.
- `npm test`: 28 files, 572 tests passed. Covers every diff rule, thresholds,
  stable keys, source/availability/missing-section handling, private files,
  retention, symlink/path rejection, atomic publication and failure cleanup,
  exact unchanged default output, and diff-only exit codes 0/3.
- With the coordinator environment loaded, the requested
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'` passed:
  7 files, 24 tests passed, 1 LLM test excluded (8.14 seconds).
- Live back-to-back persisted comparisons: d1 at 18:53:52.188Z → 18:53:54.266Z
  and p1 at 18:53:56.418Z → 18:53:57.404Z both returned `changes: []` and
  `notes: []`. All saved test artifacts were temporary and cleaned up.
- Validation deviation: while exposing hidden console logs, a subsequent
  `npm run test:integration -- tests/integration/report-diff.test.ts --disableConsoleIntercept`
  accidentally ran the entire suite because the package script already supplies
  the integration directory and the exclusion filter was omitted. All 25 tests
  passed, including the existing local Strata end-to-end test; running that test
  violated the task's no-LLM instruction and was reported to the coordinator.
  Saving and diffing themselves contain no LLM calls.
- No shared contract or dependency changes are needed. Concurrent-writer history
  serialization and differing owner scopes are outside this implementation;
  use consistent scopes and one scheduled writer per history directory.
