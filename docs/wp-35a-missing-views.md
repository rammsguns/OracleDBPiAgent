# WP-35A: honest missing dictionary view notes

## What changed

`run_query` performs one bounded, bind-based `ALL_SYNONYMS` lookup after its existing ORA-00942 object probes when a failed object is an unquoted V$/GV$ name, a `SYS.V_$`/`SYS.GV_$` fixed-object name, or a quoted V$/GV$ pattern needing case validation. It maps fixed-object spellings to their public synonym names. The lookup uses the existing hint lookup timeout, row cap, and audit path.

Exact source-note wording by branch:

- Readable objects: `Readable: X.`
- An unqualified public V$/GV$ synonym exists but its probe failed: `Not granted to this account (view exists): Y.`
- A V$/GV$ public synonym is absent: `No such view in Oracle 19c (check the name): Z.`
- A quoted V$/GV$ identifier has non-uppercase spelling: `No such view in Oracle 19c (quoted names are case-sensitive; check the name): Z.` Quoted spelling is retained when reported.
- `SYS.V$`/`SYS.GV$` with a matching public synonym: `Use V$NAME without the SYS. prefix: SYS.V$NAME.` Without that synonym, it is included in `No such view in Oracle 19c (check the name): Z.`
- Non-V$/GV$ objects, whether alone or mixed with fixed views: `Not visible to this account (missing or not granted): W.`
- If the `ALL_SYNONYMS` lookup fails: `Not visible to this account: W.` (legacy fallback wording).

Unit tests cover mixed classifications, quoted case-sensitive names, `SYS.V$` and `SYS.V_$` forms, lookup failure, and the no-extra-lookup paths. The d1 live test unions a readable RMAN view, the nonexistent `V$RMAN_BACKUP_DATAFILES`, and a discovered real but ungranted public V$ view.

## Files changed

- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`
- `docs/wp-35a-missing-views.md`

## Verification

- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — 147 files passed; 2,954 tests passed and 2 failed. Both failures are in `tests/unit/preflight-catalog.test.ts`: its scanner reports `tools/index.ts (ask): DBA_SYNONYMS` for the literal `ALL_SYNONYMS` query. The view is already listed in that test's no-grant view set, but that branch also expects it in the ask feature catalog. Adding it there is outside this WP's owned paths.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts --testNamePattern='distinguishes nonexistent RMAN view|attributes the readable V\\$LOG' --no-file-parallelism` — passed: 2 live d1 tests; 19 other tests skipped by the name filter.
- `npx vitest run tests/unit/query-error-hints.test.ts --maxWorkers=2` — passed: 50 tests.
- `npm run typecheck` — passed.
- No LLM calls were made. No contract changes are needed.

## Limits

The d1 integration test discovers a candidate public fixed view at runtime and skips with a clear reason if the target has no probeable ungranted candidate. The two full-unit-suite catalog failures require a coordinator-owned catalog adjustment or approval to update the shared catalog test.
