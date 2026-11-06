# WP-24D: p24 space evals

Implemented six `hard-p24-` challenge cases, three per approved 19c target. Questions name no tools or dictionary views. All truth is SELECT-only, with deterministic ordering, non-null output and `rowCells` scoring:

- p1: largest SHOPAPP segment identity, including type and partition identity.
- p1: per-permanent-tablespace autoextend-aware maximum bytes, summed per file.
- d1: every redo group's thread, group, exact bytes, members and total group count.
- p1: recovery-area configuration and limit, including explicit NOT CONFIGURED / 0.
- d1: undo tablespace, configured retention seconds and guarantee setting.
- d1: largest nonpartitioned non-Oracle-maintained LOB data segment mapped to its table and column.

Changing usage counters are excluded. Segment rankings return identity only. Byte facts are configured capacity and redo sizes, requested in exact bytes; no tolerance and no scorer change were needed. Configuration changes during a later gate still require revalidation.

`--suite p24` selects only these cases and intersects `--split` and `--ids` before any Strata preflight. No agent or Strata calls were made during this work. The coordinator can run its p24 agent gate later.

## Live truth stability

Reproduce with:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets node node_modules/tsx/dist/cli.mjs evals/validate-p24.ts
```

The validator retains full hard-suite invariants and validates the entire 135-case suite twice (113 truth queries per sample), comparing all six p24 results exactly. [Both samples and SQL](wp-24d-p24-truth-stability.json) are committed:

- First sample: 2026-11-06 07:03:45.330–07:04:04.914 UTC.
- Second sample: 2026-11-06 07:05:04.920–07:05:22.033 UTC.
- Minimum inter-sample gap: **60.006 seconds**; all six truths stable.

Observed identities include SHOPAPP.ORDER_LINES and CO.PRODUCTS.PRODUCT_DETAILS; p1 has no recovery area configured. No database data, grants or configuration were changed. The existing session provider performs its usual session initialization and read-only transaction handling.

## Offline archive replay

Although scoring is unchanged, [the replay](wp-24d-replay.ts) compares the branch-base scorer and case definitions against current definitions using archived answers and archived truth, without databases or LLMs. [Results](wp-24d-replay.json):

| Source | JSON files | Recognized answers | Unknown answers |
|---|---:|---:|---:|
| `../eval-archive` | 476 | 10,623 | 113 |
| `../needlefish/evals/results` | 136 | 3,174 | 0 |

**Zero flips**, including zero outside `hard-p24-`. The 113 unknown IDs have no matching case definition and were not independently rescored. Scorer SHA-256 before and after is identical: `58ba16b75a083a4ba38dac987e59cb56c4ac3c3852570979970a6db2d2877ca4`.

Reproduce with `node node_modules/tsx/dist/cli.mjs docs/wp-24d-replay.ts`.

## Files and contracts

- `evals/cases-hard/phase24-space.json`: new challenges.
- `evals/run.ts`: p24 selector alongside preserved p23 selection.
- `evals/validate-hard.ts`: p24 membership, split, category, truth and forbidden-view/question checks.
- `evals/validate-p24.ts`: DB-only two-sample stability validation.
- `tests/unit/phase24-evals.test.ts`: selection, invariants, unsafe-view rejection, unstable/missing/duplicate samples, recorded gap and positive/negative scoring.
- `tests/unit/hard-evals.test.ts`: total suite count updated from 129 to 135; prior split counts unchanged.
- `docs/wp-24d-p24-truth-stability.json`, `docs/wp-24d-replay.ts`, `docs/wp-24d-replay.json`, and this report.

Contract changes needed: **none**. No dependencies added; the initially absent ignored `node_modules` directory is linked to the existing sibling `needlefish` installation. `src/contracts.ts`, `package.json`, `PLAN.md`, existing case files and scorer remain unchanged. No push, merge, rebase or PR. Agent answer quality and Strata gate pass rates remain intentionally unverified.

## Validation

The first unit attempt had two new-test failures: an overly narrow expected rejection message (fixed to accept the shared SQL policy's earlier rejection), and the live-record test starting before the stability artifact existed. Final results follow below.

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files  95 passed (95)
     Tests  1373 passed (1373)
  Duration  46.97s
PASS (exit 0); includes prior-suite checksum tests.

PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"
Test Files  23 passed (23)
     Tests  56 passed | 1 skipped (57)
  Duration  152.74s
PASS (exit 0); the excluded Strata end-to-end test is the one skip.

DB-only validate-p24: PASS, both full-suite samples and six stable p24 truths.
Offline archive replay: PASS, 612 JSON files / 13,797 recognized answers, zero flips.
git diff --check: PASS.
```

Implementation commit: `f26147b` (`Add p24 space challenges and stable truth validation`). The following documentation commit contains this final report and replay evidence. All work is on `wp-24d-p24-evals`.
