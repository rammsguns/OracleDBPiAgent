# WP-19C: SQL web drill-down

Implemented on `wp-19c-sql-web` against the merged WP-19A API.

`GET /api/sql?target=d1-19c-lab&sqlId=<id>` returns `{ result, markdown }`.
`GET /api/sql?target=p1-19c-prod&text=<fragment>` returns up to ten
`{ sqlId, text }` candidates plus `truncated`. A candidate must be selected
explicitly, even when there is only one match. Exactly one input is required.
Authentication, approved Host/Origin and target checks, shared insight request
lock, session cleanup and the 1 MiB output cap follow the Alert Log route.
Every SQL read is audited by hash, row count and timing; bind values and
credentials are not recorded. No LLM is used by either API path.

The SQL tab shows findings, per-section availability (with source views and
failed fallback attempts), a parent-ID plan tree, DISPLAY_CURSOR disclosure,
plan changes with best/worst badges, table/index statistics, cursor children,
plan controls, bind metadata, mismatch reasons and Markdown export. Older
triage responses without `result.sql` remain valid. An optional SqlInsight in
that field uses the same renderer.

Changed product files:
- `src/web/server.ts`, `src/web/sql.ts`
- `src/web/static/sql.js`, `app.js`, `app.css`, `index.html`, `insight.js`

Changed/added tests:
- `tests/unit/web-insight.test.ts`
- `tests/browser/fake-server.ts`, `sql-fixture.ts`, `sql.spec.ts`
- `tests/browser/sql-live-server.ts`, `sql-live.spec.ts`
- `tests/integration/web-sql.test.ts`

## Live capture review

Eight full-page images in `docs/img/sql-<target>-<theme>-<width>.png` cover both
targets, light/dark and 1280/390 px. The opt-in capture server replaces health
and agent paths with local stubs; its prompt throws if invoked. Discovery uses
read-only V$SQL_PLAN queries for cached SH.SALES / SHOPAPP.ORDERS statements,
never hard-coded SQL_IDs. The existing p1 INSERT cursor shown in the capture is
only inspected; its SQL is never executed by this feature or these tests.

Visual review found wrapping of short stats badges and deep plan operations on
phones. The final CSS keeps badges and plan lines intact, makes evidence
containers independently scrollable, and preserves PARENT_ID indentation.
Tables retain readable column widths and intact numbers; fractional metrics
are displayed to at most three decimal places. Markdown retains core values.
Final captures show readable teal/amber badges in both themes, coherent
parent/child alignment on the deep d1 plan, and the p1 stale-stat finding ahead
of the detailed sections. Assertions prove no horizontal page scroll at either
width. Wide tables and plan text scroll locally; table/tree regions are
keyboard-focusable. Stub browser tests also exercise long display text,
multiple plans, best/worst, unavailable, missing stats, hostile text, cache miss,
empty candidate search, errors, export reset and optional triage SQL.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 77 files, 1156 tests passed.
- `npm run test:browser`: 44 passed, 3 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/web-sql.test.ts`: 2 passed (d1 and p1).
- `PIAGENT_SQL_LIVE=1 PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx playwright test tests/browser/sql-live.spec.ts`: 1 passed, eight live captures.

No shared contract changes needed. No changes to PLAN.md, package.json or
src/contracts.ts. WP-19B's actual producer is not merged in this worktree;
its optional SqlInsight consumer is verified with browser fixtures. Live
multiple-plan regression and unavailable grants are fixture-tested rather than
created on the databases. Strata and the full integration suite were not run.
