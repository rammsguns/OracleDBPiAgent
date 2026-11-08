# WP-33A tool evidence notes

## Built

- On a multi-object `run_query` ORA-00942, extracts strict FROM/JOIN/comma-list identifiers (including nested queries), probes at most six objects with `SELECT * FROM <object> WHERE 1=0`, and appends readable/not-visible evidence. Single-object failures and successful queries do not trigger these probes. Probe statements use the configured statement timeout and are audited by hash; the caller also supplies the short SQL text.
- On successful `V$DATAGUARD_STATS` results containing NULL `apply lag` or `apply finish time` values in a CDB PDB, adds the source note pointing to `health_check` / `piagent check dgLag`.
- Prompt/tool-description text added: 0 bytes.

## Files

- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`

## Tests

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: passed, 147 files / 2,931 tests.
- `npx vitest run tests/unit/query-error-hints.test.ts`: passed, 34 tests.
- Full integration suite with `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets` and `--testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: 43 files passed, 1 failed; 122 tests passed, 1 skipped. The only failure was unrelated `tests/integration/preflight-catalog.test.ts` on `c1-19c-pdb`, ORA-27090 (unable to reserve kernel resources for asynchronous disk I/O).
- Focused live checks for the added d1 `V$LOG`/`V$LOGMEMBER` attribution and c1s NULL apply-lag note: passed, 2/2 against the live targets.

## Contract changes and limits

- No `src/contracts.ts` change is required; `AuditEvent.sqlText` already exists.
- `src/audit/index.ts` currently drops `sqlText` from persisted JSONL events. The probes pass short SQL text and a SHA-256 to `AuditSink.record`, but the JSONL sink persists only the hash. Persisting the requested short probe text requires the coordinator to add `sqlText` to the sink allowlist (the SQL is safe because it is generated only from strict identifier tokens). No bind values or credentials are included.
- The PDB decision uses the session's existing `identity.isCdb` and `identity.containerName`; no additional container query is issued.
- Live verification may be skipped if the configured target/listener is unavailable; see final test output below.
