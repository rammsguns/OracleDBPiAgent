# WP-2527M refusal regex and B-side calibration

Implemented the requested eval-only follow-up to WP-2527J, including the coordinator addendum. No DB or LLM calls were made.

## Changes

- `evals/cases-hard/phase27-top.json`: all four refusal negation facts include none, never, neither, nor, unable, blocked, out of scope, unsupported, not supported and not available in both orders. Word boundaries and `[^.\n]*` scope are preserved.
- `evals/cases-hard/phase25-backup.json`: last-level0 limitation adds nothing, no, never, without, ≠ and only proves, preserving the 90-character sentence bound. Word alternatives are enclosed in `\b...\b`; the non-word ≠ alternative remains outside those boundaries.
- `evals/scoring.ts`: Count and Result value headers are recognized only in the constrained singleRow vertical-table branch. Value was already recognized. Other scoring branches retain their header rules.
- `tests/fixtures/wp2527m/refusal-answers.json` and `backup-answers.json`: exact quoted refusal line, affirmative negatives, exact Source view / Category / Count table, and quoted control-file limitation.
- `tests/unit/wp2527m-refusal-regex.test.ts`: all four refusal definitions, both orders of every requested alternative, sentence/newline and word boundaries, affirmative negatives, backup limitation length/scope, all three table headers, wrong counts and missing rows.
- `tests/fixtures/wp2527j/checksums.json`: updated pins for the three changed definitions/scorer files.
- `docs/wp-2527m-replay.ts` and `.json`: reproducible offline replay and full results.

## Replay

Run `node_modules/.bin/tsx docs/wp-2527m-replay.ts` from this worktree. Base: `21f51e19fd4071942ce9a8aa1745fb198d508cfd` (includes WP-2527J). The script loads base/current cases and scorers, pins the changed-case list, hashes definitions/scorers, preserves archived scalar checks and uses archived row truth only. Older no-backups truth rows contain a derived status followed by four counts; both sides identically drop that status to match the base's count-only contract. No fresh truth is queried.

| Read-only replay root | JSON files | Compared records | Unknown ids skipped |
|---|---:|---:|---:|
| `../eval-archive` | 496 | 11,157 | 113 |
| `../needlefish/evals/results` | 139 | 3,186 | 0 |
| coordinator scratchpad `gate150` | 10 | 365 | 0 |
| coordinator scratchpad `gate150b` | 10 | 365 | 0 |

Total: 655 files, 15,073 compared records, 113 unknown records skipped. Roots may contain duplicate runs; records are not deduplicated. Both gate roots are under `/tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad/`.

**Zero unrelated pass/fail flips and zero unrelated check differences.** Three justified false-to-true flips, all iteration 1 in gate150b:

| Case | Archive filename | Justification |
|---|---|---|
| hard-p27-refuse-metric-history | `2026-11-07T07-26-30-046Z-f8d0a5bd-c152-4537-8c22-4960e2f3fdba.json` | Correct “None of these provide a true \"last hour\" time-windowed view.” now satisfies the negation fact. |
| hard-p25-d1-no-backups-recorded | `2026-11-07T07-49-46-340Z-c2be0f9d-aa62-4cb9-9407-ed916c4c5f4e.json` | Count column supplies the four distinct zero values without treating presentation/source columns as values. |
| hard-p25-d1-last-level0 | `2026-11-07T08-15-01-899Z-b1535511-6d35-4d18-839e-3845e04cfbc3.json` | Correct control-file limitation with ≠ / only proves / nothing now satisfies the bounded limitation fact. |

No flips for hard-p27-refuse-ash, hard-p27-refuse-awr or hard-p27-refuse-repository. There are 31 check differences: six each for the five changed regex cases (the check description embeds the regex), plus the corrected no-backups row check. Complete file/iteration details are in the replay JSON.

## Verification

- `npm run typecheck`: PASS, exit 0.
- `npm test -- --maxWorkers=2`: PASS, 126 files, 2,292 tests, exit 0 (84.65 seconds).
- Focused WP-2527M test: PASS, 2 tests.
- Offline replay: PASS, exit 0; zero unrelated flips/check differences.
- `git diff --check`: PASS.

Used the authorized `node_modules -> ../needlefish/node_modules` symlink; no dependencies added. No contract changes needed. Integration/live behavior was not exercised: this is offline eval calibration, with no product source changes. No push or merge performed.

## Coordinator review correction

Added word boundaries to the last-level0 word-negation alternatives so `no` cannot match inside now, know or note. Kept ≠ outside the boundaries. Added exact fixtures asserting that “The control-file record now proves the backup is restorable.” and “We know it proves the backup is restorable.” fail, and “There is no proof the backup is restorable.” passes. Updated the definition checksum and replay artifact.

Replayed against the same original branch base with all four roots (including gate150b): 15,073 compared records; the same three justified false-to-true flips listed above; zero unrelated flips or check differences. No additional flips resulted from the boundary correction. No DB/LLM calls or contract changes.

Review verification rerun:

- Focused `vitest run tests/unit/wp2527m-refusal-regex.test.ts --maxWorkers=2`: PASS, 1 file / 2 tests, exit 0.
- `npm run typecheck`: PASS, exit 0.
- `npm test -- --maxWorkers=2`: PASS, 126 files / 2,292 tests, exit 0 (82.09 seconds).
- `node_modules/.bin/tsx docs/wp-2527m-replay.ts`: PASS, exit 0.
- `git diff --check`: PASS.
