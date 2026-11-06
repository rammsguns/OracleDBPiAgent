# WP-23D: p23 sessions evals

Branch: `wp-23d-p23-evals`. Base: `1d84ee093941dd16c6da4578a3077be4f186d7ce`.

Built six challenge cases in `evals/cases-hard/phase23-sessions.json`, three per approved 19c target. All use fixed SELECT SQL and `rowCells`; questions name no tools or views. The cases cover cumulative non-idle wait-class aggregation on both targets, event-to-class associations for commit/redo and locking/idle events, and definition counts for six wait classes. They never count sessions or select session details, SQL text, binds, forbidden columns, ASH or AWR. Every truth is nonempty, so no empty-truth skip is needed.

The runner discovers the file with the other hard cases, exactly like p20. It also accepts `--suite p23`; split and explicit ID filters intersect that suite. `loadSelectedCases` lets tests verify selection without invoking the agent or Strata preflight. Directory suites retain their existing selection and checksum behavior. Full hard-suite counts are now 129: 30 dev, 24 holdout, 21 regression, 54 challenge. The historical checksum remains unchanged and its test passes.

`validate-hard` checks the new suite's size, target balance, challenge/rowCells contract and prohibited truth columns. `evals/validate-p23.ts` calls the full hard validator twice, waiting 60 seconds after the first completes, then compares every p23 row exactly and fails on instability or missing records. Run it without an agent or LLM:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets node_modules/.bin/tsx evals/validate-p23.ts
```

## Live truth stability

The full hard suite passed both validation calls. The [recorded SQL and both result sets](wp-23d-p23-truth-stability.json) are committed. First validation: 2026-11-06 05:56:49.667–05:57:07.138 UTC. Second: 05:58:07.144–05:58:23.822 UTC. The gap between runs was **60.006 seconds**, so every truth was re-read at least 60 seconds later. All six p23 cases matched exactly; none skipped.

| Case suffix | Identical results in both samples |
|---|---|
| d1-dominant-wait-class | System I/O |
| p1-dominant-wait-class | System I/O |
| d1-commit-events | log file parallel write → System I/O; log file sync → Commit |
| p1-lock-idle-events | SQL*Net message from client → Idle; both named TX/TM enqueue events → Application |
| d1-event-definition-counts | Application 17; Commit 5; Concurrency 56 |
| p1-event-definition-counts | Idle 140; System I/O 40; User I/O 59 |

The definition cases are independent of workload and validation connections. The two cumulative winners omit changing counters, exclude Idle and break ties deterministically by class name. Their stability is demonstrated for this interval, not guaranteed across a restart or a major workload shift; rerun the validator before the coordinator gate. Blocking-session and oldest-transaction cases were avoided because they would introduce changing identities or empty-case skips.

## Offline archive replay

A live-truth fixture exposed a false negative: global Markdown cleanup removed the literal asterisk in `SQL*Net message from client`. Only `hard-p23-` row matching now preserves embedded asterisks while stripping boundary Markdown emphasis. Exact event-name matching still rejects `SQLNet`; a regression test verifies that historical case behavior remains unchanged. No existing case definition changed. Scorer SHA-256: base `9545ba7202b061ffa291ebd8e3078316daee33c54d360787691d8c92a796f992`, current `58ba16b75a083a4ba38dac987e59cb56c4ac3c3852570979970a6db2d2877ca4`.

[Replay script](wp-23d-replay.ts) compares base cases/scoring with current cases/scoring using archived answers and rowCells truth. It preserves archived scalar/allCells truth checks rather than substituting live data. [Results](wp-23d-replay.json): **zero flips**, including zero outside `hard-p23-`.

| Root | JSON files | Recognized answer records |
|---|---:|---:|
| `../eval-archive` | 476 | 10,623 |
| `../needlefish/evals/results` | 136 | 3,174 |
| Total | 612 | 13,797 |

There were 113 additional archive answer records whose IDs have no current/base case definition; the replay reports them as unknown and does not rescore them. The explicit `hard-p23-` guard leaves the historical scoring path unchanged for those records as well; their results were not independently replayed. No p23 agent answers exist yet.

Reproduce offline with `node_modules/.bin/tsx docs/wp-23d-replay.ts`.

## Checks

Dependencies were initially absent. Linked existing `../needlefish/node_modules`; no dependencies or manifests changed. All database commands used `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` and the existing approved account/19c-gated reader. No passwords or API keys were printed, copied or committed. No agent, Strata health endpoint or LLM was called. Existing Oracle session initialization and transaction cleanup are unchanged; eval truth statements are SELECT-only and never change database data or objects.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm test -- --maxWorkers=2` | PASS, 92 files, 1,327 tests, exit 0 |
| `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets node_modules/.bin/tsx evals/validate-p23.ts` | PASS, full hard suite twice; six p23 truths identical, no p23 skips, exit 0 |
| `node_modules/.bin/tsx docs/wp-23d-replay.ts` | PASS, 612 files / 13,797 recognized records, zero flips, exit 0 |
| `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"` | FAIL, 53 passed / 1 failed / 1 excluded Strata test, 22 files, exit 1 |
| `git diff --check` | PASS |

Final command output:

```text
> npm run typecheck
> tsc -p tsconfig.json --noEmit
(exit 0, no errors)

> npm test -- --maxWorkers=2
 Test Files  92 passed (92)
      Tests  1327 passed (1327)
   Duration  39.88s

> PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"
 FAIL tests/integration/triage.test.ts
   discovers the live purge failure from natural language via the alert log
 AssertionError: expected [] to include 'NIGHTLY_PURGE_JOB'
 tests/integration/triage.test.ts:106:27
 Test Files  1 failed | 21 passed (22)
      Tests  1 failed | 53 passed | 1 skipped (55)
   Duration  152.96s
```

The integration failure is outside WP-23D: its existing natural-language purge discovery test searches a rolling `2d` window. At 2026-11-06 06:01 UTC, a SELECT-only, independently 19c-gated [prerequisite probe](wp-23d-integration-prerequisite.json) found the latest matching purge alert at **2026-11-04 04:30:56.298 UTC**, more than 49 hours earlier. Thus the expected alert is outside the test window. The triage code/test is unchanged; the coordinator should repair its live prerequisite or fixed-window test in its owning WP. No other integration test failed and there were no database-dependency skips. The one skipped test was the explicitly excluded Strata end-to-end test. Full hard-truth validation, including p23, passed in integration.


## Files and remaining work

Changed files:

- `evals/cases-hard/phase23-sessions.json`: six fixed truth challenges.
- `evals/run.ts`: testable selection and `p23` suite selector.
- `evals/validate-hard.ts`: p23 invariants.
- `evals/scoring.ts`: embedded-asterisk cleanup scoped to `hard-p23-`.
- `evals/validate-p23.ts`: two-sample live stability validator.
- `tests/unit/hard-evals.test.ts`: total count 129.
- `tests/unit/phase23-evals.test.ts`: SQL restrictions, suite selection/intersections, validator failures and positive/negative scoring with live truth fixtures.
- `docs/wp-23d-p23-truth-stability.json`: both live SQL/result samples.
- `docs/wp-23d-replay.ts`, `docs/wp-23d-replay.json`: reproducible offline replay and counts.
- `docs/wp-23d-integration-prerequisite.json`: read-only diagnosis of the unrelated integration failure.
- This final report, `docs/wp-23d-p23-evals.md`.

Contract changes needed: **none**. `src/contracts.ts`, `package.json` and `PLAN.md` unchanged. Agent answer quality, p23 ×2 pass rate and all Strata gate measurements remain intentionally unverified; the coordinator owns them. No push, merge or PR performed.

Implementation commit: `b928237` (`Add p23 sessions challenges and stable truth validation`). A second commit (`Preserve SQL*Net event names in p23 scoring only`) contains the scoped scorer fix, regression test and archive replay. The final documentation commit records the integration prerequisite and final checks.
