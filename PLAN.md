# OracleDBPiAgent — MVP plan

An Oracle Database harness built on the PI agent SDK (`@earendil-works/pi-agent-core`
1.4.0). A DBA or developer asks a question about an Oracle database. The agent answers
by calling typed, bounded, read-only database tools and gives evidence for every claim.
The project follows **OracleDBHarness** (`/home/kiwi/OracleDBHarness`) and reuses its
databases, secrets and local LLM. It does not reuse its code (Python/FastAPI); this
project is TypeScript because PI is.

## MVP scope and hard constraints

1. **Oracle Database 19c only.** Every new session runs a version gate
   (`product_component_version` / `v$instance`) and throws `UnsupportedVersionError`
   unless the major version is 19. There are no 26ai, ADB, TCPS or wallet code paths,
   and the gate is tested.
2. **Local LLM only: Strata on this machine.** The model is `qwen3.8-flash-next-iq3_s`
   at `http://127.0.0.1:8080/v1` (OpenAI-compatible), with the API key read from
   `~/llm-rig/strata/.config/strata/api-key`. `loadConfig` refuses any non-loopback
   base URL. No cloud provider packages are registered (only one PI provider,
   `strata`), and no network egress happens except to loopback and the local Oracle
   listeners. Strata operations: `~/OracleDBHarness/strata_utils.md` and
   `restart_strata.md`.
3. **Read-only.** The MVP never changes data or the database (see "Read-only policy").
4. **Local Docker databases only** (from `~/OracleDBHarness/databases/INVENTORY.md`):

| Target | Container | DSN | Account | Default schema | Notes |
|---|---|---|---|---|---|
| `d1-19c-lab` | `oracle19c` | `localhost:1522/ORCL` | `HARNESS_LAB` (role `HARNESS_DIAGNOSTICS_ROLE`, no ANY privs) | `SH` | 19.9.1 EE non-CDB; HARNESS_LAB can read only SH (918k SALES rows); HR/OE/CO exist but are not granted |
| `p1-19c-prod` | `oracle19c-prod` | `localhost:1523/PRODCDB` | `HARNESS_RO` (role `HARNESS_DIAGNOSTICS_ROLE`, no ANY privs) | `SHOPAPP` | 19.9.1 EE non-CDB; production-shaped stand-in with a SHOPAPP OLTP scheduler workload |

Passwords come from `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`
(`d1_lab.pw`, `p1_harness_ro.pw`, mode 600). Both logins and the 19.9.1 version were
verified on 2026-10-26. **Never** use SYS/SYSTEM, HARNESS_APP or SHOPAPP credentials
from this project. `oracle23ai_dataset` (:1521) is out of scope. The TierHive VPS and
ADB are out of scope.

Verified on 2026-10-26: a pi-agent-core `Agent` with a custom `openai-completions`
provider pointed at Strata made a tool call and answered correctly (see
"LLM wiring").

## Architecture

```
piagent CLI (ask | chat | doctor | targets)
   │
   ▼
createOracleAgent()  ── pi-agent-core Agent ── streamFn ──► Strata (127.0.0.1:8080/v1)
   │   beforeToolCall: budget (tool calls, wall time), audit, policy
   │   afterToolCall: truncate to maxToolResultBytes, audit
   ▼
DB tools (AgentTool[])  ──► SessionProvider ──► node-oracledb thin ──► 19c targets
                               │ 19c gate, CURRENT_SCHEMA, call timeout, read-only txn
                               ▼
                         JSONL audit (var/audit.jsonl)
```

Layout. `src/contracts.ts` is shared and owned by the coordinator.

| Path | Owner | Contents |
|---|---|---|
| `src/config/` | WP-A | `loadConfig(env): AppConfig`, loopback check, targets file validation |
| `src/llm/` | WP-A | Strata provider + model (`createProvider`, `openAICompletionsApi`), health check |
| `src/agent/` | WP-A | `createOracleAgent(ctx)`, system prompt, budgets, hooks |
| `src/audit/` | WP-A | `JsonlAuditSink` |
| `src/cli/` | WP-A | `commander` CLI: `ask`, `chat`, `doctor`, `targets` |
| `src/oracle/` | WP-B | pool/session provider, 19c gate, SQL classifier, `query()` |
| `src/tools/` | WP-B | `createDbTools(ctx)` and every DB tool |
| `tests/unit/` | each WP for its own code | vitest, no DB or LLM |
| `tests/integration/` | WP-C (WP-B adds DB-only tests) | real 19c containers and Strata |
| `evals/` | WP-C | question cases, runner, scoring |

### LLM wiring (verified)

```ts
const model = { id: cfg.llm.model, name: "Strata", api: "openai-completions", provider: "strata",
  baseUrl: cfg.llm.baseUrl, reasoning: true, input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: cfg.llm.contextWindow, maxTokens: cfg.llm.maxOutputTokens };
const models = createModels();
models.setProvider(createProvider({ id: "strata", name: "Strata", baseUrl: model.baseUrl,
  auth: { apiKey: { name: "Strata", resolve: async () => ({ auth: { apiKey } }) } },
  models: [model], api: openAICompletionsApi() }));   // from "@earendil-works/pi-ai/api/openai-completions.lazy"
new Agent({ initialState: { systemPrompt, model, tools, thinkingLevel }, streamFn: models.streamSimple.bind(models),
  identity: { attribution: null } });
```

Strata serves one request at a time on dual RTX A4000s, so speeds are tens of tokens
per second. Use `toolExecution: "sequential"`, keep prompts small, and never run LLM
calls in parallel (evals included).

### Read-only policy (WP-B, defense in depth)

1. **Account.** Targets use read-only accounts with no ANY privileges, and `doctor`
   reports their privileges.
2. **Classifier** (`src/oracle/sqlPolicy.ts`). It strips comments and string literals
   and allows exactly one statement. That statement must start with `SELECT` or
   `WITH` and not contain `FOR UPDATE`. It rejects `;` separating statements, DML, DDL,
   PL/SQL blocks, `CALL`, `LOCK`, `ALTER SESSION`, and database links (`@`) outside
   literals. It also rejects calls to an explicit denylist of side-effecting packages
   (`DBMS_`/`UTL_` writers such as UTL_HTTP, UTL_FILE, DBMS_SCHEDULER, DBMS_PIPE,
   DBMS_LOCK, DBMS_AQ, DBMS_XMLGEN with DML). Each rejection throws
   `StatementRejectedError` with a reason. It needs a large table-driven unit test.
3. **Session.** Each `query()` runs inside `SET TRANSACTION READ ONLY` and ends with a
   rollback. It sets `callTimeout = statementTimeoutSeconds`, fetches at most
   `maxRows + 1` rows, and turns LOBs into previews of 4 KB or less.
4. **Explain plan.** `EXPLAIN PLAN` writes to `PLAN_TABLE`, so the MVP does not use
   it. `explain_plan` shows cached plans only: `DBMS_XPLAN.DISPLAY_CURSOR` for a
   `sql_id`, falling back to `V$SQL_PLAN`. Both work on both targets (decided in WP-B;
   see `docs/compatibility-19c.md`). Plans for statements not yet executed are out of
   scope for the MVP.
5. **Licensing.** Do not query ASH/AWR (`V$ACTIVE_SESSION_HISTORY`, `DBA_HIST_*`).
   They need the Diagnostics Pack. MVP diagnostics use `V$SESSION`, `V$SQL`,
   `V$SQLSTATS`, `V$SYSTEM_EVENT`, `V$SESSION_WAIT`, `V$LOCK` and `DBA_*`/`ALL_*`
   views that `HARNESS_DIAGNOSTICS_ROLE` grants. WP-B checks the grants and records
   them in `docs/compatibility-19c.md`.

### MVP tools (WP-B)

Every tool takes an optional `target` (default `PIAGENT_DEFAULT_TARGET`) and returns a
compact text table with a `details` object. Every tool caps its output at
`maxToolResultBytes`, records audit events, and throws on error (the PI convention).

| Tool | Purpose |
|---|---|
| `list_targets` | Configured targets, environment and description (no DB call) |
| `db_overview` | Version, instance, host, startup time, character set, DB size, SGA/PGA summary |
| `list_schemas` | Non-Oracle-maintained users with object counts and sizes |
| `list_objects` | Objects in a schema, filtered by type or name pattern (paged) |
| `describe_object` | Columns, constraints, indexes, row count estimate and last-analyzed date for a table or view |
| `get_source` | PL/SQL/view source by line range (paged, at most 200 lines) |
| `run_query` | Ad-hoc read-only SQL through the policy, with a row cap |
| `explain_plan` | Plan for a read-only statement (see policy step 4) |
| `top_sql` | Top N statements from `V$SQLSTATS` by elapsed time, CPU, buffer gets or executions |
| `session_activity` | Active sessions, waits, blockers (`V$SESSION`, `V$LOCK`) |
| `wait_events` | Top system wait events (`V$SYSTEM_EVENT`, idle class excluded) |
| `tablespace_usage` | Tablespace size, used and free space, autoextend |

### Agent behavior (WP-A)

- **System prompt.** It states the role (Oracle 19c DBA/developer assistant) and the
  target list. It forbids guessing: every factual claim must cite a tool result. If
  the tools cannot answer, the agent says so. It never suggests running a statement
  that changes data unless asked, and labels any such statement as a suggestion only.
- **Budgets.** `maxToolCalls` and `maxWallSeconds` are checked in `beforeToolCall`.
  When a budget runs out, the hook blocks with `terminate: true`, and the agent gets
  one final no-tool answer turn.
- `transformContext` prunes old tool results so the context stays under about 60% of
  the context window.
- **CLI.**
  - `piagent doctor` checks: Strata `/health` loaded, base URL is loopback, each
    target connects, the 19c gate passes, privileges are read-only, `doctor` exits
    non-zero on failure.
  - `piagent targets`
  - `piagent ask "<q>" [--target t] [--json]` streams text to stdout. With `--json`
    it prints one JSON result with the answer, tool calls and usage.
  - `piagent chat [--target t]` is a REPL.

### Evals (WP-C)

- `evals/cases/*.json` holds at least 25 questions across both targets: schema
  discovery, data questions with known answers (for example, HR has 107 employees and
  OE has 105 orders), performance (top SQL on p1 under the SHOPAPP load), plan
  reading, and refusals (a request to delete rows, a request about the 26ai DB).
- Each case has `expect` checks: required facts (regex), required tool use,
  forbidden claims, and a must-refuse flag. Answers with known values are checked
  against fresh ground-truth SQL at run time, not hard-coded, where the data can
  change (p1).
- `npm run eval` runs the cases **sequentially** against Strata. It writes
  `evals/results/<timestamp>.json` (git-ignored) and a markdown summary, and prints
  a pass rate, per-case tool calls, tokens and wall time.
- The integration tests cover the 19c gate on both targets, the read-only policy
  against the real DB (an INSERT through `query()` must fail before reaching the DB),
  and one end-to-end `ask` through Strata.

## Work packages (Orca agents)

| WP | Branch / worktree | Agent | Depends on |
|---|---|---|---|
| WP-A | `wp-a-agent-cli` | codex | contracts only. It uses a stub `createDbTools` until WP-B merges. |
| WP-B | `wp-b-oracle-tools` | codex | contracts only |
| WP-C | `wp-c-evals` | codex | contracts. It builds the runner against `createOracleAgent`/`createDbTools` signatures and finishes after A and B merge. |
| Review | — | antigravity | Each WP branch before the coordinator merges it |

Post-MVP rounds (next candidates from `docs/mvp-status.md`):

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-D | `wp-d-p1-fallbacks` | codex | p1 fallbacks in `src/tools`, grant request script (merged) |
| WP-E | `wp-e-allowlist-doctor` | codex | single allowlist, testable `doctor` (merged) |
| WP-F | `wp-f-chat-budget-evals` | codex | `evals/`: multi-turn chat cases and budget exhaustion cases |
| WP-G | `wp-g-paged-view-source` | codex | `src/tools` `get_source`: full view text paged by line |

The coordinator (the Claude session in `needlefish`) merges each branch into
`needlefish`, then into `master`. It runs `npm run typecheck`, `npm test`,
`npm run test:integration` and `npm run eval`, and records results in
`docs/mvp-status.md`.

## Model optimization loop (post-MVP, 2026-10-27)

Goal: get the best answers from the current Strata model
(`qwen3.8-flash-next-iq3_s`) by tuning the harness only. The loop never restarts,
unloads or reconfigures Strata, and never swaps the model. The 39 MVP cases pass
39/39, so a harder suite comes first.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-H | `wp-h-hard-evals` | codex | `evals/cases-hard/`, its ground-truth checks, `docs/evals-hard.md` |
| WP-I | `wp-i-optimizer` | codex | tunables in `src/config`, `src/agent`, `src/llm`; `evals/run.ts` suite/split/repeat options; `evals/optimize.ts`; `evals/variants/` |

- **Hard suite (WP-H):** at least 24 cases in `evals/cases-hard/`, each with
  `split: "dev"` or `"holdout"` (about 2:1, every category in both). Categories:
  multi-step diagnosis on p1's live workload, analytical SQL on SH with
  `allCells` ground truth, cached-plan reading, schema relationships, disguised
  writes and injection refusals, and multi-turn follow-ups. Ground truth comes
  from read-only SQL, never from the model.
- **Tunables (WP-I):** env settings, all off by default so behavior is unchanged:
  `PIAGENT_LLM_THINKING` (exists), `PIAGENT_LLM_MAX_OUTPUT_TOKENS` (exists),
  `PIAGENT_LLM_TEMPERATURE` (only if Strata honors it), `PIAGENT_PROMPT_APPENDIX_FILE`
  (text appended after the fixed safety rules) and `PIAGENT_TOOL_NOTES_FILE` (JSON:
  extra text per tool description). Appendices cannot remove or override the
  read-only rules, which stay first and are enforced in code.
- **Runner (WP-I):** `npm run eval -- --suite <dir> --split dev|holdout --repeat N`.
  `npm run optimize -- --variant evals/variants/<name>.json --suite ... --split ...
  --repeat N` applies a variant's settings and appends one record to
  `var/optimize/ledger.jsonl`: variant name and hash, suite, split, repeats, pass
  rate, per-case pass counts, refusals pass, tokens in/out, tool calls and wall
  time. `npm run optimize:report` prints the leaderboard.
- **Loop (coordinator):** one variant per iteration on the hard dev split. A
  variant that fails any refusal is disqualified. Keep a variant only if it beats
  the current best on mean pass rate across repeats (cost breaks ties). Confirm
  each new best on the hard holdout and the 39 MVP cases, and reject it if either
  regresses. Stop after 3 iterations in a row with no improvement, then promote
  the winner's settings as defaults, behind an Antigravity review.
- LLM calls stay sequential: only one eval or optimize process runs at a time.

## Token saving (2026-10-27)

Eval `tokensIn` excludes Strata prompt-cache reads, so the fixed system prompt and
tool definitions already cost little. Editing earlier history breaks the cache
(drop-thinking was rejected; see `docs/model-optimization.md`). The remaining cost
is new tool-result text and output tokens.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-L | `wp-l-compact-describe` | codex | `describe_object` result shape in `src/tools/index.ts`, its tests, `docs/wp-l-compact-describe.md` |

- **WP-L (merged 2026-10-27, promoted):** fewer bytes per `describe_object` result with no lost facts. The
  coordinator A/Bs it on Strata (hard dev ×2, then holdout ×3 and MVP) and keeps
  it only if every case and refusal still passes and input tokens fall.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-M | `wp-m-multi-describe` | codex | `describe_object` accepting several tables per call in `src/tools/index.ts`, its tests, `docs/wp-m-multi-describe.md` |
| WP-N | `wp-n-cache-tokens` | codex | cached-token accounting in `evals/run.ts`, `evals/runtime.ts`, `evals/optimize.ts` (ledger/report), their tests |

- **WP-M (rejected 2026-10-27, not merged):** after WP-L, the costliest hard cases spend 3–5 sequential requests on
  `describe_object`, one table each. One call for up to 5 tables should cut
  requests and the thinking output that comes with each. Same A/B gate as WP-L.
- **WP-N (merged 2026-10-27):** record `usage.cacheRead` per case and per run (ledger field
  `tokensCached`, shown in `optimize:report`). Older rows show it as unknown.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-O | `wp-o-reasoning-budget` | codex | opt-in `PIAGENT_LLM_REASONING_BUDGET` tunable in `src/config/tunables.ts`, `src/llm/index.ts`, `evals/optimize.ts` (allowed keys), variants, tests |

- **WP-O (merged opt-in 2026-10-27, not promoted):** output (thinking) is now the larger cost. Strata accepts a per-request
  `reasoning_budget_tokens` (default 2,048) that closes the thinking phase. Add it
  as an opt-in tunable (unset = unchanged requests); the coordinator A/Bs budgets
  of 1,024 and 512 under the usual gate (all cases and refusals pass; tokens fall).

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-P | `wp-p-tool-error-diagnostics` | codex | per-call tool diagnostics in `evals/runtime.ts`, `evals/run.ts`, their tests, `docs/wp-p-tool-error-diagnostics.md` |

- **WP-P (diagnostics, merged 2026-10-27):** about 8% of tool calls fail (90 of 1,137 in the latest
  hard and MVP runs, nearly all `run_query`), and each failure costs a round trip
  with thinking. The audit log records only the error class. Eval records gain
  per-call detail taken from the agent's messages (tool, short args/SQL text,
  error flag, first line of error text, result bytes) and a summary of failures
  by error code. Eval-only: no change to the product or its prompts. The next
  WP targets the most common failure.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-Q | `wp-q-error-hints` | codex | `run_query` error hints in `src/tools/index.ts`, its tests, `docs/wp-q-error-hints.md` |

- **WP-Q (error hints; merged 2026-10-28 after an alternating 4×4 dev A/B, −2.8% tokens):** WP-P's first hard dev ×2 run (40/40, 120.0k in / 49.3k
  out) had 13 of 56 `run_query` calls fail: ORA-00904 ×3 (guessed `V$SQL`
  columns), ORA-01747 ×3 (`VALIDATE` for `VALIDATED`), ORA-00935 ×3 (nested
  aggregates), ORA-00942 ×4 (`DBA_*` not granted ×2; expected `PM` boundary ×2).
  The model retries blind, up to 5 times in a row. On ORA-00904/01747 against a
  dictionary or `V$` view, append that view's real column names (read-only lookup,
  bounded); on ORA-00942 for a `DBA_*` view, say whether the `ALL_*` view exists;
  on ORA-00935, say that aggregates can't nest at one level. Hints are short and
  added only to errors. Same A/B gate as WP-L, plus fewer `run_query` errors.

## MVP exit criteria

Status on 2026-10-26: [docs/mvp-status.md](docs/mvp-status.md).

- [x] `npm run typecheck` and `npm test` pass; integration tests pass against both 19c containers and Strata.
- [x] `piagent doctor` passes on this host; it fails clearly (exit 1, named check, no connection details) when Strata is unloaded or a DB is down (outages simulated in `tests/unit/doctor.test.ts`, not induced).
- [x] Against a non-19c DSN (`oracle23ai_dataset` at `localhost:1521/FREEPDB1` as `HARNESS_LAB` with `d2_lab.pw`, used only by the gate integration test and never as a target), the gate refuses.
- [x] The read-only policy unit suite has at least 60 cases; no write reaches either DB.
- [x] Eval pass rate is at least 80% on the cases, and every refusal case passes.
- [x] Every tool call is in `var/audit.jsonl`.
- [x] Nothing in the code or config can reach a non-loopback LLM endpoint.

## Out of scope for MVP

Writes, runbooks and DDL. Web UI. Multi-user auth. 26ai/ADB/TCPS. Remote LLMs.
ASH/AWR. Thick driver mode.
