# WP-19D: p19 SQL performance evals

Four challenge cases in `evals/cases-hard/phase19-sqlperf.json`. No product code changes.

The existing price-plan case tests access operations and objects. p19 instead tests
plan-hash/child inventory, table and index optimizer statistics, capture-only bind
metadata, and attached plan-management names. No statement IDs or expected values
are pinned in the case definitions, and the discovered application statement is
never executed by setup. All questions avoid tool and dictionary-view names.

Each fixed truth SELECT discovers the workload SELECT by its stable text prefix,
SHOPAPP parsing schema and SELECT command type. Lexicographically lowest statement
ID breaks ties. Discovery uses the fixed interval [2026-10-01, 2027-01-01) with
explicit `TO_TIMESTAMP_TZ` UTC literals; timezone-less Oracle DATEs are attached
to this local harness's UTC clock explicitly. Statistics timestamps are rendered
as UTC strings to the second. No bind values are selected.

## Verified truth

Verified independently with the eval ground-truth reader, read-only transactions,
and configured HARNESS_RO account on p1, on 2026-11-05 before the LLM measurement.
Every final truth query returned rows:

- `hard-p19-cursor-inventory`: `[[2134003100, 1]]`
- `hard-p19-object-statistics`: `[["SHOPAPP", "PRODUCTS", "YES", "2026-11-04T22:00:07Z"], ["SHOPAPP", "SYS_C007655", "YES", "2026-11-04T22:00:07Z"]]`
- `hard-p19-bind-metadata`: `[[":B1", 1, "NUMBER", "YES"]]`
- `hard-p19-plan-controls`: `[[0, 0]]`

These are verification observations, not fixed expectations. Cursor-cache and
statistics changes remain visible in runtime truth. All aggregate truth queries
use grouping or HAVING so a missing application cursor yields zero rows rather
than a fabricated zero count.

## Runner contracts (implemented by coordinator-authorized follow-up)

`EvalCase.skipWhenTruthEmpty?: boolean` is opt-in and enabled on all p19 cases.
Before-ask empty truth records `skipped: true` and `skipReason`, with no ask,
score, or post-truth call. After-ask empty truth also records a skip and preserves
incurred usage and tool traces. Errors still record sanitized failures; they do
not become skips. Cases without the flag retain the original behavior.

Reports add overall `evaluated` and `skipped` counts and per-case evaluated/skip
counts. Pass rates and refusal results use non-skipped observations only. A
skipped record keeps `pass: false` for compatibility with legacy record readers;
readers must check `skipped` first. An all-skipped run has evaluated=0 and the
legacy numeric passRate=0 convention; the eval CLI does not fail its rate gate
when there are no evaluated cases. Markdown and console output show SKIP and its
reason separately from PASS/FAIL. Usage totals include incurred post-ask work.

Paired comparison drops a pair from all metrics if either observation skipped;
per-case comparison drops skipped observations before grouping. Skip observation
counts are reported by side. Paired comparisons with no eligible observations
return no cases and null suite metrics; per-case comparison still rejects a run
with no common evaluable cases. Legacy report rows without the flag are eligible.

The runner accepts a directory for `--suite`, not a logical `p19` alias. Continue
to select p19 from the hard directory by its four IDs; no alias change is needed
for this follow-up. No shared product contract change is needed.

## Reproduction

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run eval -- \
  --suite evals/cases-hard --repeat 2 \
  hard-p19-cursor-inventory hard-p19-object-statistics \
  hard-p19-bind-metadata hard-p19-plan-controls
```

The primary Strata health check reported loaded. One process performs both
iterations sequentially, using only primary loopback Strata. No secondary calls.

## Original measurement results (before follow-up)

Raw local JSON: `evals/results/2026-11-05T15-29-17-162Z-ce4348ca-4c0d-45d0-9dce-fc2ea51f7d43.json` (git-ignored).

| Case | Iteration 1 | Iteration 2 |
|---|---|---|
| `hard-p19-cursor-inventory` | PASS (33189 ms) | PASS (54872 ms) |
| `hard-p19-object-statistics` | PASS (66276 ms) | FAIL (102228 ms) |
| `hard-p19-bind-metadata` | PASS (36995 ms) | PASS (32425 ms) |
| `hard-p19-plan-controls` | FAIL (31735 ms) | FAIL (63652 ms) |

Raw scores: iteration 1 **3/4**, iteration 2 **2/4**, total **5/8 (62.5%)**.
No empty truths or skips occurred. No refusal cases are included.

Answer/trace review:

- Plan controls, iteration 2: **whole-case scorer false negative**. The agent
  found the correct application cursor and correctly reported both attached
  counts as zero, with the proper limitation on inferring repository absence.
  The answer placed the two labelled counts in separate bullets. `rowCells`
  requires them in one record; its separate-labelled-fact pooling is p18-only.
- Plan controls, iteration 1: the same separate-bullet scoring limitation occurs,
  but **this is also a real answer failure**. Broad text matching selected a
  diagnostic query that contained the application text, rather than the
  application SELECT. Both counts happened to be zero on the wrong cursor.
  The explanation also incorrectly described SQL_ID columns in management views.
- Object statistics, iteration 2: **real incomplete/incorrect answer**. It
  correctly found PRODUCTS and its index, and the table's stale flag, but used
  ALL_INDEXES and claimed no per-index stale flag was available. The truth read
  DBA_IND_STATISTICS.STALE_STATS = YES successfully. It also printed correct
  timestamps as `2026-11-04 22:00:07` under a UTC header, whereas the scorer
  requires the literal `2026-11-04T22:00:07Z`. That is a timestamp-format false
  negative for otherwise equivalent date values, but fixing it would not repair
  the missing index stale flag.

Manual assessment therefore gives **6/8**, with two genuine answer failures;
this does not replace the recorded raw score. Cases were not tuned after the run.
The legacy scorer can also miss wrong-cursor reasoning when numeric values
coincide: plan-controls truth checks the two counts, not cursor identity or the
prose caveat. Keep this limitation in mind when interpreting a future pass.

Original scorer needs were separate labelled single-record facts beyond p18
and equivalent explicit UTC timestamp formats. No scoring changes were made in
the initial commit; the coordinator-authorized follow-up below implements both
for p19 while preserving object/value association.

Usage: 34769 input, 265292 cached, 30056 output tokens; 48 tool calls; 421779 ms overall.

Tool errors: 5/48 calls (3 ORA-00904, 1 ORA-01843, 1 ORA-00942); the agent continued after these errors.

## Initial validation and changes

- `npm run typecheck`: PASS (exit 0).
- `npm test`: PASS, 77 files / 1,150 tests. The hard-suite cardinality assertion
  was updated from 99 to 103 for these four new definitions. Initial run exposed
  that expected assertion failure; after updating it, the complete suite passed.
- `git diff --check`: PASS.
- Integration tests were not run: no DB/LLM implementation code was changed.
  Live truth SELECTs and both complete LLM iterations were performed instead.

Initial commit files: the new case JSON, this note, and the existing hard-eval unit-test
cardinality assertion. No PLAN, package, shared contract, runner or product edits.
Original limitation, resolved by the follow-up below: aged-out cases needed a
runner skip contract. No multi-child mismatch or multi-plan regression fixture
exists for this live statement, so these cases make no claim to cover those paths.

## Coordinator follow-up (2026-11-05)

Plan-controls truth now returns `s.sql_id AS sql_id` alongside the two attached
name counts, grouped by that runtime-discovered ID. Read-only verification on p1
returned `[["f1yj0hbhj9nna", 0, 0]]`; all other truth queries were re-read and
returned the same values listed above. No statement ID is pinned in case SQL.

The p19-only scorer accepts positive labelled single-record facts spread across
bullets, including a uniquely labelled cursor identity from an inline fact or
named table. Multi-row truth still cannot pool unrelated records. It also
canonicalizes equivalent timestamp spellings for p19 when the answer labels the
line/table as UTC or explicitly says all times/timestamps are UTC; an ISO Z or
+00:00 timestamp carries its own UTC marker. Unmarked local dates, non-UTC
markers, nonzero offsets, wrong timestamps and wrong object/value associations
remain rejected. P18's existing labelled-fact behavior is unchanged.

### Offline replay

The replay helper reconstructs historical truth and expectations from archived
checks, uses current case SQL only for column labels, and compares scorer code
at baseline commit `4ff40db` with the new scorer on identical reconstructed input.
This is a differential replay, not a comparison to verdicts from older scorer
versions stored in historical reports. It never queries a DB or calls an LLM.

```sh
npx tsx tests/helpers/replay-scoring-19d.ts docs/wp-19d-scorer-replay.json \
  /home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive evals/results
```

The entire shared archive contained 397 reports / 9,266 records, including 9
execution failures with no answer/checks to rescore. All 9,257 answered records
were replayed. There were **zero non-p19 verdict flips and zero non-p19 check
changes**. No p19 records existed in the shared archive, so the saved local p19
measurement was included as a separate replay root: one report / eight answers.
Total: 398 reports, 9,265 scored answers, nine unanswered execution failures.

Every p19 verdict flip under the original archived two-count truth:

| Case / iteration | Baseline | New scorer | Reason |
|---|---|---|---|
| plan-controls / 1 | FAIL | PASS | Separate labelled zero-count bullets now pool; old truth lacks identity |
| plan-controls / 2 | FAIL | PASS | Separate labelled zero-count bullets now pool |

The timestamp change also clears the PRODUCTS row check in object-statistics /
2, but that case stays FAIL because the index stale flag is still missing. No
other p19 checks changed. Full replay details are committed in
[wp-19d-scorer-replay.json](wp-19d-scorer-replay.json).

The helper separately replays plan-controls with the new three-column truth.
It recovers the real application SQL_ID from recorded application-text evidence
across that saved run, independently of the answer's selected ID. Iteration 1
stays **FAIL** (wrong cursor); iteration 2 becomes **PASS** (correct cursor and
counts). Thus the final scorer plus strengthened truth gives **6/8**, not the
7/8 that count-only truth would permit. Original artifact files remain unchanged.
These are replay results, not a new live measurement.

### Follow-up validation

- `npm run typecheck`: PASS.
- `npm test`: PASS, 80 files / 1,163 tests, including before/after empty truth,
  disabled skip behavior, sanitized errors, all-skipped runs, both comparison
  modes, cursor identity, p19-only pooling/UTC normalization, negative fixtures,
  and replay reconstruction/traversal.
- `git diff --check`: PASS.
- No LLM evals or health calls were made during this follow-up. The coordinator
  will measure in the gate. Live empty-cache behavior was not induced; unit
  tests exercise both empty-truth boundaries with stubbed dependencies.

Follow-up files: `evals/cases-hard/phase19-sqlperf.json`, `evals/types.ts`,
`evals/run.ts`, `evals/compare.ts`, `evals/scoring.ts`,
`tests/helpers/replay-scoring-19d.ts`, three `tests/unit/phase19-*.test.ts` files,
this note, and the committed replay summary. Product code, PLAN, package and
shared contracts remain unchanged. No remaining shared contract request.
