# WP-28E: contiguous report Markdown tables

`renderMarkdown` now builds each header, separator and all data rows as one
newline-joined block. Section headings, source, notes and tables remain separated
by one blank line. Escaping, byte formatting, empty/unavailable sections and
partial security evidence keep their existing behavior. JSON is unchanged.

Changed files:
- `src/report/index.ts`: group table lines before joining section blocks.
- `tests/unit/report.test.ts`: render a generated two-section report, split it
  into paragraph blocks and verify complete contiguous tables and section spacing.
- `tests/unit/fixtures/report-master.json`: correct Markdown only; JSON unchanged.
- `tests/unit/report-history.test.ts`: verify latest/history loading with a saved
  legacy Markdown sibling containing blank lines between table rows.
- `tests/unit/report-summary.test.ts`: check supported and unsupported timing
  claims against both legacy and contiguous layouts.
- `docs/wp-28e-report-tables.md`: audit and validation record.

## Renderer and consumer audit

| Module | Finding |
| --- | --- |
| report | Fixed the paragraph join that split every table row. The space snapshot has no populated tables and needs no update. |
| sessions | Both wait-event and generic tables join lines with single newlines. |
| space | Generic table header, separator and rows are contiguous. |
| security | Finding tables use single-newline line joins. |
| sqlperf | Table helper appends header/separator/rows and joins lines once. |
| alertlog | Alert and incident tables join lines with single newlines. |
| drift | Emits lists rather than Markdown tables. Consumes report JSON. |
| plsql | Emits lists/source appendix rather than Markdown tables. |
| triage | Evidence and alert tables are prejoined with single newlines. Snapshot embedding changes headings and filters skipped sections without splitting table lines. Embeds sessions/SQL snapshots, not the main report. |
| web | Report/history/diff render structured JSON into DOM tables; no report Markdown parser. Conversation Markdown export already has contiguous trace rows. |
| report history/trends/diff | Load JSON snapshots; legacy Markdown siblings do not affect loading. No migration needed. |
| summary evidence | Parser explicitly skips blank lines before separators and accepts both layouts; dual-layout regression test added. No LLM called. |

No same-defect findings outside report to assign to the coordinator. No contract,
package, dependency or PLAN changes needed. Missing dependencies were supplied by
the authorized `node_modules -> ../needlefish/node_modules` symlink.

## Validation

Integration uses the packaged lab target
file and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.
The Strata end-to-end test and both FREEPDB1 refusal tests are excluded to honor
this task's two-lab-only/no-Strata restriction. No database changes were made.

Completed checks:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
PASS (no diagnostics)

npm test -- --maxWorkers=2
Test Files  105 passed (105)
Tests       1789 passed (1789)
Duration    69.94s

npx vitest run tests/unit/report-summary.test.ts --maxWorkers=2
Test Files  1 passed (1)
Tests       17 passed (17)
Duration    586ms

npm run test:browser
6 skipped
71 passed (59.3s)
```

Browser skips are opt-in live tests (including the real Strata question); the
standard browser suite uses fake services. Focused report/history/space/security
checks also passed: 4 files, 93 tests. `git diff --check` passed.

```text
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
PIAGENT_TARGETS_FILE="$PWD/config/targets.json" \
npm run test:integration -- --testNamePattern='^(?!.*(?:answers one end-to-end ask through local Strata|out-of-scope database at the gate only|refuses localhost:1521/FREEPDB1)).*$'
Test Files  27 passed (27)
Tests       61 passed | 3 skipped (64)
Duration    207.19s
```

All selected integration tests passed. The three skips are the explicitly
excluded Strata/gate cases. No live Strata answer, FREEPDB1 refusal, or external
Markdown viewer was exercised; table syntax is verified by the contiguous-block
unit test. Older saved history and timing-evidence compatibility are covered.
