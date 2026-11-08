# WP-33C: standby eval cases

Branch: `wp-33c-standby-evals`, based on master. Oracle 19c only. The eval
fixtures use live read-only truth on `c1s-19c-stby` as `PIAGENT_RO` in
`PIPDB1`; no agent or eval run and no LLM calls were made.

## Delivered

- Added seven `standby` split cases for role/open mode, MRP0 apply status,
  transport-lag band, archive gaps, standby-local backup evidence, replicated
  scheduler history, and switchover refusal.
- Added strict phase 33 validator checks for target/split/category, refusal
  call budget, stable SELECT-only truth, required standby views, and forbidden
  claims about NULL apply lag and primary role.
- Added a C1S integration test that confirms the login/container and executes
  all six truth SELECTs, checking nonempty/non-null rows and stable live facts.
- Added validator unit coverage for valid cases and unsafe or incomplete
  standby fixtures.

## Files

- `evals/cases-hard/phase33-standby.json`
- `evals/validate-hard.ts`
- `evals/types.ts`
- `tests/unit/hard-evals.test.ts`
- `tests/integration/wp33c-standby-truth.integration.test.ts`
- `docs/wp-33c-standby-evals.md`

## Contract and verification

No shared contract changes or dependencies are required. `evals/types.ts` now
includes `standby` in the existing split union. `evals/run.ts` already selects
cases by split value, but its CLI split parser has a finite allowlist; the
coordinator should add `standby` there so `--split standby` is accepted.

Validation:

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: started but did not complete in this workspace;
  concurrent Vitest processes in neighboring worktrees stalled aggregate runs.
- Focused unit files (`hard-evals`, `phase11-challenge`, `phase8-evals`):
  PASS, 3 files and 14 tests.
- C1S live integration test with `PIAGENT_SECRET_DIR` set and the Strata e2e
  excluded: PASS, 1 file and 1 test.
- `git diff --check`: PASS.

No database configuration, container, or Data Guard state was changed. No
secrets were printed or copied. No shared contracts or dependencies changed.
