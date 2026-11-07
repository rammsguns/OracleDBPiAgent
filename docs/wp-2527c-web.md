# WP-25C / WP-26C / WP-27C — combined web work package

Branch: `wp-2527c-web`. Date: 2026-11-06.

## Built

Added Backup, Jobs and Top between Space and Security in the existing evidence tab order. Tab activation and keyboard navigation now share one ordered list. The tabs retain the existing dark shell, token authentication, Host/Origin checks, insight lock and 1 MiB response cap. Tables have named, keyboard-focusable scroll regions and scoped headers; hints appear only when a table actually overflows. Snapshot empty states say “None in this snapshot.” Target changes and cancellation discard stale responses.

- **Backup:** shared UTC timeline with full/level-0, incremental and per-thread archived-log metadata lanes. Exact event evidence is available in disclosures. Sequence gaps are highlighted separately because the core supplies no verified time bounds for them. The core's candidate/not-verifiable decision, media-validation caveats, per-view availability, PDB scope notes, caps, datafile evidence and findings remain visible. No recovery capability is inferred from an empty gap list.
- **Jobs:** per-job run markers on a shared UTC axis; failures have a separate color, border and explicit FAILED text, with failure counts in disclosure summaries. Maintenance-debt cards cover invalid objects, indexes, index partitions/subpartitions and stale statistics. The existing reader supplies redaction and truncation; every rendered value uses text nodes. Errors are explicitly identified as untrusted application text. Scope/retention caveats remain available in an accessible disclosure.
- **Top:** manual Sample button, numeric seconds selector (integer 5–120, default 15), elapsed progress, cancel and delta tables. No polling or automatic sample on tab activation. SQL_ID buttons prepare the existing SQL tab with the sampled target and ID; reading that insight still requires its button. Unknown/reset/new/aged-out counters remain distinct from zero. Load and host scope labels come from the core.

Top cancellation aborts the Node wait and prevents the second snapshot reads. An already-running SELECT can finish before resources close. The shared request lock remains held until cleanup finishes.

A live run initially exceeded the web cap because the sampler returns five complete SQL-cache counter lists. The web adapter now retains all rankings and exact counter-state counts, omits measured drill-down rows and returns the first 100 unknown counter details per metric, with an explicit note. A 10,000-cursor unit case verifies counts, rankings and payload size. Tables and job timelines also disclose a 100-row display cap. Core analysis still uses the reader's full bounded evidence.

## Files

- `src/web/operations.ts`: local adapters importing `src/backup`, `src/jobs` and `src/top`; validation, audit wrapping, cancellation and bounded Top response.
- `src/web/server.ts`: the three endpoints within the existing authenticated insight surface.
- `src/web/static/operations.js`: rendering and request/progress/cancel lifecycle.
- `src/web/static/app.js`, `index.html`, `app.css`: initialization, tab order, panels and styles.
- `tests/unit/web-operations.test.ts`: parameter validation, cancellation/audit behavior and large-cache response regression.
- `tests/browser/operations.spec.ts`: desktop/phone layout, overflow hints, literal hostile text, empty states, manual-only sampling, bounds, progress, cancellation, stale clearing, failures, SQL navigation and endpoint authorization/validation.
- `tests/browser/operations-live-server.ts`, `operations-live.spec.ts`: opt-in SELECT-only captures pinned to the two approved labs, with the 19c gate and no agent/LLM execution.
- `docs/img/{backup,jobs,top}-*.png`: live and explicitly synthetic screenshots linked below.
- This report.

No changes to the three core feature modules, shared contracts, package manifest or plan. No new dependencies; the missing local `node_modules` was symlinked to `../needlefish/node_modules` as authorized.

## Checks

Runtime: Node v24.18.1. Commands and final output:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

npm test -- --maxWorkers=2
Test Files  116 passed (116)
Tests       2154 passed (2154)
Duration    73.98s

npm run test:browser
7 skipped
83 passed (1.1m)

PIAGENT_OPERATIONS_LIVE=1 PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:browser -- tests/browser/operations-live.spec.ts
1 passed (52.7s)
```

The seven skipped browser cases are the opt-in live capture cases. The new live capture case was run separately, as shown above. The catalog/grant coverage tests pass as part of the full unit suite.

Final required integration command:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

The first complete run returned 70 passed, one skipped (Strata e2e), and two failures in untouched code/tests:

- `tests/integration/backup.test.ts:13`, p1: expected `partial`, received `ok`. This assertion predates the applied p1 grants. The live web view correctly displays readable evidence together with a not-verifiable recovery estimate.
- `tests/integration/sqlperf.test.ts:19`, p1: a cached-cursor timestamp was an empty string where the test expected `/Z$/`.

Final rerun:

```text
Test Files  1 failed | 31 passed (32)
Tests       1 failed | 71 passed | 1 skipped (73)
Duration    366.40s

FAIL tests/integration/backup.test.ts > reads backup metadata on p1-19c-prod
AssertionError: expected 'ok' to be 'partial'
Expected: "partial"
Received: "ok"
```

The SQL timestamp case passed on the final rerun. The remaining failure is the stale backup grant premise in an untouched core integration test; the coordinator/core-test owner needs to update that assertion for the approved grants. No out-of-lane fixes were made. The required integration check is therefore not all green.

## Live evidence

The capture provider uses only the two pinned lab accounts, reads passwords from the required secret directory and executes policy-checked SELECTs. It refuses LLM prompts. Both labs are the known non-CDB 19.9.1 targets; this capture provider is not a real-target/PDB test harness.

Both labs returned readable evidence for every Backup and Jobs view. Backup status was `ok` (readable evidence), while recoverability was `not-verifiable` on both: neither recorded RMAN jobs, backup sets/pieces/datafile backups or available archived logs. d1 had four datafiles and 161 log-history rows; p1 had five datafiles and 64 log-history rows. Both had zero corruption/recover-file rows. Zero computed gaps does not establish recoverability when no baseline backup exists.

Jobs, default 24-hour window:

| Evidence | d1-19c-lab | p1-19c-prod |
| --- | --- | --- |
| Scheduler jobs | 22 | 25 |
| Retained run rows | 10, complete | 200, row cap reached |
| Job-log rows | 24, complete | 200, row cap reached |
| Last-error rows | 0 | 0 |
| Autotask clients / history rows | 3 / 3 | 3 / 3 |
| Invalid-object debt | CO: 3 views | No visible rows |
| Index / partition / subpartition debt | No visible rows | No visible rows |
| Stale-statistics debt | SYS tables: 110 | SHOPAPP tables: 2; SYS tables: 110; SYS partitions: 1 |

These are captured observations, not stable expected values. The p1 timeline explicitly displays only the first 100 of the 200 returned runs, and the evidence cards preserve the source truncation warning.

Top, manual five-second requests:

| Evidence | d1-19c-lab | p1-19c-prod |
| --- | --- | --- |
| Overall status | partial: SQL row cap reached | ok |
| Measured SQL interval | 19.004 s | 6.541 s |
| Elapsed/CPU/get/execution counter states | 9,996 measured; 1 new; 1 aged-out; 3 reset | 3,670 measured; no new/aged-out/reset |
| Physical-read counter states | 9,999 measured; 1 new; 1 aged-out | 3,670 measured |
| Host CPU busy | 40.13% | 38.58% |
| User calls / second | 201.38 | 93.75 |
| Logical reads / second | 12,754.99 | 3,271.54 |
| Commits / second | 0 | 3.82 |

The core's measured per-section intervals, rather than the requested sleep time, determine rates. d1's row-cap note explicitly warns that incomplete coverage cannot prove cursor aging. The classifications above are sampler output, not proof of an atomic cache snapshot. Load and host retain “CDB-wide (shared by all PDBs)” labels.

## Screenshots

Live overview captures, dark mode, desktop 1280 px and phone 390 px:

| Tab | d1 desktop | d1 phone | p1 desktop | p1 phone |
| --- | --- | --- | --- | --- |
| Backup | [desktop](img/backup-d1-19c-lab-dark-1280.png) | [phone](img/backup-d1-19c-lab-dark-390.png) | [desktop](img/backup-p1-19c-prod-dark-1280.png) | [phone](img/backup-p1-19c-prod-dark-390.png) |
| Jobs | [desktop](img/jobs-d1-19c-lab-dark-1280.png) | [phone](img/jobs-d1-19c-lab-dark-390.png) | [desktop](img/jobs-p1-19c-prod-dark-1280.png) | [phone](img/jobs-p1-19c-prod-dark-390.png) |
| Top | [desktop](img/top-d1-19c-lab-dark-1280.png) | [phone](img/top-d1-19c-lab-dark-390.png) | [desktop](img/top-p1-19c-prod-dark-1280.png) | [phone](img/top-p1-19c-prod-dark-390.png) |

Synthetic browser fixtures exercise populated lanes, sequence gaps, failed runs, hostile application text and unknown deltas that the live snapshots do not supply:

| Tab | Desktop | Phone |
| --- | --- | --- |
| Backup | [populated timeline and gap](img/backup-example-dark-1280.png) | [populated timeline and gap](img/backup-example-dark-390.png) |
| Jobs | [failed run and debt](img/jobs-example-dark-1280.png) | [failed run and debt](img/jobs-example-dark-390.png) |
| Top | [delta and reset](img/top-example-dark-1280.png) | [delta and reset](img/top-example-dark-390.png) |

## Contracts and limits

No shared contract changes requested. `sql.counterSummary` and the bounded counter-detail arrays are local web response fields. No new SQL/views or grant/preflight changes are needed: this WP calls the existing readers.

Live 19c PDB behavior, RAC, Data Guard, real backup media and restore capability remain unverified. Populated backup chains/gaps, failed-run rendering and missing-view behavior use fixture/unit coverage. Counter resets also have unit coverage; the live d1 sampler classified several non-monotonic counters as reset. Synthetic screenshots are labelled separately from lab evidence. Screenshots are overviews; long evidence remains accessible below or in disclosures.

No Strata/LLM requests, eval runs, RMAN execution or scheduler execution were performed. No database-changing DML, DDL or PL/SQL was issued. The required integration suite retains its documented gate-only unsupported-version refusal test.

## Review follow-up — Minor-1

Read `docs/review-wp-2527c-web.md` from branch `review-wp-2527c-web` (APPROVE). Fixed Minor-1 by wrapping Jobs session acquisition in `src/web/operations.ts`. The wrapper checks the request's AbortSignal before acquisition and before every query, including any reader fallback. An already-running SELECT may finish; cancellation prevents subsequent SELECTs and the reader's existing `finally` still closes its session.

The implementation stays within the web adapter: `src/jobs/index.ts`, its public signature, existing callers and CLI output are unchanged. No shared contract changes are needed.

Added three unit cases in `tests/unit/web-operations.test.ts`: abort after the first successful query, abort after the first unavailable-view query, and a request already aborted before acquisition. The first two assert exactly one query and exactly one close; the last asserts no session acquisition. All tests use fakes and perform no database or LLM calls.

Requested follow-up checks all passed:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

npm test -- --maxWorkers=2
Test Files  116 passed (116)
Tests       2157 passed (2157)
Duration    78.27s

npm run test:browser
7 skipped
83 passed (1.1m)
```

The focused adapter suite also passed all six cases. This follow-up changes only the web adapter, its unit tests and this report; the earlier live captures and integration observations above remain historical evidence.
