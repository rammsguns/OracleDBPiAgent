# WP-20E: eval premises after phase 20 grants

Completed on branch `wp-20e-premises`. No LLM/Strata requests, database writes, new dependencies, shared contracts, package scripts or plan changes. Existing dependencies were restored with `npm ci --ignore-scripts`.

## Changes

- `hard-grant-p1-parameters` remains in dev, now under `diagnosis`. It positively requests both configured memory targets in bytes, with fresh name/value truth from `V$PARAMETER`. Backup regression and archive-log holdout cases retain grant-limited coverage. The validator requires that remaining regression/holdout coverage.
- `hard-p11b-partial-memory` keeps its ID, challenge split and `partial-grants` category. It requests verified instance/version plus shared-pool allocation from the still-inaccessible `V$SGASTAT`; it forbids inferring that allocation from total SGA/configured targets. The validator now probes `SYS.V_$SGASTAT`.
- `hard-p16-history-arguments` accepts `**Defaults:** None` and quoted `DEFAULTED = 'N'`. Case-local forbidden facts reject positive defaults and contradictory answers. Shared scoring code is unchanged.
- The web SQL integration assertion now expects `# SQL Insight`.
- Updated affected premise/count tests, retained the historical suite hash with a frozen pre-grant parameter fixture, and kept historical phase11 scorer answers against their original premise. Added tests for both new premises and default conclusions.

## Read-only p1 probe (item 2)

Used `createSessionProvider(loadConfig())`, target `p1-19c-prod`, and only `session.query(SELECT ...)`, with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` exported. No password was printed or copied.

```sql
SELECT name, value FROM V$PARAMETER
WHERE name IN ('sga_target','pga_aggregate_target') ORDER BY name
```

| Parameter | Bytes |
|---|---:|
| PGA_AGGREGATE_TARGET | 1073741824 |
| SGA_TARGET | 3221225472 |

```sql
SELECT NAME, BYTES FROM V$SGASTAT WHERE ROWNUM=1
```

Result: **ORA-00942**. The full hard validator independently verifies the inaccessible-view prerequisite through the same product session and accepts only ORA-00942/ORA-01031; unrelated failures propagate.

## Offline replay (item 3)

The ignored archives are shared outside this worktree: `../eval-archive` and `../needlefish/evals/results`. Both were read without modification. Command:

```sh
npx tsx docs/wp-20e-replay.ts ../eval-archive ../needlefish/evals/results
```

Scanned 554 JSON files, 10,364 recognized answer records, including all 76 archived answers for this case. **8 fail→pass stored records; 0 pass→fail; 0 flips for other cases.** Six distinct answers flipped; two are also stored in results. Counts intentionally include both stored copies.

The replay compares item-3 expectations against base commit `3fb73dc64d5db0e222ea9cdd308cb6e15518f898`, preserving archived truth/tool checks. This isolates the no-defaults fix from the deliberately changed parameter/partial-memory premises and unrelated historical scorer changes. No fresh ground truth or model call is used for replay. Every flip retains passing archived truth/tool checks.

All flips below are iteration 1, false→true:

| Location | Result file | Accepted conclusion |
|---|---|---|
| `../eval-archive/phase18/gate-18g` | `2026-11-05T06-37-37-326Z-11a32e67-86dd-4ba0-94b8-1ae776fcd080.json` | `DEFAULTED = 'N'` |
| `../eval-archive/phase18/gate-18g` | `2026-11-05T06-41-26-188Z-7807b07a-c61f-4eb0-985b-fed9dea4c9dc.json` | `Defaults:** None` |
| `../eval-archive/phase18/gate-18h` | `2026-11-05T09-19-45-760Z-3b9eb40e-214e-4377-b737-f1765aadb5d7.json` | `Defaults:** None` |
| `../eval-archive/phase19/gate-19` | `2026-11-05T17-46-55-792Z-e2cefc6c-e886-4a55-a2a5-75d086108b04.json` | `Defaults:** None` |
| `../eval-archive/phase19/gate-19` | `2026-11-05T17-50-15-326Z-51e55392-6787-47b5-b5f6-e6b612f57a97.json` | `DEFAULTED = 'N'` |
| `../eval-archive/phase19/gate-19` | `2026-11-05T18-05-56-711Z-b168ebdc-2308-4d34-8c4d-342a8301a7d4.json` | `DEFAULTED = 'N'` |
| `../needlefish/evals/results` | `2026-11-05T06-41-26-188Z-7807b07a-c61f-4eb0-985b-fed9dea4c9dc.json` | `Defaults:** None` |
| `../needlefish/evals/results` | `2026-11-05T09-19-45-760Z-3b9eb40e-214e-4377-b737-f1765aadb5d7.json` | `Defaults:** None` |

Full machine-readable flip report: [wp-20e-replay.json](wp-20e-replay.json); reproducible script: [wp-20e-replay.ts](wp-20e-replay.ts).

## Validation

The database validation and integration commands below exported `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm test -- --maxWorkers=2` | PASS, 87 files, 1263 tests, exit 0 |
| `npx tsx evals/validate-hard.ts` | PASS, 88 truth queries / 109 hard cases, exit 0; refreshed committed artifact |
| `npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` | PASS, 22 files, 54 passed / 1 excluded (55 total), exit 0 |
| `git diff --check` | PASS |

The integration command runs the entire integration directory serially using the repository script, excluding exactly the one end-to-end Strata test before its body runs. That exclusion prevents even a Strata health request. All 54 DB tests executed; no DB dependency skips occurred. Unit worker count was bounded to two after the initial unrestricted run canceled workers; the complete bounded run passed. Earlier stale count/hash assertions were updated for the changed premise, then the full unit suite passed.

## Files and contracts

Changed the three owned case JSON files, `evals/validate-hard.ts`, `evals/hard-ground-truth-validation.json`, `tests/integration/web-sql.test.ts`, affected phase5/8/11 unit tests, the historical parameter fixture, `tests/unit/wp20e-premises.test.ts`, and these documentation/replay files.

**Contract changes needed: none.** LLM behavior was intentionally not measured; the end-to-end Strata integration test is excluded by name to comply with the explicit no-LLM instruction.

Implementation commit: `e2da060` (`fix(evals): refresh post-grant premises and no-default facts`).
