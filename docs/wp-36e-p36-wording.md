# WP-36E p36 wording variants

## Built

Expanded the missing-view `requiredFacts` wording in all three p36 cases to accept `doesn't`/`doesn’t exist`, `isn't`/`isn’t valid`, `is not a valid`, `not valid`, `nonexistent`/`non-existent`, `no such`, and the existing alternatives, in either order within the existing 70-character proximity. Review round 1 also tightened proximity and positive wording, and expanded the forbidden claims for readable views.

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

## Review round 1 changes

Mirrored the missing-view variants in the forbidden claims for each readable view. Those checks cover prose and table forms with plain, backticked, or bold names, both phrase/name orders, and a `V$LOG` boundary so it cannot match `V$LOGMEMBER`. Forbidden proximity stops at another `V$` object or a column reference, preventing join errors and missing-column notes from marking a readable view unavailable.

Bound missing-view and positive readable-view facts to `[^.\\n]{0,70}` on the same sentence and line. Positive terms guard against negated `valid`, `readable`, `usable`, or `exists` wording. Added all four reviewer examples as scorer MUST FAIL fixtures, tested the negative variants across formatting/order combinations, and added the exact gateA answer as a MUST PASS fixture. Earlier MUST PASS and MUST FAIL fixtures remain in the production-scorer test.

A temporary TypeScript rescore script loaded the real p36 case definitions and scorer, then walked every JSON record in `/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive/phase36/gateB`. Result: 24 split-p36 records, 24/24 pass with the revised case file (all 24 were also archived as passing). The script reported no failing checks and was removed after the run.
