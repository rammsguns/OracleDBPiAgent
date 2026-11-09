# WP-34A standby provenance notes

## Built

Added gated `run_query` source notes for successful backup metadata and scheduler history reads on standby databases. Matching uses the shared SQL tokenizer, recognizes quoted/schema-qualified names, CTE source bodies, and `SYS.V_$`/`SYS.GV_$` synonyms, and excludes CTE aliases and projection aliases. Backup matching includes the `V$BACKUP_*` and `V$RMAN_*` families, `V$DATAFILE_COPY`, and backup control-file sections.

Role detection occurs only after a matching user SELECT succeeds. The `run_query` path requests at most one row with a two-second timeout and caches the role per provider/target. `readDatabaseRole` accepts optional query options; existing backup, check, jobs, and space callers use its unchanged no-options query call. Failed role reads, including ORA-00942/ORA-01031, omit the note without affecting the user query or session. The base identity query does not reference V$DATABASE.

## Files changed

- `src/backup/role.ts`
- `src/tools/index.ts`
- `docs/wp-34a-standby-provenance.md`

Earlier WP-34A commits also changed `src/oracle/index.ts` and the listed test files.

## Tests

- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — passed: 147 files, 2,950 tests.
- Focused jobs/tools unit tests — passed: 103 tests.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts tests/integration/jobs.test.ts tests/integration/backup.test.ts tests/integration/check.test.ts --no-file-parallelism --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` — passed: 4 files, 26 tests. Includes live c1s/c1 provenance checks and the role-query cache assertion.
- `git diff --check` — passed.

## Regression correction

Round 3 identified that hardcoding `maxRows: 1` in the shared role helper overrode the jobs wrapper's configured row cap. The helper now receives options optionally, and only the provenance callsite supplies bounds. The jobs test and full unit suite pass with this correction.

## Contract changes and limits

No contract changes. `src/contracts.ts` remains unchanged. The full integration suite was not run in this round; the requested c1s/c1 and jobs/backup/check integration files passed. The local Strata e2e test was excluded; no LLM calls were made.
