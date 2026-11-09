# WP-34A standby provenance notes

## Built

Added gated `run_query` source notes for successful backup metadata and scheduler history reads on standby databases. Matching uses the shared SQL tokenizer, recognizes quoted/schema-qualified names and CTE source bodies, and excludes CTE aliases and projection aliases. Backup matching includes the full `V$BACKUP_*` and `V$RMAN_*` families, `V$DATAFILE_COPY`, and backup control-file sections.

Role is captured as part of the connection identity query once per target per session provider, then reused across tool calls. Known primary identity prevents a separate role probe in `run_query`; unavailable roles omit notes. No prompt or tool-description text was added.

## Files changed

- `src/backup/role.ts`
- `src/oracle/index.ts`
- `src/tools/index.ts`
- `tests/unit/tools.test.ts`
- `tests/integration/query-error-hints.test.ts`

## Tests

- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — passed: 147 files, 2,950 tests.
- `npx vitest run tests/unit/tools.test.ts tests/unit/preflight-catalog.test.ts --maxWorkers=2` — passed: 79 tests.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts --no-file-parallelism --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` — passed: 20 tests. Live c1s/c1 assertions passed, including one role lookup across three standby tool calls, quoted view matching, standby notes, and no notes on c1 primary.
- `git diff --check` — passed.

## Contract changes

None. `databaseRole` is carried on a local `DatabaseIdentity` adapter in `src/oracle/index.ts`; `src/contracts.ts` was not changed.

## Unverified

No full integration suite was run in this review round. The local Strata e2e test was excluded as requested; no LLM calls were made.
