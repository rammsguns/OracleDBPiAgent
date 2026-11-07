# WP-29A scorer report

Built on branch `wp-29a-scorer`, base `dcc4111555588a814f7d0f21d25abb1c20216b97`.

- Numeric scalar and allCells checks now compare signed decimal tokens, accepting trailing zeroes, existing thousands-separator normalization, and numeric level labels such as `1 (Critical)`. Exact decimal-string comparison avoids rounding in allCells. Existing rowCells decimal/annotation handling is retained and covered by the same positive and wrong-value fixtures.
- Reproduced the exact p25 record selected by `c-pack-check/files.tsv`'s p25 entry, with truth `[["NOT EXPLICITLY CONFIGURED"],["REDUNDANCY 1"]]`. On this branch the immediate blocker was the `copy / image copy` explanation being interpreted as structured fields. Single-value prose with a slash now uses bounded occurrence matching; explicit table cells and bindings retain their constraints. Only negation immediately before the occurrence denies it (`not`, `no`, `never`, `except`, `without`, optionally `equal to`, `configured as`, `set to`). Thus `X is not REDUNDANCY 1` fails, while `REDUNDANCY 1 ... not a setting` passes.
- Changed only the limitation fact for `hard-p26-p1-stats-autotask`: retain its existing limitation pattern, OR accept a question line ending in `?` or Markdown heading containing the whole word `guarantee`/`prove`, immediately followed (allowing blank lines) by `No.` or `**No.**`. Unrelated No answers, Yes answers, and intervening prose fail. Coordinate this single fact edit with WP-29B when merging `phase26-jobs.json`; no other case change is required.

Files: `evals/scoring.ts`, `evals/cases-hard/phase26-jobs.json`, `tests/unit/phase29a-scorer.test.ts`, `tests/unit/phase29a-stored.json`, `tests/fixtures/wp2527j/checksums.json` (refresh the two intentionally changed pinned files), `docs/wp-29a-replay.ts`, `docs/wp-29a-replay.json`, and this report.

Validation:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
exit 0

npm test -- --maxWorkers=2
Test Files  129 passed (129)
Tests       2393 passed (2393)
Duration    69.99s
exit 0
```

The initial full test run caught the intentionally stale calibration checksum; the hashes were updated and the final full run above passed. Ten new tests cover the stored p25/p26 answers, all three numeric truth modes, wrong values and adjacent denials.

Offline replay: `npx tsx docs/wp-29a-replay.ts`. It scans `../eval-archive` recursively (including every `phase25-27` directory), plus `../needlefish/evals/results`. It reconstructs scalar ranges and row/allCells truth from stored checks, never from live data. It compares the base scorer/cases with this branch and recovers 107 retired-case records from local Git history. Six early worker-smoke records have uncommitted IDs; their fact, tool, forbidden-claim and allCells truth expectations are reconstructed directly from their complete archived checks. No definitions or records are silently skipped. Every allowed flip is pinned to the reviewed answer's SHA-256, with a justification in the JSON; an unreviewed flip or missing definition fails the replay.

Replay result: 673 JSON files, 15,647 records (12,461 archive + 3,186 needlefish), 0 unknown/skipped IDs, 4 justified flips representing 3 unique answers, **0 unrelated flips**. The scan includes all phase25–27 A/B/C and follow-up gate directories.

Flip justifications (all false to true):

1. `sh-customers`, phase11 gate-11b `2026-11-04T12-03-18-541Z...`, plus its duplicate in needlefish results: `55500.00 rows` equals archived scalar truth `55500`.
2. `hard-p25-d1-retention-setting`, C p25 `2026-11-07T17-19-19-923Z...`: explicitly states the unset override and correct implied `REDUNDANCY 1`; “not a setting” explains the default/override distinction.
3. `hard-p26-p1-stats-autotask`, C p26 `2026-11-07T17-20-14-720Z...`: `**No.**` directly answers `Does "ENABLED" alone guarantee a successful run?`, then explains eligibility versus actual completion.

The replay JSON also records individual check differences, including numeric unit cases whose final verdict stays failing because other required facts remain absent, and the renamed limitation check on otherwise unchanged p26 answers.

No contract, dependency, product, DB, or LLM changes. No Strata or DB access was performed. Integration was not run because no DB/LLM code changed. Live gated evals and live truth remain for the coordinator; this report verifies archived answers only.
