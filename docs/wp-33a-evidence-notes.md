# WP-33A tool evidence notes

## Built

- On a multi-object `run_query` ORA-00942, extracts strict FROM/JOIN/comma-list identifiers (including nested queries), probes at most six objects with `SELECT * FROM <object> WHERE 1=0`, and appends readable/not-visible evidence. Single-object failures and successful queries do not trigger these probes. Probe statements use the configured statement timeout and are audited by hash; the caller also supplies the short SQL text.
- The extractor excludes single, multiple, and nested CTE names; retains chained ANSI join sources after `ON`/`USING`; skips table-valued and lateral sources; and suppresses attribution when a source cannot be classified safely. If all probes succeed, the note says the missing object was not identified instead of presenting a readable list.
- On successful `V$DATAGUARD_STATS` results containing NULL `apply lag` or `apply finish time` values in a CDB PDB, adds the source note pointing to `health_check` / `piagent check dgLag`.
- The lag detector also recognizes `GV$DATAGUARD_STATS` and simple aliased `NAME`/`VALUE` projections. It skips expressions or projections that cannot be mapped confidently.
- Prompt/tool-description text added: 0 bytes.

## Files

- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`

## Tests

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: passed, 147 files / 2,942 tests.
- `npx vitest run tests/unit/query-error-hints.test.ts`: passed, 45 tests, including the final keyword guard case.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts`: passed, 18/18; includes live d1 attribution and c1s apply-lag note checks.

## Contract changes and limits

- No `src/contracts.ts` change is required; `AuditEvent.sqlText` already exists.
- `src/audit/index.ts` currently drops `sqlText` from persisted JSONL events. The probes pass short SQL text and a SHA-256 to `AuditSink.record`, but the JSONL sink persists only the hash. Persisting the requested short probe text requires the coordinator to add `sqlText` to the sink allowlist (the SQL is safe because it is generated only from strict identifier tokens). No bind values or credentials are included.
- The PDB decision uses the session's existing `identity.isCdb` and `identity.containerName`; no additional container query is issued.
- Live verification may be skipped if the configured target/listener is unavailable; see final test output below.
