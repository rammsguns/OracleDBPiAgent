# WP-29C: config placeholder and preflight coverage

Implemented on branch `wp-29c-config-preflight`.

## Behavior

Previously `loadConfig` accepted init's `/absolute/path/to/db-secrets` value,
leaving commands to fail later during password-file handling (or first at the
LLM key placeholder). Configuration now rejects the normalized secret-directory
placeholder with a reviewed `SafeConfigError` that names the value and tells the
owner to edit the private `.env` or export `PIAGENT_SECRET_DIR`. Existing CLI
error handling prints this guidance and exits 1. The check precedes target,
LLM and database setup; arbitrary user paths are never included in its message.
Explicit environment exports still take precedence over `.env`.

The package-style smoke test compiles to a temporary package directory, supplies
packaged config/template files, runs from outside the checkout, initializes a
mode-0700 temporary `PIAGENT_HOME`, and uses a sanitized child environment and a
network-blocking preload. It tests valid invocations of ask, chat, doctor,
targets check, report, drift, both PL/SQL commands, sessions, space, security,
single-SQL analysis, alertlog, triage, backup, jobs and top. No real secrets are
created or read. Existing LLM-placeholder tests explicitly override the secret
directory so they continue exercising their intended LLM-specific diagnostic.

## Scanner

The preflight source scanner now detects comma-separated relations, quoted and
SYS-qualified identifiers, comments/hints between SQL keywords and relations,
and finite interpolations of identifier constants or array-map families.
Regressions include composed prefix/suffix names and ensure SELECT-list commas,
function arguments and hints do not introduce fake relations. Existing explicit
adapters remain for runtime view families and validated application tables.
Backup and jobs now also receive per-feature catalog checks.

The scan found no missing catalog views or template grants. The initial version
added file-scoped exemptions for `OTHER` and `WHERE`; the review follow-up below
removes those exemptions by keeping source literal boundaries intact.
`src/preflight/views.ts` and `docs/grants-template-pdb.sql` needed no changes.

This is a conservative coverage scanner, not a TypeScript evaluator or full
Oracle SQL parser. Arbitrary runtime-generated identifiers still need explicit
coverage adapters; the existing runtime families retain theirs.

## Files

- `src/config/environment.ts`: secret-directory placeholder assertion.
- `src/config/index.ts`: early normalized-path check.
- `src/config/safeErrors.ts`: reviewed fixed guidance.
- `tests/unit/secret-dir-placeholder.test.ts`: unit and compiled-package smoke tests.
- `tests/unit/preflight-catalog.test.ts`: scanner, regressions and feature coverage.
- `tests/unit/cli-messages.test.ts`, `tests/unit/global-install.test.ts`: isolate LLM-placeholder tests.
- `tests/unit/safe-config-errors.test.ts`: reviewed message catalog expectation.
- `docs/wp-29c-config-preflight.md`: this report.

## Validation

`npm run typecheck` — exit 0:

```text
> oracledb-pi-agent@1.5.0 typecheck
> tsc -p tsconfig.json --noEmit
```

`npm test -- --maxWorkers=2` — exit 0:

```text
Test Files  129 passed (129)
     Tests  2393 passed (2393)
  Duration  79.35s
```

This includes all three secret-directory tests (including the package smoke)
and all twelve preflight coverage tests. `git diff --check` also passed.
During development, targeted tests caught an incomplete SQL command invocation
in the smoke matrix and an out-of-date safe-message expectation; both were
corrected before the final full-suite run.

## Contracts and unverified work

No changes needed to shared contracts, package metadata, dependencies or PLAN.md.
No DB or LLM implementation was changed, so integration tests and gated evals
were not run. Live database behavior and Strata behavior remain unverified here;
the coordinator owns the gated evals. No database connections or LLM requests
were made. No push or merge was performed.


## Antigravity review follow-up

Addressed all three Minors from `review-wp-29c-config-preflight`:

- **Minor-1:** Comma-join aliases use Oracle identifier syntax, including quoted
  aliases with spaces or doubled quotes, and unquoted dollar/hash aliases.
  Tests prove later relations are still detected, including unfamiliar names
  outside the dictionary-prefix heuristic.
- **Minor-2:** A lightweight source-literal reader keeps separate strings and
  templates separate, ignores source comments, and visits nested template
  interpolations. SQL scanning is limited to SQL-bearing literals/fragments;
  exact dictionary-name literals still participate in coverage. Adjacent code
  and diagnostic prose no longer manufacture relations. Removed the `WHERE`
  and `OTHER` exemptions (and the now-unneeded overview `CONNECTION` exemption).
  Tests exercise the review's exact prose/adjacent-fragment cases, nested SQL
  templates, and regular expressions containing quotes before SQL literals.
- **Minor-3:** Finite identifier values and array-map family choices match
  case-insensitively, while results retain uppercase normalization. Tests cover
  lowercase view constants, mixed-case prefix/suffix compositions and families.

The global catalog, per-feature catalog and grants-template assertions remain
active. A source-by-source retention test also compares the new scan with every
known catalog relation found by the previous scanner, preventing the source
boundary change from silently dropping existing coverage. No catalog or grants
changes were required; no product code, dependencies or shared contracts changed.

Follow-up validation (both exit 0):

```text
$ npm run typecheck
> tsc -p tsconfig.json --noEmit

$ npm test -- --maxWorkers=2
Test Files  129 passed (129)
     Tests  2403 passed (2403)
  Duration  86.86s
```

All 22 preflight scanner/catalog tests pass, including ten new review
regressions. `git diff --check` passes. No DB or LLM calls made; integration
tests were not rerun for this test-only change.
