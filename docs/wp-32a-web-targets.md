# WP-32A: configured targets throughout the web UI

Every web diagnostic route and selector now uses the loaded target configuration.
Removed the packaged-name restrictions from the shared diagnostic route, drift
route, shared panel selector and drift selectors. Report/history and chat already
used configuration membership; chat now returns the same HTTP 400
`Invalid target` message for unknown names.

The existing config loader remains the authority for target file selection,
validation and account deny lists. No target format, shared contracts, dependencies,
Oracle policy, authentication, Host/Origin checks, caps, locks or cancellation
behavior changed. Private lists replace packaged names rather than extending them.

Changed files:

- `src/web/server.ts`, `src/web/sessions.ts`
- `src/web/static/panel.js`, `operations.js`, `drift.js`
- `tests/unit/web-targets.test.ts`: all diagnostic routes, drift, report/save/history
  and chat reject unknown/unconfigured names before session creation; each of the
  three packaged and private names reaches the session boundary.
- `tests/browser/private-targets.spec.ts`: every selector displays exactly the
  private API target list (apart from the existing Default/All targets controls).
- `tests/integration/web-private-targets.test.ts`: temporary 0700 PIAGENT_HOME,
  0600 targets.json with lab-d1/lab-p1/lab-c1 aliases of packaged lab metadata and
  password-file basenames d1_lab.pw/p1_harness_ro.pw/c1_piagent_ro.pw.
  Calls Check, Backup, Jobs, Top, PL/SQL list/doc, Alert Log, SQL, Security,
  Sessions, Space, Report/save/history, Triage and Drift for each alias. Real
  connections retain 19c/account/read-only gates. Report history stays in the temp
  home. No passwords are copied into the home or test source.
- `docs/web-ui.md`, `docs/real-targets.md`: private-home web setup and behavior.

Validation (2026-11-08):

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 143 files / 2,821 tests passed.
- `npm run test:browser`: 90 passed, 7 opt-in tests skipped. Generated
  `docs/img` screenshots restored afterwards.
- Private-home integration test: passed on all three aliases, 104.74 seconds,
  using PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  41 files passed / 1 failed; 96 tests passed / 1 failed / 1 skipped
  (618.28 seconds). The excluded Strata end-to-end test was skipped.
  The private-target test passed in this suite as well as its separate final run.
- Existing C1 live-PDB test independently reproduces a failure at
  `tests/integration/c1-pdb-live.test.ts:22`: not every current datafile has
  a level-0 backup timestamp. This occurs before web server creation; backup
  implementation and lab data are outside this WP and unchanged.

The locked dependencies were installed with `npm ci --ignore-scripts` because
this worktree initially had no node_modules. No LLM calls were made. The Strata
end-to-end test was excluded; opt-in live browser tests were not enabled.
No shared contract changes are needed. No push or merge was performed.

## Review follow-up

Addressed Antigravity's minor description-redaction finding. `/api/targets` now
escapes the configured username for regex use and matches whole Oracle identifier
words case-insensitively. RO in PRODUCTION and APP in APPLICATION remain intact;
standalone account mentions are masked. Boundaries also handle Oracle's `$` and
`#` identifier characters. Added route regressions for RO, APP, APP$RO and APP#
in `tests/unit/web-server.test.ts`.

Follow-up validation: `npm run typecheck` passed;
`npx vitest run tests/unit/web-server.test.ts tests/unit/web-targets.test.ts --maxWorkers=2`
passed 2 files / 31 tests. No DB or LLM calls, contract changes or dependencies.
