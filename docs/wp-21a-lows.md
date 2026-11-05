# WP-21A: open Low items

Implemented on branch `wp-21a-lows` without LLM/Strata calls, new dependencies,
shared-contract changes, or database writes.

## Changes

- `src/alertlog/index.ts`: decode ADR incident status as Inflight (1), Ready (2),
  Tracked (3), Closed (4), Data removed (5), Purged (6), Incomplete (7).
  Unknown and null codes display as Unknown with their raw value. JSON retains
  `status: number | null` and adds `statusName`. The optional type member keeps
  older evidence fixtures compatible; the reader always populates it.
- Alert evidence in `src/triage/alerts.ts` and its Markdown in
  `src/triage/index.ts` includes the decoded name; raw JSON status remains available.
- `src/web/static/alertlog.js` displays the name and code in the Status column,
  including a fallback for older evidence without `statusName`.
- `src/config/environment.ts` and the ask/chat path in `src/cli/index.ts` reject
  init's `/absolute/path/to/strata-api-key` before health checks or sessions,
  naming `PIAGENT_LLM_API_KEY_FILE` and explaining how to configure it. No key
  contents are read or included in the error.
- `src/report/schedule.ts` adds a comment warning to generated instructions when
  the Node executable is outside conventional system install paths. This covers
  version managers, temporary bundled executables, and custom installs requiring
  review. The warning advises a stable system Node install and regeneration after
  changing Node; generated commands retain the actual executable path.
- Tests: `tests/unit/alertlog.test.ts`, `tests/unit/triage-alerts.test.ts`,
  `tests/unit/global-install.test.ts`, `tests/unit/report-schedule.test.ts`,
  and `tests/browser/alertlog.spec.ts`.

Status mapping source: [Oracle Database 19c V$DIAG_INCIDENT reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-DIAG_INCIDENT.html).

Fresh 1280px browser fixture screenshots (synthetic evidence, no model calls):
[Light](img/wp-21a-alertlog-light.png), [dark](img/wp-21a-alertlog-dark.png).
The browser suite also checks phone widths and the shared triage evidence renderer.

## Validation

The worktree had no dependency directory. A local ignored `node_modules` symlink
reuses the existing project installation in `../needlefish/node_modules`; no
package manifests or lockfiles changed.

Final results:

- `npm run typecheck`: passed (exit 0).
- `npm test -- --maxWorkers=2`: 87 files passed; 1,277 tests passed.
- `npm run test:browser` (with `PIAGENT_WP21_CAPTURE=1`): 52 passed,
  four opt-in live capture tests skipped. After switching screenshot captures to
  desktop width, `PIAGENT_WP21_CAPTURE=1 npm run test:browser -- --grep
  'Alert Log filters'`: two passed.
- `export PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`
  followed by `npm run test:integration --
  --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  22 files passed; 54 tests passed, one excluded Strata test skipped (143.46 s).
- `git diff --check`: passed.

No contract changes requested. No unverified implementation items. Real model
behavior was deliberately not exercised, and screenshots use deterministic
browser fixtures rather than live Oracle evidence. Integration validated both
approved 19c targets through existing read-only product/eval paths; the existing
non-19c refusal gate is the sole permitted exception.

Commits: `d605ffc` (ADR decoding), `9ff129b` (init placeholder), `e12270e`
(schedule warning), `cbe57e5` (desktop screenshots), plus this validation report.
Nothing pushed or merged.
