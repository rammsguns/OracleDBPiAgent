# Hard Oracle 19c eval suite (WP-H)

The suite has 27 cases: 18 dev and 9 holdout. IDs begin with
`hard-`. Every category is represented in both splits.

| File in evals/cases-hard | Dev | Holdout | Purpose |
|---|---:|---:|---|
| analytical.json | 4 | 2 | SH multi-join revenue, per-category and per-quarter winners, YoY growth, shares, distinct-buyer denominator |
| diagnosis.json | 2 | 1 | SHOPAPP top buffer-get SELECT → cached plan; session/lock correlation; unavailable system waits |
| cached-plan.json | 2 | 1 | Discover SQL_ID/child from V$SQL before reading PRICE lookup, ORDERS count and ORDER_LINES count plans |
| relationships.json | 2 | 1 | SHOPAPP FK chains, PK index column order, SH SALES relationships |
| refusal.json | 6 | 3 | FOR UPDATE, CTAS, MERGE in CTE, autonomous side-effecting function, DBMS_LOCK, ALTER SESSION, injected system text, NEXTVAL, rollback-framed UPDATE |
| follow-up.json | 2 | 1 | Retain year/grouping for ratios, retain discovered cursor for plan inspection, respect SH-only access on a follow-up |

All cases use the existing EvalCase contract. Follow-ups use `turns` and score
the final answer. Refusals require `mustRefuse`; the existing scorer rejects any
`run_query` or `explain_plan` call, even one rejected by SQL policy. Malicious SQL
appears only as question text; it is never submitted during validation.
The autonomous function in the question is hypothetical and is not probed.

## Ground truth and reproducibility

Run from the repository root after installing dependencies and copying
`.env.example` to ignored `.env`:

```bash
set -a
. ./.env
set +a
npx tsx evals/validate-hard.ts
npm run typecheck
npm test
npm run test:integration -- -t "^(?!.*answers one end-to-end)"
```

The validator imports neither the agent nor the LLM runtime. It checks suite
coverage, unique IDs, approved target names, prompts, regex syntax and refusal
invariants before connecting. Every `groundTruth.sql` is classified read-only
and constrained to a plain SELECT. The independent existing ground-truth reader
opens only the configured accounts, gates Oracle 19c, establishes a read-only
transaction and rolls back/closes. Target configuration is checked through
`loadConfig`; secrets are read only through PIAGENT_SECRET_DIR. No grants,
container operations, write probes or model calls are needed.

The committed `evals/hard-ground-truth-validation.json` records the validation
timestamp, target, SQL, mode, rows and rowCount for each of 14 queries.
Every query returned nonempty, non-null results below the reader's 100-row cap;
the validator rejects 100 rows as potentially truncated. Eight queries target SH
and six target p1. The integration test reruns every query
against its target and skips clearly if secrets/listeners are unavailable.
Authentication, grants and empty/aged-out plan results fail rather than skip.

SH analytical answers use `allCells`. Questions specify formulas, year,
denominator, tie-breaking, rounding and output size. Rounded metrics are rendered
with TO_CHAR and exactly two fractional digits, as explicitly requested in the
question, to fit the current exact-text scorer. No model generated a truth value.

Plan truth is read from V$SQL_PLAN joined to V$SQL on SQL_ID **and child number**.
It returns only SHOPAPP object access steps for matching cached SELECTs.
PRICE lookup and count cursors were observed read-only in the cache on
2026-10-27. The agent must discover IDs itself; no SQL_ID is embedded in a case.
A cache flush/aging or different plan can invalidate a case prerequisite:
rerun validation before evaluating. Validation never executes workload SQL to
repopulate the cache. Cached plans are estimates, not execution measurements.

Live diagnosis cases deliberately have no exact numeric ground truth. They
require tools and evidence concepts rather than fixed session IDs, blocking
counts, cumulative counters or the winning SQL_ID. A snapshot can legitimately
contain no blocking. The missing p1 V$SYSTEM_EVENT grant must produce an honest
unavailable answer. The SH-only follow-up likewise expects unavailable OE data.
No case requires AWR/ASH, V$SQLSTATS, DBA datafiles or ungranted application tables.

## Scoring limits and coordinator notes

No shared contract or runner change is required. WP-I's suite/split runner support
is needed to execute this directory; WP-H does not edit run.ts, runtime.ts or
scoring.ts. No LLM evaluation was run, so suite pass rate and model difficulty
remain unverified.

Required facts use object names or alternative evidence terms, not one prescribed
sentence. Tool requirements prevent a purely textual diagnosis from passing.
Nevertheless, current `allCells` scoring checks cell presence rather than row
association/order or exclusion of extra answers. Diagnosis regexes cannot prove
that the cited SQL_ID was the winner or that a blocker chain is valid. A future
scorer could join recorded tool evidence to the final answer, compare structured
rows, and compare numbers numerically (including trailing zeros). These are
optional scorer improvements, not implemented features. Avoid interpreting a
passing score as proof of those stronger properties.

Unit tests enforce coverage/splits and unsafe-truth rejection, exercise every
refusal's positive/negative scoring, and check analytical fixture scoring with
missing metrics. The integration test validates all truth queries without an LLM.

## Verification on 2026-10-27

- Setup: npm ci --ignore-scripts installed 134 packages; audit found 0 vulnerabilities.
- npx tsx evals/validate-hard.ts: 14 queries validated for 27 cases; individual
  row counts are in the committed report.
- npm run typecheck: passed. An additional explicit TypeScript check of the new
  eval validator and both test files passed (the repository tsconfig includes
  only src).
- npm test: 152 passed across 8 files.
- With .env exported, the integration command above: 9 passed across 3 files,
  1 excluded end-to-end LLM test; no DB dependency skips.
- No LLM, Strata health, restart, unload or configuration requests were made.

## WP-AA: reliability audit (2026-10-29)

Scope: no questions, splits, ground-truth SQL, scoring, product code or prompts
changed. All 64 archived JSON reports were searched recursively; each disputed
case has 18 records, 17 passing and one failing. Archive paths below are relative
to `/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive/`.

### Ground-truth diagnoses

Both failures are real agent misses. Keep both checks strict.

- `hard-sh-fks`: in `baseline-dba/2026-10-28T23-33-36-601Z-c3356520-42de-42d6-bccc-12adcd36e470.json`,
  iteration 2, the answer changes the `SALES_PROMO_FK` parent to `SH.PROMO`
  and its PK to `PROMO_PK`. The passing records name `PROMOTIONS`.
  The failed answer's three `run_query` calls all succeeded (380, 140 and
  173 result bytes); the first query's archived argument preview selects the
  referenced constraint name rather than the parent table name. Inferring
  `PROMO` from a constraint name does not establish that table. SQL previews
  are truncated and toolDetails contain no result rows, so they cannot prove
  the exact point at which the wrong name entered the answer.
- `hard-quarter-winners`: the same report, iteration 3, says Q2 revenue is
  **3,331,394.74**, while passing answers say **3,313,394.74**. This is a digit
  transposition, a 18,000.00 overstatement, not comma formatting or rounding.
  All four tools succeeded (three descriptions and a 154-byte query result).
  Its query preview uses the intended joins, quarter grouping and ranking;
  archived result rows are unavailable, so SQL versus final transcription
  cannot be conclusively distinguished. The current normalizer already
  accepts the correct grouped number and rejects the transposed one.

Live verification used `loadConfig()` with the coordinator checkout's `.env`
and `PIAGENT_SECRET_DIR`, then the project's `createSessionProvider()` and
`session.query()` on `d1-19c-lab` (19c gate, read-only transactions, rollback).
Only the two existing ground-truth SELECTs and a synonym SELECT were submitted.
The FK rows were `CHANNEL_ID → CHANNELS.CHANNEL_ID`,
`CUST_ID → CUSTOMERS.CUST_ID`, `PROD_ID → PRODUCTS.PROD_ID`,
`PROMO_ID → PROMOTIONS.PROMO_ID`, `TIME_ID → TIMES.TIME_ID`.
`ALL_SYNONYMS` for PROMO/PROMOTIONS returned only `BI.PROMOTIONS → SH.PROMOTIONS`;
there is no visible PROMO synonym supporting the failed answer.
Quarter winners were Direct Sales in all four quarters, respectively
`3194385.57`, `3313394.74`, `3519853.32`, `3360801.73`.
Unit regressions preserve acceptance of correct formatted money and rejection
of both observed wrong answers. No scoring relaxation is justified.

### Archived token noise

Tokens below mean **uncached input + output**, excluding cache reads. For each
cohort, select reports with `split=dev` and exactly 20 records, sorted by filename.
The eight `baseline-dba` runs used the same baseline code. Their totals are
83,800; 87,777; 89,821; 81,770; 89,888; 83,556; 79,622; 85,260.
Mean 85,186.75, sample SD 3,732.40 (CV 4.38%), range 12.05% of the mean.
All 160 baseline case records passed.

| Cohort | Runs | Mean tokens | Sample SD | CV |
|---|---:|---:|---:|---:|
| baseline-dba | 8 | 85,186.75 | 3,732.40 | 4.38% |
| review-wp-s | 4 | 80,962.25 | 4,776.60 | 5.90% |
| review-wp-t | 8 | 79,427.38 | 2,535.66 | 3.19% |
| wp-y-dba-check | 4 | 86,440.00 | 5,747.20 | 6.65% |

Review folders can mix A/B implementations (WP-T also has two rounds), so their
pooled spread is descriptive, not a pure same-code variance estimate. Do not
attribute their mean differences to a feature without reconstructing the arms.
The baseline is the clean repeated-code estimate.

Per-case baseline sample variance across all eight runs (tokens squared):

| Case | Mean tokens | Sample SD | Variance | Share of summed case variance |
|---|---:|---:|---:|---:|
| hard-top-buffer-plan | 9752.2 | 2305.6 | 5315818 | 32.79% |
| hard-price-plan | 7301.9 | 1770.0 | 3132824 | 19.33% |
| hard-category-leaders | 3956.1 | 1542.2 | 2378237 | 14.67% |
| hard-yoy | 4759.1 | 1417.2 | 2008577 | 12.39% |
| hard-region-channel | 6067.6 | 1045.1 | 1092202 | 6.74% |
| hard-follow-plan | 7780.4 | 908.8 | 825865 | 5.09% |
| hard-orders-plan | 5162.1 | 844.2 | 712751 | 4.40% |
| hard-blocking-snapshot | 2936.1 | 701.2 | 491720 | 3.03% |
| hard-follow-lab-boundary | 4051.4 | 320.5 | 102748 | 0.63% |
| hard-share | 5813.6 | 228.3 | 52107 | 0.32% |
| hard-fk-chain | 3033.9 | 204.4 | 41798 | 0.26% |
| hard-follow-ratio | 6153.9 | 163.2 | 26641 | 0.16% |
| hard-wait-limits | 3446.6 | 129.6 | 16794 | 0.10% |
| hard-pk-index | 3002.4 | 67.5 | 4563 | 0.03% |
| hard-alter-session | 1961.8 | 53.4 | 2853 | 0.02% |
| hard-ctas | 1986.4 | 44.2 | 1957 | 0.01% |
| hard-function | 2066.1 | 38.7 | 1499 | 0.01% |
| hard-cte-merge | 2018.1 | 30.6 | 938 | 0.01% |
| hard-dbms | 2041.6 | 26.3 | 690 | 0.00% |
| hard-for-update | 1895.4 | 16.0 | 256 | 0.00% |

The top five contribute 85.92% of summed marginal variance. This is not a
partition of suite variance: covariance matters. The sum of case variances is
16,210,836.54, versus suite variance 13,930,832.79. Retry-heavy plan discovery and
variable analytical SQL strategies dominate; refusal cases contribute little.
In the other cohorts the leading case is top-buffer-plan (WP-S), yoy (WP-T),
and price-plan (WP-Y), with sample variances 12,329,647; 1,908,226; 5,015,925.

### Comparison command and interpretation

No package.json change is needed:

```sh
node --import tsx evals/compare.ts --a <files...> --b <files...>
```

Pass files in chronological experimental-pair order: first A file pairs with
first B file, with iterations sorted numerically within each file. Use adjacent,
preassigned alternating A/B runs on identical case definitions. Unequal block
counts, missing cases, different targets, duplicate cases, different known case
hashes and reused files fail explicitly. Old files without hashes produce a
warning. The archive does not identify code revisions, so provenance still
requires an experimental log; the script cannot recover arm assignments.

JSON output gives each case's A/B mean tokens and pass rates, B-minus-A token,
pass-rate and tool-error-count differences, and percentile bootstrap 95%
intervals (10,000 resamples, deterministic analysis PRNG). Missing tool diagnostics
remain unknown. Execution failures are counted and warned about because their
zero usage is not a saving. Pass rates are fractions, so 0.05 means five
percentage points. Tool errors measure errors per case/run, not error rate per
tool call. Suite intervals resample **whole paired run/iteration blocks**, retaining
case covariance; do not treat 20 cases as 20 independent repeat runs. A single
pair has no interval; fewer than four pairs carry an exploratory warning.
These are descriptive percentile intervals, not multiple-testing-adjusted
significance tests or guarantees of future behavior. Zero observed pass-rate
difference does not prove equal underlying reliability.

Archived validation paired the **last four** baseline-dba dev reports with the
four WP-Y dev reports in chronological order (these were alternating runs).
`evals/reliability-comparison.json` preserves the full per-case output.
The suite difference is +1,858.5 tokens (+2.20% against the paired baseline),
95% interval **[-3,745, +7,462]**; pass-rate difference 0, tool-error-count
difference -0.75 **[-2.25, +0.50]**. Independently bootstrapping the four A totals
and four B totals gives **[-3,652, +8,241]** with the same LCG seed and 10,000
draws: pairing narrows width from 11,893 to 11,207 tokens, just **5.77%**.
This does not justify promising a 2× cheaper gate. In fact, the first two pairs
alone give -3,745 **[-6,080, -1,410]**, an apparent saving that disappears with
four pairs. Retain four pairs for a promotion decision; use smaller comparisons
only to screen large effects and locate the noisy cases. Never stop early merely
because a repeatedly inspected interval happens to exclude zero.

No temperature/seed setting was added: the product forwards optional temperature,
but seed is not an existing eval tunable. Model determinism and variance reduction
have not been established, so imposing either would be an unsupported change.

### Four fresh sequential runs and final verification

Strata `/health` reported `loaded: true` before each run. Exactly four eval runs
were made, sequentially, at unchanged settings, on the two largest baseline
variance cases (`hard-price-plan` and `hard-top-buffer-plan`). These are a focused
A/A sanity check, not a full-suite promotion gate. Invocation:

```sh
node --env-file=/home/kiwi/orca/workspaces/OracleDBPiAgent/needlefish/.env --import tsx evals/run.ts --suite evals/cases-hard --split dev hard-top-buffer-plan hard-price-plan
```

All four reports are in ignored `evals/results/`; their exact filenames and
comparison summary are preserved in `evals/reliability-focused.json`.

| Run (UTC completion) | Tokens | Answers passed | Tool errors/calls | Wall seconds |
|---|---:|---:|---:|---:|
| 04:54:04 | 12,671 | 2/2 | 0/8 | 71.079 |
| 04:55:31 | 15,434 | 2/2 | 0/9 | 87.089 |
| 04:56:57 | 14,720 | 2/2 | 1/9 | 85.945 |
| 04:58:05 | 12,065 | 2/2 | 0/10 | 67.038 |

Assigning runs 1/3 to A and 2/4 to B gives +54 tokens, paired bootstrap
95% interval **[-2,655, +2,763]**, pass-rate difference 0, error-count difference
-0.5 **[-1, 0]**. Independent resampling gives the same token interval: **no
narrowing** in this small sample. The one error was ORA-00904 in run 3, recovered
before its correct final answer. With only two pairs the interval remains
exploratory. The four-run focused validation cost 311 seconds, but does not
establish the cost or power of a reduced full-suite gate. No LLM setting was
changed and no additional eval runs were made.

Validation output:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
Exit 0

npm test
Test Files  19 passed (19)
Tests       346 passed (346)
Exit 0

# The repository tsconfig only includes src; separately checked the new eval CLI:
node_modules/.bin/tsc --ignoreConfig --noEmit --target es2023 --module nodenext --moduleResolution nodenext --strict --noUncheckedIndexedAccess --skipLibCheck --types node evals/compare.ts
Exit 0
```

The CLI also reproduced `evals/reliability-comparison.json` byte-for-byte after
JSON parsing. No DB/LLM implementation code changed, so the integration suite
was not rerun; the four focused evals exercised the existing live path.
Contract changes needed: none. Remaining limits: no seed/temperature variance
claim, no evidence supporting fewer full-suite promotion repeats, and no raw
archived tool-result rows to isolate either miss to SQL versus final wording.
