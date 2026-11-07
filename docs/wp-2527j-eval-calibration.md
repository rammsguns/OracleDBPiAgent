# WP-2527J: challenge truth calibration

The two first-run misses were presentation mismatches. Calibrate their truth
projections rather than broaden the shared scorer. Questions, splits, tool
requirements and explanatory checks remain unchanged, apart from explicitly
requiring the p25 absence statement.

- p26 selects only ENABLED and the PRESENT/NOT RECORDED next-run state. Owner and
  job name remain SQL predicates; echoing identifiers already in the question is
  not a discovered fact. Existing rowCells handles the Property|Value table.
- p25 selects four category/count rows, preserving all four original source views
  and COUNT(*) semantics. Existing rowCells matches Category|Source|Row count
  tables without pooling zeroes across unrelated categories. The exact absence
  statement is a separate required fact: its position in prose is immaterial.
  This is deliberately a fixed empty-history challenge, like the existing fixed
  retention explanation. `checkNoBackupsPremise` in validate-p25 fails closed if
  any count becomes nonzero, a source is omitted, or the labelled shape changes.
  A changed fixture requires review; it must not silently turn into a positive
  backup-history case. Eval truth still requires the fresh count for each source,
  so nonzero live counts cannot pass the archived zero answer.

No scorer change or shared contract change is needed. A broad value-presence mode
would lose category/count association and is unsuitable here.

## Evidence and replay

`tests/fixtures/wp2527j/gate-answers.json` freezes the exact two answers/checks/tool
lists from the supplied read-only gate result (2026-11-07T03-03-09-679Z).
`checksums.json` pins that fixture and both calibrated case files; a unit test
checks these hashes. Historical checksum reports remain historical evidence.
The two affected entries in hard-ground-truth-validation.json are refreshed;
unrelated volatile entries retain their previous snapshot.

`docs/wp-2527j-replay.ts` adapts wp-27d-replay.ts against baseline
c3f8531936ccf5caa0d8e37a6751d5c569cb1d9b. It requires an unchanged scorer and
exactly these two case changes. Archived row checks supply truth; p26 drops the
two identifiers, and p25 projects archived counts into labelled rows. It never
uses today's database to grade old answers. Archived scalar/allCells truth checks
are preserved, as in the original replay.

Result in `docs/wp-2527j-replay.json`:

- eval-archive: 496 JSON files, 11,157 recognized records; 113 records without
  current/baseline definitions excluded.
- needlefish/evals/results: 139 JSON files, 3,186 recognized records.
- gate150: 3 JSON files, 140 recognized records.
- Zero flips in the 14,343 older records; exactly the two requested gate cases
  change fail to pass. Zero unrelated check differences or score flips.
- Scorer SHA-256 before/after:
  `5753f65dbf20b04a5727c766685aec469f60a9efb23e5d3460947d3eaf1b907d`.

Unit coverage passes both exact archived answers and rejects each individually
wrong count, each omitted category/count row, missing absence statement, FALSE
enablement, missing next-run state, and PRESENT/NOT RECORDED swaps in both
directions. The validator rejects nonzero or incomplete backup fixtures.

## Validation

Only packaged lab targets and read-only SQL were used; no LLM calls.

- `PIAGENT_SECRET_DIR=… npx tsx evals/validate-hard.ts`: 124 queries validated for
  154 hard cases across both labs.
- `npx tsx evals/validate-p25.ts --target <lab>`: passed on d1 and p1; all ten
  backup views readable and all four case results readable on each.
- `npx tsx evals/validate-p26.ts --target <lab>`: passed on d1 and p1; all four
  views readable. d1's next-run query legitimately has no matching job; p1 returns
  TRUE/PRESENT. The p1 ORA-02292 failure fixture remains valid.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 121 files passed; 2,244 tests passed (35.55s).

Live JSON evidence is refreshed in docs/wp-25d-live-* and docs/wp-26d-live-*.
Dependencies use the requested symlink to ../needlefish/node_modules.
No product DB/LLM implementation changed. The integration suite was not run
because it includes live LLM calls; DB validation above covers this eval-only
change. Real PDB visibility and future model answers were not verified.

Files changed: the two challenge JSON definitions; validate-p25.ts; the two
refreshed truth snapshot entries; phase25-evals.test.ts; new calibration tests,
answer/checksum fixtures, replay script/report and this note; four live validator
reports. validate-p26.ts needs no change because it already validates the new
projection through the common case definitions.
