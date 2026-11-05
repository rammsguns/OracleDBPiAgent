# WP-19E: SQL Insight Polish

Implemented all six polish items on `wp-19e-sql-polish`.

Candidate discovery excludes `PARSING_SCHEMA_NAME = SYS_CONTEXT('USERENV',
'SESSION_USER')` before grouping, ranking and limiting. The CLI text lookup and
triage report the number of distinct excluded SQL_IDs. Explicit SQL_ID inspection
still works for any cached cursor. Counts and candidates are separate read-only
observations, so cache churn can change them between reads. The exclusion is
specifically the session user; other users' diagnostic SQL can still match text.

Object statistics retain status and source on each table/index row. Section
summaries contain only aggregate section entries; successful summaries stay compact
and non-ok summaries name their views. Findings precede evidence tables and show
Finding, Evidence and Verify Next, with suggested SELECTs shown but never executed.
Raw Check fields remain available in JSON for evidence consumers, not as finding
columns in the presentation.

Elapsed/CPU per execution display in milliseconds with three significant digits.
Other per-execution metrics are rounded for display; JSON retains raw numbers and
microseconds. Headings and column labels use title case, including bind metadata:
Child, Name, Position, Type, Captured. Empty optional sections produce one line
when all four are empty. Wide evidence tables and plans scroll in their own boxes
at desktop and phone widths.

## Fresh Read-Only Smokes (2026-11-05)

SQL_IDs were discovered at run time from V$SQL/V$SQL_PLAN object references, then
passed to the actual CLI (`node --import tsx src/cli/index.ts sql --target T
--sql-id ID`). No application SQL was executed to populate the cache. Triage used
`query slow on SH.SALES` and `query slow on SHOPAPP.ORDERS`, without summarization
or any LLM. Full output:

- [d1 SQL](smokes/wp-19e-d1-19c-lab-sql.md)
- [p1 SQL](smokes/wp-19e-p1-19c-prod-sql.md)
- [d1 triage](smokes/wp-19e-d1-19c-lab-triage.md)
- [p1 triage](smokes/wp-19e-p1-19c-prod-triage.md)

A separate actual CLI text smoke (`--target p1-19c-prod --text ORDERS`) reported
1 session-user diagnostic statement excluded, listed 10 candidates and requested a
narrower fragment because the candidate cap was reached. The p1 object triage
selected a workload cursor (`fdkzjqg9y6gcx` in this observation), with 0 excluded
object-reference diagnostics. These IDs and timings are observations, not fixtures.

The browser capture server uses real approved database sessions with all LLM
paths disabled. Fresh captures cover both targets, both themes, and 1280/390 widths:

| Target | Light 1280 | Dark 1280 | Light 390 | Dark 390 |
|---|---|---|---|---|
| d1 | [Image](img/sql-d1-19c-lab-light-1280.png) | [Image](img/sql-d1-19c-lab-dark-1280.png) | [Image](img/sql-d1-19c-lab-light-390.png) | [Image](img/sql-d1-19c-lab-dark-390.png) |
| p1 | [Image](img/sql-p1-19c-prod-light-1280.png) | [Image](img/sql-p1-19c-prod-dark-1280.png) | [Image](img/sql-p1-19c-prod-light-390.png) | [Image](img/sql-p1-19c-prod-dark-390.png) |

Visual review found phone table cells breaking hashes, object names and UTC dates.
The final captures preserve those values on one line inside scrollable tables;
finding prose wraps within wider cells. Light/dark text and badges are readable,
plans preserve indentation, and no capture has horizontal page overflow. Phone
users must scroll evidence tables to see later columns. The existing conversation
panel still occupies substantial vertical space above the SQL tab on phones.

## Verification

Commands used the existing installed dependencies through a local ignored
node_modules link; no dependencies or package files changed. Database checks set
`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.

- `npm run typecheck`: clean.
- `npm test`: 1183 tests passed in 81 files.
- `npm run test:browser`: 45 tests passed; 3 opt-in live tests skipped (the SQL live capture ran separately).
- `npx vitest run tests/integration/sqlperf.test.ts tests/integration/triage-sqlperf.test.ts`: 3 tests passed in 2 files, both targets reached.
- `PIAGENT_SQL_LIVE=1 npx playwright test tests/browser/sql-live.spec.ts`: 1 test passed, eight fresh screenshots.

No shared contract changes are required. Local API additions: candidate query
results carry `excluded`, and TriageSql has optional `excluded`. SQL insight object
statistics keys are removed from `sections`; their existing row status/view remain.
The web API still uses its existing candidate response shape. No LLM calls, full
integration suite, push, merge, database writes, or Strata changes were performed.

## Changed Files

- Core/CLI: `src/sqlperf/index.ts`, `src/sqlperf/cli.ts`.
- Triage: `src/triage/sqlperf.ts`, the SQL Markdown section in `src/triage/index.ts`.
- Web: `src/web/static/sql.js`, SQL-specific rules in `src/web/static/app.css`.
- Unit tests: `tests/unit/sqlperf.test.ts`, `tests/unit/triage-sqlperf.test.ts`, `tests/unit/web-insight.test.ts`.
- Integration tests: `tests/integration/sqlperf.test.ts`, `tests/integration/triage-sqlperf.test.ts`.
- Browser tests: `tests/browser/sql.spec.ts`.
- Docs: this report, `docs/sqlperf.md`, the four linked `docs/smokes/wp-19e-*.md` files, and the eight linked `docs/img/sql-*.png` captures.

Verification limits: cursor-cache evidence and execution counts are transient. No
LLM or full integration checks were run, as requested; screenshots show actual
cache contents, including the scheduler's cached INSERT plan on p1, inspected
using SELECTs only. The suggested verification SELECTs were displayed only.
