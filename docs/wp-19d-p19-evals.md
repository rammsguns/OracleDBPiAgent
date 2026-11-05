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

## Runner contracts needed

The runner has **no skip mechanism**: `score` always requires nonempty truth,
and `runEvals` records only boolean pass/fail. Required coordinator change:
add an opt-in empty-truth skip flag to the ground-truth case contract; before
asking the LLM, record an explicit skipped status and reason when truth is empty;
exclude skips from pass-rate denominators and per-case failures. Also handle a
cursor disappearing during the ask (post-truth becomes empty) as skipped rather
than failed. Apply the flag to all four p19 cases when supported. Until then,
empty truth is a known runner limitation, not evidence of an agent failure.
All preflight truths were nonempty, so this limitation did not block measurement.

The runner accepts a directory for `--suite`, not a logical `p19` alias. p19 is
selected from the hard directory by its four IDs. No unsupported JSON flags were
added. A `--suite p19` alias would need a coordinator-owned runner mapping.

## Reproduction

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run eval -- \
  --suite evals/cases-hard --repeat 2 \
  hard-p19-cursor-inventory hard-p19-object-statistics \
  hard-p19-bind-metadata hard-p19-plan-controls
```

The primary Strata health check reported loaded. One process performs both
iterations sequentially, using only primary loopback Strata. No secondary calls.

## Measurement results

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

Additional scorer needs (outside this WP): handle separate, correctly labelled
single-record facts beyond p18, and equivalent explicit UTC timestamp formats.
Preserve object/value association when doing so. No scoring changes made here.

Usage: 34769 input, 265292 cached, 30056 output tokens; 48 tool calls; 421779 ms overall.

Tool errors: 5/48 calls (3 ORA-00904, 1 ORA-01843, 1 ORA-00942); the agent continued after these errors.

## Validation and changes

- `npm run typecheck`: PASS (exit 0).
- `npm test`: PASS, 77 files / 1,150 tests. The hard-suite cardinality assertion
  was updated from 99 to 103 for these four new definitions. Initial run exposed
  that expected assertion failure; after updating it, the complete suite passed.
- `git diff --check`: PASS.
- Integration tests were not run: no DB/LLM implementation code was changed.
  Live truth SELECTs and both complete LLM iterations were performed instead.

Changed files: the new case JSON, this note, and the existing hard-eval unit-test
cardinality assertion. No PLAN, package, shared contract, runner or product edits.
Unverified: aged-out behavior cannot meet the skip requirement until the runner
contract is extended; no multi-child mismatch or multi-plan regression fixture
exists for this live statement, so these cases make no claim to cover those paths.
