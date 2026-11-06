# WP-27D: p27 interpretation evals

Built ten challenge cases, five per lab. Two read only fixed statistic names
and class bitmasks; four interpret supplied cumulative-counter examples (delta
and rate, reset, missing baseline, aged-out SQL); four refuse ASH, an AWR report,
V$SYSMETRIC_HISTORY and DBMS_WORKLOAD_REPOSITORY. Refusals must explicitly decline,
recommend `piagent top`, and explain that a live sample cannot reconstruct the
past hour. Supplied examples and refusals permit zero tool calls. Metadata cases
require `run_query` and explain CLASS bitmasks and CDB-wide scope.

The existing refusal scorer already supports required alternative facts and
rejects SQL tool calls. No new expectation schema was needed. A p27-only row
matcher adjustment preserves `(hard)` and `(total)` in statistic names, including
named/table records. Historical case scoring remains unchanged.

The runner now accepts `--suite p27` (coordinator use only). The hard validator
accepts p27 interpretation/refusal cases without database truth and validates the
new suite's size, shape, alternative, and exact metadata SQL. No live load values
are used as expected answers. Dev, holdout, regression and MVP definitions are
unchanged; the ten additions use the challenge split.

Changed files:

- `evals/cases-hard/phase27-top.json`: cases.
- `evals/run.ts`, `evals/scoring.ts`, `evals/validate-hard.ts`: selection,
  name fidelity, and validation.
- `evals/validate-p27.ts`: DB-only metadata smoke, pinned packaged lab targets.
- `tests/unit/phase27-evals.test.ts`: selection, malformed suites, alternatives,
  refusal safety, counter interpretations, and name/class pair integrity.
- `tests/unit/hard-evals.test.ts`: suite/refusal totals and refusal fixture updated.
- `docs/wp-27d-live.json`, `docs/wp-27d-replay.ts`,
  `docs/wp-27d-replay.json`, and this report: evidence and reproducible replay.

## Live output, 2026-11-06

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-p27.ts`
passed on both labs. [Full output](wp-27d-live.json). No cumulative values were
read. Both returned:

| Statistic | CLASS |
|---|---:|
| parse count (hard) | 64 |
| parse count (total) | 64 |
| physical reads | 8 |
| redo size | 2 |
| session logical reads | 1 |
| user calls | 1 |
| user commits | 1 |

D1 reads V$STATNAME joined to V$SYSSTAT by STATISTIC#; p1 reads V$SYSSTAT.
A read-only access probe found p1 V$STATNAME returns ORA-00942 despite the stated
all-feature-view premise; V$SYSSTAT has the needed NAME and CLASS fields. No grant
change is necessary for these cases. The initial joined p1 validation failed for
that reason and was replaced with the available metadata source. An initial
smoke without PIAGENT_SECRET_DIR was correctly refused before querying.

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-hard.ts`
passed: `Validated 120 ground-truth queries for 150 hard cases; row counts recorded.`
The generated all-suite truth snapshot was left unchanged in git; the p27-only
snapshot is retained above.

## Verification

- `npm run typecheck`: exit 0, no diagnostics.
- `npm test -- --maxWorkers=2`: exit 0; 116 files, 2,158 tests passed.
  The first run exposed two stale total-count/fixture assumptions in
  `hard-evals.test.ts`; these were updated for the ten new cases and the
  required alternative, then the complete suite passed.
- `npx vitest run tests/unit/phase27-evals.test.ts --maxWorkers=2`: 7/7 pass.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  exit 1; 31 files passed, 1 failed; 71 tests passed, 1 failed, 1 skipped
  (73 total). Duration 242.05 s. The Strata e2e test was excluded.
  `tests/integration/backup.test.ts:13` expects p1 status `partial`, but
  receives `ok` after the owner-applied backup grants. This unrelated stale
  premise belongs to the backup/coordinator lane; it was not edited here.
- `npx tsx docs/wp-27d-replay.ts`: exit 0. Against base
  `d25f1cb3e613572db3195dee9d6bd931b1af7d40`, all 179 existing case objects are
  unchanged. Replayed 11,157 archive records plus 3,186 coordinator result
  records (14,343 total), zero pass/fail flips. The 113 unknown archive records
  have no matching current/base case and are explicitly counted, not evaluated.
  [Replay output](wp-27d-replay.json) includes scorer hashes and source counts.
- `git diff --check`: clean.

## Contracts and unverified work

No shared contract changes, dependencies, product changes, or package scripts
needed. Coordinator follow-up: update the p1 backup integration-test access
premise to reflect the applied grants. No web files changed; browser tests were not required. No LLM calls or
evals were run; coordinator still needs the p27 model gate, including whether the
current prompt knows to recommend `piagent top`. Refusal behavior here is tested
using offline answers, not generated model responses.

Live PDB behavior remains unverified; both labs are non-CDB. These cases state
system-statistic scope as CDB-wide and never infer absence from an empty result.
The lab truth validator deliberately fails closed on missing/empty metadata;
it does not convert a visibility gap to zero. No new product fixed queries or
preflight/grant changes were introduced. Existing shared test totals will need
the ordinary reconciliation if other WPs add hard cases concurrently.
