# Single-SQL Performance Insight

Current presentation and refreshed live smokes: [WP-19E](wp-19e-sql-polish.md).
Text candidates now exclude the session user’s diagnostic statements and report
the excluded count. Raw JSON timing remains in microseconds; displayed per-execution
time uses milliseconds with three significant digits. Object status lives on each
statistics row, with one summary per section.

Use the deterministic, read-only CLI without an LLM:

```sh
piagent sql --target d1-19c-lab --sql-id <13-character-sql-id>
piagent sql --target p1-19c-prod --text 'statement fragment' --json
piagent sql --target p1-19c-prod --sql-id <id> --child 0 --markdown
```

Markdown is the default. Choose exactly one selector and one output format.
Invalid options raise SqlUsageError and exit 2. Text lookup escapes LIKE wildcards,
uses binds, and lists at most 10 distinct SQL_ID candidates (an eleventh sentinel
detects truncation). Multiple matches require the operator to choose an ID;
the CLI never picks one. No match produces an empty candidate response.

The public API is exported from src/sqlperf/index.ts:
readSqlInsight(session, { sqlId, child?, maxPlans? }), findSqlCandidates,
renderSqlInsightMarkdown, SqlUsageError and the local SqlInsight types.
No shared contract changes are needed. The caller owns the session lifetime.
The CLI audits query hashes, counts and error codes without bind values.

Each section reports ok, unavailable (with attempted view and Oracle code), or
skipped, and records truncation. The default session row cap applies to reads;
maxPlans defaults to 5 (1–20). Cursor-cache eviction and caps mean these are
bounded observations, not historical workload measurements. The children and
planChanges metrics are cumulative, execution-weighted across observed children;
elapsed and CPU are microseconds. Zero executions yield null ratios.
FIRST_LOAD_TIME is converted in SQL from its server-local VARCHAR2 using
TO_TIMESTAMP, FROM_TZ with the current SYSTIMESTAMP offset, and SYS_EXTRACT_UTC.
TRIM makes blank values SQL NULL; absent times remain empty in the output.
DST caveat: FIRST_LOAD_TIME stores neither a zone nor its historical offset.
Using the server's current offset can be off by an hour for cursors loaded
before a daylight-saving transition (or by the offset change if the server
time zone changed). These UTC values are therefore estimates across such
changes. DATE statistics/last-active times are formatted by the UTC session.

Markdown plans preserve whitespace, pipes and other characters in fenced code
blocks, including V$SQL_PLAN fallback rows. Fence length exceeds any embedded
backtick run. Tables include the union of keys across all rows so each child's
mismatch flags remain visible; summary view names are de-duplicated.

Plans use DISPLAY_CURSOR with TYPICAL, falling back to V$SQL_PLAN for empty,
diagnostic-only or failed display output. Structured plan rows are also fetched
to identify referenced tables/indexes and nested-loop ancestry. Statistics use
DBA_TAB_STATISTICS / DBA_IND_STATISTICS, falling back to ALL views; inaccessible
statistics are never treated as proof of missing statistics. Baselines and
profiles match exact signatures, preserving baseline SQL_HANDLE and PLAN_NAME.
Shared-cursor Y reasons are fetched only above three observed children, using
single-character flag columns discovered through ALL_TAB_COLUMNS.
Bind output contains only child, name, position, datatype and WAS_CAPTURED.
VALUE_STRING is never selected. No password or credential hash column is read.
No AWR, ASH, EXPLAIN PLAN, DML, DDL or procedural execution is used.

Findings contain Check evidence rows for execution-time plan instability,
stale/missing statistics, large full scans on nested-loop inner branches, and
high child counts. A finding is a diagnostic lead, not proof of causality.

## Historical WP-19A Smoke, 2026-11-05

This earlier diagnostic-probe text lookup is intentionally excluded by WP-19E.
Use the workload-based smokes linked above for current validation.

Both approved accounts ran the integration SELECT probe:

```sql
SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS
```

The CLI then found it by SQL text, without a fixed SQL_ID:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- sql --target d1-19c-lab --text 'SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS' --markdown
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- sql --target p1-19c-prod --text 'SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS' --markdown
```

| Target | Status | Children | Plan hash observed | Plan source | Tables / indexes |
|---|---|---|---|---|---|
| d1-19c-lab | ok | 1 | 3166300339 | display_cursor | 11 / 16 |
| p1-19c-prod | ok | 1 | 4081256306 | display_cursor | 11 / 16 |

The repeated Markdown smokes preserved the aligned plan header and its raw
pipes inside triple-backtick fences on both targets. Table/index summaries
named DBA_TAB_STATISTICS and DBA_IND_STATISTICS once each. SQL-converted
first-load values observed were 2026-11-05T15:00:27Z (d1) and
2026-11-05T15:00:29Z (p1). Both hosts currently use UTC; a historical DST
transition was not induced live.

Both reported ok for children, plans, plan changes, statistics, baselines,
profiles and capture metadata. Mismatch reads were skipped because only one
child was observed. IDs and plan hashes are observations only, never fixtures.
Integration tests independently locate this statement via V$SQL on every run,
and clearly skip when approved databases or credential configuration are down.

## Validation

- npm run typecheck: clean.
- npm test: 1,154 passing unit tests.
- PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/sqlperf.test.ts:
  2 passing tests, one per approved target. The full integration suite was
  intentionally not run for this review revision to avoid shared LLM use.
- npm run test:browser: 38 passing, 2 opt-in live tests skipped.

No grants, database changes, dependencies, shared contracts or model changes
are required. The new CLI and core tests cover fallback and unavailable
fixtures; the live smoke does not force cache eviction or revoke privileges.
