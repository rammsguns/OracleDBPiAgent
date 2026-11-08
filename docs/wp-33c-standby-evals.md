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
- Review fixes: scheduler history and local-backup conclusions use facts rather
  than drifting/unasked counts; transport lag truth is a SQL-computed
  under-five-minute band; role wording permits accurate primary-source
  references; validator requires the local-backup forbidden-claim guard.
- Added two correct and two incorrect natural answer examples per case, scored
  through the production eval scorer.
- Added a C1S integration test that confirms the login/container and executes
  the three truth SELECTs for role/open mode, MRP status, and banded transport
  lag. Archive gaps, local backups, and replicated job history are graded with
  stable facts and forbidden-claim guards without row matching.
- Added validator unit coverage for valid cases and unsafe or incomplete
  standby fixtures.

## Files

- `evals/cases-hard/phase33-standby.json`
- `evals/run.ts`
- `evals/validate-hard.ts`
- `evals/types.ts`
- `tests/unit/hard-evals.test.ts`
- `tests/integration/wp33c-standby-truth.integration.test.ts`
- `docs/wp-33c-standby-evals.md`

## Contract and verification

No shared contract changes or dependencies are required. `evals/types.ts` and
`evals/run.ts` include `standby` in the split type and CLI allowlist, so
`--split standby` selects these cases.

Revalidation after review fixes:

- `npm run typecheck`: PASS.
- Focused `hard-evals` unit file: PASS, 6 tests, including scorer answer pairs
  for all seven cases.
- `npm test -- --maxWorkers=2`: PASS, 147 files and 2,927 tests.
- C1S truth integration test: PASS, 1 test.
- `git diff --check`: PASS.

No database configuration, container, or Data Guard state was changed. No
secrets were printed or copied. No shared contracts or dependencies changed.
