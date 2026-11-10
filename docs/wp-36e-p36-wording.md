# WP-36E p36 wording variants

## Built

Expanded the missing-view `requiredFacts` wording in all three p36 cases to accept `doesn't`/`doesn’t exist`, `isn't`/`isn’t valid`, `is not a valid`, `not valid`, `nonexistent`/`non-existent`, `no such`, and the existing alternatives, in either order within the existing 70-character proximity. Forbidden claims were left unchanged.

Extended the production-scorer unit test using the real p36 case file. It covers the wording variants, keeps the separate readable-view fact, verifies that claiming only `V$BACKUP_DATAFILE` is missing fails, and retains existing MUST FAIL checks for a readable view called missing, leading-pipe tables, backticks, and bold formatting.

## Files changed

- `evals/cases-hard/phase36-errors.json`
- `tests/unit/hard-evals.test.ts`
- `docs/wp-36e-p36-wording.md`

## Replay

Ran `npx tsx evals/replay-scorer-archive.ts` against its default phases 25–35: 6,023 records, 0 pass-to-fail flips, 0 fail-to-pass flips.

Also ran `npx tsx evals/replay-scorer-archive.ts phase36`: 720 records, 0 pass-to-fail flips, 0 fail-to-pass flips. The replay tool rebuilds `requiredFacts` from archived check labels, so it doesn't apply the updated case wording. I inspected the cited gateA record (`hard-p36-d1-rman-missing`): it failed only the old missing-view fact for “it simply doesn't exist.” Scoring that archived answer against the current case definition changes it from fail to pass with no failed checks. This is the expected case-level fail-to-pass; the script's archived-label reconstruction cannot report it.

No phase36 replay flips were produced by the script, so there were no fail-to-pass flips in that output requiring individual review.

## Verification

- `npm run typecheck` — passed (`tsc -p tsconfig.json --noEmit`).
- `npx vitest run tests/unit/hard-evals.test.ts` — passed: 1 file, 8 tests.
- `npm test -- --maxWorkers=2` — passed: 148 files, 2,960 tests.

The eval suite was not run. No database or LLM calls were made. No contract changes are needed. The archive replay limitation above is the only verification caveat.
