# Single-SQL performance insight (WP-19A)

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
All times are UTC. FIRST_LOAD_TIME is normalized from Oracle's cache string,
and DATE statistics/last-active times are formatted by the UTC database session.

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

## Live smoke, 2026-11-05

Both approved accounts ran the integration SELECT probe:

```sql
SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS
```

The CLI then found it by SQL text, without a fixed SQL_ID:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- sql --target d1-19c-lab --text 'SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS' --json
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- sql --target p1-19c-prod --text 'SELECT /* piagent_sqlperf_live_probe */ COUNT(*) FROM ALL_OBJECTS' --json
```

| Target | Status | Children | Plan hash observed | Plan source | Tables / indexes |
|---|---|---|---|---|---|
| d1-19c-lab | ok | 1 | 3166300339 | display_cursor | 11 / 16 |
| p1-19c-prod | ok | 1 | 4081256306 | display_cursor | 11 / 16 |

Both reported ok for children, plans, plan changes, statistics, baselines,
profiles and capture metadata. Mismatch reads were skipped because only one
child was observed. IDs and plan hashes are observations only, never fixtures.
Integration tests independently locate this statement via V$SQL on every run,
and clearly skip when approved databases or credential configuration are down.

## Validation

- npm run typecheck: clean.
- npm test: 1,150 passing unit tests.
- PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration:
  46 passing tests, including both SQL insight target tests.
- npm run test:browser: 38 passing, 2 opt-in live tests skipped.

No grants, database changes, dependencies, shared contracts or model changes
are required. The new CLI and core tests cover fallback and unavailable
fixtures; the live smoke does not force cache eviction or revoke privileges.
