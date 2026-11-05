# WP-18H: agent sessions in UTC

Every accepted 19c connection now executes
`ALTER SESSION SET TIME_ZONE = '+00:00'` once during setup, immediately after
CURRENT_SCHEMA and before identity/tool queries. The UTC statement is unconditional.
The existing version gate still runs first and closes unsupported connections.
No tool SQL, policy, prompt, audit format, or contracts changed.

Bare TIMESTAMP literals compared to timezone-aware ADR/scheduler columns now use
UTC. CURRENT_TIMESTAMP and LOCALTIMESTAMP use UTC; SYSDATE and SYSTIMESTAMP
continue to use the server clock. This changes session state only.

## Consumer review

- Alertlog CLI explicit windows require a zone; relative windows become ISO UTC.
  Both alert and incident readers bind strings with explicit +00:00 and use
  TO_TIMESTAMP_TZ. Their fetched timezone-aware dates serialize with toISOString.
  The new integration test compares the fixed d1 incident window through the
  reader API, bare literals, and explicit UTC literals.
- Triage alert windows use that same reader. Job history windows and
  OUTSIDE_WINDOW use SYSTIMESTAMP minus NUMTODSINTERVAL. Scheduler timestamps
  are timezone-aware; ISO serialization and the +/-10 minute correlation windows
  preserve their instants.
- Report time filters use SYSDATE for server-wall-clock DATE fields. No filter
  depends on SESSIONTIMEZONE. Report Date serialization, history/diffs/trends,
  and web JSON/export handling receive the same driver Date objects as before.
- Web alertlog and triage delegate to the same readers; browser date display
  parses the serialized ISO instant. Browser coverage also checks exports.
- 18G tool rendering still uses local getters for DATE/plain TIMESTAMP and ISO
  UTC for timezone-aware types. Thin-mode DATE/TIMESTAMP fetches and Date binds
  retain client-local wall-clock behavior independently of the session zone.
  New live tests on both targets check fixed DATE/TIMESTAMP values, a Date bind
  round trip, and equal TZ/LTZ instants. The existing live metadata/rendering
  probe now uses normal session setup rather than intercepting CURRENT_SCHEMA.

No consumer relied on the previous -06:00 session zone, so no consumer code
changes were needed. Existing report DATE-to-ISO behavior remains unchanged;
18G's wall-clock formatting is specific to tool text.

## Verification

Unit coverage asserts one UTC setup per new session, before multiple queries and
their read-only transaction setup. Live coverage asserts SESSIONTIMEZONE and
CURRENT_TIMESTAMP's offset are +00:00 on both approved targets. On d1 the
2026-10-06 inclusive / 2026-11-04 exclusive incident window returns the same six
incident IDs with bare and explicit UTC literals.

Results (2026-11-05, Node 24.18.1, host zone America/Mexico_City):

- `npm run typecheck`: passed.
- `npm test`: 75 files, 1,122 tests passed.
- `PIAGENT_SECRET_DIR=… npm run test:integration -- --no-file-parallelism`:
  16 files, 44 tests passed, no skips (106.93s). Includes both approved targets
  and the single end-to-end Strata integration case; LLM calls ran sequentially.
- Targeted final UTC/rendering recheck: 2 files, 3 tests passed.
- `npm run test:browser`: 38 passed, 2 skipped (35.4s). The skips are opt-in live
  Oracle screenshot and Strata browser cases; ordinary browser tests use fixtures.
- `git diff --check`: passed.

The phase-18 A/B evaluation gate is coordinator work and was not run in this
worker session. No contract changes are requested.
