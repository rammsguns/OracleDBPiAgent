# WP-24C: web Space tab

Implemented the Space tab and authenticated `GET /api/space` using the merged `src/space/` API. The route validates target, sections, owner, top (1–100), and the Oracle-maintained-owner flag before opening sessions. It shares the other insight routes' loopback Host/Origin checks, bearer authentication, single-flight lock, 1 MiB response cap, private errors, and session cleanup. Query audit events contain SQL hashes and metadata, without bind values. Web evidence excludes SQL, binds, and duplicate raw query rows.

The tab shows findings first, captured-at UTC, tablespace bars and file configuration, owner-filtered top segments, temp consumers, undo history, redo configuration and FRA. Bars distinguish solid used space, diagonally hatched allocated free space and vertically hatched autoextend capacity. Text gives used and allocated bytes, free space, autoextend maximum, headroom, both usage percentages, and fixed-file status. Dashed markers identify the documented 85% and 95% thresholds. There is manual refresh and Markdown export, with stale results and exports cleared when inputs change. Database text uses DOM text nodes. Tables scroll in focusable, labelled regions; the toolbar wraps at phone width.

The arrow-key tab array now matches the DOM order: Tool trace, Audit, Report, Drift, PL/SQL, SQL, Sessions, Space, Security, Alert Log, Triage. Browser coverage checks forward/backward traversal, wrapping, Home and End.

Files changed:

- `src/web/space.ts`: validation, audited reader adapter and compact response.
- `src/web/server.ts`: route and optional reader seam for tests.
- `src/web/static/space.js`: rendering, toolbar, filters and Markdown download.
- `src/web/static/app.js`, `index.html`, `app.css`: tab wiring, keyboard order and responsive styles.
- `tests/unit/web-insight.test.ts`: route authentication, validation, shared lock, response cap, evidence redaction and cleanup.
- `tests/browser/space-fixture.ts`, `space.spec.ts`: hostile database text, wide tables, themes, mobile layout, export, errors, incomplete evidence, stale responses and keyboard navigation.
- `tests/browser/space-live-server.ts`, `space-live.spec.ts`: opt-in live screenshot capture with a SELECT-only provider, approved endpoint/account verification and a 19c gate. Health and agent seams prevent all Strata calls.
- Eight `docs/img/space-{d1-19c-lab,p1-19c-prod}-{light,dark}-{1280,390}.png` files and this report.

Validation:

- `npm run typecheck`: passed (exit 0).
- `npm test -- --maxWorkers=2`: 97 files passed; 1,479 tests passed (exit 0).
- `npm run test:browser`: 69 passed, 6 opt-in live tests skipped (exit 0).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets PIAGENT_SPACE_LIVE=1 npm run test:browser -- tests/browser/space-live.spec.ts`: 1 passed (exit 0). Fresh SELECT-only data from both approved targets; eight screenshots captured. Viewed every screenshot individually and checked wrapping toolbar, readable usage labels, all cards, contained tables and themes. Automated assertions confirmed no page-level horizontal scroll in all eight configurations; fixture tests also scrolled every wide table through its last column.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: 24 files passed; 58 tests passed, 1 skipped (the excluded Strata case); exit 0.

Contract changes needed: none. The only additive web interface is the local optional `WebServerOptions.readSpaceUsage` test seam; no shared contracts need changes. `src/space/`, `src/contracts.ts`, `package.json` and `PLAN.md` were left unchanged. No dependencies were added; `npm ci --ignore-scripts` restored existing lockfile dependencies in this worktree. No Strata calls, model changes, grants or database writes were introduced. No pushes or merges.

Limitations: screenshots capture a sequence of SELECTs rather than a consistent point-in-time snapshot. Live targets currently have no FRA configured; the populated FRA path uses the same generic record table renderer as the other capacity cards. The Strata end-to-end integration case is deliberately excluded as requested.

Commits: `5f0c586` contains the implementation and fixture coverage; a following documentation commit contains the SELECT-only live capture harness, screenshots and this report.
