# WP-24A: space core and CLI

Implemented on `wp-24a-space`. No shared contract changes or additional grants/dependencies are needed.

## Delivered

- `src/space/index.ts`: `readSpaceUsage`, `renderSpaceMarkdown`, `SpaceUsageError`, `tablespaceHeadroom`, `formatBytes`, exported report/section/row/options types, option validation and deterministic findings.
- `src/space/sql.ts`: SELECT-only catalogs for tablespaces, segments and LOB ownership, temp files/current usage/consumers, undo files/extent statuses/24-hour statistics/retention, redo groups/members, and recovery area/file types.
- `src/space/cli.ts` and the `space` registration in `src/cli/index.ts`: validated filters, Markdown/JSON, hashed SQL audit events, cleanup and required exit codes. No LLM use.
- `tests/unit/space.test.ts`: mixed autoextend files, invalid maxima, bigfiles, free-space fallback, LOB and partition mapping, no FRA, both grant-error codes for every query, partial/failed results, unexpected errors, catalog pagination, finding boundaries, Markdown safety and compactness, parser-based source SQL scan and forbidden/write rejection cases.
- `tests/unit/space-cli.test.ts`: CLI usage failures, target requirement and help.
- `tests/integration/space.test.ts`: all six sections on d1 and p1, headroom invariants, top limits and owner filters.
- `docs/space.md`: usage, units and semantics, timestamped live reports on both targets and independently written SELECTs with observed results. Separate CLI smokes also exited 0: d1 Markdown and p1 JSON.

Markdown puts findings first, displays binary units and usage bars, hides columns empty throughout a table, collapses empty sections, and puts tablespace configuration/file paths in a disclosure. It has no `Status: ok` lines. JSON retains raw bytes and evidence. Missing grants isolate their section; unexpected database failures propagate.

## Consumer API notes

`tablespaceHeadroom(files)` accepts `{ bytes, maxBytes, autoextensible, path? }[]` and returns `{ allocatedBytes, maxBytes, headroomBytes }`. This helper's headroom is expansion beyond current allocation; each autoextend maximum is clamped to at least current bytes. Report tablespace rows instead expose usable headroom as maximum minus used bytes, plus allocated/maximum usage percentages and file details.

Tablespace rows have a dedicated exported type. Other sections use exported `SpaceRow` records: temp, undo, redo and recovery distinguish their subcategories with `kind` (`File`, `Usage`, `Consumer`, `Extent status`, `Last 24 h`, `Group`, `Member`, `Area`, `File type`). Sections carry primary `evidence` and `supportingEvidence`. Selected sections determine overall status; unselected sections are `skipped`. Catalog paging respects the session cap, with a 10,000-row ceiling; incomplete evidence makes the report partial.

No edits to sessions, shared contracts, package manifests, PLAN, report/triage/web code or other projects. No database writes, forbidden catalog reads, Strata calls, pushes or merges.

## Verification

`npm run typecheck`: passed, exit 0.

`npm test -- --maxWorkers=2`:

```text
Test Files  96 passed (96)
     Tests  1446 passed (1446)
  Duration  53.69s
```

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`:

```text
 Test Files  24 passed (24)
      Tests  58 passed | 1 skipped (59)
   Start at  01:11:16
   Duration  147.40s (tests 95%, import 4%)
```

Passed, exit 0. The one skipped test is the explicitly excluded Strata end-to-end ask. Both space integration tests passed, including owner filters.

## Limits of live verification

All six sections were `ok` on both approved Oracle 19c targets. Independent checks matched tablespace allocated/maximum/used bytes, redo configuration and the top segments; live temp/undo/FRA observations are recorded alongside the report. Neither target has a configured FRA. High-capacity and error findings, missing grants, malformed maxima and synthetic bigfile/LOB scenarios were verified with fixtures, without changing databases to manufacture them. Current usage may change between SELECTs; the report labels this snapshot limitation. Growth/history integration belongs to WP-24B.
