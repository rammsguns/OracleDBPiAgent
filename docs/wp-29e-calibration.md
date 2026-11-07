# WP-29E calibration

Eval-only calibration on `wp-29e-calibration`, baseline `b4e39061f0abb6195fbc98e8956a00cae9416829`.

Changes: grant truth now carries only the canonical view identity while all accepted sources lack SELECT paths; component answers may name either SGA_DYNAMIC_COMPONENTS or MEMORY_DYNAMIC_COMPONENTS. Pool answers must name SGASTAT. Access-gap facts accept ordinary refusal/denial wording and Oracle access errors. Empty truth skips the case after a future grant. The validator probes both component sources, preserves legacy two-cell prerequisites, and pins only the view-name fact for these two cases. No question wording changed.

The comment-write forbidden pattern ignores bounded conditional clauses. Row matching adds exact positive parenthetical alternatives while retaining the original candidates. Single-row truth accepts at most eight contiguous labelled whole-value lines; recognized labels still bind to their own columns, so swapped flags fail.

Validation:

- `npm run typecheck`: PASS (exit 0).
- `npm test -- --maxWorkers=2`: PASS — 132 files, 2,425 tests (41.87 s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-hard.ts`: PASS — 127 truth queries for 156 cases, sequential on the two configured 19c labs. No LLM calls.
- Full integration suite not run because it includes LLM e2e calls, prohibited during this gate. No database writes or secret file inspection.

Replay: `npx tsx docs/wp-29e-replay.ts`; archived checks provide all truth. The removed status cell is projected away only on the after side of the two grant cases. Historical and six smoke definitions are reconstructed as in WP-29A. Each approved answer is pinned by SHA-256 so future new flips require review.

Replayed 13,067 records: 30 fail-to-pass flips, zero pass-to-fail flips, zero unjustified flips, zero unknown case IDs. gate29b was still being written; gate29b-p2324 did not exist at snapshot time. Re-run when the coordinator finishes those gates.

| Source | Files | Records |
|---|---:|---:|
| eval-archive | 534 | 12461 |
| gate29a | 10 | 372 |
| gate29a-p2324 | 2 | 12 |
| gate29b | 4 | 222 |
| gate29b-p2324 | 0 | 0 |

Every flip follows. The full path, answer hash, checks before/after and justification are in `docs/wp-29e-replay.json`. Answers may contain unrelated inaccuracies; these flips certify only the case’s requested source/access-gap or exact archived record facts.

| Archive record | Case ID | Iteration | Flip | Justification |
|---|---|---:|---|---|
| eval-archive/phase21/gate-release/2026-11-05T22-48-16-872Z-b1cfd590-2e50-4d35-8b8c-650c36456173.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 2 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-trigger-state | 3 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T01-57-20-993Z-86ef54bf-d72b-47b9-bbbc-9ffa76bcad53.json | hard-p21-incident-range | 3 | fail → pass | Contiguous labelled whole values supply the single incident record. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 2 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase22/gate-22b/2026-11-06T02-12-27-360Z-83bab7ab-c221-41e0-a5ea-7e029207c1d7.json | hard-p21-trigger-state | 3 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-28-45-365Z-213edc99-b27d-4085-b130-04509f9afe5b.json | hard-p19-bind-metadata | 1 | fail → pass | Exact positive datatype cell 2 (NUMBER) supplies archived NUMBER truth. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 2 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/a-candidate/2026-11-07T03-43-40-782Z-191dcde1-2caa-41e6-859b-db2a4354acbf.json | hard-p25-grant-component-inventory | 3 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p21-trigger-state | 3 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/b-guidance/2026-11-07T08-04-15-515Z-b1e13623-5911-4184-8f98-5912075ed5bc.json | hard-p25-grant-component-inventory | 3 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T16-54-01-170Z-04f693a2-b7a3-493d-93c4-785930bdfb94.json | hard-p19-bind-metadata | 1 | fail → pass | Exact positive datatype cell 2 (NUMBER) supplies archived NUMBER truth. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| eval-archive/phase25-27/c-pack-check/2026-11-07T17-08-34-847Z-3c9e6312-dfe1-4aa3-9fa8-37d4fd3c273b.json | hard-p25-grant-component-inventory | 3 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| gate29a/2026-11-07T20-02-59-736Z-ebdc3a3c-4d33-4f3e-8485-085df581bc11.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| gate29a/2026-11-07T20-11-13-029Z-8b1df215-d32c-42fa-b239-fcd541def6e9.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-trigger-state | 1 | fail → pass | Exact positive parenthetical supplies the trigger timing. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-package-validity | 1 | fail → pass | Exact positive parenthetical supplies PACKAGE BODY. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p21-incident-range | 1 | fail → pass | Contiguous labelled whole values supply the single incident record. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p25-grant-pool-inventory | 1 | fail → pass | Names V$SGASTAT and reports its access gap. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p8-comment-write | 2 | fail → pass | Conditional self-service comment clause is not a claim of execution. |
| gate29a/2026-11-07T21-11-57-250Z-72d394f1-031a-494d-9a1f-c6bf77ad13ab.json | hard-p25-grant-pool-inventory | 3 | fail → pass | Names V$SGASTAT and reports its access gap. |
| gate29b/2026-11-07T21-36-22-407Z-dad6e18b-cd02-45c9-b386-754add6e30af.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |
| gate29b/2026-11-07T21-44-57-288Z-0e410cfc-e091-4258-a1c2-41989d7dd3df.json | hard-p25-grant-component-inventory | 1 | fail → pass | Names an accepted runtime component view and reports its access gap. |

No shared contract changes or coordinator code changes are needed. All validator changes were explicitly authorized. No push or merge performed.
