# WP-36D transposed-label fallback regression

## What changed

The generic two-column `Attribute | Value` scorer now treats “statistics” and
“stats” as the same label word and permits the common abbreviation that omits
“stats” (for example, `Stale?` for `STALE_STATS`). Existing negative-label
checks still reject labels such as `Not stale?`. The replay utility accepts
`--base <git-ref>` (default `master`) and includes phase 36 when run without
explicit archive roots.

The unit regression loads `hard-p21-products-stats` from `evals/cases-hard`,
scores the reported transposed answer with truth `["YES", "YES"]`, and checks
that `Stale? | NO` and `Not stale? | YES` fail.

## Files changed

- `evals/scoring.ts`
- `evals/replay-scorer-archive.ts`
- `tests/unit/row-cells.test.ts`
- `docs/wp-36d-label-fallback.md`

## Archive replay

Commands run:

```sh
node_modules/.bin/tsx evals/replay-scorer-archive.ts --base v1.11.0
node_modules/.bin/tsx evals/replay-scorer-archive.ts
```

Both runs covered 6,743 records from phases 25–36 (phase25-27, phase28,
phase29, phase30, phase31, phase32, phase33, phase34, phase35, phase36).
The v1.11.0 comparison had **0 pass→fail** and 2 fail→pass flips. The default
master comparison had **0 pass→fail** and 1 fail→pass flip.

Every fail→pass answer was read and checked against its truth:

| Baseline | ID | Iteration | Archive file | Review |
|---|---|---:|---|---|
| v1.11.0 | `hard-p21-products-stats` | 2 | `phase30/b-48bf50e/2026-11-08T04-12-09-571Z-7f92f692-4f2a-46d1-8730-b5ec5f2e492d.json` | Reports stale and global stats as YES; includes matching `STALE_STATS = YES` and `GLOBAL_STATS = YES`. Correct for truth `["YES", "YES"]`. |
| v1.11.0 | `hard-p26-p1-next-run-semantics` | 1 | `phase35/gateB/2026-11-09T17-53-00-249Z-3ea1d9e4-ec82-499d-97b2-bba4dd239409.json` | Reports enabled TRUE and `Next Run Time | PRESENT`; the semantics explanation accurately distinguishes a scheduled estimate from guaranteed execution. Correct for truth `["TRUE", "PRESENT"]`. |
| master | `hard-p21-products-stats` | 1 | `phase36/gateB/2026-11-10T01-35-54-405Z-abbe9b26-b039-430f-8f63-f75b24e3de57.json` | The exact transposed answer in the regression: stale YES and global statistics YES with matching SQL flag annotations. Correct for truth `["YES", "YES"]`. |

## Verification

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: run twice; each run had 147 test files pass
  and 2,959 tests pass, with the same one test failing because
  `hard-evals.test.ts` could not acquire the primary eval lock. Active
  coordinator Phase 36 processes held the lock during both attempts (first
  PID 3511219, then PID 3512651). Both processes were left untouched. The
  scorer unit tests completed as part of each run.
- No eval suite was started by this work. The replay reads archived answers and
  does not call the LLM.

## Unverified

The `hard-evals.test.ts` lock-dependent unit test needs a clean rerun when no
coordinator eval process holds `/tmp/piagent-eval-primary.lock`. It did not
complete in either attempted full-suite run.
