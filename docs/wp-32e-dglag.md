# WP-32E: Data Guard lag corrections

## Delivered

- Primary `dgLag` is `OK`, has JSON `value: null`, and displays
  `not applicable (primary)`. It no longer reports a measured zero or affects
  aggregate health. CLI and web Check output use the same display; health_check
  now includes this OK/not-applicable row.
- When a PDB returns NULL apply lag, the standby fallback requires valid
  transport lag, `TIME_COMPUTED` and `DATUM_TIME` within 120 seconds of the
  database `SYSDATE` and each other, an MRP0 row in `APPLYING_LOG` or
  `WAIT_FOR_LOG`, and positive RFS sequence/block positions. Every thread with
  received redo must have a caught-up MRP0 position on that same thread.
  `V$ARCHIVED_LOG` must be readable, and any RFS row with `APPLIED='NO'` beyond
  MRP0's current sequence fails closed, including rows on threads without an
  applying MRP0. The fallback reports transport lag as a conservative bound
  and includes per-thread derivation; missing, stale, capped or behind evidence
  remains UNKNOWN with a reason.
- The path where apply lag is visible remains the maximum of transport/apply
  lag and still requires visible MRP0. No database grants or lab changes were
  made. The existing PDB grants already cover all three views.

## Files changed

- `src/backup/role.ts`
- `src/check/index.ts`
- `src/tools/healthCheck.ts`
- `tests/unit/standby.test.ts`
- `tests/unit/healthCheck.test.ts`
- `tests/browser/check.spec.ts`
- `tests/integration/c1-standby.test.ts`
- `tests/integration/check.test.ts`
- `docs/check.md`
- `docs/wp-32e-dglag.md`
- Follow-up code is in `src/backup/role.ts`; follow-up regression cases are in
  `tests/unit/standby.test.ts`.

## Contract and verification

No shared contract changes or dependencies are needed: `Verdict` already allows
`value: null`, and the local check adapter can set `status: OK` and a custom
display string. `src/contracts.ts`, `package.json` and `PLAN.md` were not
changed.

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: PASS, 144 files and 2,839 tests after the review
  corrections.
- Focused check/standby/health tests: PASS, 136 tests before the additional
  health rendering assertion.
- `npm run test:browser`: PASS, 89 passed and 7 skipped.
- Full integration suite with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` (plus explicit C1S/check test path filters; Vitest still ran all integration files): PASS, 43 files, 120 passed and 1 skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/c1-standby.test.ts tests/integration/check.test.ts --no-file-parallelism`: PASS, 2 files, 3 tests.
- Live CLI `check --target c1s-19c-stby --json`: `dgLag` OK, value 0 seconds
  from transport lag, with PDB derivation note and MRP0/RFS seq/block evidence.
- Live CLI checks on `c1-19c-pdb`, `d1-19c-lab` and `p1-19c-prod`: all returned
  `dgLag` OK, null value and `not applicable (primary)`. Their overall check
  statuses were respectively WARN, CRIT and UNKNOWN from other checks.
- No unverified database writes, grants, restarts or Data Guard changes.

## Antigravity review follow-up

Addressed every finding: archived logs without a corresponding MRP0 thread now
fail closed; the unapplied-log tolerance is zero; idle RFS rows with sequence
or block zero are ignored; RFS/MRP comparisons and success notes are grouped by
thread; and timestamp freshness compares parsed Oracle wall-clock values with
`SYSDATE` from the database rather than the client clock.

Regression coverage includes an unapplied log on a thread without an MRP row, a
single unapplied next sequence, idle RFS sequence zero, independent thread
sequences, rejecting cross-thread progress, and a non-UTC-style Oracle timestamp compared to the mocked database
clock. Typecheck and all 2,839 unit tests pass. C1S and C1 primary live CLI checks
pass: C1S reports the per-thread derivation at 0 transport seconds; C1 reports
`not applicable (primary)` with null value. C1S and check integration files
pass (3/3 tests). No live database changes were made.
