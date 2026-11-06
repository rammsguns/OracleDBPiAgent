# WP-23C: web Sessions tab

Implemented on `wp-23c-sessions-web`, against the merged WP-23A JSON API.

The Sessions tab shows findings, a blocker-to-waiter graph using `graphLayout.js`,
a complete nested list, cumulative wait-class bars and event metrics, time-model
statistics, long transactions and active sessions. Status and wait-class filters
operate on the captured active rows. They share a toolbar with Markdown export
immediately above Active Sessions. Snapshot options and Refresh share a compact
wrapping toolbar at the top. Refresh is manual. The captured UTC timestamp
and the sequential-query snapshot limitation are explicit. SQL_ID links open the
SQL tab with the same target and SQL_ID filled in; the operator chooses when to
read SQL insight. Markdown export uses the core renderer, independently of HTML.

`GET /api/db-sessions` uses the shared insight handler: bearer authentication,
approved Host/Origin checks, loopback listening, approved target validation,
server-side option validation, the shared single-flight guard, 1 MiB output cap,
and provider cleanup on success and failure. Supported options are `sections`,
`includeBackground=true|false`, `minTxSeconds=0..86400`, and `topWaits=1..50`.
Unknown options are rejected. Evidence in JSON retains availability, source,
truncation and fallback attempts, without duplicate raw evidence rows, SQL or
binds. Query audit events contain a SQL hash, timing and row counts; errors retain
only an Oracle code or a generic failure code.

## Files

- `src/web/dbSessions.ts`: validation, audited core reader and compact response.
- `src/web/server.ts`: route and injectable reader for tests.
- `src/web/static/dbsessions.js`: structured rendering, filters, graph, SQL links,
  manual refresh, stale-response protection and export.
- `src/web/static/index.html`, `app.js`, `app.css`: tab, keyboard navigation,
  initialization, themes and responsive layout.
- `tests/unit/web-insight.test.ts`: authentication/Host/Origin/method/target and
  options, shared busy guard, response shape, output cap, failures and cleanup.
- `tests/browser/dbsessions-fixture.ts`, `dbsessions.spec.ts`: chain/cycle fixtures,
  both themes and widths, literal hostile text, filters, navigation, export,
  errors, incomplete evidence and stale responses.
- `tests/browser/dbsessions-live-server.ts`, `dbsessions-live.spec.ts`: opt-in,
  Oracle-only capture server and live screenshot test.
- `docs/img/dbsessions-{d1-19c-lab,p1-19c-prod}-{light,dark}-{1280,390}.png`:
  eight replacement live captures, taken 2026-11-06 at 11:36 UTC and individually viewed after merging master.

## Visual verification

Both targets returned live Sessions snapshots. Neither had a blocking chain or
long transaction during capture. The fixture browser tests verify real chain and
cycle rendering without manufacturing database locks or transactions.

Inspected all eight final screenshots: light/dark contrast is readable, controls
fit at phone width, desktop gives Sessions three quarters of the content area,
and wide tables scroll within their own region with an explicit scroll hint.
The two-column time-model table fits entirely, including Seconds, at 390 px. The first inspection caught squeezed
event names/numbers at phone width; minimum table widths fixed that before the
final captures. Browser assertions check no horizontal page scrolling.

The capture-only provider checks the approved endpoint and 19c version, reads its
password only from `PIAGENT_SECRET_DIR`, and executes only classified SELECTs.
It does not issue session alterations or transaction statements. Its fake agent
cannot call an LLM. Product requests retain the existing shared Oracle provider.

## Validation

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 97 files, 1,460 tests passed (56.84 s), after the master merge.
- `npm run test:browser`: 63 passed, 5 opt-in live tests skipped (50.8 s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`: 24 files passed; 58 passed, 1 skipped (the excluded Strata test), 153.87 s.
- `PIAGENT_DBSESSIONS_LIVE=1 PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx playwright test tests/browser/dbsessions-live.spec.ts`: 1 passed (8.3 s); eight replacement screenshots generated.

Dependencies were installed with `npm ci --ignore-scripts` from the unchanged
lockfile because the worktree initially had no local `node_modules`.

## Contracts and limitations

No contract changes requested. No changes to `src/sessions/`, chat conversations,
`src/contracts.ts`, `package.json` or `PLAN.md`; no added dependencies.

Master was merged with `git merge master` (merge commit `e4bc8ef`), bringing in
WP-23F without conflicts. The new captures show per-kind System I/O advice and
exclude idle-class sessions by default. The web continues to render the returned
JSON directly; no sessions-core code was edited in this revision.
Graphs over 80 distinct sessions use the complete list instead; long edge labels
are shortened visually with full text in SVG titles and the list. Cumulative
waits are explicitly distinguished from current activity. Missing or capped
evidence is visible; an empty section is not proof of absence when unavailable.

## Commits

- `980b87f` — Add database Sessions web tab and bounded insight route.
- `d33ee74` — Capture live Sessions layouts on both Oracle 19c targets.
- Final report committed separately on the same branch. No push or merge.

## Coordinator review revision

- Merged master into this branch with a normal merge; no rebase.
- Kept every wide table in a bounded `overflow-x: auto` region, made that
  containment explicit with width/min-width rules, and added a visible scroll
  hint. Removed the unnecessary minimum width from the two-column time model,
  so its Seconds column is visible at phone width without scrolling.
- Added light/dark browser tests at 390 px for **all four tables** (wait events,
  time model, long transactions, active sessions). Each test scrolls to the
  right edge when needed and asserts that every row's last cell is within the
  visible container. The tests also assert no horizontal page scroll.
- Grouped target, idle/background, minimum age, top N and Refresh into one
  wrapping toolbar. Moved status/wait-class filters and Markdown export to
  Active Sessions, and verified their placement in the browser.
- Successful requests now say `Loaded.`; the status adds a note only when a
  section is unavailable. Section-specific availability and cap details remain
  beside their evidence.
- Isolated fixture evidence objects so the unavailable/capped scenario cannot
  contaminate later table-layout tests.
- Retook and personally viewed all eight live screenshots after the merge and
  UI fixes. Both targets had no blocking or long transactions, and no active
  sessions after WP-23F's idle filtering. Chain/cycle and nonempty tables remain
  covered with fixtures. Capture paths and SELECT-only capture provider are
  unchanged; no LLM was called.

Fresh validation results are recorded in the Validation section above.
Revision implementation commit: `468a898`. Replacement screenshots: `c322ece`.
All fresh validation commands passed. No new contract changes or unverified
review requests remain.
