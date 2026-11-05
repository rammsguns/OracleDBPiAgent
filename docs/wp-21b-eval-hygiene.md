# WP-21B eval hygiene

Implemented on `wp-21b-eval-hygiene`. No agent, LLM or Strata requests; no database writes, dependencies added, shared contract, package or plan changes.

## Changes and decisions

- p18 normalizes spaced Oracle problem keys in both answers and truth. Contiguous labelled bullets become records, terminated by blank lines, prose, headings or repeated labels. Values remain bound to their own labels; separate records cannot lend cells. Audit-policy presentation aliases and numbered policy headings are accepted. Parenthetical explanations are removed before binding checks. Tests cover swapped flags, repeated values, record boundaries and scoped code normalization.
- Ground-truth connections set UTC after the 19c gate and before the read-only transaction, matching product sessions.
- Stabilized `hard-p8-description-language`, retaining its holdout classification, question, facts and truth SQL. Reviewed all 82 archived records with jq: 60 failures have only `tool: run_query` failing, while facts and truth pass. `describe_object` returns the requested dictionary column metadata, so `run_query|describe_object` is the appropriate evidence requirement. No weakening of column-name, datatype or length checks.
- Added 12 blind holdouts, three each for PL/SQL (16), ADR (18), SQL performance (19), and security (20). Questions never name tools or views. No agent was run. Live truth validation led only to replacing inaccessible DBA_INDEXES with ALL_INDEXES. Optional empty metadata/cache results use `skipWhenTruthEmpty`.
- Validator records legitimate empty results separately as `skipped`, preserving nonempty validated-record invariants. Phase 21 is an additional release holdout, excluded from the historical tuning ratio, with holdout/truth enforced. Updated historical population tests and restored the old p8 tool requirement only when checking the frozen historical hash.

## Offline scorer replay

`npx tsx docs/wp-21b-replay.ts ../eval-archive ../needlefish/evals/results`

Read-only jq extraction across **554 JSON files / 10,364 recognized records**. Compared the frozen pre-change scorer from base `59842c3` with the current scorer using archived row truth, preserving scalar truth checks. Case definitions are held constant except the explicit p8 tool alternative. **62 fail→pass; zero pass→fail; zero flips on other IDs; zero p18 archive flips.** P18 has a synthetic spaced-key labelled-bullet regression test. Every flip is listed below and includes its full answer and truth in [wp-21b-replay.json](wp-21b-replay.json). Duplicated stored records are counted separately.

Each p8 flip is justified by correct LANGUAGE_ID / VARCHAR2 / 3 facts and passing archived truth, with describe_object supplying equivalent metadata. Both p20 flips contain the six correct attributes grouped under each policy; the first uses six bullets, and the second supplies policy identity in the immediately preceding numbered heading. Label binding preserves the NO/YES distinction. No unrelated archived check failure was waived.

| File | Case | Iteration | Justification |
|---|---|---:|---|
| `../eval-archive/phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18/2026-11-05T05-52-51-200Z-bfd39063-322c-476a-aa38-ba69faf45f9c.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18g/2026-11-05T07-59-02-767Z-3b8f57f0-1a95-463a-b883-02e8a535c47d.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18g/2026-11-05T07-59-02-767Z-3b8f57f0-1a95-463a-b883-02e8a535c47d.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18g/2026-11-05T08-08-18-440Z-3f851eca-a013-49c7-9910-c53b1fe8b537.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18g/2026-11-05T08-08-18-440Z-3f851eca-a013-49c7-9910-c53b1fe8b537.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18h/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18h/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18h/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18h/2026-11-05T10-33-50-755Z-447a901c-6a32-4014-be5d-356a52fa5409.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase18/gate-18h/2026-11-05T10-33-50-755Z-447a901c-6a32-4014-be5d-356a52fa5409.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase19/gate-19/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase19/gate-19/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase19/gate-19/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../eval-archive/phase19/gate-19/2026-11-05T19-26-07-699Z-146edc1f-7cf8-4bdc-9c97-ae51483c59d8.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../eval-archive/phase19/gate-19/2026-11-05T19-26-07-699Z-146edc1f-7cf8-4bdc-9c97-ae51483c59d8.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../eval-archive/phase20/measure/2026-11-05T19-45-57-301Z-9198a7cc-5d8e-43bb-93a7-7858324d584f.json` | `hard-p20-p1-enabled-audit-policies` | 1 | Complete labelled policy records |
| `../eval-archive/phase20/measure/2026-11-05T19-47-34-478Z-d7c2fc8d-fa85-45d0-a6e0-4848c4c1e87d.json` | `hard-p20-p1-enabled-audit-policies` | 1 | Complete labelled policy records |
| `../needlefish/evals/results/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T07-59-02-767Z-3b8f57f0-1a95-463a-b883-02e8a535c47d.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T07-59-02-767Z-3b8f57f0-1a95-463a-b883-02e8a535c47d.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T10-25-12-813Z-b06abf11-5d29-4de0-9a4d-522dc9b742ef.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 1 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 2 | Equivalent dictionary evidence |
| `../needlefish/evals/results/2026-11-05T19-17-36-804Z-9f38d79e-9157-422d-8bd7-541b6fd5d310.json` | `hard-p8-description-language` | 3 | Equivalent dictionary evidence |

## UTC replay and live validation

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx docs/wp-21b-truth-replay.ts`

All **125 truth queries** from MVP and hard case files (including the fresh holdout) ran before/after using the frozen prior ground-truth reader and the UTC reader. **125 identical result sets; zero changes.** Setup SELECTs are executed by both paths. Full rows are in [wp-21b-truth-replay.json](wp-21b-truth-replay.json). These are observations against the live workload, not a guarantee that future mutable counts stay fixed.

`npx tsx evals/validate-hard.ts`, with PIAGENT_SECRET_DIR exported: PASS, **99 nonempty truth queries / 121 cases**, plus one explicitly skipped empty truth (`hard-p21-public-directory`). All other 11 new holdout truths are nonempty. Artifact: `evals/hard-ground-truth-validation.json`.

## Final verification

All commands exit 0. DB commands export `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test -- --maxWorkers=2` | PASS: 88 files, 1,266 tests |
| `npx tsx evals/validate-hard.ts` | PASS: 99 nonempty queries / 121 cases; one permitted empty truth separately recorded |
| `npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` | PASS: 22 files, 54 passed, one excluded Strata test (55 total) |
| `git diff --check` | PASS |

No DB dependency skips occurred in the final integration run. The one excluded test is the explicitly forbidden Strata end-to-end test. Browser tests were not run because no web files changed.

## Files and contracts

Changed only evals, eval unit tests/fixtures and docs. Commits: `11e4d6c` (scoring and replay), `7ec46e6` (UTC and blind holdout). The scorer/truth snapshots under `tests/fixtures/wp21b/` make both replays reproducible. New holdout: `evals/cases-hard/phase21-holdout.json`. Updated scorer, truth reader, validator, validation artifact, p8 case, and affected historical suite tests.

Contract changes needed: **none**. No web changes; browser tests are not applicable. LLM behavior deliberately unmeasured; the fresh holdout remains blind. Initial integration failure on the permitted empty record was corrected before the final rerun.
