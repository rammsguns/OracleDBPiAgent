# WP-24B: space report and drift

Implemented on branch `wp-24b-space-report`, 2026-11-06.

## Delivered

- Opt-in `report --sections space`, using the merged `readSpaceUsage` API. No new SQL and no edits to `src/space/`.
- Saved scalar metrics for used bytes per tablespace, temp tablespace usage, and configured FRA usage. JSON retains raw bytes; Markdown labels binary units.
- Days to the autoextend maximum, with centered ordinary least squares in days over at least three distinct timestamps spanning at least 24 hours. Remaining capacity is measured from the newest observed usage, divided by fitted bytes/day; full capacity gives zero days. Flat or negative slopes say `not growing`; insufficient evidence says `not enough history`.
- Forecasts use the latest contiguous compatible saved samples plus the current observation. Missing/unavailable evidence, a changed reader source or a changed maximum breaks the fit. Instance restarts do not reset space gauges, and no startup SQL was added.
- History byte series with gaps for missing or incomplete evidence. The diff marks tablespace growth-rate changes when both snapshots have fitted rates and the same maximum. Floating-point differences below max(0.000001 bytes/day, previous absolute rate × 1e-9) are ignored.
- `drift --scope space` compares tablespace membership, contents, bigfile and maximum bytes; redo group count and the sorted multiset of sizes; FRA configuration and limit. Usage, paths, redo group numbering and runtime statuses do not participate. Unavailable or capped evidence withholds the affected comparison. Existing exit handling returns 3 when drift is present.
- Existing default report and all existing drift scopes have byte snapshots (JSON and Markdown), generated against the pre-change implementation with fixed timestamps and empty query fixtures, then verified against this implementation.

## Files changed

- `src/report/space.ts`: audited reader adapter, metric validation, compatible history and growth math.
- `src/report/index.ts`: section allowlist, opt-in collection and binary Markdown formatting.
- `src/report/trends.ts`: space byte series.
- `src/report/diff.ts`: fitted growth-rate markers.
- `src/drift/space.ts`: configuration projection and comparison.
- `src/drift/index.ts`: scope validation and dispatch.
- `tests/unit/report-space.test.ts`, `tests/unit/drift-space.test.ts`, `tests/unit/__snapshots__/report-space.test.ts.snap`.
- `tests/integration/report-space.test.ts` and this document.

## Validation

Dependencies were absent in this worktree, so existing locked dependencies were installed using `npm ci --ignore-scripts`. No dependencies or lockfiles changed.

Commands and results:

```text
npm run typecheck
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files 101 passed (101)
Tests      1569 passed (1569)

npx vitest run tests/unit/report-space.test.ts tests/unit/drift-space.test.ts --maxWorkers=2
Test Files 2 passed (2)
Tests      23 passed (23)

PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
Test Files 26 passed (26)
Tests      61 passed | 1 skipped (62)
```

The excluded test is the requested Strata end-to-end test. No Strata calls were made. The integration checks include space reports on both approved targets, drift self-comparisons without drift, and a complete cross-target comparison with drift.

Live CLI smokes, with `PIAGENT_SECRET_DIR` set as above:

```text
npm run piagent -- report --target d1-19c-lab --sections space
exit 0; generated 2026-11-06T15:41:53.166Z

npm run piagent -- report --target p1-19c-prod --sections space
exit 0; generated 2026-11-06T15:41:54.332Z

npm run piagent -- drift --left d1-19c-lab --right p1-19c-prod --scope space
exit 3; complete comparison
```

The d1 report contained five tablespaces and the p1 report six. P1-only `SHOP_DATA` was permanent, smallfile, with maximum 4,294,967,296 bytes (4 GiB). Redo size/count and FRA configuration matched. Neither target had a configured FRA. Both reports correctly displayed `not enough history` for forecasts. No live 24-hour history was fabricated; positive, noisy, flat, negative, short-span, invalid and capacity-boundary cases were verified using unit fixtures.

## Contracts and coordinator follow-up

No changes are needed to `src/contracts.ts`, `package.json` or `PLAN.md`; none were edited. The local `ReportOptions` adapter adds optional `historyDirectory`, defaulting to the existing `reportDirectory()` (including `PIAGENT_REPORT_DIRECTORY`). Existing history JSON schema is unchanged.

One CLI wiring change is outside this WP's owned paths: in `src/cli/index.ts`, pass `historyDirectory: out` to `generateReport` alongside `target`, `owner` and `sections`. This makes an explicit custom `report --out DIR` also select DIR for forecasting. Until the coordinator adds that line, forecasts read the default/environment history directory even when the CLI saves to a different `--out`; programmatic callers can already pass `historyDirectory`. Use `PIAGENT_REPORT_DIRECTORY=DIR` with the same `--out DIR` as the current CLI workaround. No CLI files were edited.

Database activity used only the existing space reader and approved read-only providers. No secrets were printed or copied. No changes were made to other projects, services or containers. No push or merge was performed.
