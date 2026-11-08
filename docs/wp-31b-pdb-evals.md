# WP-31B: PDB evals

Built on wp-31a-pdb-live, branch wp-31b-pdb-evals. All live queries used
PDB-local PIAGENT_RO through the product session provider on localhost:1524/PIPDB1.
Passwords stayed in PIAGENT_SECRET_DIR. No LLM calls or database changes.

Eleven cases in `evals/cases-hard/phase31-pdb.json` form the independent `pdb`
split: container identity, scope, backup age/archive mode, failed job/error,
invalid objects/unusable partitions, stale table statistics, SHOP_DATA headroom,
customer count, scheduler inventory, broad health and an open-mode refusal.
Ten cases have runtime SELECT-only rowCells truth; the refusal permits no calls.
No answer is tied to a particular prose layout. Age and free-space bands avoid
second-level timing and workload drift. Truth retains all matching stale tables,
invalid objects and unusable partitions rather than assuming only one forever.

The broad-health truth selects failed-job names and invalid-object names from
the database. Facts require failed-job and maintenance descriptions, with a
negation-aware forbiddenClaims pattern guarding unqualified healthy verdicts.
Adversarial unit tests include unrelated negations before a false verdict,
contradictory verdicts, qualified/component verdicts, vertical values, missing or
wrong problem names, and refusal behavior. The integration cross-checks the
health engine's failedJobs/maintenance WARN or CRIT states, establishing the
connection to `piagent check` without deriving expected names from model output.

Runner/type changes add `pdb` to the eval-local split union and argument parsing.
The hard validator accepts c1 only on this split, checks its shape and SELECT
policy, and excludes this independent category from dev/holdout balance rules.
Historical count/hash tests exclude the new split where measuring prior cases;
the complete suite and refusal totals include it. Existing cases are unchanged.
No shared `src/contracts.ts`, package metadata, dependencies or product code changed.
No coordinator contract changes are needed.

Live validation executes every truth query, so Oracle parses each query and
checks PIAGENT_RO access. All must yield nonempty, non-null, untruncated rows;
there are no intended-empty truths. Missing dependency skips are explicit;
SQL and fixture errors fail closed. The seed's deliberate defects must remain
present; the live workload may add other problems. RMAN per-file metadata can
be visible when job details are hidden; it cannot prove media/restore validity.

Changed files: the case JSON; `evals/run.ts`, `evals/types.ts`,
`evals/validate-hard.ts`; `tests/unit/wp31b-pdb-evals.test.ts`,
`tests/unit/hard-evals.test.ts`, `tests/unit/phase8-evals.test.ts`,
`tests/unit/phase11-challenge.test.ts`;
`tests/integration/wp31b-pdb-truth.integration.test.ts`;
`docs/evals-hard.md` and this report.

Validation results are recorded below after the final runs. This checkout had
no node_modules; checks used an ignored symlink to WP-31A's installed dependencies.
The coordinator owns the fresh model gate:
`npm run eval -- --suite evals/cases-hard --split pdb`.

Final validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2703 passed (2703)
PIAGENT_SECRET_DIR=… npx vitest run tests/integration/wp31b-pdb-truth.integration.test.ts --no-file-parallelism
Test Files 1 passed (1)
Tests 1 passed (1); all ten truth SELECTs executed live, no skips
```

The new unit file contributes 27 tests. The live test also confirms USER is
PIAGENT_RO and CON_NAME is PIPDB1. No full integration suite was invoked to
completion because it includes LLM tests; this session ran only the requested
C1 truth integration and no model gate. Model answer quality remains unverified
until the coordinator runs the `pdb` gate.

## Antigravity review follow-up

Addressed the Major and associated list-coverage finding from the read-only
`review-wp-31b-pdb-evals/docs/review-wp-31b-pdb-evals.md` review. The health
forbiddenClaims expression now requires an explicit whole-database subject:
c1, the database, this database, overall, verdict or status. It cannot match a
bare healthy value after a colon or list marker. Component breakdowns such as
`- Backup: healthy (recent level-0 backup present)` and `- Space: healthy` can
accompany an overall WARN verdict. `Healthy: no` and subject-labelled variants
such as `Overall: Healthy: no` are safe; `Overall: healthy` and `The database
is healthy` remain forbidden. Tests cover numbered/bulleted lists, colon-separated
lists, answer-word negations and explicit healthy verdicts inside those layouts.

Info 3 is addressed with a narrowly scoped change in `evals/scoring.ts`: only
`hard-p31-failed-job` permits an exact five-digit numeric cell to match its
corresponding `ORA-` truth cell. The `Error#:` line label is accepted as
`Error code:` for this case only. Truth SQL retains the Oracle prefix, and job
identity, error digits, other columns and unrelated cases retain their matching
rules. Tests reject wrong codes, wrong jobs, longer numeric codes, negated codes,
TNS prefixes and crossed labelled table columns. The owned unit file now has
54 tests.

Follow-up files: `evals/cases-hard/phase31-pdb.json`, `evals/scoring.ts`,
`tests/unit/wp31b-pdb-evals.test.ts`, and this report. No shared contract,
dependency, product, database or LLM changes. The model gate remains unrun.

Live rerun exposed an aging test premise: all ten truth SELECTs still returned
valid rows, but the seed's retained scheduler failures had left the default
one-hour health window, so `failedJobs` correctly returned OK. The integration
now captures the real job collector window and compares its count and verdict
with independent PIAGENT_RO SQL over exactly those UTC bounds. Retained failure
names and maintenance WARN/CRIT remain required. No failure was manufactured and
no database state changed. `docs/evals-hard.md` now describes that distinction.
The legacy WP-2527J scorer checksum was updated for the case-local change; its
archived-answer semantic assertions and case/fixture checksums remain intact.
Additional follow-up files are the live truth integration,
`tests/unit/wp2527j-calibration.test.ts`, and `docs/evals-hard.md`.

Final review-follow-up validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2733 passed (2733)
PIAGENT_SECRET_DIR=… npx vitest run tests/integration/wp31b-pdb-truth.integration.test.ts --no-file-parallelism
Test Files 1 passed (1)
Tests 1 passed (1); all ten truth SELECTs executed live, no skips
```

The focused WP-31B unit run also passed all 54 tests. No model calls, database
changes, pushes or merges were made. No shared contract changes are needed.

## Antigravity round 2 follow-up

Addressed the second review's Major: the health forbiddenClaims subject now
includes bare Database, PDB, PIPDB1 and CDB19/PIPDB1 references as well as
composite status/verdict labels following whole-database subjects. Explicit
introductory clauses such as `Overall,` and `In summary,` are recognized before
the subject. Markdown emphasis and numbered/bulleted lists remain presentation.
Examples now rejected include `**Overall Status**: Healthy`, `Database status:
healthy`, `C1 status: healthy`, `Database is healthy`, `The PDB is healthy`,
`PIPDB1 is healthy`, and `In summary, the database is healthy`.

The subject remains mandatory: bare healthy values in component lists are not
whole-database verdicts. Answer-word negations (`Healthy: no`, `Healthy? No`,
`Status: healthy: false`), verbal negations, qualified healthy-except/but/with
statements, and overall WARN verdicts remain accepted. A comma before a
qualification is accepted too, including a bold `Overall Status` heading.

The unit test now expresses health expectations as a single two-column table
(`passes`, `verdict`), with 30 must-fail and 32 must-pass rows. All previous
round-1 phrasings remain represented; the new rows cover every round-2 bypass,
Markdown, list markers, introductory clauses and qualified composite labels.
Each row is scored with the independent required DB problem names/facts present,
so a missed healthy verdict cannot hide behind another failed expectation.
The complete owned unit file has 85 tests.

Only `evals/cases-hard/phase31-pdb.json`,
`tests/unit/wp31b-pdb-evals.test.ts` and this report changed in round 2.
`evals/scoring.ts` and numeric error-code support are unchanged. The review's
reported zero flips over 832 phase30 archive records was read as review evidence;
this follow-up did not rerun that replay. No shared contract or dependency changes
are needed. No LLM calls or database changes were made; the model gate remains
coordinator work.

Round-2 validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2764 passed (2764)
PIAGENT_SECRET_DIR=… npx vitest run tests/integration/wp31b-pdb-truth.integration.test.ts --no-file-parallelism
Test Files 1 passed (1)
Tests 1 passed (1); all ten truth SELECTs executed live as PIAGENT_RO, no skips
```

Focused unit validation passed all 85 WP-31B tests. No pushes or merges.

## Approved round 3 minor follow-up

Allowed optional whitespace after the health guard's initial Markdown markers.
The subject is still required, but headings such as `## Overall Status: Healthy`,
`# C1: healthy` and `### Verdict - healthy` now trigger the forbidden verdict.
All three were added to the must-fail table; `**Overall Status**: Healthy` stays
covered. The table now has 33 must-fail and 32 must-pass phrasings, with all
previous component-list, negation and qualified-verdict cases preserved.
Focused validation passed all 88 WP-31B unit tests.

Changed only `evals/cases-hard/phase31-pdb.json`,
`tests/unit/wp31b-pdb-evals.test.ts`, and this report. No scorer, truth SQL,
shared contracts, dependencies or product code changed. No database or LLM calls
were needed; live integration was not rerun for this regex-only follow-up.

Round-3 minor validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2767 passed (2767)
```

All 32 must-pass phrasings still pass; all 33 must-fail phrasings fail scoring
as intended, including the three Markdown headings and the existing bold label.
No shared contract changes are needed. No push or merge.

## Gate findings: recurring failure and backup answer layout

Changed `lab/c1/seed.sql` so REPORT_EXPORT_JOB starts at SYSTIMESTAMP and
repeats `FREQ=MINUTELY;INTERVAL=30`. The immediate asynchronous run, intentional
ORA-20001, full logging and retained job remain unchanged. This keeps the
one-hour health window supplied with failures while the scheduler runs.
`lab/c1/README.md` and `docs/evals-hard.md` describe the fixture requirement.
The seed integration additionally checks the interval, enabled state, logging
and recent intentional failure; the truth integration requires a nonzero
windowed failure count, still independently checked against the collector window.

Changed only hard-p31-backup-age among the eval cases. Its truth is one cell:
the DB-derived age band. ARCHIVELOG is an independent required fact, with a
negation-aware guard against a positive claim that c1 runs NOARCHIVELOG.
Mode labels, table cells and direct database claims are covered; negated claims
and comparisons to another target's NOARCHIVELOG mode remain safe. The validator
requires the separate mode checks; the live validator checks single-cell shape
and confirms ARCHIVELOG separately as PIAGENT_RO. Tests cover split classification
and mode layouts, wrong bands, absent modes, contradictions and negations.
The scorer and every other eval case are unchanged.

### Offline archived replay

The supplied directories contain timestamp-named result JSON files; `files.tsv`
maps them to pdb-1/pdb-2. [Per-case results](wp31b-gate-rescore.md) list every p31
case's before/after pass state in each of the four files. The
[machine-readable report](wp31b-gate-rescore.json) includes source SHA-256 hashes.
The [replay script](wp31b-gate-rescore.mts) uses baseline case definitions from
57d2540 and archived truth rows recovered from stored checks, never fresh DB
truth. Before scores must reproduce each archived pass bit. Only the backup
truth projects to its original age-band column; all other definitions and
pass bits must stay identical. No model calls are made.

| Archived file label | Before | After |
|---|---|---|
| gate31a/pdb-1 | 8/11 | 9/11 |
| gate31a/pdb-2 | 9/11 | 10/11 |
| gate31b/pdb-1 | 8/11 | 9/11 |
| gate31b/pdb-2 | 9/11 | 10/11 |
| Total | 34/44 | 38/44 |

All four backup-age failures become passes. Every other score is unchanged:
the four health failures stay failures (historical answers cannot gain evidence
retroactively), gate31a/pdb-1 identity stays failed, and gate31b/pdb-1 headroom
stays failed. There are zero unrelated flips and zero pass-to-fail flips.

Reproduce without DB or LLM calls:

```sh
npx tsx docs/wp31b-gate-rescore.mts /tmp/claude-1000/-home-kiwi-orca-projects-OracleDBPiAgent/4094c500-1c7c-411a-a045-e1c394d3f98b/scratchpad
```

Changed files: the case JSON, validator, seed SQL and README, the two C1
integration tests, WP-31B unit tests, hard-eval documentation, this report, and
the three replay artifacts linked above. No shared contract or dependency
changes are needed. No LLM calls, database changes, pushes or merges by this
worker. The coordinator changed the live scheduler configuration.

Gate-follow-up validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2785 passed (2785)
Focused WP-31B unit tests: 106 passed
Offline gate replay: 44 records; 4 backup-age FAIL→PASS, 0 unrelated flips
PIAGENT_SECRET_DIR=… npx vitest run tests/integration/c1-seed.test.ts tests/integration/wp31b-pdb-truth.integration.test.ts --no-file-parallelism
Test Files 2 failed (2)
Tests 2 failed (2), no skips: both failed only the new recent-failure assertion
```

The integration failure is a live fixture startup gap, not a SQL/grant/scoring
failure. PIAGENT_RO observed, at 2026-11-08T12:01:50Z:

- REPORT_EXPORT_JOB enabled TRUE, state SCHEDULED, interval
  FREQ=MINUTELY;INTERVAL=30, logging FULL.
- Latest retained failed run: 2026-11-08T06:09:29.116Z, error 20001.
- Next scheduled run: 2026-11-08T12:27:47.896Z.
- Zero failed runs in the one-hour health window; the health engine correctly
  reported zero. All ten truth SELECTs, the single-cell backup shape and separate
  ARCHIVELOG assertion passed before the recent-failure assertion.

The seed's immediate run fixes this gap for future seeding. Merely changing an
existing job's repeat schedule does not supply a new run-history row. The worker
requested a coordinator-triggered immediate run and retained the original
read-only DB constraint; neither the seed nor any administrative SQL was run by
this worker. Recent window evidence and passing live recency tests remain
unverified until that run or the next scheduled run occurs. The assertions were
kept strict rather than silently accepting the missing fixture.

## Rerun health summary layout calibration

Changed only hard-p31-health's groundTruth mode from rowCells to allCells.
The live truth SQL, failure and maintenance facts, and forbiddenClaims guard
are unchanged. Every truth name must still be present, but may be owner-qualified
inside a descriptive table cell or bullet rather than occupy a whole cell.
The validator requires allCells for this case alone and retains rowCells for
every other factual p31 case. The scorer itself is unchanged.

New unit coverage includes owner-qualified names in table details and free-form
bullets, a missing invalid view, a missing failed job, and longer near-miss names.
Mutating any other factual p31 case to allCells is rejected. All existing health
verdict and missing-name tests continue to run. The focused unit file has 114 tests.
`docs/evals-hard.md` now documents the single-case exception.

### Replay of all four phase31 gate groups

[Per-file, per-case replay results](wp31b-health-rescore.md) cover all 110 p31
records in ten archived gate result files across gate31a, gate31b, gate31ra and
gate31rb. Each file's SHA-256 and every before/after case result are recorded.
Only the health mode differs between the two sides; definitions for all other
cases, the required facts and forbidden claims are asserted identical. Stored
truth is recovered from archived checks. The previously accepted backup-age
projection is applied identically on both sides to the original gate31a/b files,
so its earlier scoring correction is not counted again. No fresh DB or model
calls are made.

| Archived file label | Before | After |
|---|---|---|
| gate31a/pdb-1 | 9/11 | 9/11 |
| gate31a/pdb-2 | 10/11 | 10/11 |
| gate31b/pdb-1 | 9/11 | 9/11 |
| gate31b/pdb-2 | 10/11 | 10/11 |
| gate31ra/pdb-1 | 10/11 | 10/11 |
| gate31ra/pdb-2 | 10/11 | 10/11 |
| gate31ra/pdb-3 | 9/11 | 9/11 |
| gate31rb/pdb-1 | 11/11 | 11/11 |
| gate31rb/pdb-2 | 10/11 | 11/11 |
| gate31rb/pdb-3 | 10/11 | 11/11 |
| Total | 98/110 | 100/110 |

Exactly two FAIL→PASS flips: hard-p31-health in gate31rb/pdb-2 and pdb-3.
Their free-form table details include both qualified truth names, but the old
whole-cell matcher missed the invalid-view name. Both satisfy the unchanged
failure/maintenance facts and health-verdict guard. All other records are
unchanged, including earlier answers that omitted problem names. Removing each
truth name from every archived health answer produced 20 adversarial answers;
all still failed. There are zero unrelated flips and zero PASS→FAIL flips.

Replay used a temporary local script; only the Markdown report is retained in
the repository, per housekeeping. No archive contents were changed. No LLM calls,
database changes, dependencies or shared contract changes are involved. Changed
files are the case JSON, hard validator, WP-31B unit tests, hard-eval docs, this
report, and the Markdown replay report. Live integration was not rerun for this
case-mode change; the DB truth SQL and its existing live assertions are unchanged.

Health-layout validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2793 passed (2793)
Focused WP-31B unit tests: 114 passed
Archived replay: 110 records, 2 health-only FAIL→PASS flips, 0 unrelated flips
Missing-name replay: 20/20 omissions still fail
```

No pushes or merges. No shared contract changes are needed.
