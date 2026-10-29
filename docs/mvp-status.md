# Project status — 2026-10-29

The MVP and local web UI are merged. Token-saving work is finished for now.
The DBA-tool and plan-search experiments are closed without merging.
Results below are historical checks on this host (z4g5), not a fresh live run.
See [PLAN.md](../PLAN.md) for scope and [the index](README.md) for related docs.

## How it was built

| Step | Who | Result |
|---|---|---|
| Plan, contracts, skeleton | Claude (coordinator), `needlefish` | `89a9144` |
| WP-A agent, LLM, CLI, audit | Codex, Orca worktree `wp-a-agent-cli` | `ac1434e`, `3065b81` |
| WP-B Oracle sessions, SQL policy, 12 tools | Codex, Orca worktree `wp-b-oracle-tools` | `540ef03`, `c1df41c` |
| WP-C evals, integration tests | Codex, Orca worktree `wp-c-evals` | `36eae4d` |
| Review | Antigravity (Gemini 3.8 Flash), Orca worktree `review-mvp` | REQUEST CHANGES, [report](review-mvp-2026-10-26.md) |
| Integration fixes and review fixes | Claude | `ee4c345`, `8e3c432`, `7f529b9`, plus the initial status update |

## Initial MVP verification — 2026-10-26

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

## Round 2 (next candidates from round 1)

| Step | Who | Result |
|---|---|---|
| WP-D: p1 fallbacks and DBA grant request | Codex, Orca worktree `wp-d-p1-fallbacks` | `aa02261` |
| WP-E: single approved-target list, testable `doctor` | Codex, Orca worktree `wp-e-allowlist-doctor` | `3288f5d` |
| Eval cases for the p1 fallbacks | Claude | `c3ab0d0`, `c98166a` |
| Review | Antigravity, Orca worktree `review-round2` | **APPROVE**, no findings, [report](review-round2-2026-10-26.md) |

- On p1, `db_overview`, `list_schemas` and `tablespace_usage` fall back to granted views (`PRODUCT_COMPONENT_VERSION`/`SYS_CONTEXT`/`NLS_DATABASE_PARAMETERS`, `ALL_USERS`/`ALL_OBJECTS`, and `DBA_TABLESPACE_USAGE_METRICS` × `BLOCK_SIZE`). They fall back only on ORA-00942. Each result states its source, and unavailable fields are `NULL` with a note.
- `wait_events` still needs a grant on p1, and its error names `SYS.V_$SYSTEM_EVENT`.
- The approved targets are held once, in `src/config/approvedTargets.ts`. Both `loadConfig` and the session provider enforce them.
- `doctor` exits 1 with a named check and no connection details when Strata is unloaded, a target is unreachable, the 19c gate fails, or privileges are unexpected. These outages are simulated in unit tests.
- `docs/grants-request-2026-10-26.sql` contains read-only SELECT grants for a **human DBA** to review and run. It was applied on 2026-10-27 with the project owner's explicit authorization (see below).

Round 2 verification: typecheck passes, 133 unit tests, 7 integration tests, and `doctor` exits 0 on both targets.
The eval suite has 33 cases. The full run scored 32/33; the miss was a scorer regex for `prod-overview`, not the agent's answer. After the fix, `prod-overview` passed on rerun, so the suite stands at 33/33 across the two runs with the same agent code.

## Current limits

- **Access.** d1 can read SH, HR, OE and CO. PM and IX remain ungranted.
  p1 still lacks some views, including V$PARAMETER, RMAN views and
  V$SQL_PLAN_STATISTICS_ALL. The 2026-10-27 grants resolved the earlier
  wait-event and overview limits.
- **Plans.** `explain_plan` shows cached plans only, because `EXPLAIN PLAN` writes to `PLAN_TABLE`. It accepts a SQL ID or exact SQL text, not fragment search.
- **View source.** Full text is paged by line, at most 200 lines per call.
  Views over 1 MiB or with an unsupported character set are refused.
- **Builders vs product.** The product uses only local Strata. The builder agents (Codex, Antigravity) are cloud services.

## Round 3 — 2026-10-27

Built by Codex workers in Orca worktrees and reviewed by Antigravity
([review](review-round3-2026-10-27.md)).

- **WP-G (paged view source):** `get_source` for views now returns the full
  `ALL_VIEWS.TEXT` (LONG) paged by line, with `totalLines`, `hasMore` and
  `nextStartLine`, instead of the 4 KB preview. Views over 1 MiB are refused
  before the text is fetched. Integration tests read page 2 of
  `SYS.ALL_CUBE_DEPENDENCIES` on both targets.
- **WP-F (chat and budget evals):** eval cases can give `turns` (one agent, several
  prompts, scored on the final reply) and per-case `limits`. Six new cases: four
  multi-turn chat cases (follow-up counts on SH and SHOPAPP, switching target
  while pinned, a delete request) and two budget cases (`maxToolCalls` 1 and 2).
  `maxToolCalls` is scored on calls that ran, not on requests the budget hook
  blocked.
- **Coordinator scoring fixes:** each admitted tool call is counted once (the
  hook and the tool both audit `tool_call`). Row-count deltas, approximations and
  optimizer-statistics figures no longer count as contradicting row counts.
  The pin case allows quoting the configured target description as unverified,
  but fails any stated d1 count.
- **Review:** REQUEST CHANGES, reviewed at `4f17076`. Findings 1–3 were already
  fixed in `82d9d09`. Finding 4 (pin case missed "SALES is N" and "SALES: N")
  is fixed with unit tests. Finding 5 (the view byte check assumes AL32UTF8) is
  documented in `compatibility-19c.md`; both approved targets are AL32UTF8.

Results: typecheck passes, 149 unit tests and 9 integration tests pass, and the
full eval suite passes 39/39 (100%), with every refusal passing
(`evals/results/2026-10-27T08-12-44-730Z`).

## Optimization loop and promotion — 2026-10-27

- **WP-H/WP-I:** added a hard eval suite (27 cases, split into dev and holdout)
  and a harness-only optimizer (thinking level, output tokens, temperature,
  prompt appendix, tool notes). Strata was not reconfigured.
- **Loop:** ran 8 variants. The winner was refuse-first guidance plus concise
  guidance plus an FK-resolution note on `describe_object`.
- **WP-J:** promoted the winner to defaults. The coordinator added a generic
  `run_query` column-name note.
- **Final evals:** MVP 39/39, hard dev 36/36, hard holdout 18/18. Every refusal
  passes. Details are in `model-optimization.md`.
- **WP-K:** non-allowlisted SQL function calls are now rejected. The Antigravity
  review found no bypasses. Its four false-rejection findings are fixed
  position-by-position, covered by unit tests.
- **Tests:** typecheck passes, 239 unit tests pass, and 10 integration tests pass.

## DBA grants applied — 2026-10-27

The project owner authorized running `docs/grants-request-2026-10-26.sql`. Each
section ran as `/ as sysdba` inside its own container, after checking the
database name, the 19.9.1 version and the grantee. All 31 SELECT grants succeeded
(11 on p1, 20 on d1). No password was read.

- **`doctor`:** passes. Both accounts still hold only CREATE SESSION.
- **p1 tools:** `db_overview`, `list_schemas`, `tablespace_usage`, `top_sql` and
  `wait_events` now use the primary DBA_/V$ path. The integration test asserts
  this. The ORA-00942 fallbacks stay in the code and keep their unit tests.
- **Changed eval cases:** these cases assumed missing grants and now check live
  ground truth:
  - `prod-waits` and `hard-wait-limits`: the top non-idle wait.
  - `prod-overview`: the startup date.
  - `hr-access`: the HR.EMPLOYEES count.
  - `prod-schemas`: the SHOPAPP DBA_OBJECTS count, now 20 instead of the 12
    objects previously visible to the login.
- **Boundary case:** `hard-follow-lab-boundary` now tests PM, which is still not
  granted, instead of OE.
- **d1 description:** updated in `config/targets.json`.
- **Results:** 239 unit tests and 10 integration tests pass. The hard suite
  passes 36/36 on dev and 18/18 on holdout. The MVP suite passed 38/39; the one
  failure was `prod-schemas`, whose stale expected count was then fixed. The four
  changed MVP cases then passed 12/12 (×3). Every refusal passes.
- **Full MVP rerun:** after fixing `prod-schemas`, the MVP suite passed 39/39
  with every refusal passing (79.7k input / 12.9k output tokens, 40 tool calls).
- **Review:** Antigravity's follow-up review (`docs/review-post-jk-2026-10-27.md`)
  covered the column-name note, the SQL policy fix and these grant changes, and
  returned APPROVE. Its two low-severity SQL policy findings are fixed (246 unit
  tests).
- **Ungranted objects:** PM, IX and V$SQL_PLAN_STATISTICS_ALL on p1 stay
  ungranted, by design.

## Issue fixes — 2026-10-27

- **Clean holdout and ledger versioning:** see `model-optimization.md`. Each
  ledger row records a case hash, two edited holdout cases moved to dev, and six
  fresh holdout cases were added.
- **Token cost:** the compact guidance cut hard-dev input tokens by 8.6% with no
  pass-rate loss.
- **Hardening:** charset-aware view source checks, the `doctor` view-dependency
  check and the grant-aware p1 integration test; see `compatibility-19c.md`.
- **Worktrees:** the 16 merged Orca worktrees were removed. Their branches were
  fully merged, and the commits remain in history.
- **Tests:** typecheck passes, 249 unit tests and 10 integration tests pass, and
  `doctor` passes.

## Token-saving work — finished for now, 2026-10-28

- **WP-L:** compact `describe_object` results merged and promoted.
- **WP-M:** multi-table describe rejected and not merged.
- **WP-N:** cached-token accounting merged.
- **WP-O:** reasoning budget merged as opt-in; it showed no reliable saving
  and was not promoted.
- **WP-P/WP-R:** per-call errors and per-request usage diagnostics merged.
- **WP-Q:** `run_query` error hints merged after an alternating 4×4 dev A/B
  (−2.8% tokens).
- **WP-S:** shorter prompt and tool descriptions merged (−15% fixed prefix,
  −9.4% hard-dev tokens). Its dev A/B passed 79/80; the plan-follow-up miss
  and follow-up checks are recorded in [model optimization](model-optimization.md).

## Cached-plan search — WP-T closed, not merged

The first A/B passed, but none of the model's `explain_plan` calls used the new
`search` parameter. A second round added a steering sentence. Search was still
unused, and total tokens rose 2.7%. Both rounds are closed; the current tool
still matches exact SQL text or a SQL ID. See [the experiment history](model-optimization.md).

## Local web UI — WP-U/WP-V merged, 2026-10-28

WP-U added the loopback HTTP server, session lifecycle and `piagent web` command.
WP-V added the plain HTML/CSS/JavaScript page: streamed chat, target picker,
tool trace, audit tab, health checks and Stop button. Both received Antigravity
APPROVE before merging (`3136369`, `869c26a`). No dependencies were added.

The recorded gate passed typecheck, 336 unit tests and 20 filtered integration
tests. The coordinator's end-to-end API smoke test confirmed:

- Loopback-only binding, 401 without a token, and 403 for a bad Host or Origin.
- CSP headers and target output without DSNs or login names.
- One question per target answered through `db_overview`, with matching audit records.
- A DML request refused without a tool call.
- Clean SIGTERM shutdown and no token in the audit.

`npm run build` compiles TypeScript and copies `src/web/static/` into
`dist/web/static/`. The compiled CLI serves the page too. The manual-copy
instruction in the original [web UI notes](web-ui.md) predates this build fix.
These are recorded API smoke results; they do not establish a fresh visual
browser check. See also the [server report](wp-u-web-server-report.md).

## DBA tools — WP-W/WP-X/WP-Y closed, not merged, 2026-10-28/29

WP-W/WP-X added four read-only checks for statistics, indexes, parameters and
operations. Reviews approved them and all cases passed, including the ten new
DBA cases ×3. The larger prefix cost about 300 extra uncached tokens per session:
hard dev rose 1.3%, holdout 15.4% and MVP 14.5%.

WP-Y combined them into one `dba_check` tool. All cases passed, but holdout still
rose 6.3% and MVP 8.2% (hard dev +2.2%). After questions were changed to plain
DBA language, the model chose the tool in only 10/18 dev runs, and never in the
six parameter/backup runs. It used `run_query` successfully instead.

The owner closed the phase. A rarely chosen tool did not justify its per-session
prefix cost. The branches remain available, as recorded in [PLAN.md](../PLAN.md);
the product still has 12 tools. The referenced WP-Y report is not present in
this checkout.

## Next candidates

- The largest remaining token cost is cross-session prompt reuse in Strata.
  Each new conversation re-reads about 1.7k prefix tokens. Shared-prefix reuse
  needs a Strata change outside this project and requires the owner.
- Token saving is finished for now. The opt-in reasoning budget showed no
  reliable saving. WP-T and the DBA-tool phase are closed, not pending merges.
- Loading DBA tools only on demand is a possible future experiment, not an
  approved implementation. It would need dynamic tool lists or shared prompt reuse.

## Docs refresh — WP-Z

Only the project README, this status page and the documentation index changed.
Fresh checks passed: `npm run typecheck` and `npm test` (18 files, 336 tests).
Every local Markdown link resolves, and the index covers every file in `docs/`.
No live integration tests, evals or browser checks were rerun for this docs-only change.
