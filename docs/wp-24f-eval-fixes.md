# WP-24F eval scorer and case fixes

Both phase-23 gate defects are fixed. No agent or Strata calls were made. Database verification used the existing read-only session provider and approved 19c targets, with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.

## Scorer root cause

`rowMatches` converts a recognized Markdown table into named bindings such as `wait_class=System I/O / event_count=40`. Its binding regex treated **every slash** as a delimiter, extracting `System I` and failing the named-column consistency check before whole-cell matching. Cell cleaning and numeric matching were not the cause.

The binding parser now treats a whitespace-delimited slash as the field separator, consistently with the existing field parser, and preserves embedded literal slashes. Whole-value and named-column checks remain in place. Tests cover exact `System I/O`, `User I/O`, filesystem paths and `A/B` in tables and named records; partial `I/O`, truncations, extra text, wrong values and swapped columns fail. Existing non-slash matching remains covered by the suite.

## Redo case and live validation

`hard-p24-d1-redo-layout` now returns four per-group truth fields: thread number, group number, size bytes and member count. Its own `requiredFacts` check requires an explicit total of three groups, separately from the rows. No global total-count scoring rule was added. The DB validator fails closed unless this case returns exactly three rows of four fields. Tests exercise valid totals, omitted and wrong totals (including 30), missing rows and the old five-field shape.

Live commands:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets node_modules/.bin/tsx evals/validate-hard.ts
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets node_modules/.bin/tsx evals/validate-p24.ts
```

`validate-hard`: **113 ground-truth queries validated for 135 cases**. Updated `evals/hard-ground-truth-validation.json`, including the four-field redo record.

The p24 validator ran the full hard validator twice and compared all six p24 truths. First sample: 2026-11-06T16:06:57.261Z–16:07:06.375Z. Second: 16:08:06.379Z–16:08:14.753Z. The gap from first completion to second start was **60,004 ms**, and all six truths were identical. Updated [the stability record](wp-24d-p24-truth-stability.json).

## Full offline archive replay

Committed [replay script](wp-24f-replay.ts) and [complete JSON results](wp-24f-replay.json). Run from this worktree root:

```sh
node_modules/.bin/tsx docs/wp-24f-replay.ts
```

Baseline: `fda1a2feabc058618ac0d9fc9477db82d168fb42`. The script compares baseline scorer/cases with current scorer/cases, and records a scorer-only intermediate result. It extracts archived truth from checks, never queries current DB truth, and projects the archived fifth redo cell away only for the changed redo case. Archived scalar/allCells checks remain fixed because complete pre/post scalar bounds are not always retained. The 113 retired-case records have no rowCells checks, so they cannot call the changed function; their archived results are preserved, and the script throws if an unknown rowCells case appears. These retired IDs are listed in the JSON.

| Root | JSON files | Records |
| --- | ---: | ---: |
| `../eval-archive` | 479 | 10,856 |
| `../needlefish/evals/results` | 136 | 3,174 |
| Total | 615 | 14,030 |

Exactly **two record flips**, both false → true, both iteration 1 in `../eval-archive/phase23/gate-23/2026-11-06T16-03-55-312Z-695391b9-a7ac-487f-a70e-3a4fff340a78.json`:

1. `hard-p23-p1-event-definition-counts`: the answer associates `System I/O` with 40 and `User I/O` with 59 correctly. Those two truth checks now pass because the binding parser preserves their literal slashes. The Idle/140 check already passed. This flip occurs with the scorer fix alone.
2. `hard-p24-d1-redo-layout`: all three rows correctly state thread 1, groups 1/2/3, 209715200 bytes and one member. The separate `Total group count: 3` satisfies the new case fact. Requiring an additional 3 in every row was the defective truth. The scorer-only intermediate still fails; the case correction produces this flip.

There are no other record flips, and no pass-to-fail flips. The JSON also lists the two changed slash row checks, including changes that would not affect a record's overall verdict.

## Gate-23 before and after

The `files.tsv` manifest contains dev1, dev2 and challenge1. Only challenge1 contains p23/p24 records; all twelve are individually re-scored in the JSON.

| Suite | Archived / baseline | Fixed |
| --- | ---: | ---: |
| p23 | 5/6 | 6/6 |
| p24 | 4/6 | 5/6 |
| Combined | 9/12 | 11/12 |

The remaining failure is `hard-p24-p1-autoextend-max`, whose answer still fails four exact capacity row checks (SHOP_DATA, SYSAUX, SYSTEM and USERS). No scoring relaxation was applied. The challenge run therefore improves from 53/60 to 55/60 with these two corrections; dev1 and dev2 remain 30/30.

## Verification

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **102 files passed; 1,579 tests passed**, 26.73 seconds.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: **26 files passed; 61 tests passed, 1 skipped**, 79.88 seconds. The skipped test is the excluded Strata end-to-end ask.
- Suite membership, historical checksum tests and existing scorer tests pass. No existing checksum covers the changed p24 case, so no frozen fixture or checksum change was needed.

Files changed: `evals/scoring.ts`, `evals/cases-hard/phase24-space.json`, `evals/validate-hard.ts`, `evals/hard-ground-truth-validation.json`, `tests/unit/phase24-evals.test.ts`, `tests/unit/wp-24f-scoring.test.ts`, `docs/wp-24d-p24-truth-stability.json`, `docs/wp-24f-replay.ts`, `docs/wp-24f-replay.json`, and this report.

Contract changes needed: **none**. No changes to `src/contracts.ts`, `package.json` or `PLAN.md`; no dependencies added. The initially absent worktree dependencies were linked to packages already installed in `../needlefish/node_modules`. Initial validator attempts failed on missing `oracledb`; both validators passed after linking the installed dependencies.

Nothing remains unverified within the requested scope. Agent/LLM behavior was deliberately not exercised; archived answers were replayed offline.
