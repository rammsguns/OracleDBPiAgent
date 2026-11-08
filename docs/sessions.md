# Sessions, blocking and waits

Run this command against an approved Oracle 19c target:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- sessions --target p1-19c-prod
npm run piagent -- sessions --target d1-19c-lab --json
npm run piagent -- sessions --target p1-19c-prod --section blocking,transactions --min-tx-seconds 60
npm run piagent -- sessions --target p1-19c-prod --all --top 20 --markdown
```

Markdown is the default. Findings precede active sessions, the indented blocking
tree, cumulative waits, the time model and long transactions. Empty and skipped
sections collapse. SQL IDs in the tree and findings include a
`piagent sql --target T --sql-id X` command for further investigation.
Findings do not change the exit status.

Options:

| Option | Meaning |
| --- | --- |
| `--target T` | Required approved target |
| `--section a,b` | Any of active, blocking, waits, timeModel, transactions; default all |
| `--all` | Include background and Idle-waiting active sessions; blockers always included |
| `--min-tx-seconds N` | Integer 0–86400, default 300 |
| `--top N` | Top N events across all non-idle classes, 1–50, default 10 |
| `--json` / `--markdown` | Mutually exclusive formats |

Exit 0 means usable evidence (including findings or a partial snapshot), 2 means
invalid usage, and 1 means a connection/query failure or all requested sections
unavailable. Missing grants (ORA-00942 / ORA-01031) affect individual sections.
Unexpected errors propagate to the CLI's safe error boundary.

The snapshot is a short sequence of SELECTs, not one consistent read. Sessions,
locks and transactions may vanish between queries. Missing blocker sessions remain
visible as placeholders. Trees stop at ten edges and mark cycles as a deadlock in
progress. The view never creates locks or transactions to demonstrate blocking.

Wait totals, class percentages, event percentages and average milliseconds are
**cumulative since instance startup, not current activity**. Percentages use all
non-idle events before the top-N display limit; classes with no displayed event
still show their aggregate. Time-model seconds include DB time, DB CPU,
background elapsed time and background CPU time.

Active rows exclude the reader's SID and use SQL_ID, falling back to PREV_SQL_ID.
By default, active rows must have STATUS ACTIVE and a non-Idle wait class.
`--all` also includes Idle waits and background sessions. Blockers remain in the
active table regardless of status, type or wait class, including when only the
active section is requested. The blocking snapshot also reads inactive sessions,
so an idle-in-transaction blocker remains visible. Wait chains are queried first; missing access falls back
to V$SESSION blocking and final-blocking pointers. Object names fall back from
DBA_OBJECTS to ALL_OBJECTS. TX, TM and UL locks and modes 0–6 have readable names;
other lock types retain their Oracle code.

Oracle DATE wall clocks (logon and transaction start) are interpreted in the
database server's SYSTIMESTAMP time-zone region/offset and emitted as UTC strings.
The approved containers use UTC. Age uses server SYSDATE, avoiding client clock
differences.

Reads respect the configured session row cap, paging ordered results up to 10,000
rows per query. A remaining row cap is marked partial. Paging is also part of the
non-atomic snapshot caveat. Missing auxiliary lock/object grants mark blocking
details unavailable, while preserving any available tree.

No SQL text, bind capture, application session metadata, ASH, AWR or historical
Diagnostics Pack views are read. The command does not call an LLM. Audit records
contain query hashes and outcome metadata, without credentials or bind values.

## Exported API for WP-23B and WP-23C

Import from `src/sessions/index.ts`:

- `readSessionActivity(session, options?)`: options are `sections?: string[]`,
  `includeBackground?: boolean`, `minTxSeconds?: number`, `topWaits?: number`.
- `SessionActivity`: overall ok/partial/failed, target, capturedAt ISO UTC,
  self.sid, five typed sections and findings.
- Each `SessionSection<T>` has status, typed rows, primary `evidence: Check`,
  `supportingEvidence: Check[]` for supplementary/fallback reads, and optional note.
- `buildBlockingTree(SessionRow[])` returns `BlockingNode[]`, with SID,
  optional session, children, cycle, depthLimited and vanished.
- `classifyWaits(WaitRow[])` returns descending `WaitClass[]`: waitClass,
  seconds, percent and events; it is pure and does not impose display limits.
- `renderSessionsMarkdown(activity)`, `validateSessionsOptions(options)`,
  `SessionsUsageError`, `SECTION_IDS` and the row/finding types are exported.

WaitRow uses seconds (not Oracle microseconds), totalWaits, averageMs and percent.
TransactionRow uses ageSeconds, undoBlocks, undoRecords and UTC startTime.
SessionRow uses blockerSid/finalBlockerSid, sqlId, status, secondsInWait, object,
lockType and lockMode. No shared-contract changes are required.

## Live smokes — 2026-11-06 UTC

Executed the JSON command above for each target with the approved secret directory.
Both exited 0; every section was ok and no evidence was truncated.

| Target | Captured at UTC | Active users | Blocking roots | Wait classes | Time-model rows | Long transactions |
| --- | --- | --- | --- | --- | --- | --- |
| d1-19c-lab | 2026-11-06T05:59:46.574Z | 0 | 0 | 9 | 4 | 0 |
| p1-19c-prod | 2026-11-06T05:59:49.584Z | 2 | 0 | 9 | 4 | 0 |

Each produced one informational finding: System I/O exceeded half of cumulative
non-idle wait time. These observations describe those snapshots only.
Markdown smokes also exited 0 on both targets (d1 at 2026-11-06T06:02:26.492Z and
p1 at 2026-11-06T06:02:29.369Z). The p1 background/active-only JSON smoke
exited 0 at 2026-11-06T06:02:31.777Z and returned 86 active rows
(84 background), with other sections skipped.
The integration tests independently verify the structure and all five section
statuses on each target. Blocking chains, cycles, vanished blockers, idle
transactions and missing grants are tested with unit fixtures; no workload or
locks were created.

## WP-23F live smokes — 2026-11-06 UTC

Re-ran Markdown and JSON commands on both approved targets using the secret
directory above. All commands exited 0. JSON snapshots had every section ok,
no truncated evidence, no blockers and no long transactions.

| Target | JSON captured at UTC | Active rows | Wait classes | Time-model rows |
| --- | --- | --- | --- | --- |
| d1-19c-lab | 2026-11-06T06:24:14.679Z | 0 | 9 | 4 |
| p1-19c-prod | 2026-11-06T06:24:17.734Z | 0 | 9 | 4 |

A p1 `--all --section active --json` smoke exited 0 at
2026-11-06T06:24:20.278Z: 86 active rows, all waiting in Idle. Other sections
were skipped. No LLM was called and no workload, locks or transactions were created.

Markdown excerpts from final smokes follow. Activity can change between reads.

```markdown
# Sessions — d1-19c-lab

Captured at 2026-11-06T06:25:28.719Z (UTC). Status: ok.

Snapshot is a short sequence of queries, not one consistent read. Sessions may vanish between queries.

## Findings

- **info: System I/O** — 61.2% of non-idle wait time since startup. For a human DBA: Investigate redo/control file and DBWR storage latency. This figure is cumulative since startup, not current activity.

## Active sessions

<details><summary>No rows</summary>

No rows in this snapshot.

</details>
```

```markdown
# Sessions — p1-19c-prod

Captured at 2026-11-06T06:25:31.456Z (UTC). Status: ok.

Snapshot is a short sequence of queries, not one consistent read. Sessions may vanish between queries.

## Findings

- **info: System I/O** — 67.8% of non-idle wait time since startup. For a human DBA: Investigate redo/control file and DBWR storage latency. This figure is cumulative since startup, not current activity.

## Active sessions


| SID | User | Status | SQL_ID | Event | Wait class | Seconds in wait |
| --- | --- | --- | --- | --- | --- | --- |
| 227 | HARNESS_RO | ACTIVE | c4mrqh3jtn0ns | PGA memory operation | Other | 0 |
```

The active table selects at most eight columns: SID, user, status, SQL_ID, event,
wait class, seconds in wait and blocker. Columns empty in every row are hidden;
zero remains a value. The ROW_WAIT_OBJ# sentinel -1 renders blank, and JSON retains
all fields and the original sentinel. Ok section headers omit their status line;
notes remain visible, as do unavailable/skipped statuses. Findings now have advice
specific to their kind; dominant-wait advice is class-specific and explicitly
cumulative since startup.

## Live PDB verification (2026-11-08)

C1/PIPDB1 was verified live. The Oracle 19c-specific V$LOCK collector uses a query-local `/*+ RULE */` hint to avoid an Oracle 19.9 PDB plan that spills heavily to TEMP and times out (NJS-123); no grants or session optimizer settings are changed. See [WP-31A](wp-31a-pdb-live.md).


The hint is a workaround for the Oracle 19.9 PDB cost-based optimizer (CBO) stall observed on C1: the unhinted fixed-view query spills to TEMP and exceeds the 30-second statement timeout even as SYS; the hinted query returned in approximately 0.18 seconds. RULE is deprecated and is deliberately confined to this fixed query, with no session/database optimizer changes. The product supports Oracle 19c only. Revalidate this workaround when applying a different 19c release update; it is not a compatibility claim for later Oracle versions.
