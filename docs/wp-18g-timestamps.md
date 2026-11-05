# WP-18G: timestamps in tool text

`QueryResult.columnTypes?: string[]` carries each Oracle metadata `dbTypeName`.
The provider leaves fetched Date objects unchanged. Tool table cells (including
compact describe cells) use these types only when rendering text:

- `TIMESTAMP WITH TIME ZONE` and `TIMESTAMP WITH LOCAL TIME ZONE`: ISO UTC,
  milliseconds and `Z`.
- `DATE`: client-local getters recover stored wall clock, to whole seconds.
- `TIMESTAMP`: the same wall clock, with milliseconds.
- Missing/unknown types: wall clock to whole seconds.

JavaScript Dates have millisecond precision; this does not recover Oracle
sub-millisecond precision. No tool definitions, system prompt, audit behavior,
session configuration or other result consumers were changed.

## Verification

Live SELECT-only probe on d1-19c-lab as HARNESS_LAB, 2026-11-04 client local time:

| Expression | Live dbTypeName | Example tool text |
|---|---|---|
| SYSDATE | DATE | 2026-11-05 05:53:26 |
| LOCALTIMESTAMP | TIMESTAMP | 2026-11-04 23:53:26.094 |
| SYSTIMESTAMP | TIMESTAMP WITH TIME ZONE | 2026-11-05T05:53:26.094Z |
| CURRENT_TIMESTAMP | TIMESTAMP WITH TIME ZONE | 2026-11-05T05:53:26.094Z |
| CAST(SYSTIMESTAMP AS TIMESTAMP WITH LOCAL TIME ZONE) | TIMESTAMP WITH LOCAL TIME ZONE | 2026-11-05T05:53:26.094Z |
| V$DIAG_ALERT_EXT.ORIGINATING_TIMESTAMP | TIMESTAMP WITH TIME ZONE | 2026-09-11T17:34:58.290Z |

The live test also compares DATE/plain TIMESTAMP text against Oracle TO_CHAR
in the same SELECT and compares timezone-aware text against the retained Date's
`toISOString()`. Its connection wrapper suppresses the existing provider's
CURRENT_SCHEMA ALTER SESSION before execution. No ALTER SESSION is sent.

Unit fixtures run under UTC, America/New_York and Asia/Kolkata, using fixed
instants immediately before/after spring DST and in both autumn repeated hours.
They check NULLs, strings, unknown/absent metadata and retained Date values.
`tests/unit/chat-triage.test.ts` proves serialized tool definitions byte-identical
to `tests/unit/fixtures/chat-master.json`, and the system prompt identical too.

Commands/results (PIAGENT_SECRET_DIR set only for DB tests):

- `npm run typecheck`: clean.
- `npm test`: 75 files passed, 1,121 tests passed.
- `npx vitest run tests/integration/tool-timestamps.test.ts --silent=false`:
  1 passed, live metadata and actual run_query rendering.
- Existing dictionary tool integration tests and LONG view paging tests:
  6 passed on d1/p1. A temporary Vitest setup suppressed CURRENT_SCHEMA
  ALTER SESSION exactly as above; setup/config were removed afterwards.
  Filter: `dictionary permissions|hints at|full LONG` over
  `tool-dictionary-fallback.test.ts` and `oracle.test.ts`.
  The other three oracle tests were filtered out (schema-setting smoke and
  non-19c gate). No LLM tests or calls were run.

The coordinator owns the alternating eval gate; it was not run here.
