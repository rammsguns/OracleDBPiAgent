# WP-33B eval fixtures and calibration

## Built

- Added a per-case `setup` list for hard eval cases. The runner executes each exact statement through the case target's read-only Oracle session before sampling ground truth and before the ask. These queries do not count as agent tool calls and are not included in the prompt or model context.
- The validator accepts only plain `SELECT` statements, rejects semicolons, database links, `DBMS_`/`UTL_` calls and `FOR UPDATE`, and rejects setup on refusal cases.
- Added dedicated HARNESS_RO cursor warm-ups for `hard-orders-plan` and `hard-lines-plan`. PRICE intentionally remains unseeded: its truth requires a cursor parsed by SHOPAPP, while the case target runs as HARNESS_RO. No other hard cached-plan case uses an evaluator-owned V$SQL cursor needing setup.
- Per coordinator decision after adversarial review, removed all three scorer calibrations and their tests. These misses are layout variance; a scorer that can pass a wrong answer is worse than an occasional false negative. `evals/scoring.ts` and the calibration checksum test are restored to master's behavior.

## Files changed

- `evals/types.ts`, `evals/run.ts`, `evals/validate-hard.ts`
- `evals/cases-hard/cached-plan.json`
- `tests/unit/hard-evals.test.ts`, `tests/unit/wp29b-eval-cases.test.ts`
- `docs/evals-hard.md`

## Phase 32 scorer findings

- `hard-p26-p1-last-failed-job`: the archived answer gives `ORA-02292` in an **Oracle error code** field and repeats the value as `ERROR# = 2292`; the existing scorer misses this layout.
- `hard-p25-d1-last-level0`: the answer begins `**NONE RECORDED** — on **d1-19c-lab**`; the existing scorer misses this opening layout.
- `hard-p30-d1-fullest-permanent`: the answer names SYSAUX as fullest and gives `Classification: LOW` on a later line; the existing scorer misses the split layout.

These are layout-variance misses. The coordinator chose to leave them as false negatives because case-specific shortcuts that accepted negated or misattributed answers were worse than occasional misses.

## Archived scorer replay

Replayed master's scorer against the restored scorer over every answer record in every JSON archive under `/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive/phase*/`: **15,932 records paired**.

- Flips: **0** (pass → fail 0, fail → pass 0, unrelated 0).

The scorer and calibration checksum assertion are restored to master's versions; no scorer calibration hash is introduced.

## Verification

- `npm run typecheck`: passed.
- `npm run typecheck`: passed.
- Full unit suite with `--maxWorkers=2` and the local Strata end-to-end test excluded: passed (147 files, 2,926 tests).
- Full integration suite with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` and the local Strata end-to-end test excluded: passed (44 files, 121 passed, 1 skipped).

## Contracts and unverified items

No `src/contracts.ts`, `package.json`, or `PLAN.md` change is needed. The eval runner uses its existing runtime session adapter. A fake truth source stays empty until setup runs; the test proves setup precedes truth and ask. No live eval ask was run, in keeping with the no-LLM instruction. PRICE remains dependent on a live SHOPAPP-parsed workload cursor as before.
