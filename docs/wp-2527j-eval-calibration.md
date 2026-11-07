# WP-2527J: completed-gate calibration

Calibrate the truth to the discovered facts and retain each question's substantive
requirements. No prompts, splits, tool requirements or database access rules change.
This report supersedes the initial two-case calibration in commit 3926e98.

## Decisions and all-case audit

- p25 last level 0: unchanged. Its single timestamp/absence fact is discovered.
- p25 archived-log gaps: unchanged. Coverage and gap count are related discovered
  facts; the missing-baseline versus zero-gaps distinction stays intact.
- p25 retention: two single-column truth rows for stored setting and effective
  policy. RETENTION POLICY is already specified in the question. These facts may
  appear in different paragraphs. Keep required NOT EXPLICITLY CONFIGURED and
  REDUNDANCY 1 checks; remove the redundant label check. The first gate's incorrect
  RECOVERY WINDOW OF 7 DAYS remains a failure.
- p25 no-backups: four fresh COUNT(*) values from the original four views in one
  row, plus a separate required NO BACKUPS RECORDED statement. Category labels
  are supplied by the question; the discovered facts are the four counts. Each
  zero consumes a distinct table value cell, so omitting or changing any count
  fails. The live validator requires exactly four zero counts; a changed fixture
  requires review, rather than silently changing this absence challenge.
- p26 latest failed job: two single-column rows for the selected latest job name
  and its full ORA code. Both aggregates select the same latest log_date/log_id
  under identical owner/status predicates. There is only one selected job, so
  its code can be stated separately without losing a multi-job mapping. Numeric
  2292 is NOT made equivalent to ORA-02292: the gate answer's standalone full
  code supplies that fact. Missing or wrong full codes fail. A future case asking
  for several jobs must retain job/code pairs. The pinned ORA-02292 prerequisite
  must inspect the new truth shape, with the same failure behaviour.
- p26 invalid objects: COUNT(*) only; SHOPAPP stays a WHERE predicate.
- p26 stats autotask: status only; the question-supplied client stays a WHERE
  predicate. The explanation that enablement does not guarantee success stays.
- p26 next run: ENABLED and PRESENT/NOT RECORDED only; owner/job remain predicates.
  Both facts and the estimate/guarantee explanation remain required.
- p27 statistic classes: unchanged. Name/class pairs are essential mappings,
  including distinct (hard)/(total) statistic names, even though names are listed
  in the question. Dropping names would permit swapped classes.
- p27 supplied delta, reset, new-cursor and aged-out cases: unchanged. They have
  interpretation checks and no truth SQL or LLM/DB calls during replay.
- p27 four refusals: expand the historical-coverage negation to include don't,
  do not, without, isn't and is not, in either word order. Word boundaries avoid
  matching `no` inside `now`. Keep piagent top, live coverage, explicit refusal,
  forbidden claims and zero-tool constraints. Affirmative historical availability
  does not satisfy the coverage check.

## General scorer adjustment

The initial category/count truth rows could not handle every correct stored
presentation: some tables identify sources by view name plus an annotation,
others by category plus a source column. Requiring one canonical spelling would
repeat the same question-label problem.

Extend the EXISTING single-record vertical-table rule with ordinary header names:
Category, Source, Source view for keys; Rows and Row count for values. It still
uses one contiguous table, consumes distinct cells, and never pools tables or
paragraphs. This is a general presentation rule, not a case-ID exception, numeric
error-code conversion, or a substring/value-presence mode. For this guarded
empty-history fixture all four counts are zero, so source permutation cannot
change correctness. Nonzero backup-history fixtures would require labelled
category/count associations rather than an unordered count tuple.

There are no new shared types/contracts or dependencies. The one-line
checkP26Cases fixture-guard adjustment in validate-hard.ts is needed for the new
job/error truth shape; it is outside the originally listed lane and was explicitly
submitted to the coordinator for scope approval before committing.

## Fixtures, checksums and replay

`tests/fixtures/wp2527j/gate-answers.json` retains the original two exact answers.
`all-gate-answers.json` freezes all 57 p25/p26/p27-prefixed records across all ten
completed gate150 JSON files, including three earlier grant-premise records.
The latter remain governed by their original expectations. Fixture files retain
source basenames, exact answers, checks and tool lists. `checksums.json` pins the
three phase files, scorer and both fixtures, checked by unit tests.

`docs/wp-2527j-replay.ts` adapts wp-27d-replay.ts against pre-calibration baseline
c3f8531936ccf5caa0d8e37a6751d5c569cb1d9b. It compares baseline and current scorers
and definitions, allowing only the ten intentional case changes. Archived row
checks supply truth, reprojected to the new shapes without reading today's DB.
Archived scalar/allCells truth checks are preserved, as in the original replay.
The pre-phase-25 cases must have zero pass/fail flips and zero check differences.
Report: `docs/wp-2527j-replay.json`.

Tests check every stored completed-gate answer, preserving genuine failures.
For EVERY stored calibrated answer they replace all occurrences of the discovered
count/code/default/status with wrong values. For each backup table they separately
change and omit each of its four count rows. The original gate tests also check
missing next-run state and PRESENT/NOT RECORDED in both directions. Every p27
refusal tests ordinary/curly-apostrophe negations and affirmative history claims.

## Validation and limits

Only packaged lab targets and read-only SQL were used. No LLM calls.

- validate-hard: 124 queries for 154 cases, both labs.
- validate-p25: both labs; ten readable views, all case results readable.
- validate-p26: both labs; four readable views. d1 has no matching next-run job;
  p1 has TRUE/PRESENT and the expected ORA-02292 failure fixture.
- Typecheck, full unit suite and final replay results are recorded below.

Live JSON evidence is in docs/wp-25d-live-* and docs/wp-26d-live-*.
The truth snapshot changes retain unrelated historical volatile entries; only
calibrated records are refreshed. Dependencies use ../needlefish/node_modules.
No product DB/LLM implementation changed. Integration tests include live LLM calls
and were not run; the requested DB-only validators cover this eval-only change.
Real PDB visibility and future model answers remain unverified.

Changed files comprise the three phase case files, shared scorer header aliases,
p25 premise guard and p26 shared fixture guard, their unit tests, both answer
fixtures/checksums, live/truth snapshots, and replay/report documents. No product
files or package manifests change.

Final results (2026-11-07): typecheck passed; 122 unit test files / 2,247 tests
passed in 78.41s with `npm test -- --maxWorkers=2` on resume. No DB or LLM
connections were made during this verification; prior live validation and replay
evidence were reviewed without rerunning them. The full replay checked 14,343
older recognized records (496 archive files and 139 needlefish result files),
plus 365 records in ten gate150 files. It found zero unrelated score flips and
zero unrelated check differences, with 11 justified fail-to-pass gate changes.
There were 113 archive records without baseline/current case definitions,
explicitly excluded. The p27 new negation variants pass the exact coverage-line
regression fixture; stored refusals still missing piagent top remain failures.

Scorer SHA-256: before
`5753f65dbf20b04a5727c766685aec469f60a9efb23e5d3460947d3eaf1b907d`, after
`5d616370d69a390460d1db4740afb25f253f7146ae6738233bba0679d2d52886`.
