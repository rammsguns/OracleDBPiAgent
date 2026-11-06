# WP-23C: web Sessions tab

Implemented on `wp-23c-sessions-web`, against the merged WP-23A JSON API.

The Sessions tab shows findings, a blocker-to-waiter graph using `graphLayout.js`,
a complete nested list, cumulative wait-class bars and event metrics, time-model
statistics, long transactions and active sessions. Status and wait-class filters
operate on the captured active rows. Refresh is manual. The captured UTC timestamp
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
  eight fresh live captures, taken 2026-11-06 UTC and individually viewed.

## Visual verification

Both targets returned live Sessions snapshots. Neither had a blocking chain or
long transaction during capture. The fixture browser tests verify real chain and
cycle rendering without manufacturing database locks or transactions.

Inspected all eight final screenshots: light/dark contrast is readable, controls
fit at phone width, desktop gives Sessions three quarters of the content area,
and tables scroll within their own region. The first inspection caught squeezed
event names/numbers at phone width; minimum table widths fixed that before the
final captures. Browser assertions check no horizontal page scrolling.

The capture-only provider checks the approved endpoint and 19c version, reads its
password only from `PIAGENT_SECRET_DIR`, and executes only classified SELECTs.
It does not issue session alterations or transaction statements. Its fake agent
cannot call an LLM. Product requests retain the existing shared Oracle provider.

## Validation

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 94 files, 1,370 tests passed.
- `npm run test:browser`: 61 passed, 5 opt-in live tests skipped (49.6 s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`: 23 files passed; 56 passed, 1 skipped (the excluded Strata test), 148.92 s.
- `PIAGENT_DBSESSIONS_LIVE=1 PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx playwright test tests/browser/dbsessions-live.spec.ts`: 1 passed; eight screenshots generated.

Dependencies were installed with `npm ci --ignore-scripts` from the unchanged
lockfile because the worktree initially had no local `node_modules`.

## Contracts and limitations

No contract changes requested. No changes to `src/sessions/`, chat conversations,
`src/contracts.ts`, `package.json` or `PLAN.md`; no added dependencies.

Core advice and idle-session selection remain WP-23F's responsibility. These
captures reflect the merged WP-23A behavior (including its generic dominant-wait
advice and idle-class active rows). The web renders the returned JSON directly.
Graphs over 80 distinct sessions use the complete list instead; long edge labels
are shortened visually with full text in SVG titles and the list. Cumulative
waits are explicitly distinguished from current activity. Missing or capped
evidence is visible; an empty section is not proof of absence when unavailable.

## Commits

- `980b87f` — Add database Sessions web tab and bounded insight route.
- `d33ee74` — Capture live Sessions layouts on both Oracle 19c targets.
- Final report committed separately on the same branch. No push or merge.
