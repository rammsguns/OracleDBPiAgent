# WP-2527H: setup error propagation

Implemented bounded password-file setup errors and preserved safe connection
guidance across deterministic CLI commands, report, preflight, doctor and the
applicable web/chat paths. No SQL, account validation, dependency or security
allowlist changed.

The password read now opens nonblocking, checks the opened file is regular and
readable, reads and trims it, and rejects empty content. Open, stat, read and
close failures are replaced with a `SafeConfigError` containing only validated
target name and password basename. No raw filesystem error is retained. The
secret-directory mismatch is recorded as a connection setup failure too.

The shared `recordConnectionFailure` layer previously replaced every input with
a plain `Error`, losing `SafeConfigError` identity and its reviewed text. It now
preserves that instance. Other failures use an internal error type whose text
comes only from fixed connection guidance or a fixed generic fallback.
`connectionGuidance` recognizes both, so existing feature CLI catch/rethrow paths
need no individual edits. Web's outer error handler and its report/drift catches,
and chat's explicit catches, also preserve that guidance.

Report CLI checks for retained connection failures after section collection and
before rendering, saving, diffing or summarizing. Web report uses an isolated connection-failure scope around report
collection, failing before returning or saving an unavailable-only report.
`targets check --json` preserves stdout JSON and also emits stderr guidance.

## Scope and contract

Changed production files: `src/oracle/index.ts` (password read and directory
check only), `src/oracle/connectionErrors.ts`, `src/cli/index.ts`, and error
handling in `src/web/server.ts`. Tests cover every requested command family for
missing-file and mismatched-directory setup, filesystem cases, safe-error
retention and applicable web endpoints. Existing session mocks and stderr
expectations were updated for the new file-handle API and requested behavior.

No shared contract change is required. The coordinator may move the local
`PasswordFileError extends SafeConfigError` adapter into the config error
catalog later; it validates both interpolated identifiers and uses a fixed
catalog fallback if they are invalid. `src/config/`, `src/contracts.ts`,
`package.json` and `PLAN.md` were not edited.

## Verification

Results are recorded below. The integration command excludes
the Strata end-to-end ask; no LLM calls or Strata key-file reads are needed.

Real source CLI smoke used the packaged lab config and target `d1-19c-lab`, with
a temporary empty private secret directory and with a literal tilde directory
value (loader expands it, while the session compares the exported directory).
Backup, jobs, top, space, sessions, security, sql, alertlog, plsql, drift, triage,
report and targets check all exited 1 with the specific stderr guidance for
both scenarios. Report emitted no stdout. Drift still prints its unavailable
comparison before the command-scoped retained failure exits 1.

The original source CLI already displayed mismatch guidance when the environment
variable was unset. The exact coordinator package-only generic mismatch output
was not independently reproduced; preserving the error through the shared
recorder is covered directly, and all requested family mismatch tests pass.
No owner target, live PDB, or package installation was exercised.

Additional compiled CLI smoke: `npm run build` passed; `node dist/cli/index.js`
passed both setup scenarios for backup, jobs, top, space, report and targets
check, with exit 1, specific stderr and empty stdout in all twelve invocations.
The standalone new integration file passed 2/2 cases on the final source.

Changed tests: `tests/unit/setup-errors.test.ts`,
`tests/unit/interactive-connection-errors.test.ts`, `tests/unit/session.test.ts`,
`tests/unit/doctor.test.ts`, `tests/unit/target-usability.test.ts`, and
`tests/integration/setup-errors.test.ts`. Documentation changes are this file and
the troubleshooting section in `docs/real-targets.md`.

Final checks:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 120 files, 2,241 tests passed.
- `npm run build`: passed.
- `git diff --check`: clean.

- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: 35 files passed; 78 tests passed, 1 skipped (the excluded Strata ask), 248.05 seconds.
