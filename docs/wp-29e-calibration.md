# WP-29E calibration (rounds 1 and 2)

Eval-only work on `wp-29e-calibration`; cumulative baseline `b4e39061f0abb6195fbc98e8956a00cae9416829`. Round 2 also compares against round 1 (`9eb27a5`), independently checking that no previously passing record regresses.

Round 1 changed grant truth to view identity plus an access-gap fact, accepted either SGA_DYNAMIC_COMPONENTS or MEMORY_DYNAMIC_COMPONENTS for components, and retained SGASTAT-only pool identity. It added bounded conditional-comment handling, exact positive parenthetical values, and bounded contiguous labelled single-record lists.

Round 2:

- Numeric table cells retain their leading numeric value when followed by descriptive parentheses, including slash labels. Numeric parentheticals cannot substitute a different number; the existing `2 (NUMBER)` datatype alternative remains valid.
- Parenthetical assignments cannot start or split records. For the products-stats case, named YES/NO/UNKNOWN flags may precede a dash explanation only when assignments and explicit denials do not contradict the flag. All three dash styles are normalized.
- The backup-count case accepts a Source (view)/Rows table only when four recognized sources occur in the requested order with exactly matching values. Ordinals, missing rows, split tables and not-verifiable cells do not supply counts. The failing B-side p25-suite answer remains a failure.
- The failed-job fact accepts bounded child record(s)/row(s) and foreign key(s), including hyphen separators. It does not accept substrings such as foreign keyboard.

Review-2 Minors follow-up:

- The failed-job fact now uses a negation lookbehind, including optional articles: `no foreign key`, `not a foreign-key violation`, and `without child rows` no longer satisfy it. Correct archived explanations still pass.
- A leading YES in products-stats is not reduced when the explanation contains standalone NO/not/never, including natural-language denials of stale/global. Consistent `NO — GLOBAL_STATS = NO` remains valid. The affirmative `GLOBAL_STATS = YES` collection detail “not aggregated from partitions” remains valid because it explains table-level collection rather than negating the flag; a bare negated explanation or a denial such as “not global” still fails.
- Added adversarial and preservation assertions. The final replay has the same **46 unique (case, iteration, answer hash, before/after) flips** as the approved round-2 report, and the original file-specific flip set is unchanged. During verification the coordinator copied the phase-29 gates into eval-archive: 22 additional occurrences are duplicates of already-reviewed hashes, not new flips.

Validation (no LLM calls):

```text
npm run typecheck
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files  133 passed (133)
Tests       2431 passed (2431)
Duration    88.91s

PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-hard.ts
Validated 127 ground-truth queries for 156 hard cases; row counts recorded.
```

Truth queries and unavailable-view probes ran sequentially on the two configured 19c labs. Secret files were read only by product configuration code; none were printed, copied or logged. The generated shared validation artifact was restored rather than included in this WP. Full integration was not run because it includes LLM e2e calls, prohibited during this gate. No database writes occurred.

Replay: `npx tsx docs/wp-29e-replay.ts`. All truth comes from archived checks. Only the removed grant status cell is projected away on the after side; the earlier WP-2527J count-only backup projection remains identical on both sides. Retired definitions and six smoke cases are reconstructed as in WP-29A. Each approved answer is pinned by SHA-256; new hashes require review.

Replay covers **13,997 records**: **46 unique fail-to-pass flips (68 occurrences, including duplicate archive copies), 0 pass-to-fail flips, 0 unjustified flips, 0 unknown IDs, and 0 regressions against round 1**. The unique flip set is unchanged by the review fixes. Both p23/p24 directories were present; replay contains all available JSON. The approved 46 unique flips comprise the original 30, seven later B-side hashes already fixed by round 1, and nine from round 2. The additional copies under `eval-archive/phase29` account for the 22 duplicate occurrences.

| Source | Files | Records |
|---|---:|---:|
| eval-archive | 558 | 13229 |
| gate29a | 10 | 372 |
| gate29a-p2324 | 2 | 12 |
| gate29b | 10 | 372 |
| gate29b-p2324 | 2 | 12 |

Round 2 changes from the round-1 scorer:

| Case ID | Fail → pass | Justification |
|---|---:|---|
| hard-p11-order-customer-key | 3 | Parenthetical datatype assignments no longer divide the contiguous dictionary record. |
| hard-p19-cursor-inventory | 1 | Parenthetical child metadata stays within the cell; the explicit leading child count is one. |
| hard-p21-alert-levels | 1 | Numeric cell labels preserve the leading level and count, including slash annotations. |
| hard-p25-d1-no-backups-recorded | 1 | Four ordered source rows are all explicitly zero in the Rows column. |
| hard-p21-alert-levels-d1 | 1 | Numeric cell labels preserve the leading level and count, including slash annotations. |
| hard-p21-products-stats | 1 | Both named flags are YES; parenthetical metadata stays in its cell and explanations agree. |
| hard-p26-p1-last-failed-job | 1 | Child rows and a foreign-key constraint correctly explain archived ORA-02292. |

Every unique cumulative flip is listed below (duplicate archive copies appear separately in the JSON). The JSON contains full paths, iterations, exact reviewed answer hashes, checks before/after and the separate round-2 comparison. These case checks certify requested facts; answers can contain unrelated inaccuracies.

| Record | Case ID | Iteration | Round | Justification |
|---|---|---:|---|---|
| eval-archive/phase14/gate-14b-ch2/2026-11-04T14-53-23-434Z-5019ee7e-91bf-4f88-8659-41a51abb4948.json | hard-p11-order-customer-key | 1 | 2 | Parenthetical datatype assignments no longer divide the contiguous dictionary record. |
| eval-archive/phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11-order-customer-key | 1 | 2 | Parenthetical datatype assignments no longer divide the contiguous dictionary record. |
| eval-archive/phase21/gate-release/2026-11-05T22-48-16-872Z-b1cfd590-2e50-4d35-8b8c-650c36456173.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 2 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 3 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-incident-range | 3 | 1 | Contiguous labelled whole values supply the single incident record. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 2 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 3 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase23/gate-p19ab/2026-11-06T16-56-22-558Z-27296544-788c-473f-9fae-85ef25cd291a.json | hard-p19-cursor-inventory | 1 | 2 | Parenthetical child metadata stays within the cell; the explicit leading child count is one. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-28-45-365Z-213edc99-b27d-4085-b130-04509f9afe5b.json | hard-p19-bind-metadata | 1 | 1 | Exact positive datatype cell 2 (NUMBER) supplies archived NUMBER truth. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 2 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 3 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p21-trigger-state | 3 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p25-grant-component-inventory | 3 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T16-54-01-170Z-04f693a2-b7a3-493d-93c4-785930bdfb94.json | hard-p19-bind-metadata | 1 | 1 | Exact positive datatype cell 2 (NUMBER) supplies archived NUMBER truth. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p25-grant-component-inventory | 3 | 1 | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase28/gate-28/2026-11-06T19-21-10-267Z-ce58688b-1980-4f80-87a9-4a299a4d37c4.json | hard-p21-alert-levels | 1 | 2 | Numeric cell labels preserve the leading level and count, including slash annotations. |
| gate29a/2026-11-07T20-02-59-736Z-ebdc3a3c-4d33-4f3e-8485-085df581bc11.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| gate29a/2026-11-07T20-11-13-029Z-8b1df215-d32c-42fa-b239-fcd541def6e9.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| gate29a/2026-11-07T20-56-31-201Z-c21586b0-ed0f-48ea-bd60-bdc2c8df1bd9.json | hard-p11-order-customer-key | 1 | 2 | Parenthetical datatype assignments no longer divide the contiguous dictionary record. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-trigger-state | 1 | 1 | Exact positive parenthetical supplies the trigger timing. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-package-validity | 1 | 1 | Exact positive parenthetical supplies PACKAGE BODY. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-incident-range | 1 | 1 | Contiguous labelled whole values supply the single incident record. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p25-grant-pool-inventory | 1 | 1 | Names V$SGASTAT and reports its access gap. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p8-comment-write | 2 | 1 | Conditional self-service comment clause is not a claim of execution. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p25-grant-pool-inventory | 3 | 1 | Names V$SGASTAT and reports its access gap. |
| gate29b/2026-11-07T21-36-22-407Z-dad6e18b-cd02-45c9-b386-754add6e30af.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| gate29b/2026-11-07T21-44-57-288Z-0e410cfc-e091-4258-a1c2-41989d7dd3df.json | hard-p25-grant-component-inventory | 1 | 1 | Names an accepted runtime component view and reports its access gap. |
| gate29b/2026-11-07T22-30-36-493Z-85334525-26c1-4c36-b484-80ca390bbcf8.json | hard-p25-d1-no-backups-recorded | 1 | 2 | Four ordered source rows are all explicitly zero in the Rows column. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-trigger-state | 1 | 1, later B-side review | Exact positive parenthetical supplies the trigger timing. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-incident-range | 1 | 1, later B-side review | Contiguous labelled whole values supply the single incident record. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p25-grant-pool-inventory | 1 | 1, later B-side review | Names V$SGASTAT and reports its access gap. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-trigger-state | 2 | 1, later B-side review | Exact positive parenthetical supplies the trigger timing. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-alert-levels-d1 | 2 | 2 | Numeric cell labels preserve the leading level and count, including slash annotations. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p25-grant-pool-inventory | 2 | 1, later B-side review | Names V$SGASTAT and reports its access gap. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-trigger-state | 3 | 1, later B-side review | Exact positive parenthetical supplies the trigger timing. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p21-products-stats | 3 | 2 | Both named flags are YES; parenthetical metadata stays in its cell and explanations agree. |
| gate29b/2026-11-07T22-46-06-775Z-fd7492f0-799f-424f-a473-3a70aeca781c.json | hard-p25-grant-pool-inventory | 3 | 1, later B-side review | Names V$SGASTAT and reports its access gap. |
| gate29b/2026-11-07T22-58-13-752Z-589b414c-37f7-4f68-9624-e7baac023c35.json | hard-p26-p1-last-failed-job | 1 | 2 | Child rows and a foreign-key constraint correctly explain archived ORA-02292. |

Changed in round 2: `evals/scoring.ts`, `evals/cases-hard/phase26-jobs.json`, `tests/unit/phase29e-round2-scorer.test.ts`, `tests/unit/phase29e-round2-stored.json`, `tests/unit/wp2527j-calibration.test.ts`, and the three `docs/wp-29e-*` replay/report artifacts.

No shared contract changes or additional coordinator code changes are needed. No push or merge performed. No access to the coord-score worktree, Docker, or llm-rig.
