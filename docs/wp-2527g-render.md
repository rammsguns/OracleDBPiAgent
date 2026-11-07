# WP-2527G: release 1.5.0 rendering polish

Backup Markdown now renders per-datafile backups, archive gaps, recovery-area
balances and all named evidence sections as contiguous escaped tables. Empty
sets say `None.`. Display tables show at most 100 rows and report the exact
number omitted with `N more rows; use --json`. Existing query caps and partial
evidence warnings remain in force. Byte columns use binary human units.

Jobs Markdown and the web Jobs timeline and evidence tables display Oracle
INTERVAL DAY TO SECOND objects as compact durations, including days, negative
values and fractional seconds (nanoseconds, with trailing zeroes removed).
Formatting applies to any interval object, rather than only RUN_DURATION;
JSON evidence remains intact.

Top now derives load/host scope from the same isCdb identity flag as backup:
`Database-wide (non-CDB)` on both labs and `CDB-wide (shared by all PDBs)`
for PDB identity. Web Top consumes those scope fields unchanged. Chat `/top`
uses the shared Markdown renderer, verified by the live integration test.
Text output has a heading, scope, contiguous ranking/load/host tables, explicit
`none in this interval` for empty rankings, human byte units and SQL drill-down
commands. Counter rules, findings, SQL, redaction and data caps are unchanged.

## Changed files

- `src/backup/index.ts`, `src/backup/markdown.ts`: Markdown rendering and escaped table helper.
- `src/jobs/index.ts`, `src/jobs/duration.ts`: display-only interval formatting.
- `src/top/index.ts`: identity-based scope and Markdown text rendering.
- `src/web/static/operations.js`: Jobs display-only interval formatting.
- Unit backup/jobs/render-polish tests, browser operations fixtures/assertions,
  and integration-features chat scope assertions.
- This report and `docs/wp-2527g-render/` captures and test logs.

## Verification

Before/after captures in `wp-2527g-render/` use the requested CLI commands on
d1-19c-lab and p1-19c-prod: backup, jobs --since 7d, top --seconds 5.
Captures are independent live samples, so times, job runs and deltas differ.
The captures demonstrate display caps, empty rankings, host memory units and
interval display. Top reports partial SQL evidence when its existing snapshot
cap is reached; actual elapsed intervals can exceed the requested five seconds
because sequential snapshot reads take time.

No shared contract changes are needed. No live CDB/PDB is available; PDB scope
is covered by existing unit tests. Browser tests use fake services by default;
live browser tests skip unless explicitly enabled.

Final checks:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 120 files, 2,211 tests passed.
- `npm run test:browser`: 83 passed, 7 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=… npx vitest run tests/integration/backup.test.ts tests/integration/jobs.test.ts tests/integration/top.test.ts tests/integration/integration-features.test.ts --no-file-parallelism`: 4 files, 9 tests passed (146.21 seconds), no skips.

The integration command names the four files directly because the npm script
already includes the entire integration directory. No LLM calls were requested
by these four integration files or the CLI captures. Browser tests use mocked
chat responses. Captures/logs have terminal trailing blank lines removed.
