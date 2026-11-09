# WP-35C template false negatives

## Built

- Added p19 bullet alternatives for both `object ... stale` and `stale ... object` orderings. The existing independent presence check still requires PRESENT on the object's line; the owner template is unchanged, so `SHOPAPP` can appear once. Removed the redundant bullet branch from that presence check.
- Broadened the p30 classification fact template for copular wording, “falls in the LOW band,” “LOW classification,” “Classification is LOW,” and “class: low.” Added p30 contradiction templates for negated classification and tests that pair each negation with the complete winner sentence.
- Tests load the production case files with `loadHardCases()` and invoke the real `score()` function.

## Files changed

- `evals/cases-hard/phase19-sqlperf.json`
- `evals/cases-hard/phase30-check.json`
- `tests/unit/wp-34c-truth-templates.test.ts`

## Verification

- Focused scorer tests: `npx vitest run tests/unit/wp-34c-truth-templates.test.ts --maxWorkers=2` — 1 file, 3 tests passed.
- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — 148 files, 2,953 tests passed.
- Proposed p30 contradiction templates were checked against all 32 archived p30 answers that passed the Phase 34 scorer: zero hits.
- Archive replay, phases 25–34: 5,303 records; pass→fail 0; fail→pass 29 (12 p19 and 17 p30). These flips are the existing WP-34C recoveries; this replay script uses the Phase 34 scorer baseline, so it does not measure Phase 35 changes.
- Filtered integration command with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` was started with the Strata end-to-end test excluded. It remained silent and was stopped before completion; its result is unverified.

## Remaining constraint

The p30 `captureChecks` are not required-match checks: the scorer calls `matches.every(...)`, so an unmatched capture pattern passes vacuously. Template 0 still requires the answer to identify the fullest tablespace. Classification wording tests therefore pair the classification with the winner assertion. The classification fact template alone is not intended to replace the winner fact.

## Contract changes

- None made. If classification-only p30 prose must pass, `captureChecks` needs an explicit optional/conditional form or an equivalent generic scorer rule. That type is local in `evals/types.ts`; no shared contract file was changed.
