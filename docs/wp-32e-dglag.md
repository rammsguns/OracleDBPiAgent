# WP-32E: Data Guard lag corrections

## Delivered

- Primary `dgLag` is `OK`, has JSON `value: null`, and displays
  `not applicable (primary)`. It no longer reports a measured zero or affects
  aggregate health. CLI and web Check output use the same display; health_check
  now includes this OK/not-applicable row.
- When a PDB returns NULL apply lag, the standby fallback requires valid
  transport lag, `TIME_COMPUTED` and `DATUM_TIME` within 120 seconds of now and
  each other, an MRP0 row in `APPLYING_LOG` or `WAIT_FOR_LOG`, and visible RFS
  redo positions. MRP0 must be at or beyond every visible RFS sequence/block
  position for its thread. `V$ARCHIVED_LOG` must be readable and may contain at
  most one received unapplied log beyond MRP0's applied sequence. The fallback
  reports transport lag as a conservative bound and includes the derivation;
  missing, stale, capped or behind evidence remains UNKNOWN with a reason.
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

## Contract and verification

No shared contract changes or dependencies are needed: `Verdict` already allows
`value: null`, and the local check adapter can set `status: OK` and a custom
display string. `src/contracts.ts`, `package.json` and `PLAN.md` were not
changed.

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: PASS, 144 files and 2,832 tests.
- Focused check/standby/health tests: PASS, 136 tests before the additional
  health rendering assertion.
- `npm run test:browser`: PASS, 89 passed and 7 skipped.
- Full integration suite with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` (plus explicit C1S/check test path filters; Vitest still ran all integration files): PASS, 43 files, 120 passed and 1 skipped.
- Final focused typecheck and check/standby/health units after the last implementation adjustment: PASS, 137 tests.
- Live CLI `check --target c1s-19c-stby --json`: `dgLag` OK, value 0 seconds
  from transport lag, with PDB derivation note and MRP0/RFS seq/block evidence.
- Live CLI checks on `c1-19c-pdb`, `d1-19c-lab` and `p1-19c-prod`: all returned
  `dgLag` OK, null value and `not applicable (primary)`. Their overall check
  statuses were respectively WARN, CRIT and UNKNOWN from other checks.
- No unverified database writes, grants, restarts or Data Guard changes.
