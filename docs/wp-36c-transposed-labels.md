# WP-36C: transposed rowCells labels

## Built

`rowMatches` now recognizes two-column `Attribute | Value` tables for one- or
two-field truth rows. It normalizes case, Markdown, underscores, spaces and
punctuation in row labels. Every truth-column word must match a whole label
word. Extra words are limited to the neutral set `time`, `date`, `status`,
`state`, `value`, `setting`, `recorded`, and `current`; negated and historical
qualifiers fail. It handles assignments across columns together, preferring
exact labels and then labels with fewer extra words. Equally ranked duplicate
rows must all agree with truth. The scorer retains explicit Oracle wording such
as `Current container` and `Parent CDB` for the corresponding database fields.

Cell values still use the existing matcher, including positive
`Yes (`TRUE`)` annotations. Explicit dash explanations are accepted when they
repeat the asserted value and contain no negation, including `NO — STALE_STATS
= NO`. That guard was added in this branch; the `NO` repetition asymmetry is
fixed. The reported three-column loose multiset behavior was also reproduced
with both master and branch scorers; it is inherited and unchanged here.

The real `hard-p26-p1-next-run-semantics` definition is exercised with the exact
Phase 35 gate B answer from `2026-11-09T17-53-00-249Z-3ea1d9e4-ec82-499d-97b2-bba4dd239409.json`.
Wrong `NOT RECORDED`, `PRESENT` under `Owner`, and `Not TRUE` all fail.
Tests also reject every reviewed negation/history qualifier, non-neutral label
extras, `Runaway` prefix lookalikes, and conflicting duplicate rows in either
order. A swapped-order `RUN`/`NEXT_RUN` table passes through global assignment.

## Files changed

- `evals/scoring.ts`
- `evals/replay-scorer-archive.ts`
- `tests/unit/row-cells.test.ts`
- `docs/wp-36c-transposed-labels.md`

## Archive replay

Ran `npx tsx evals/replay-scorer-archive.ts phase25-27 phase28 phase29 phase30 phase31 phase32 phase33 phase34 phase35`. This directly compares the scorer loaded from `git show master:evals/scoring.ts` with the branch scorer for the same reconstructed test, answer, and truth on all eligible result records. The baseline source was verified as the current `master` ref; it is distinct from the older `8b6ef1c` source used by the template replay tool. The replay covered **6,023 records: 0 pass-to-fail and 2 fail-to-pass**.

I read both flipped answers. The Phase 30 answer correctly reports stale and global statistics as YES, with matching `STALE_STATS = YES` and `GLOBAL_STATS = YES` annotations. The Phase 35 answer is the correct scheduler answer and explains that PRESENT is a planned estimate, not a guarantee.

| Case ID | Iteration | Archive file (relative to `eval-archive`) |
|---|---:|---|
| `hard-p21-products-stats` | 2 | `phase30/b-48bf50e/2026-11-08T04-12-09-571Z-7f92f692-4f2a-46d1-8730-b5ec5f2e492d.json` |
| `hard-p26-p1-next-run-semantics` | 1 | `phase35/gateB/2026-11-09T17-53-00-249Z-3ea1d9e4-ec82-499d-97b2-bba4dd239409.json` |

## Validation

- Master comparison for the existing archived-answer test: pass on `/home/kiwi/orca/projects/OracleDBPiAgent` (master, read-only).
- Focused `tests/unit/row-cells.test.ts`: **18 passed**.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **148 files passed, 2,959 tests passed**.
- Eval suite and Strata e2e were not run; no LLM calls were made.

## Contracts and unverified items

No changes to `src/contracts.ts`, `package.json`, or `PLAN.md` are needed. No DB or LLM code changed, so integration tests were not run. Archive replay is local scoring only and uses no LLM calls.
