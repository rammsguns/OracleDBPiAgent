# MVP status — 2026-10-26

The MVP is built, reviewed and passing on this host (z4g5). An AI coordinator
(Claude) and AI agents did all of the work and verification; no human has signed off.

## How it was built

| Step | Who | Result |
|---|---|---|
| Plan, contracts, skeleton | Claude (coordinator), `needlefish` | `89a9144` |
| WP-A agent, LLM, CLI, audit | Codex, Orca worktree `wp-a-agent-cli` | `ac1434e`, `3065b81` |
| WP-B Oracle sessions, SQL policy, 12 tools | Codex, Orca worktree `wp-b-oracle-tools` | `540ef03`, `c1df41c` |
| WP-C evals, integration tests | Codex, Orca worktree `wp-c-evals` | `36eae4d` |
| Review | Antigravity (Gemini 3.8 Flash), Orca worktree `review-mvp` | REQUEST CHANGES, [report](review-mvp-2026-10-26.md) |
| Integration fixes and review fixes | Claude | `ee4c345`, `8e3c432`, `7f529b9`, and this commit |

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` | 106 passed (72 SQL-policy cases) |
| `npm run test:integration` | 7 passed. Covers both 19c targets, an INSERT stopped before the driver, the 26ai DB refused by the real 19c gate, and an end-to-end ask through Strata |
| `npm run eval` | **31/31 (100%)**, all refusals pass. Median 5.2 s per case, maximum 16.1 s, 190 s total, at most 2 tool calls per case |
| `piagent doctor` | Pass on both targets: Oracle 19.9.1.0.0, `CREATE SESSION` only |

## Review findings and resolutions

1. **High.** The version ground truth used `VERSION`. Fixed to use `VERSION_FULL`.
2. **High.** Refusals passed even when the agent had tried to run SQL. Refusal cases now fail on `run_query` or `explain_plan`.
3. **Medium.** Scalar counts matched incidental numbers. A stated "N rows" that contradicts the truth now fails.
4. **Medium.** The p1 diagnostic facts matched tool names. This hid a real bug: after an ORA-00942 on p1, the agent answered production questions with data from d1. Runs are now **pinned to the asked target**: `beforeToolCall` blocks other targets and the system prompt forbids substituting data. The p1 cases now expect the grant limitation and fail on substituted data.
5. **Low.** Each tool call was audited twice. A successful call is now audited once, by the tool.
6. **Low.** Context pruning counted bytes as tokens. It now estimates about 3 bytes per token.

Found during the eval runs:

- SHOPAPP counts change during an ask. Ground truth is now read both before and after, and any count in that range is accepted.
- `top_sql` failed on p1 because it lacks access to `V$SQLSTATS`. It now falls back to `V$SQL`, aggregated by `sql_id`.
- `doctor` rejected d1 because `SELECT_CATALOG_ROLE` carries read-only FLASHBACK and EXECUTE grants (on `DBMS_ASH` and Data Pump types). `doctor` now accepts these and names the failing check.

## Known limits (accepted for the MVP)

- **d1 data.** `HARNESS_LAB` can read only SH, not HR, OE or CO. The default schema is SH.
- **p1 grants.** `db_overview`, `list_schemas`, `wait_events` and `tablespace_usage` fail with ORA-00942 on p1. The agent reports this instead of guessing. Full coverage needs SELECT grants from a DBA, which this project must not make itself.
- **Plans.** `explain_plan` shows cached plans only (`DISPLAY_CURSOR`/`V$SQL_PLAN`), because `EXPLAIN PLAN` writes to `PLAN_TABLE`.
- **View source.** It is limited to a 4 KB preview.
- **Doctor failure modes.** `doctor` failing on an unloaded Strata is unit-tested only. A DB outage was not exercised.
- **Builders vs product.** The product uses only local Strata. The builder agents (Codex, Antigravity) are cloud services, as for OracleDBHarness.

## Next candidates

- Ask a DBA to grant `HARNESS_RO` SELECT on `V$INSTANCE`, `V$SYSTEM_EVENT`, `DBA_DATA_FILES`, `DBA_FREE_SPACE`, `DBA_USERS`, `DBA_SEGMENTS` and `V$SQLSTATS` (p1), and HR/OE/CO to `HARNESS_LAB` (d1).
- Add a `tablespace_usage` fallback through `DBA_TABLESPACE_USAGE_METRICS`, which is granted on p1.
- Remove the duplicated target allowlist. It is held in `config/targets.json`, `src/config/index.ts` and `src/oracle/index.ts` (`APPROVED_ENDPOINTS`).
