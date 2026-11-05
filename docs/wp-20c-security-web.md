# WP-20C: Web Security Tab

Implemented on `wp-20c-security-web`, 2026-11-05.

The Security tab reads the existing security core without an LLM. Findings appear
in High, Medium, Low, Info order with a severity filter, readable Subject / Finding /
Evidence tables, compact status chips, and prose advice for a human DBA. Check
Status and Evidence sections start collapsed for successful reads and expanded for
unavailable/skipped checks. Findings stay visible even when their evidence read
succeeded: `ok` never means the database is secure. Missing views, Oracle error
codes, incomplete evidence, caps, and qualification notes remain visible.

An optional OWNER.OBJECT input includes who-can findings, a graph, and a full path
list. The graph reuses `drawGraph` from the PL/SQL tab with optional labels and
without collapsing SYS objects or showing the PL/SQL operation legend. Existing
PL/SQL defaults remain unchanged. Each route is independent so separate grants do
not imply combined reachability. Paths run left to right; source and privilege
appear on nodes. The graph renders at most 60 routes, explicitly discloses that
limit, and preserves every returned route in the list. Its viewport scrolls locally.
Markdown export downloads the complete result, independent of the severity filter.
Changing target/object invalidates old content and exports; delayed responses are
ignored. Rendering uses DOM APIs and textContent throughout.

## API

`GET /api/security?target=d1-19c-lab&whoCan=HR.EMPLOYEES` (whoCan optional)
returns `{ result, markdown }`. It shares `/api/sql` authentication, Host/Origin
checks, approved target validation, single-flight lock, session cleanup, private
error responses, and the 1 MiB serialized response cap. Object validation happens
before opening sessions. Each executed SELECT is audited with a SQL hash, row
count, truncation and elapsed time, with only an Oracle code on failure. Binds,
credentials and raw SQL are not added to audit records.

The local web presentation shape retains evidence columns/rows once per check;
findings and paths carry only evidence source, status, caps and attempt codes.
SQL/binds are omitted from the web evidence. This avoids repeating full dictionary
results per finding: the initial live d1 response hit the 1 MiB guard. Full evidence
rows are still available inside each check, including complete audit policy options.
Markdown is generated from the original core result. No shared contract changes
are needed; the sole server option addition is an injectable `readSecurityPosture`
reader for tests. No dependencies were added.

## Live Captures and Visual Review

All images use actual approved read-only Oracle sessions, d1 HR.EMPLOYEES and p1
SHOPAPP.ORDERS. The dedicated capture server disables health/model calls and uses
an agent stub that throws if prompted. No query was run to create fixtures.

| Target | Light 1280 | Dark 1280 | Light 390 | Dark 390 |
| --- | --- | --- | --- | --- |
| d1 | [Image](img/security-d1-19c-lab-light-1280.png) | [Image](img/security-d1-19c-lab-dark-1280.png) | [Image](img/security-d1-19c-lab-light-390.png) | [Image](img/security-d1-19c-lab-dark-390.png) |
| p1 | [Image](img/security-p1-19c-prod-light-1280.png) | [Image](img/security-p1-19c-prod-dark-1280.png) | [Image](img/security-p1-19c-prod-light-390.png) | [Image](img/security-p1-19c-prod-dark-390.png) |

Reviewed the full p1 desktop and d1 phone captures, then crops from all eight
images at useful reading sizes. Review moved the severity control above results
and prevented long source names from breaking inside table cells. Light/dark
text, chip outlines and graph labels are readable. Findings wrap; account/source
names stay intact. All eight captures assert zero horizontal page overflow.
Phone users must scroll tables and graphs horizontally to reach later columns
and nodes; the path list wraps without that requirement. Larger graphs also
scroll vertically within a bounded viewport. The existing conversation panel takes
substantial space above Security on phones, and full reports require vertical
scrolling. These are remaining layout tradeoffs, not hidden overflow.

Both targets returned all eight checks successfully with who-can requested.
d1 showed the open default-password sample accounts and nested-role powerful
privileges; p1 had no findings for those two high-severity checks. Both showed
PUBLIC package grants, profile and audit review findings. Live paths covered
owner/direct grants; nested role and PUBLIC paths use browser fixtures. No grants
were altered to create additional live paths.

## Verification

Used the installed dependencies through an ignored local node_modules symlink.
Database commands used `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.

- `npm run typecheck`: passed.
- `npm test`: 85 files passed, 1,253 tests passed.
- `PIAGENT_BROWSER_LIVE=0 PIAGENT_ALERTLOG_LIVE=0 PIAGENT_SQL_LIVE=0 PIAGENT_SECURITY_LIVE=0 npm run test:browser`: 51 passed, 4 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/web-security.test.ts`: 2 passed, no skips, both approved targets reached. Verifies posture, owner paths, complete response under 1 MiB, Markdown and per-query hash audit records without binds/SQL.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets PIAGENT_SECURITY_LIVE=1 npx playwright test tests/browser/security-live.spec.ts`: 1 passed, eight fresh live screenshots.
- `git diff --check`: clean.

Browser coverage includes both themes/widths, literal hostile text, severity
filtering, initial disclosure state, SYS object preservation, path list, exports,
empty/partial/unavailable evidence, failure/413/429 recovery, stale responses,
contained table scrolling and a 61-route list with a 60-route graph cap. API tests
cover authentication, Host/Origin, methods, target/object validation, the shared
insight lock, output limits, private errors, evidence compaction and session cleanup.

## Changed Files and Limits

- API: `src/web/server.ts`, new `src/web/security.ts`.
- UI: new `src/web/static/security.js`; tab wiring in `app.js` and `index.html`;
  Security styles in `app.css`; optional graph settings in `insight.js`.
- Unit: `tests/unit/web-insight.test.ts`.
- Browser: `tests/browser/fake-server.ts`, new `security-fixture.ts`,
  `security.spec.ts`, `security-live-server.ts`, `security-live.spec.ts`.
- Integration: new `tests/integration/web-security.test.ts`.
- Docs: this report and eight `docs/img/security-*.png` images above.

No PLAN.md, package.json, src/contracts.ts, core security code, database state,
containers or Strata configuration changed. No LLM calls, full integration suite,
evals, push, merge or PR. No requested contract changes. Live observations are
transient, not a security certification; core reachability limitations in
security.md still apply. No live nested-role/PUBLIC/ANY fixture was created.

## Coordinator Review Follow-up

The coordinator found that the initial d1 desktop graph cut off its fourth route
and scaled its node text too large. The earlier visual review missed that cutoff.
Security now opts into an explicit 0.75 graph scale: the SVG has intrinsic width
and height derived from its layout instead of stretching to the panel width.
Security CSS respects those dimensions. Node labels render at 14.25 px (owner
labels 12 px; kind labels 10.5 px), alongside the page's 16 px body and 13.6 px
tables. Both live graphs fit vertically in their containers, including d1's final
Direct OE → SELECT HR.EMPLOYEES route. Larger graphs still scroll within the
bounded viewport; phone graphs may require horizontal scrolling. The shared
PL/SQL renderer keeps its original sizing/fonts when no scale is supplied.

Profile findings now aggregate in `readSecurityPosture`, keyed by profile,
resource and effective limit. Each finding names the profile and limit once and
lists the sorted, distinct affected open custom users. DEFAULT inheritance still
resolves before grouping, and separate profiles/resources remain separate rows.
For example, d1 now has one DEFAULT / PASSWORD_VERIFY_FUNCTION=NULL finding with
10 users; p1 has one with two users. CLI Markdown, report consumers and web all
receive these grouped findings. Raw profile/user evidence remains complete and
unchanged, including accounts excluded from findings. Findings counts now count
profile-limit groups rather than affected users. No contract shape changed.

All eight linked images were retaken after both fixes. Reviewed the full d1 dark
desktop capture and graph/list crops from every target/theme/width: the last path
is visible, fonts are consistent with page scale, light/dark labels remain
readable, and graphs no longer stretch across the desktop panel. Live capture
assertions check the final node's bottom against its container, no vertical graph
overflow for these live paths, rendered label size between 13 and 16 px, and no
horizontal page overflow at all eight sizes/themes. The existing locally scrolling
phone evidence and graph layout remains intentional.

Follow-up verification (no LLM calls):

- `npm run typecheck`: passed.
- `npm test`: 85 files, 1,254 tests passed.
- `PIAGENT_BROWSER_LIVE=0 PIAGENT_ALERTLOG_LIVE=0 PIAGENT_SQL_LIVE=0 PIAGENT_SECURITY_LIVE=0 npm run test:browser`: 52 passed, 4 opt-in live tests skipped. Includes existing PL/SQL graph layout/contrast tests and an explicit default-renderer sizing regression check.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/security.test.ts tests/integration/web-security.test.ts`: 4 passed in two files, no skips. Live core assertions verify the single DEFAULT verify-function group and affected-user count on both targets.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets PIAGENT_SECURITY_LIVE=1 npx playwright test tests/browser/security-live.spec.ts`: 1 passed, all eight images refreshed.

Additional changed files: `src/security/index.ts`, `tests/unit/security.test.ts`,
`tests/integration/security.test.ts`, and the grouping note in `docs/security.md`.
Other follow-up edits are confined to the previously listed graph/UI/browser files,
this report and the eight screenshots. No shared contract or dependency changes
are required. No full integration suite, database mutations, Strata calls, push or
merge were performed. Live evidence remains transient; no new grant fixtures
were created.
