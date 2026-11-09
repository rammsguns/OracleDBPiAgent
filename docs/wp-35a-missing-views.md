# WP-35A: honest missing dictionary view notes

## What changed

`run_query` now performs one bounded, bind-based `ALL_SYNONYMS` lookup after its existing ORA-00942 object probes when at least one failed object is a V$/GV$ name, optionally SYS-qualified. `SYS.V_$` and `SYS.GV_$` spellings map to their public V$/GV$ synonym names. The note separates readable objects, existing but ungranted fixed views, nonexistent Oracle 19c fixed views, and other missing or ungranted objects. A failed synonym lookup retains the prior “Not visible to this account” wording. The lookup uses the existing hint lookup timeout, row cap, and audit path.

Unit tests cover mixed classifications, quoted and SYS.V_$ forms, lookup failure, and the no-extra-lookup paths. The d1 live test unions a readable RMAN view, the nonexistent `V$RMAN_BACKUP_DATAFILES`, and a discovered real but ungranted public V$ view.

## Files changed

- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`
- `docs/wp-35a-missing-views.md`

## Verification

- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — passed: 148 files, 2,955 tests.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)' --no-file-parallelism` — passed: 21 tests. Includes the live d1 mixed case.
- No LLM calls were made. No contract changes are needed.

## Limits

No unverified implementation behavior remains for this work package. The integration test discovers a candidate public fixed view at runtime and skips with a clear reason if the target has no probeable ungranted candidate.
