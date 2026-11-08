# WP-30D-TARGET-USAGE

Implemented shared unknown-target guidance before database connection for backup,
space, top, sessions, security, sql, plsql list/doc, check, jobs, alertlog,
report history/schedule/schedule run, and targets check. Existing report, triage,
drift, ask and chat already use the shared validator. Unknown targets exit 2 and
name the requested target plus the configured names and `piagent targets` hint.
Unsafe target strings retain the existing omission policy (no arbitrary input
is echoed). Jobs distinguishes a configured target outside its pinned scope.
Check retains its usage/config prefix, validation order and monitoring exit codes.

Changed files:

- `src/config/targetUsage.ts`: optional error constructor preserves command-specific usage handling.
- `src/backup/cli.ts`, `src/space/cli.ts`, `src/top/cli.ts`, `src/sessions/cli.ts`,
  `src/security/cli.ts`, `src/sqlperf/cli.ts`, `src/plsql/cli.ts`, `src/check/cli.ts`,
  `src/jobs/cli.ts`, `src/alertlog/cli.ts`: shared validation before provider creation.
- `src/jobs/index.ts`: shared validation and separate pinned-scope rejection.
- `src/cli/index.ts`: target validation lines for history, scheduling and preflight.
- `tests/unit/target-usage-cli.test.ts`: per-command provider-creation assertions,
  subprocess message/exit checks across target-taking commands, helper safety checks.
- `tests/unit/backup-cli.test.ts`, `tests/unit/top-cli.test.ts`,
  `tests/unit/check-cli.test.ts`, `tests/unit/jobs.test.ts`: updated expectations
  and explicit pinned/unknown assertions.

Implementation commit: `c3a93fd` (`Unify CLI unknown-target usage guidance`).

Validation:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
exit 0

npm test -- --maxWorkers=2
Test Files  136 passed (136)
Tests       2579 passed (2579)
Duration    103.55s

npm test -- --maxWorkers=2 tests/unit/target-usage-cli.test.ts
# The npm script includes tests/unit, so this reran the full unit suite.
Test Files  136 passed (136)
Tests       2580 passed (2580)
Duration    102.34s

PIAGENT_TARGETS_FILE="$PWD/config/targets.json" \
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
Test Files  36 passed (36)
Tests       80 passed | 1 skipped (81)
Duration    420.62s
```

The explicit targets-file environment ensures integration uses only packaged labs
(except the authorized non-19c refusal test). The skipped test is the requested
Strata end-to-end ask exclusion. No web code changed; browser tests are not
required. Dependencies were installed from the existing lockfile with
`npm ci --ignore-scripts`; no dependency or package-file changes.

Contract changes needed: none. The helper's optional error constructor is local
to configuration/CLI code; shared contracts are untouched. No live LLM behavior
was verified or changed. No database write behavior was added.
