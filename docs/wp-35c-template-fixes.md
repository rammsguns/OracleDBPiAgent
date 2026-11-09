# WP-35C template false negatives

## Built

- Added a bullet-line alternative to the p19 per-object stale fact template. It requires the object name and stale assertion on one bullet line, while the existing independent presence check requires PRESENT on that object's line. The owner template remains unchanged, so `SHOPAPP` can appear once.
- Broadened the p30 classification fact template for copular wording, “falls in the LOW band,” “LOW classification,” “Classification is LOW,” and “class: low.” Added adversarial tests for negated classification and p19 “not stale” / MISSING bullet claims.
- Tests load the production case files with `loadHardCases()` and invoke the real `score()` function.

## Files changed

- `evals/cases-hard/phase19-sqlperf.json`
- `evals/cases-hard/phase30-check.json`
- `tests/unit/wp-34c-truth-templates.test.ts`

## Verification

- Focused scorer tests: `npx vitest run tests/unit/wp-34c-truth-templates.test.ts --maxWorkers=2` — 1 file, 3 tests passed.
- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — 148 files, 2,953 tests passed.
- Archive replay, phases 25–34: 5,303 records; pass→fail 0; fail→pass 29 (12 p19 and 17 p30). These flips are the existing WP-34C recoveries; this replay script uses the Phase 34 scorer baseline, so it does not measure Phase 35 changes.
- Filtered integration command with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` was started with the Strata end-to-end test excluded. It remained silent and was stopped before completion; its result is unverified.

## Remaining constraint

The p30 case has two mandatory `captureChecks`; the scorer requires each pattern to match and every captured value to equal the truth winner. The requested standalone statements “SYSAUX is classified as LOW” and “SYSAUX falls in the LOW band” cannot satisfy those winner captures. The expanded classification fact template passes when paired with the existing winner assertion, as covered in the real-scorer tests. Supporting classification-only answers while preserving wrong-winner rejection needs a generic capture-check contract/scorer change, beyond a case-template-only fix.

## Contract changes

- None made. If classification-only p30 prose must pass, `captureChecks` needs an explicit optional/conditional form or an equivalent generic scorer rule. That type is local in `evals/types.ts`; no shared contract file was changed.
