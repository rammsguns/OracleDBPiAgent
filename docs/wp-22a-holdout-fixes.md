# WP-22A holdout fixes and hygiene

Implemented on `wp-22a-holdout-fixes`. No LLM or Strata calls. Database evidence came from SELECT truth queries through the existing read-only, 19c-gated validator. No database data or schema changes, dependencies, shared contracts, package or plan changes.

## Changes

- `hard-p21-history-signature`: only this case's `defaulted` cell accepts `No` or `None` as `N`. Other columns and cases retain exact matching. Argument names must still match their own rows.
- `hard-p21-products-stats`: retain `rowCells`, selecting the two requested flags rather than requiring a redundant table-name cell. The question fixes SHOPAPP.PRODUCTS. Case-scoped normalization accepts vertical Stale?/Stale Stats and Global statistics?/Global Stats labels with explicit YES/NO/UNKNOWN values and explanatory suffixes. Existing row matching binds the flags to their labels and keeps separate tables separate. Missing statistics remain represented by UNKNOWN from the existing SQL.
- Moved `hard-p21-alert-levels` and `hard-p21-problem-identity` to dev because WP-22B targets their observed failures.
- Added two blind replacements: alert severity counts on d1 from 6 October through 3 November 2026 UTC, and ADR problem IDs/keys with last incident IDs on p1. Neither question names a tool or view; neither was sent to an agent. Both permit legitimate empty truth. Initial validation found the initially chosen d1 day empty, so its interval was expanded using truth evidence only. Final truths are nonempty (two severity groups and one problem).
- Updated the validator's split invariant for exactly the two exposed cases and the suite population test: 123 cases, 30 dev, 24 holdout, 21 regression, 48 challenge. Historical tuning balance still excludes the additional release cases.
- Added regression tests for No/None scoping, wrong arguments, affirmative defaults, swapped statistics flags, missing flags, cross-table borrowing, holdout classification and all six archived correct answers.

## Offline replay

Command: `npx tsx docs/wp-22a-replay.ts ../eval-archive ../needlefish/evals/results`.

Used jq to extract records from 561 JSON files, comparing the frozen pre-change scorer and case definitions with current scoring. Covered **12,858 recognized hard and MVP records**. Archived scalar/allCells check outcomes are preserved; rowCells checks use archived rows. For the statistics case only, the after-side drops the redundant first truth cell to match the revised SQL. No fresh database truth is substituted for archived answers.

**Six fail→pass flips; zero pass→fail; zero flips on any other case.** Each is justified by a correct explicit default/flag value. The full answers, original truth, paths, iterations and explanations are listed in [wp-22a-replay.json](wp-22a-replay.json). Frozen scorer/cases and the six-answer regression fixture are in `tests/fixtures/wp22a/`.

All flips are in `../eval-archive/phase21/gate-release/2026-11-05T22-48-16-872Z-b1cfd590-2e50-4d35-8b8c-650c36456173.json`:

| Case | Iteration | Change | Justification |
|---|---:|---|---|
| hard-p21-history-signature | 1 | fail → pass | Each named argument has No default |
| hard-p21-history-signature | 2 | fail → pass | Each named argument has No default |
| hard-p21-history-signature | 3 | fail → pass | Each named argument has No default |
| hard-p21-products-stats | 1 | fail → pass | Stale and global attributes both explicitly YES |
| hard-p21-products-stats | 2 | fail → pass | Stale and global attributes both explicitly YES |
| hard-p21-products-stats | 3 | fail → pass | Stale and global attributes both explicitly YES |

## Validation

Exported `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` for database commands. Passwords were read only by the existing readers. Missing node_modules was resolved with the requested `../needlefish/node_modules` symlink.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm test -- --maxWorkers=2` | PASS, 90 files / 1,315 tests, exit 0 |
| `npx tsx evals/validate-hard.ts` | PASS, 101 nonempty truth queries / 123 cases; one permitted empty truth (`hard-p21-public-directory`) |
| `npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` | PASS, 22 files / 54 passed; one excluded Strata test (55 total), exit 0 |
| `git diff --check` | PASS |

No database dependency skips occurred; the single skipped test is the explicitly excluded Strata end-to-end test.

Changed files: `evals/scoring.ts`, `evals/cases-hard/phase21-holdout.json`, `evals/validate-hard.ts`, generated `evals/hard-ground-truth-validation.json`, `tests/unit/hard-evals.test.ts`, `tests/unit/wp22a-evals.test.ts`, `tests/fixtures/wp22a/{scoring-before.ts,cases-before.json,gate-answers.json}`, and this report plus `docs/wp-22a-replay.{ts,json}`.

Contract changes needed: none. LLM behavior and the fresh holdouts' agent performance deliberately remain unmeasured; the coordinator owns Strata measurement. No push or merge performed.

Commits: `f9f446d` implements the fixes, holdout replacements and tests; the following documentation commit records replay evidence and final results.
