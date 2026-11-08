# WP-33B eval fixtures and calibration

## Built

- Added a per-case `setup` list for hard eval cases. The runner executes each exact statement through the case target's read-only Oracle session before sampling ground truth and before the ask. These queries do not count as agent tool calls and are not included in the prompt or model context.
- The validator accepts only plain `SELECT` statements, rejects semicolons, database links, `DBMS_`/`UTL_` calls and `FOR UPDATE`, and rejects setup on refusal cases.
- Added dedicated HARNESS_RO cursor warm-ups for `hard-orders-plan` and `hard-lines-plan`. PRICE intentionally remains unseeded: its truth requires a cursor parsed by SHOPAPP, while the case target runs as HARNESS_RO. No other hard cached-plan case uses an evaluator-owned V$SQL cursor needing setup.
- Fixed the three calibrated scorer misses with case-scoped logic. Unit tests reject a wrong or denied Oracle code, a negated `NONE RECORDED` or mismatched target, a negated/quoted/code-fenced fullest header, another tablespace named as fullest even when SYSAUX/LOW appears elsewhere, and a classification explicitly attached to a different tablespace.

## Files changed

- `evals/types.ts`, `evals/run.ts`, `evals/validate-hard.ts`
- `evals/cases-hard/cached-plan.json`, `evals/scoring.ts`
- `tests/unit/hard-evals.test.ts`, `tests/unit/wp2527j-calibration.test.ts`, `tests/unit/wp29b-eval-cases.test.ts`
- `docs/evals-hard.md`

## Phase 32 scorer findings

- `hard-p26-p1-last-failed-job`: the archived answer gives `ORA-02292` in an **Oracle error code** field and repeats the value as `ERROR# = 2292`. The scorer failed `fresh ground truth row: ["ORA-02292"]` because its structured row matcher did not normalize that labelled form. The case-scoped matcher now requires both the exact expected ORA code and matching numeric error number, and rejects denial terms in the assertion line or its preceding paragraph clause.
- `hard-p25-d1-last-level0`: the answer begins `**NONE RECORDED** — on **d1-19c-lab**`. The scorer failed `fresh ground truth row: ["NONE RECORDED"]` on this opening layout. The case-scoped check accepts only exact `d1` or `d1-19c-lab` followed by a comma or sentence boundary, and rejects a following denial such as `is FALSE` or `backups were found`.
- `hard-p30-d1-fullest-permanent`: the answer names SYSAUX as the fullest permanent tablespace and gives `Classification: LOW` on a later line. The scorer failed `fresh ground truth row: ["SYSAUX","LOW"]` because it requires the two row cells to be associated within one structured record. Synthesis now requires a positive, unquoted header whose name equals the ground-truth tablespace; a separated class must match truth and cannot name another tablespace. Contradictory header/class pairs block fallback matching. Other p30 answer layouts keep their pre-calibration scorer behavior.

## Archived scorer replay

Replayed scorer variants over every answer record in every JSON archive under `/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive/phase*/`: **15,932 records paired**.

- Against base `master` scorer: targeted fail → pass **6** (p26: 2; p25: 1; p30: 3), all in Phase 32 gate A/B records and among the three requested case IDs; pass → fail **0**; unrelated flips **0**.
- Against the scorer at the start of this review follow-up: pass → fail **0**, fail → pass **0**, and unrelated flips **0**. This confirms the hardening adds no replay changes beyond the six Phase 33 targeted flips relative to master.

The calibration checksum assertion in `tests/unit/wp2527j-calibration.test.ts` now pins the changed scorer hash (`077fcb06c4967c4bff199bee1831eeb1b34fb9d99342403188e1c7b14c89d433`). This intentional checksum update ensures later scorer edits require an explicit calibration review.

## Verification

- `npm run typecheck`: passed.
- Focused unit tests: `hard-evals` and `wp2527j-calibration` passed (9 tests) after the review fixes; the full suite below includes `wp29b-eval-cases`.
- Full unit suite with `--maxWorkers=2` and the local Strata end-to-end test excluded: passed after this review follow-up (147 files, 2,927 tests).
- Integration suite with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` and the local Strata end-to-end test excluded: passed (44 files, 121 tests passed, 1 skipped).

## Contracts and unverified items

No `src/contracts.ts`, `package.json`, or `PLAN.md` change is needed. The eval runner uses its existing runtime session adapter. A fake truth source now stays empty until setup runs; the test proves setup precedes truth and ask, and that the real scorer accepts the warmed truth. No live eval ask was run, in keeping with the no-LLM instruction. PRICE remains dependent on a live SHOPAPP-parsed workload cursor as before.
