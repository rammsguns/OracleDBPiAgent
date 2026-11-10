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
| `d1-19c-lab` | `oracle19c` | `localhost:1522/ORCL` | `HARNESS_LAB` (role `HARNESS_DIAGNOSTICS_ROLE`, no ANY privs) | `SH` | 19.9.1 EE non-CDB; HARNESS_LAB reads SH (918k SALES rows), plus HR/OE/CO since the 2026-10-27 grants |
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

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-R | `wp-r-request-usage` | codex | per-request usage diagnostics in `evals/runtime.ts`, `evals/run.ts`, their tests, `docs/wp-r-request-usage.md` |

- **WP-R (diagnostics, merged 2026-10-28):** in WP-Q's hard dev runs, uncached input is about 63k
  tokens per run, but tool results add only about 18k tokens' worth of text.
  pi-ai replays earlier thinking to Strata as `reasoning_content`; whether
  Strata's chat template keeps it is unknown. Eval records gain one row per
  LLM request (input, cached and output tokens, plus the characters of thinking,
  text, tool-call arguments and tool results added since the previous request),
  and the report gains totals. Eval-only. The coordinator then runs one hard
  dev eval and fits uncached input against those parts to find the next target.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-S | `wp-s-short-prefix` | codex | system prompt text in `src/agent/index.ts`, tool and parameter descriptions in `src/tools/index.ts`, their tests, `docs/wp-s-short-prefix.md` |

- **WP-S (shorter prefix; merged 2026-10-28, −15% prefix, −9.4% hard dev tokens):** WP-R showed that the first request of each session
  carries 62% of uncached input, because Strata never reuses a shared prompt start
  across conversations. Shorten the system prompt (1,970 chars) and the tool
  definitions (3,823 chars of JSON) by at least 25%, with every safety rule kept
  in meaning, plus the target list and the tool facts the model needs. Code-side
  enforcement is unchanged. Gate: Antigravity checks that no rule was lost; then
  an alternating 4×4 hard dev A/B, and holdout ×3 and MVP against same-day
  baselines. Every case and refusal must pass, and tokens must fall.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-T | `wp-t-plan-search` | codex | `explain_plan` cursor search in `src/tools/index.ts`, its tests, `docs/wp-t-plan-search.md` |

- **WP-T (plan search; not merged 2026-10-28: the model never used `search` in the A/B):** the four cached-plan hard cases use about a third of
  hard dev tokens. Most of it goes on run_query searches of `V$SQL` to find a
  sql_id (`hard-follow-plan`: 8.3 requests and 5.3 run_query calls per run). One
  WP-S failure came from the model matching its own diagnostic query.
  `explain_plan` only matches exact SQL text today. Add an optional text search:
  case-insensitive fragments, optional parsing schema, and skip cursors from the
  agent's own login. It returns the matching cursors and the plan of the best
  one in a single call. Same gate as WP-S.
- **WP-T round 2 (2026-10-28, user request; closed: `search` still unused, +2.7% tokens):** add one plain-English instruction
  that steers the model to `explain_plan` `search` for finding a cached plan by
  its text, instead of querying `V$SQL`. Same gate as before, and `search` must
  actually be used in the WP-T runs.

## Read-only web UI (phase approved 2026-10-28)

Goal: a local browser front end for the same agent, with the same rules. It is
read-only, Strata-only and 19c-only, and audits every tool call. It adds no new
dependencies: the server uses `node:http`, and the page is plain HTML, CSS and
JavaScript served by the server. Nothing listens on a non-loopback address.

| WP | Branch / worktree | Agent | Owns |
|---|---|---|---|
| WP-U | `wp-u-web-server` | codex | `src/web/server.ts`, `src/web/sessions.ts`, the `piagent web` command in `src/cli/index.ts`, their tests, `docs/web-ui.md` (server part) |
| WP-V | `wp-v-web-page` | codex | `src/web/static/` (index.html, app.js, app.css), pure render helpers and their unit tests, `docs/web-ui.md` (page part) |
| Review | — | antigravity | each branch, with a security focus (below) |

API contract (fixed by the coordinator, so WP-U and WP-V can run in parallel):

- `piagent web [--port N]` binds 127.0.0.1 only (default port 8765) and prints
  `http://127.0.0.1:N/#token=<random>`. Every `/api` request needs that token in
  an `Authorization: Bearer` header, and the `Host` header must be
  `127.0.0.1:N` or `localhost:N`. The `Origin` header, when present, must match.
  This protects against other local users, CSRF and DNS rebinding.
- `GET /api/targets` → `[{ name, environment, description }]` from config. It
  never includes DSNs, users or secrets.
- `POST /api/sessions` `{ target? }` → `{ sessionId }`. A session is one agent
  conversation; an optional target pins it, as `--target` does. There are at
  most 4 sessions, closed after 30 minutes idle.
- `POST /api/sessions/:id/ask` `{ question }` → a Server-Sent Events stream:
  `text` (delta), `tool_start` (name, args cut to 300 chars), `tool_end` (name,
  isError, first line of error, result bytes), `done` (answer, usage), and
  `error` (generic message; never driver or provider text). A process-wide lock
  keeps LLM calls one at a time; a busy server answers 409.
- `DELETE /api/sessions/:id` closes the session and its DB connections.
- `GET /api/sessions/:id/audit` → that session's audit records from
  `var/audit.jsonl`, matched by runId: kind, tool, target, SQL hash, rows,
  elapsed time. No SQL text beyond what the audit already stores, and never bind
  values.
- `GET /api/health` → Strata `/health` status and DB reachability, as reported
  by `piagent doctor` (named checks, no connection details).
- The page is chat on the left and the tool-call trace on the right, with a
  target picker, an audit tab and a stop button. It renders all model and
  database text with `textContent` (never `innerHTML`), and the server sends a
  strict CSP: `default-src 'self'`, no inline script.

Gate: `npm run typecheck`, `npm test`, filtered `npm run test:integration`, and
an Antigravity review of each branch covering the loopback bind, token, Host and
Origin checks, XSS, error and secret leakage, the LLM lock and session cleanup.
Then the coordinator runs one end-to-end smoke test: start `piagent web`, ask one
question per target and one refusal through the API, and check the audit
records. Merge and push only if all of this passes.

Status 2026-10-28: WP-U (3136369) and WP-V (869c26a) merged after Antigravity
APPROVE on both. 336 unit tests and 20 filtered integration tests pass. The
end-to-end smoke test passed: loopback-only bind; 401 without the token; 403 for
a bad Host or Origin; CSP set; targets with no DSN or user; one question per
target answered via db_overview with matching audit records; DML refused with no
tool call; clean SIGTERM shutdown; token not in the audit. `npm run build` now
copies `src/web/static/` into `dist/web/static/`, so the compiled `piagent web`
serves the page too.

## More read-only DBA tools (phase approved 2026-10-28; closed, not merged)

Goal: add four read-only tools for common DBA questions that the current 12 tools
answer only through free-form `run_query`. Blocking sessions and locks
(`session_activity`) and top SQL (`top_sql`) already exist. The new tools must
not make the agent worse or more expensive on the existing evals.

Access probe on 2026-10-28 (SELECT ... WHERE 1=0 as the product accounts):
- d1: V$PARAMETER, DBA_TAB_STATISTICS, DBA/ALL_INDEXES, V$SESSION_LONGOPS,
  V$LOG, V$ARCHIVED_LOG, V$RMAN_BACKUP_JOB_DETAILS, *_SCHEDULER_JOBS and
  *_JOB_RUN_DETAILS all readable. ALL_TAB_STATISTICS errored with no ORA code
  (likely the call timeout), so use DBA_TAB_STATISTICS on d1.
- p1: only ALL_TAB_STATISTICS, ALL_TAB_MODIFICATIONS, ALL_INDEXES,
  ALL_IND_COLUMNS, V$SESSION_LONGOPS and the scheduler views. All V$ parameter,
  log and backup views and DBA_ views return ORA-00942.

| WP | Branch / worktree | Agent | Tools |
|---|---|---|---|
| WP-W | `wp-w-schema-health` | codex | `optimizer_stats` (owner and optional table: num_rows, last_analyzed, stale_stats, DML since last analyze where readable; DBA_ first, ALL_ fallback on ORA-00942 or timeout) and `index_health` (owner and table: index name, uniqueness, status including UNUSABLE partitions, visibility, columns in order, blevel, clustering factor vs table blocks, last_analyzed) |
| WP-X | `wp-x-instance-ops` | codex | `db_parameters` (name pattern or non-default only; V$PARAMETER; on p1 fail naming the grant, like `wait_events`) and `ops_status` (topic: `long_ops` / `jobs` / `backups`; running long operations with % done; scheduler jobs with state, failures and last run status; last RMAN jobs and archive log rate, d1 only, naming the missing grant on p1) |
| Review | — | antigravity | each branch |

Rules for both WPs:
- Each WP puts its SQL and definitions in its own module (`src/tools/schemaHealth.ts`,
  `src/tools/instanceOps.ts`) and adds one import line to `src/tools/index.ts`,
  so the merge is simple.
- Fixed SQL only, bounded rows, bind variables for every input, owner and table
  names validated like `describe_object`. Every call goes through the existing
  SQL policy and audit. No ASH/AWR, DBMS_STATS or package calls.
- Tool descriptions are at most 110 characters, with minimal schemas. The
  coordinator raises the `short-prefix` test cap by the measured growth (budget:
  700 characters for all four tools).
- Each WP adds `evals/cases-hard/<wp>.json` with at least 3 dev and 2 holdout
  cases that the existing tools answer poorly or expensively, with ground truth
  checked against the live targets using read-only queries.

Gate:
- typecheck, `npm test`, filtered integration tests, and an Antigravity review.
- On the merged branch: the new cases pass ×3. The existing hard dev 4×4 A/B,
  holdout ×3 and MVP all pass (every refusal passes), and hard dev tokens rise
  by no more than 3% against a same-day baseline.
- Merge and push only if all of this passes.

Result 2026-10-28/29: not merged, by the owner's decision. Each step was compared
with same-day master (4d78e88) baselines:
- WP-W + WP-X (four tools, both reviews APPROVE): every case passed, including
  the 10 new DBA cases ×3. Hard dev tokens +1.3%, but holdout +15.4% and MVP
  +14.5%: the larger prompt costs every new session about 300 uncached tokens
  (first request 1,688 → 1,991).
- WP-Y folded them into one `dba_check` tool (review APPROVE). The prefix fell
  from 5,968 to 5,436 characters. Holdout +6.3%, MVP +8.2%, hard dev +2.2%, all
  passing.
- The DBA case questions named the old tools, so they were reworded in plain
  DBA language (post-result edit, recorded in docs/wp-y-dba-check.md on that branch). After
  that, the model chose `dba_check` in only 10/18 dev runs, and 0/6 for
  parameters and backups. It wrote V$PARAMETER/RMAN SQL with `run_query` and
  still got the facts right. As with WP-T, a tool the model does not choose
  unprompted is not worth a per-session cost.
- The work is kept on branches `rammsguns/wp-w-schema-health`,
  `rammsguns/wp-x-instance-ops`, `rammsguns/wp-y-dba-check` and
  `dba-tools-merged`. If revisited, consider loading DBA tools only on demand,
  which needs prompt reuse across sessions or dynamic tool lists.

## Docs refresh (2026-10-29; merged)

WP-Z (`wp-z-docs-refresh`, codex) owns README.md, docs/mvp-status.md and a new
docs/README.md index. It changes no code. Review: antigravity checks the docs
against the code and PLAN.md. Merge and push on APPROVE.

## Eval reliability (2026-10-29; merged)

Goal: make A/B gates cheaper and more trustworthy. Two problems:
- Ground-truth misses: the master baseline failed `hard-sh-fks` ("fresh ground
  truth: PROMOTIONS") and `hard-quarter-winners` ("3313394.74") once each in
  holdout ×3. Decide whether each is a real agent miss or a brittle check.
- Noise: the same code varies about ±5% in tokens between hard dev runs, so each
  gate needs 4×4 alternating runs (about 1 hour).

WP-AA (`wp-aa-eval-reliability`, codex) owns `evals/` (scoring, runner,
ground truth) and docs/evals-hard.md. It does not change `src/` or product
prompts, and holdout questions and splits stay fixed. It may change only the
scoring of a check proven brittle, with the evidence in the docs.
1. Diagnose both misses from archived results
   (`~/orca/workspaces/OracleDBPiAgent/eval-archive/`) and live read-only
   ground-truth queries.
2. Measure noise from the archived A/B runs: per-case token variance and which
   cases dominate it. Propose and implement a cheaper comparison, for example a
   per-case paired comparison with a bootstrap interval in a `compare` script,
   or an optional fixed eval temperature/seed if Strata honours it.
   Verify with at most 4 sequential eval runs.
Review: antigravity. Merge and push on APPROVE, if the unit tests pass.

Result: both baseline misses were real agent errors, not scorer bugs (it
invented `PROMO` for `PROMOTIONS`, and transposed 3,313,394.74 to
3,331,394.74). Token CV between runs of the same code is about 4.4%; five cases
give 86% of the variance. Pairing by case narrows the interval only about 6%,
and there is no evidence for a fixed temperature or seed, so gates keep the 4×4
alternating method. `evals/compare.ts` reports paired per-case differences with
a bootstrap 95% interval. Evidence is in docs/evals-hard.md.

## Web UI browser tests (2026-10-29; merged)

The owner approved `@playwright/test` as a dev-only dependency on 2026-10-29.

WP-AB (`wp-ab-browser-tests`, codex) owns `tests/browser/`, a
`playwright.config.ts`, and, as a coordinator-approved exception for this WP
only, the `@playwright/test` devDependency, a `test:browser` script in
package.json, and the lockfile. Product code changes only if a test finds a real
bug, and each one is reported.
- The tests start the real server from `src/web/server.ts` on 127.0.0.1 with an
  injected fake agent (`agentFactory`), so they need no DB or LLM. They drive the
  page in headless Chromium: token taken from the hash and removed from the URL;
  target picker; streamed answer; tool trace rows; stop; 409 busy; session
  expiry; audit tab; health. Hostile model text (`<img onerror>`, `<script>`)
  must render as text, with no CSP violations in the console. The layout must
  work at phone width.
- One optional live smoke test (`PIAGENT_BROWSER_LIVE=1`) asks one d1 question
  through the real agent. It is skipped by default and never runs in parallel.
- `npm test` and `npm run test:integration` stay unchanged and must not pick up
  the browser tests.
Review: antigravity. Merge and push on APPROVE, if `npm run test:browser` passes.

Result: merged after Antigravity APPROVE. `npm run test:browser` covers 9
fake-agent tests (Playwright 1.64.1, Chromium) plus the opt-in live test, which
passed once against d1. The tests found and fixed one real bug: the target
picker overflowed at phone width (`select { min-width: 0; max-width: 100%; }`).

## Phase 2 (approved 2026-10-29)

Theme: **trustworthy answers and DBA reports, without making every session more
expensive.** Phase 1 left three lessons:
1. The remaining agent errors are invented facts: a table name (`PROMO` for
   `PROMOTIONS`) and transposed digits (3,313,394.74 → 3,331,394.74).
2. Every tool schema costs every session about 75–150 uncached tokens, and the
   model rarely picks a new tool unprompted (WP-T, DBA tools).
3. Cross-session prompt reuse would be the biggest saving, but it is a Strata
   change, outside this project.

So phase 2 adds no new LLM tools. It checks answers after they are written, and
it runs fixed DBA checks without the LLM.

All hard rules stay: 19c only, read-only, Strata only, one LLM call at a time,
secrets only from `PIAGENT_SECRET_DIR`. Each WP follows the usual flow: an Orca
codex worker, then an Antigravity review (told to use grep/jq on large JSON),
then the coordinator gate, then merge and push.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-2A Answer grounding check | `wp-2a-grounding` | `src/agent/grounding.ts`, hook in `src/agent/index.ts`, eval capture of tool result text, tests | — |
| WP-2B Read-only DBA report | `wp-2b-report` | `src/report/`, `piagent report` in `src/cli/index.ts`, tests, docs/report.md | — |
| WP-2C Web UI: report tab and export | `wp-2c-web-report` | `src/web/` routes and page, browser tests | WP-2A, WP-2B |

### WP-2A: answer grounding check
- After the final answer, a deterministic, LLM-free check extracts the "hard
  facts" from the answer: quoted or upper-case Oracle identifiers
  (OWNER.TABLE, columns, SQL_IDs) and numbers with 4 or more significant digits.
  It checks each one against the text of this run's tool results. It accepts
  case changes, thousands separators, rounding to the precision shown, and
  bytes↔KB/MB/GB.
- On unsupported facts it allows **one** correction turn: "These values do not
  appear in tool results: …; fix or remove them." That turn uses the existing
  evidence and no new tools unless needed. Facts still unsupported after it are
  listed as "unverified" in the CLI (`--json` field) and the audit (a count
  only, never the values).
- Step 1, offline: add the tool result text (capped) to eval records. Then
  measure the false-positive rate on one hard dev and one holdout run before the
  correction turn is switched on. Target: flags on at most 5% of correct
  answers.
- Gate: hard dev 4×4 A/B, holdout ×3 and MVP all pass. Fact failures do not
  increase. Tokens rise by at most 3% on hard dev and at most 5% on MVP. The
  correction turn fires on fewer than 10% of answers. `evals/compare.ts`
  reports the paired intervals.
- **Result (2026-10-29): gate failed, not merged.** Branch kept at
  `rammsguns/wp-2a-grounding` (fcae196). The checker was tuned on dev to flag
  1/20 correct answers, but on the frozen holdout it flagged 6/13 (46%). With
  the correction turn on, live hard dev fell from 20/20 to 16/20 and the turn
  fired on 9/20 (45%, limit 10%). Two refusal cases (`hard-function`,
  `hard-dbms`) refused correctly, then lost their refusal wording after being
  told to retract identifiers they had named but not queried. The full A/B gate
  was not run. A lexical checker over-fits dev; any retry needs an exemption for
  refusals and a held-out flag rate at or under 5% before it is switched on.
- **Fix and result (2026-10-29): merged.** Redesign (7bdbf3b): the correction
  turn fires only for unsupported numbers (4+ significant digits). Refusals and
  runs with no successful tool call are skipped. Unsupported identifiers are only
  listed as `unverified`. The correction text says to keep the rest of the
  answer, including any refusal. Offline, corrections would fire on 0/20 dev and
  0/13 holdout correct answers. On a fresh MVP capture the rate is 1/39. The
  Antigravity review approved it. Gate against 4dec631:
  - Hard dev 4×4: 80/80 pass (baseline 80/80), and the correction fired on 5/80
    answers (6%).
  - Holdout ×3: 39/39 (baseline 38/39). MVP: 39/39.
  - Tokens on hard dev: +4.0%, 95% interval −2% to +10%. MVP: −0.3%.
  - The correction turns themselves add +1.2%. The remaining +2.8% is in cases
    where no correction fired, and those cases run the same code with the same
    prompt and tools, so it is run-to-run noise. The user approved the merge on
    the +1.2% attributable cost.
  - `piagent report --summarize` still has no grounding check (left for later).

### WP-2B: read-only DBA report
- `piagent report --target <t> [--json|--md] [--sections ...]` runs fixed,
  bounded, read-only SQL with **no LLM**: identity and version; tablespace
  usage; top waits; top SQL; stale or locked optimizer stats; unusable or
  invisible indexes; non-default parameters; failed scheduler jobs; long
  operations; and RMAN backups and archive rate.
- It reuses the SQL, ORA-00942 fallbacks and grant-naming errors from the closed
  branches `rammsguns/wp-w-schema-health` and `rammsguns/wp-x-instance-ops`,
  and the existing tools' SQL. It goes through the same session provider, SQL
  policy and audit. A section that needs a missing grant (p1 parameters,
  backups) reports "not available: needs SELECT on SYS.V_$…" and the report
  still completes.
- An optional `--summarize` sends one LLM call with the report as input and
  asks for a short prioritised summary. It cites section names only, and the
  grounding check from WP-2A applies to it when that WP is merged.
- Gate: unit tests with fake sessions; an integration run against both targets
  (every section either returns data or a named grant error, under a time
  budget); Antigravity review of the SQL and read-only safety; and the DBA
  facts checked against independent read-only queries. No change to the agent
  prompt, so no token A/B is needed.
- **Result (2026-10-29): merged.** 14 sections; d1 returns all 14, p1 returns 11
  plus three named grant errors. The Antigravity review passed SQL safety,
  secret scrubbing and the row and time caps. It asked for one change: the
  summary prompt suggested `audit_trail` changes and a restart, so it now allows
  only read-only diagnostic next steps (3626174). Live `--summarize` passed on
  d1 (24 s) and on p1 after the fix. After the merge: typecheck, 419 unit
  tests, 22 integration tests (1 skipped) and 9 browser tests all pass. The
  summary has no grounding check because WP-2A did not merge.

### WP-2C: web UI report tab and export
- A "Report" tab runs WP-2B for the selected target (`GET /api/report?target=`),
  with the same token, Host/Origin checks and the LLM lock for `--summarize`.
  It renders with `textContent` only.
- Export downloads the conversation and trace as Markdown. Shown text only: no
  token, DSN, user or bind values.
- Unverified facts from WP-2A are flagged in the chat.
- Gate: unit tests, browser tests (Playwright, fake agent), including the XSS
  and phone-width cases for the new tab, an Antigravity security review, and
  one live smoke test.
- **Result (2026-10-29): merged.** The Antigravity security review approved all 7
  checks. Web chat traces now leave out SQL, binds and connection fields. Live
  smoke on the merged code:
  - `/api/report` returned 401 without the token, 403 for a bad origin and 400
    for a bad target or section.
  - d1 returned 14 of 14 sections; p1 returned 11, with 3 named grant notes.
  - `summarize=1` on d1 took 42 s and gave read-only advice.
  - A chat answer carried `unverified: []`, and the token did not appear in the
    audit log.
  - After the merge: typecheck, 525 unit tests, 22 integration tests (1
    skipped) and 11 browser tests pass.
  **Phase 2 is complete.**

### Not in phase 2
Writes and runbooks that change anything, ASH/AWR, non-19c targets, cloud
LLMs, multi-user auth and new LLM tools. Cross-session prompt reuse is recorded
as a request to the Strata owner, with no work in this repo.

## Phase 3: wrap-up (approved 2026-10-29)

Small, low-risk follow-ups from phase 2. The flow is the usual one: Orca
worker, Antigravity review, coordinator gate, merge and push. WP-3B starts after
WP-3A merges, so the docs describe the final behavior.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-3A Grounding for report summaries | `wp-3a-summary-grounding` | `src/report/summarize.ts`, the report summary output in `src/cli/index.ts` and `src/web/` (route field and page note), tests, `docs/report.md` | — |
| WP-3B Docs refresh for phase 2 | `wp-3b-docs` | `README.md`, `docs/` | WP-3A |

### WP-3A: grounding for report summaries
- Run the WP-2A checker (`checkFacts` from `src/agent/grounding.ts`, imported
  as-is) on the `--summarize` text. The evidence is the rendered report
  Markdown that was sent to the model.
- No correction turn: the summary stays one LLM call. Unsupported numbers
  (4 or more significant digits) are listed after the summary as "Unverified".
  The CLI prints them, `/api/report` returns `unverified: string[]` next to
  `summary`, and the Report tab shows a note (textContent only).
- Gate: unit tests with fake summaries (supported, unsupported, rounded and
  byte-converted values), browser test for the note, Antigravity review, and a
  live `--summarize` on both targets. Report how many numbers were flagged. No
  agent prompt change, so no token A/B is needed.
- **Result (2026-10-29): merged.** The first live run flagged only correct
  values: 5 on d1 and 1 on p1. These were ORA-01653/01654 error codes and
  microsecond values correctly shown in seconds. The checker's `_MICRO`
  header rule only reads the first line of each evidence text, and the report
  is one long document. The fix (6acf171) is in `summarize.ts` only: each
  table becomes its own evidence text, `ELAPSED_TIME` and `CPU_TIME` are
  tagged as microseconds, and ORA codes are ignored. A wrong value (1,206 s)
  is still flagged. Re-run on both targets: 0 flags. Both Antigravity reviews
  approved. `grounding.ts` is unchanged.

### WP-3B: docs refresh for phase 2
- Update `README.md`, the `docs/README.md` index and `docs/mvp-status.md` for
  phase 2: `piagent report`, the grounding check, the web Report tab and
  export, and the `PIAGENT_GROUNDING_CHECK` switch.
- Remove stale notes, such as the "Live summary: not verified" line in
  `docs/report.md` (it has since been verified live).
- Gate: Antigravity review against the code, checking that every command and
  option named in the docs exists.
- **Result (2026-10-29): merged.** 7 docs files were updated (8c54d86) and stale
  "not verified" and "pending" notes removed. The Antigravity review checked
  commands, options, routes, environment variables, links and numbers against
  the code and this plan, and approved. **Phase 3 is complete.**

### Housekeeping
Remove the merged phase 2 worktrees and archive their eval results in
`eval-archive/phase2/`. Done. The broken `file:///` links in three older
review docs were also made repo-relative (f252bf7).

## Phase 4: scheduled report diffs (approved 2026-10-29)

Goal: let a DBA run `piagent report` on a schedule and see what changed since
the last run. Read-only, no LLM, no token cost. The user runs it from their own
cron; this repo adds no scheduler or daemon.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-4A Saved reports and diff | `wp-4a-report-diff` | `src/report/history.ts`, `src/report/diff.ts`, the `report` options in `src/cli/index.ts`, tests, `docs/report.md` | — |
| WP-4B Web: last change view | `wp-4b-web-diff` | `src/web/` (route and Report tab), browser tests, `docs/web-ui.md` | WP-4A |

### WP-4A: saved reports and diff
- `piagent report --target <t> --out <dir>` also writes
  `<dir>/<target>/<UTC timestamp>.json` and `.md`. The default directory is
  `var/reports`, which git ignores. Files are written atomically (temp file,
  then rename) with mode 0600. Target names are validated before use in a
  path, and the newest 30 runs per target are kept.
- `--diff` compares this run with the newest saved run for the same target
  and prints a "Changes since <timestamp>" section. `--json` adds a `diff`
  object. Deterministic rules, with thresholds in one place:
  - new failed scheduler runs;
  - tablespace used % up 5 or more points, or crossing 85%;
  - new SQL_IDs in top SQL;
  - tables newly stale or locked;
  - indexes newly unusable or invisible;
  - the newest backup no longer recent;
  - sections that changed between ok and unavailable.
- `piagent report --target <t> --diff-only` prints only the changes, for cron
  mail. The exit code is 0 for no changes and 3 for changes, so cron can
  react.
- No secrets, binds or DSNs in saved files: they hold the same data as the
  `--json` output.
- Gate:
  - Unit tests: the diff rules on fixture reports, retention, atomic writes,
    path validation and exit codes.
  - An integration run on both targets: two runs back to back give an empty or
    near-empty diff.
  - Antigravity review, and a live check.
- **Result (2026-10-29): merged** (83c47c2). The Antigravity review approved:
  path safety, symlinks, file modes, atomic writes, the diff rules, and exit
  codes. Live check on both targets:
  - A plain report is unchanged, and back-to-back `--diff-only` runs print
    "No changes." with exit code 0.
  - Target `../etc` is rejected (exit 1).
  - Files are 0600 and directories 0700, and `--json --diff` adds `diff`.
  - No secrets in saved files. The only match for "password" was the
    parameter name `remote_login_passwordfile`.
  Exit code 3 for changes is covered by unit tests, but nothing changed
  between live runs. A backup counts as recent if it completed within 24
  hours. Documented limits: concurrent writers, and runs with a different
  `--owner`. The worker ran the existing LLM end-to-end test once by mistake;
  it was a single call, with Strata otherwise idle.

### WP-4B: web last change view
- The Report tab shows "Changes since last saved run" for the selected target,
  using the WP-4A diff. The web UI reads saved reports; saving from the web
  happens only with an explicit "Save this run" button. Same token and
  Host/Origin checks as the other routes, and textContent rendering only.
- Gate: unit tests for the route, browser tests (diff rendering, an XSS
  payload in a changed value, phone width), Antigravity security review and a
  live smoke test.
- **Result (2026-10-29): merged** (e0dc8b1 and 57040a3). The Antigravity
  security review approved it with no findings. Live smoke through the real
  server on both targets:
  - Reading before any save wrote 0 files.
  - `POST /api/report/save` returned 401 without the token, 403 for a bad
    origin and 400 for a bad target.
  - Save and then read gave a diff against the saved run with 0 changes.
  - The saved files were 0600, and the token did not appear in the audit log.
  One fix came from the smoke test. The read path said "baseline established"
  even though nothing was saved; it now says "No saved run yet." The CLI
  wording is unchanged. **Phase 4 is complete.**

### Not in phase 4
A scheduler or daemon in this repo, notifications (email or Slack), LLM
summaries of diffs, and history charts.

## Phase 5: eval suite expansion (approved 2026-10-29)

Goal: a larger, harder eval suite that tightens the token gate and guards the
phase 2 grounding check against regressions. No product change.

The hard suite has 33 cases today: 20 dev and 13 holdout. The 4×4 dev token
interval is about ±6%, so a real cost change of 3% cannot be told apart from
noise. Add **16 cases (8 dev, 8 holdout)** across the categories that caused
real errors:

| Category | Dev | Holdout | What it tests |
|---|---:|---:|---|
| Numeric precision | 2 | 2 | Large SH sums and counts with 7 or more significant digits, where transposed digits fail (the 3,313,394.74 miss) |
| Unit conversion | 2 | 2 | Wait and SQL times in µs shown in seconds; segment and tablespace sizes in bytes shown in MB or GB |
| Name fidelity | 1 | 1 | Near-miss names (PROMOTIONS vs PROMO) and objects that do not exist, where the answer must say "not found" rather than invent |
| Refusal follow-ups | 2 | 2 | A normal first turn, then a request to change data or run DDL: the agent must refuse and keep the refusal wording |
| Grant-limited p1 | 1 | 1 | Questions p1 cannot answer for lack of a grant: the answer must name the gap and invent nothing |

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-5A New hard cases | `wp-5a-eval-cases` | new files under `evals/cases-hard/`, `evals/validate-hard.ts`, `docs/evals-hard.md` | — |

### WP-5A: new hard cases
- Same EvalCase contract and scorer, no scorer changes. Every factual case has
  read-only ground-truth SQL that `evals/validate-hard.ts` checks on its
  target. Questions must not name tools or give away the answer.
- Holdout cases are written before any agent run, and are never tuned on agent
  answers. Their wording may change only if a review finds the question
  ambiguous or the ground truth wrong.
- Gate:
  1. `validate-hard.ts` passes on both targets: ground truth only, no LLM.
  2. An Antigravity review of ground truth, ambiguity and answer leaks.
  3. Coordinator baseline on current main: new dev cases ×3 and new holdout
     cases ×3. Every case must pass at least once in 3 runs, so it is
     solvable. A case that never passes is fixed (for a real ambiguity) or
     dropped, and recorded.
  4. Record per-case pass rates and the new dev token CV, and re-estimate the
     4×4 interval width with `evals/compare.ts`.
- After merge, every future gate uses the expanded suite. Baselines are re-run
  each time, as now.

- **Result (2026-10-29): merged** (96cedf2 and bdfd07f). The hard suite now has
  49 cases: 28 dev and 21 holdout. Ground truth validates on both targets.
  - The Antigravity review requested changes. 6 `forbiddenClaims` regexes would
    have failed correct negations, such as "no change was committed" and "does
    not reference PROMO". They now skip negations, with unit tests.
  - Solvability baseline ×3 on the current code: 15 of 16 cases passed at least
    once at first. `hard-units-sales-mb` failed 3 of 3: the value was right
    (exactly 128 MB), but the agent wrote "128 MB", not "128.00 MB". It was
    replaced by `hard-units-sales-gb` (0.125000 GB), which passed 2 of 3.
    Known weakness: that is the same 128 MB, with the same expected value as
    holdout `hard-units-costs-gb`.
  - The agent drops trailing zeros. `hard-units-costs-gb` passed 2 of 3, and
    its miss wrote "0.125".
  - Expanded dev ×4: 27/28, then 28/28 ×3. Tokens averaged 109,393 per run,
    with a CV of 5.0% and an approximate 4×4 half-width of ±6.9%. Old 20-case
    dev on the same code: CV 4.0%, ±5.5%.
  - **The goal of a tighter token interval was not met.** With 4 runs each,
    the CV estimates are too noisy to separate the two suites. The spread comes
    from single cases that vary widely: `hard-precision-revenue-1998` ranged
    from 2,027 to 4,207 tokens. A narrower interval needs more runs per side,
    or a per-case paired analysis, not more cases.

### Not in phase 5
Scorer changes, new tools, prompt tuning to pass the new cases, and LLM-judged
scoring.

## Phase 6: sharper token gate and number formatting (approved 2026-10-29)

These are the two follow-ups from phase 5. WP-6B starts after WP-6A merges, so
its A/B uses the new analysis.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-6A Per-case token analysis | `wp-6a-per-case-compare` | `evals/compare.ts`, its tests, `docs/evals-hard.md` (gate method section) | — |
| WP-6B Keep requested decimals | `wp-6b-decimals` | the system prompt in `src/agent/index.ts`, tests, `docs/model-optimization.md` | WP-6A |

### WP-6A: per-case token analysis
- Problem: the gate compares per-run totals, so a few heavy, variable cases
  dominate the noise. `hard-precision-revenue-1998` ranged from 2,027 to 4,207
  tokens.
- Add a per-case mode to `evals/compare.ts`. For each case present in both
  sides, take the ratio of mean tokens (B over A). Combine the ratios as a
  geometric mean, so every case weighs the same. Give a 95% interval by
  bootstrapping over cases and over runs within cases. Keep the existing
  per-run mode as is.
- Report how many runs per side would bring the interval to ±3%, from the
  observed variance.
- No LLM needed. Validate on archived results:
  - A/A, by splitting same-code runs from `eval-archive/phase5/` and the
    phase 2 gate files. The interval must contain 0.
  - The WP-2A gate (baseline 4dec631 against the merged candidate). Compare the
    width with the per-run method's 4.0% [−2%, +10%].
- Gate: unit tests on synthetic data with a known ratio; the A/A and WP-2A
  results recorded; Antigravity review of the statistics.
- **Result (2026-10-29): merged** (6496c09 and af2fa2d). Use
  `evals/compare.ts --per-case [--seed N]`.
  - Both A/A splits contain 0: −1.80% [−10.60%, +7.22%] and −0.07% [−7.42%,
    +7.84%].
  - The WP-2A gate gives +1.13% [−6.67%, +10.45%]. The per-run method gave
    +4.0% [−2%, +10%].
  - The per-case interval is wider, not narrower. Its value is the per-case
    breakdown, which shows which cases drive a change.
  - The Antigravity review requested one fix. The runs-per-side estimate
    counted pilot noise as spread between cases, so it found no answer on any
    comparison. It now subtracts that noise (method of moments).
  - With the fix, the A/A splits need 12 and 14 runs per side for ±3%. The
    other comparisons have no runs-only answer. So the 4×4 gate cannot resolve
    a 3% token change, and token results stay advisory.

### WP-6B: keep requested decimals
- Problem: the agent drops trailing zeros when a question asks for a fixed
  number of decimals ("128 MB" for "128.00 MB", "0.125" for "0.125000").
- Fix: one short sentence in the system prompt: when a question asks for N
  decimal places, show exactly N, including trailing zeros. It must fit under
  the short-prefix cap in `tests/unit/short-prefix.test.ts`. No tool or scorer
  changes.
- Gate (the usual one, plus the new analysis):
  - Hard dev 4×4 A/B, holdout ×3 and MVP all pass.
  - Fact failures do not increase.
  - Tokens rise by at most 3% on hard dev and 5% on MVP. Report both the
    per-run and the WP-6A per-case intervals.
  - The format-sensitive cases (`hard-units-*`, `hard-precision-*`) fail no
    more often than on the baseline.
- **Result (2026-10-29): merged** (a6acbd8). Added "Keep exactly N requested
  decimals, including trailing zeros." Existing wording was shortened to fit
  the prefix cap; the Antigravity review found no weakened rule and approved.
  Gate results, baseline c84a745 (archived in `eval-archive/phase6/`):
  - Hard dev 4×4: 112/112 against 107/112.
  - Format cases: 0 failures against 4 (`hard-units-customers-mb` 3,
    `hard-units-sales-gb` 1). The baseline's fifth miss was
    `hard-top-buffer-plan`, which is not a format case.
  - Tokens: hard dev −1.8% per run [−6.4%, +4.7%] and −2.4% per case
    [−9.2%, +5.0%]. Holdout −6.0% per case [−11.5%, −1.7%]. MVP +0.3% per case
    [−1.0%, +1.8%], 39/39 on both sides.
  - Holdout 62/63 on both sides. The candidate's one miss,
    `hard-fresh-grant-request`, was a correct refusal with no tool calls. It
    said "once the privilege has been granted", which matched the forbidden
    pattern `(?:has been|was|successfully|now) granted`. The case passed all
    46 earlier runs. The owner chose to merge and fix the pattern in a
    follow-up.
- **Follow-up (2026-10-29): merged** (8f31ae7). The grant pattern now skips a
  match right after once/after/when/if/until or a nearby negation. All three
  gate answers for the case now pass.
  - A first attempt added a clause-wide guard to nine patterns. The Antigravity
    review rejected it: it let invented claims through, and none of the other
    eight patterns had ever false-failed. Those eight are unchanged.

### Not in phase 6
Scorer changes, accepting values without trailing zeros in the scorer, and new
tools.

## Phase 7: release readiness (approved 2026-10-29)

The repo is public, but nothing checks pushes. This phase adds CI, checks the
setup steps on a clean clone, writes a changelog and tags v1.0.0. There are no
product behaviour changes, so there is no eval A/B gate.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-7A CI and clean-clone check | `wp-7a-ci` | `.github/workflows/ci.yml`; fixes to unit tests that only pass on this machine; `docs/ci.md` | — |
| WP-7B Changelog and quick start | `wp-7b-release-docs` | `CHANGELOG.md`, `README.md`, `docs/mvp-status.md`, `docs/README.md` (index) | WP-7A |
| Coordinator | `needlefish` | `package.json` (version 1.0.0, `"license": "MIT"`), secret scan, tag | WP-7B |

### WP-7A: CI and clean-clone check
- Add a GitHub Actions workflow on push and pull request to `main`. It uses
  Node 24 and `npm ci`, then runs `npm run typecheck`, `npm test` and
  `npm run build`. No database, no LLM, no secrets, and no integration,
  browser or eval runs.
  - Pin actions to full commit SHAs and give the workflow
    `permissions: contents: read`.
- Prove it locally first:
  - Clone the repo into a temporary folder.
  - Run the same steps with a scrubbed environment (`env -i`, no `.env`, no
    `PIAGENT_*` variables).
  - Any unit test that reads this machine's paths, secrets, `var/` or
    `eval-archive/` is a bug. Fix the test, not the product.
- Gate:
  - The clean-clone run passes.
  - The Antigravity review checks the workflow for secret exposure, write
    permissions and unpinned actions.
  - After the coordinator pushes, the first GitHub run is green
    (`gh run list`).
- **Result (2026-10-29): merged** (3f5fbd9 and 6c9fa00). `actions/checkout`
  v7.0.1 and `actions/setup-node` v7.1.0 are pinned to SHAs that match their
  tags. The workflow has `contents: read` and `persist-credentials: false`.
  - The scrubbed clean clone passed 594 tests and the build; no test fixes
    were needed.
  - The Antigravity review approved.
  - The first GitHub run (40968486748) passed.
  - The coordinator's history secret scan (by count only) found no secret
    files, keys, token patterns, Strata key or secret-directory values.

### WP-7B: changelog and quick start
- `CHANGELOG.md`, in Keep a Changelog format: one 1.0.0 entry that summarizes
  the MVP and phases 1–6 from this file. Keep it short; link docs rather than
  repeat them.
- `README.md`: a quick start that a new reader can follow:
  - prerequisites (Node 24, Oracle 19c targets, an OpenAI-compatible local
    LLM endpoint);
  - `npm ci`;
  - `.env` from `.env.example`;
  - the secret files;
  - the first commands (`piagent report --target d1-19c-lab`, `piagent ask`,
    the web UI).
  - State the safety model up front: read-only, 19c only, local LLM only.
- Verify every command in the quick start on a clean clone. A read-only
  report against d1 and at most one `piagent ask` against Strata are allowed,
  one call at a time.
- Refresh `docs/mvp-status.md` and the docs index. Every local link must
  resolve.
- Gate: the Antigravity review of accuracy and of setup steps that leak paths
  or secrets; typecheck and tests pass.
- **Result (2026-10-29): merged** (38eb743, 5c50f05, 651da0c). The Antigravity
  review approved.
  - On a clean clone, the build, a d1 report (14 sections), one Strata
    question and the web UI all worked. All 89 local links resolve.
  - The old README loaded `.env` through `NODE_OPTIONS`, which Node rejects.
    The quick start now uses `node --env-file=.env dist/cli/index.js`.

### Coordinator release steps
1. Set `package.json` version to 1.0.0 and `"license": "MIT"` to match
   `LICENSE`.
2. Scan the full git history for secrets (password files, API keys, `.env`
   contents, private keys) with grep over `git log -p`. Stop and report if
   anything is found.
3. Merge and push.
4. Confirm CI is green, then tag `v1.0.0` and push the tag. Make a GitHub
   release only if the owner asks.
- **Result (2026-10-29): released.** Version 1.0.0 and the MIT license field
  were set in 8fd2554. CI run 40969636474 passed, and the `v1.0.0` tag was
  pushed. Phase 7 is complete. No GitHub release was made.

### Not in phase 7
New features, eval changes, dependency upgrades, publishing to npm, and
running integration or LLM tests in CI.

## Phase 8: fresh holdout set (approved 2026-10-29)

Every gate since phase 2 has used the same 21 holdout cases. Changes may now be
tuned to them, so a holdout pass means less than it should. This phase writes
a new holdout and keeps the old one as a regression set.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-8A New holdout cases | `wp-8a-fresh-holdout` | `evals/cases-hard/` (new `phase8-*.json` files and the `split` field of old holdout cases), `evals/types.ts`, `evals/run.ts` (split option only), `evals/validate-hard.ts`, their tests, `docs/evals-hard.md` | — |

### WP-8A: new holdout cases
- Write 12 new holdout cases: one per hard category (11), plus a second
  analytical case. Each case must use different tables, columns or facts from
  every existing case. Add no near-copies of current questions.
- Keep the current case shapes and rules: ground truth from plain SELECT,
  `allCells` for analytical cases, pinned facts checked by `validate-hard.ts`,
  negation-aware `forbiddenClaims`, and only views that p1 can read.
- Move the 21 old holdout cases to a new split, `regression`. Update:
  - the types;
  - `evals/run.ts --split`;
  - the validator. Every category needs dev and holdout. The 55–72% dev
    ratio counts dev and holdout only.
- No agent or LLM runs while writing cases, so they are written blind. Ground
  truth is checked only with `validate-hard.ts`.
- Coordinator baseline on main (eb04e45): new holdout ×3. Every failure is
  sorted into agent error or scorer bug. Only scorer bugs are fixed, with
  tests. Cases are never loosened to make the agent pass.
- Gate:
  - Validation passes, typecheck and tests pass.
  - The Antigravity review checks independence from existing cases, ground
    truth, patterns, and the failure triage.
  - Baseline results are recorded.
- Gates from then on run: hard dev 4×4, new holdout ×3, regression ×1, and MVP.
- **Result (2026-10-29): merged** (84decd8). The suite now has 28 dev, 12
  holdout (`hard-p8-*`) and 21 regression cases. Validation checked 40
  ground-truth queries for 61 cases. 600 unit tests pass.
  - Baseline on eb04e45: new holdout ×3 passed 36/36, refusals included
    (archived in `eval-archive/phase8/`).
  - The Antigravity review approved. It found no overlap with existing
    cases, and all 24 realistic wrong answers it wrote fail the scorer. The
    clean baseline reflects the agent, not loose patterns.
  - The new holdout is no harder than the old one. Its value is that no
    change has been tuned against it.

### Not in phase 8
Changes to dev cases, the scorer or the product.

## Phase 9: global CLI install (requested 2026-10-29)

The owner asked for a CLI install like the PI agent's (`npm install -g`, then
run the command anywhere). Today `piagent` only works from a clone:

- `dist/` is not in git.
- `config/targets.json` and `var/` are resolved from the current directory.
- Settings load only through `node --env-file=.env`.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-9A Global install | `wp-9a-global-install` | `src/cli/`, `src/config/` (default paths and env loading only), `package.json` (`prepare` script and `files` field only, granted by the coordinator), tests, `README.md` install section, `docs/install.md` | — |

### WP-9A: global install
- Install paths, with no npm publish:
  - `npm install -g github:rammsguns/OracleDBPiAgent`;
  - `npm install -g .` from a clone.
  - A `prepare` script builds `dist/`. The `files` field ships `dist/`, the
    default `config/targets.json`, `.env.example`, `LICENSE` and `README.md`.
- A per-user home, `~/.piagent/` (override with `PIAGENT_HOME`), created
  0700:
  - `piagent init` creates it and writes `.env` (0600) from `.env.example`
    with placeholders. It never overwrites, and never writes or asks for
    passwords or keys.
  - On start, the CLI loads `PIAGENT_ENV_FILE` or `~/.piagent/.env` if
    present. Variables already set win. It never auto-loads `.env` from the
    current directory.
  - It refuses an env file that group or others can read. Values are never
    printed.
- Defaults when the variables are unset:
  - the targets file comes from the installed package's `config/targets.json`
    (resolved from the module, not the current directory);
  - the audit file and reports go under `~/.piagent/`.
  - Explicit variables still win, and the clone workflow
    (`node --env-file=.env dist/cli/index.js`) keeps working.
- `piagent --version` prints the package version.
- No change to the safety model: same approved targets, loopback Strata only,
  read-only tools.
- Verify with a temporary prefix and HOME only (never the real global
  install):
  - `npm pack`, then `npm install -g --prefix <tmp>` from the tarball and from
    a local git clone;
  - then `piagent --version`, `piagent init`, `piagent targets`, and one
    read-only `piagent report --target d1-19c-lab` run from an unrelated
    directory.
- Gate: unit tests for env loading, permissions, precedence and path
  defaults; typecheck, unit and integration tests; the Antigravity security
  review; CI green.

- **Result (2026-10-30): merged** (6308293, f488ae7, 02864a8).
  - Supported installs: from a clone (`npm ci`, then `npm install -g .`) and
    from a packed tarball. A direct `npm install -g github:…` fails under
    npm 9 and 11: npm builds git packages under `-g` without
    devDependencies. This is documented as unsupported; the owner chose no
    nested-install workaround.
  - The Antigravity security review requested four fixes, all applied:
    - an existing `PIAGENT_HOME` is never re-permissioned; a symlinked,
      foreign-owned or non-private home is refused;
    - an explicit `PIAGENT_ENV_FILE` that is missing is an error;
    - the home is created only by `init` or on the first default audit or
      report write;
    - `PIAGENT_REPORT_DIRECTORY` is listed in `.env.example`.
  - Gate: typecheck, build, 615 unit tests, integration 24 passed and 1
    skipped. The coordinator's temp-prefix tarball check matched: package
    contents are clean, `--version` creates nothing, `init` gives 0700 and
    0600, and `targets` works from an unrelated directory.
  - Behaviour change: with the variables unset, audit and report history now
    default to `~/.piagent/`. Set `PIAGENT_AUDIT_FILE` and
    `PIAGENT_REPORT_DIRECTORY` to keep using `var/` in a clone.

### Not in phase 9
Publishing to npm, installer scripts piped from curl, and Windows support.

## Phase 10: second Strata for evals (approved 2026-10-30)

The owner has a second Strata on the LAN running the same model
(`qwen3.8-flash-next-iq3_s`) with a 32k context and a k8v4 KV cache. The local
server has 131k and q8_0/q8_0. It can make gates faster and give more runs per
side, as WP-6A showed is needed for ±3% token precision. AGENTS.md rule 2 now
has an eval-only exception for it, reached through an SSH tunnel at
`127.0.0.1:18080`.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-10A Eval secondary endpoint | `wp-10a-eval-secondary` | `evals/run.ts` and eval helpers; a narrow, eval-only path in `src/llm/` and `src/config/`; tests; `docs/evals-two-servers.md` | — |
| Coordinator | `needlefish` | same-code check across servers; the balanced gate script | WP-10A plus the owner's tunnel and key file |

### WP-10A: eval secondary endpoint
- `evals/run.ts --endpoint primary|secondary` (default `primary`, unchanged).
  `secondary` reads:
  - `PIAGENT_EVAL_SECONDARY_BASE_URL`, which must be exactly
    `http://127.0.0.1:18080/v1`;
  - `PIAGENT_EVAL_SECONDARY_API_KEY_FILE`;
  - `PIAGENT_EVAL_SECONDARY_CONTEXT_WINDOW`, default 32768.
- The product path stays strict: CLI, web and report still accept only
  127.0.0.1:8080 and never read `PIAGENT_EVAL_*`. Tests prove it.
- Before running, check the endpoint's `/health`: `loaded: true` and the same
  model name as the primary. Stop if either fails.
- One call at a time per endpoint, across processes: a per-endpoint lock
  file. A second `run.ts` on the same endpoint refuses to start.
- Results record the endpoint label and its health snapshot (no key).
  `compare.ts` accepts mixed-endpoint files and warns if the two sides do not
  use the endpoints equally.
- The key is never printed or logged, and the audit log never stores it.
- Gate: unit tests (no tunnel needed), typecheck, the Antigravity security
  review.
- **Result (2026-10-30): merged** (a2b86f4). The Antigravity security review
  approved:
  - product isolation;
  - per-request URL checks for 127.0.0.1:18080 only;
  - a 0600 key file, never logged;
  - a cross-process lock per endpoint.

  Typecheck and build pass, 626 unit tests pass, and integration has 24
  passed and 1 skipped. The secondary server was not contacted; its live
  check waits on the owner's tunnel.

### Coordinator: same-code check and balanced gates
- Owner setup: SSH key access to the LAN host, the tunnel
  `127.0.0.1:18080 → 127.0.0.1:8080` on the LAN host, and a 0600 key file.
- Same-code check: one hard dev ×2 run on each server, with the same code.
  Compare pass rates and per-case tokens. Server differences are expected;
  record their size.
- Balanced gate: each server runs both baseline and candidate for half the
  repeats, interleaved, so any server difference cancels.
  - Each stream is sequential.
  - Wall time is the main measure.
  - Report results by server as well as pooled.

Result (2026-10-30), with both servers running at once and the same code.
Results are archived in `eval-archive/phase10/`.
- Primary: 56/56 passed, every refusal passed, 980 s wall time.
- Secondary: 52/56 passed, 5,676 s wall time.
  - Three of its failures were not model failures. The LAN host rebooted
    partway through the run, which killed the tunnel. Those calls got
    "connection refused", so no key went anywhere.
  - Its one real failure was `hard-follow-plan`.
- Speed: on the 53 records both servers completed, the secondary was 5.67×
  slower (5,334 s against 940 s).
- Tokens, per case: −3.4%, 95% interval [−14%, +8%]. That is consistent with
  no difference, but the interval is wide.

Decision: the balanced gate is not adopted.
- A 50/50 split would take about 2.8× as long as running on the primary
  alone.
- Even an ideal split by speed (about 85/15) saves at most about 15%.
- The secondary's different context window and KV cache add a risk of
  server bias.

The `--endpoint secondary` option stays as an opt-in tool for long side
jobs. Gates stay on the primary. Phase 10 is closed.

Port note: an OracleDBHarness uvicorn process has `--port 18080` in its
command line but was not listening. If it ever binds that port, the tunnel
cannot start (`ExitOnForwardFailure`). The runner's health check, which
requires `loaded` and a matching model, would then refuse the endpoint.

### Not in phase 10
Product use of the second server, failover, load balancing, and
reconfiguring either server.

## Phase 11: harder evals, then quality fixes (approved 2026-11-03)

The owner asked for an agent quality pass. The data says the suite is
saturated: phase 8 holdout ×3 passed 36/36, and phase 10 hard dev ×2 passed
56/56 on the primary. The only recent real failure was `hard-follow-plan`
(1 in 4, on the secondary). run_query errors are 6 to 7 per run. About half
are expected ORA-00942s in grant cases. The rest are ORA-00904s from guessed
column names (`T.CAL_YEAR`, `v$sql_plan.PLAN_ID`), recovered on the next call.
With a 100% pass rate the suite cannot show whether a change helps, so the
owner chose to make it harder first. Quality fixes come after, driven by real
failures.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-11A Challenge cases | `wp-11a-challenge-evals` | new `evals/cases-hard/phase11-*.json`; `evals/types.ts` (split value only); `evals/run.ts` (split option only); `evals/validate-hard.ts`; `evals/scoring.ts` (only new, opt-in check kinds); their tests; `docs/evals-hard.md` | — |
| WP-11C Fair row scoring and harder round | `wp-11c-row-scoring` | see WP-11C below | WP-11A baseline |
| WP-11B Quality fixes | decided after the 11C baseline | decided after the 11C baseline | WP-11C baseline |

### WP-11A: challenge cases
- Add a new split, `challenge`, with about 12 cases. Gates keep their current
  splits; `challenge` is reported separately and does not change dev,
  holdout or regression.
- Target difficulty: the current agent should pass roughly 40 to 80% of the
  challenge runs. Every case must be answerable from views that its target can
  read, with read-only ground truth checked by `validate-hard.ts`.
- Categories, 2 to 3 cases each:
  - **Multi-step diagnosis:** the answer needs 3 or more dependent lookups,
    each built on the last (for example: top SQL by a measure, then its plan,
    then the indexes or columns that the plan touches).
  - **Column traps:** natural wording that differs from the real column or
    view name (calendar year, plan line, full SQL text), so a guess fails and
    the agent must look up the structure.
  - **False premises:** the question assumes an object, value or state that
    is not true; the answer must correct the premise and invent nothing.
  - **Ambiguity:** the same name exists in more than one schema, or the
    question can be read two ways. The answer must name the readings or state
    which one it used, checked by required facts for each reading.
  - **Multi-turn dependency:** a later turn refers to a value found in an
    earlier turn ("that table", "the second one").
  - **Wide exact answers:** `allCells` over 8 or more rows, where one wrong
    or missing row fails.
- Same rules as phases 5 and 8: questions do not name tools or give away the
  answer; ground truth is plain SELECT; `forbiddenClaims` skip negations; no
  near-copies of existing cases.
- Cases are written blind (no agent or LLM runs). Scorer changes are allowed
  only as new, opt-in check kinds with unit tests. Existing case behaviour
  must not change, which tests prove.
- Coordinator baseline on main: challenge ×3. Triage every failure into
  agent error or scorer/case bug. Only scorer and case bugs are fixed. A case
  is never loosened to make the agent pass. A case that fails 3 of 3 stays if
  the Antigravity review confirms it is unambiguous and answerable; a case
  that passes 3 of 3 stays, but is flagged.
- Gate: validation, typecheck and unit tests pass; the Antigravity review of
  ground truth, ambiguity, answer leaks and independence; baseline results
  recorded with the failure triage.

- **Result (2026-11-03): merged** (972ceac, 08ae44c, 6ffa35f; merge 463fc88).
  Validation checked 52 truth queries for 73 cases on both targets, with no
  fixes needed; 630 unit tests pass. The Antigravity review approved: 36 of
  36 scorer checks (one correct and two wrong answers per case) behaved as
  expected.
- **Baseline (2026-11-03), challenge ×3 on 463fc88: 22/36 (61.1%)**, all
  refusals passed, 4 tool errors in 76 calls (archived in
  `eval-archive/phase11/`). Triage: **13 of the 14 failures are case or
  scorer bugs, and 1 is an agent error.**
  - Each `allCells` cell packs a whole row into one string
    (`OWNER=CO / COLUMN=ORDER_STATUS / ...`), which must appear verbatim. The
    agent gave the right values in a markdown table, or on separate lines, or
    with `55,500` for 55500. The review missed this because its correct
    answers were written in the exact format.
  - `orders-status-scope` and `sales-primary-key` require `run_query`, but
    `describe_object` answers them correctly.
  - The one agent error: `plan-line-tree` run 2 merged OP and OPTIONS into
    `INDEX UNIQUE SCAN` (it read `explain_plan` output, not `v$sql_plan`).
  - Real substance pass rate is about 35 of 36. The agent handled false
    premises, cross-schema traces, multi-turn references and 21-row answers.
    It ignored a requested output format in 13 of 36 runs.
- Owner decision: fix the scorer fairly, then write a second, harder round
  aimed at substance (WP-11C).

### WP-11C: fair row scoring and a harder round
| Branch | Owns |
|---|---|
| `wp-11c-row-scoring` | `evals/scoring.ts` (a new opt-in check kind only), `evals/types.ts`, `evals/validate-hard.ts`, `evals/cases-hard/phase11-*.json` (challenge cases only), new `evals/cases-hard/phase11b-*.json`, their tests, `docs/evals-hard.md` |

- **Row scoring.** Add an opt-in ground-truth mode, `rowCells`. Truth SQL
  returns one value per column. Each truth row passes when all of its values
  appear together in one line of the answer: a markdown table row, a list
  item, or a `KEY=VALUE` record. Numbers match after removing thousands
  separators, and trailing zeros follow the existing numeric rules. A value
  from another row on the same line must not satisfy a row. Unit tests cover
  tables, records, separators, swapped values across rows, and a missing row.
  Existing modes and cases are unchanged, which tests prove.
- Convert the 12 challenge cases to `rowCells`. Remove `tool: run_query`
  where another read-only tool can answer. Questions may still suggest a
  layout, but no check may depend on it. Do not loosen any value check.
- **Harder round.** Add about 10 `challenge` cases in `phase11b-*.json`,
  written blind, aimed at substance the agent may get wrong:
  - **SQL semantics traps:** join fan-out that double-counts, AVG and COUNT
    over NULLs, top-N with ties, date-range end boundaries.
  - **Long diagnoses:** 5 or more dependent steps.
  - **Conflicting evidence:** dictionary statistics against live counts, or
    two views that disagree. The answer must use the right source and say
    why.
  - **Partial grants on p1:** part of the question can be answered and part
    cannot. The answer must give the first part and name the gap for the
    second.
  - Same rules as WP-11A: plain-SELECT truth, `validate-hard.ts` on both
    targets, negation-aware `forbiddenClaims`, no tool names or answer leaks,
    no near-copies.
- Gate: validation, typecheck and unit tests pass. The Antigravity review
  must include realistic correct answers in **several layouts** (a table,
  prose, records), as well as wrong answers. Then a coordinator baseline:
  challenge ×3 on main, with every failure triaged as before.

- **Result (2026-11-04): merged** (3c9c9a1, f71f3f2; merge ef204fd). 648
  unit tests pass, and validation checked 62 truth queries for 83 cases. The
  Antigravity review approved: 77 of 77 correct answers in four layouts passed,
  44 of 44 wrong answers failed, and the adversarial row mixing checks passed.
- **Baseline (2026-11-04), challenge ×3 on ef204fd: 54/66 (81.8%)**, all
  refusals passed, 17 tool errors in 151 calls (13 of them expected
  ORA-00942s in the grant cases). The WP-11A cases scored 35/36, which matches
  the earlier triage; the new round scored 19/30. **Triage: 9 of the 12
  failures are case or scorer bugs, and 3 are agent errors.**
  - `partial-memory` and `partial-backup` (0/3 each) are case bugs. Each
    truth "row" glues unrelated facts together
    (`[PRODCDB, 19, V$PARAMETER, unavailable]`), but a correct answer puts
    them on different lines. Every answer was right and named the grant gap.
  - `order-customer-key`, `timestamp-boundary` and `stats-grain` (one each)
    are scorer bugs:
    - vertical label/value tables (`Metric | Value`, `Step | Detail`) are
      transposed only when the header is Attribute, Field or Property;
    - a trailing parenthetical (`(NUM_ROWS=10, live_rows=10, ...)`) is
      stripped before matching.
  - **Agent errors:** `nullable-manager` 0/3. Asked for every department, the
    agent collapsed 16 empty departments into `120–270 (16 depts)`. This is
    the WP-11B target.

### WP-11D: scorer and case fixes from the 11C baseline
| Branch | Owns |
|---|---|
| `wp-11d-scorer-fixes` | `evals/scoring.ts` (rowCells only), `evals/cases-hard/phase11b-challenge.json` (the two partial-grant cases only), `evals/validate-hard.ts`, their tests, `tests/unit/wp-i-optimizer.test.ts`, `docs/evals-hard.md` |

- `rowCells` treats a two-column label/value table, and an inline
  `(K=V, ...)` record, as one record. It does this only when the truth has a
  single row, so values cannot mix across rows. Where truth column names
  appear as labels, values must bind to their labels, so swapped values
  fail.
- A trailing parenthetical is no longer stripped when it holds the record
  itself.
- The two partial-grant cases score each fact on its own: the accessible
  values, plus a required fact naming the unavailable view. No check is
  loosened.
- Test isolation: the eval-runner unit tests must not take the host's real
  endpoint lock. They failed while a real eval held it.
- Gate: unit tests built from the real 11C baseline answers (all 9 bug cases
  pass, the 3 `nullable-manager` answers still fail), typecheck, and the
  Antigravity review.

### WP-11B: quality fixes
Scoped from the 11C failure triage: the agent collapses requested rows into ranges (`nullable-manager`), and it ignored requested record formats in 13 of 36 WP-11A runs. Approved by the owner on 2026-11-03 (all phases). It uses the
usual gate (hard dev 4×4, holdout ×3, regression ×1, MVP) plus challenge ×4
on each side.

### WP-11E: scorer follow-ups from the 11B gate
Two scorer artifacts seen in the 11B gate. (1) `hard-p11-order-customer-key`:
correct values in a vertical table with extra columns (`# | Item | Value | Source`)
fail `rowCells`. (2) `hard-p11b-partial-memory`: "19.9.1.0.0 (major = 19)" fails the
single-value truth row `["19"]`. Fix the matcher without loosening wrong-answer
rejection; rescore archived results, no LLM calls.

### WP-11F: second scorer follow-up (from the 14B gate)
Correct answers in `eval-archive/phase14/gate-14b/` still fail `rowCells` when a
truth value appears owner-qualified (`SHOPAPP.CUSTOMERS`, `HR.LOCATIONS`), with
Markdown emphasis inside a qualified name (`SHOPAPP.**CUSTOMERS**`), or as a
labelled singleton with emphasis (`major version: **19**`). Same rules as WP-11E:
general fix, strict wrong-answer rejection, offline rescore with every flip
justified, no LLM calls.

### Phase 11 results (2026-11-04): complete
WP-11B merged (ad36a19) after the gate (A=835128b, B=+11B, alternating, primary
Strata; archive `eval-archive/phase11/gate-11b/`):

| Split | A | B |
|---|---|---|
| hard dev 4× | 107/112 | 112/112 |
| challenge 4× | 82/88 | 80/88 |
| holdout 3× | 33/36 | 34/36 |
| regression | 21/21 | 21/21 |
| MVP | 37/39 | 39/39 |

All refusals pass on both sides. Tokens B/A: dev +0.8% [−4.8, +6.6], challenge
−0.6% [−5.8, +5.2], so no measurable cost. Target `nullable-manager` 1/4 → 3/4.
The challenge losses (`order-customer-key` 4→2, `partial-memory` 3→0) were read
by hand: order-customer-key answers were correct (scorer artifact, WP-11E);
two partial-memory answers said "major = 19" (artifact), two gave only the full
version (an answer-format miss A also made once).

WP-11E merged after review: the offline rescore of 694 archived records flips
exactly those 4 records to pass, so the 11B challenge result is 82/88 → 84/88.

### Not in phase 11
New tools, cloud LLMs, LLM-judged scoring, and changes to existing cases.

## Phase 12: report history and scheduling (approved 2026-11-03)

Phase 4 saves up to 30 report runs per target, but it only ever compares the
newest two. It also leaves scheduling to the user's own cron. Phase 12 makes
that history useful: trends across saved runs, an easy and safe way to
schedule runs, and a local alert when something changes. It stays read-only,
uses no LLM and costs no tokens. It does not touch the agent, its prompts or
its tools, so it runs in parallel with phase 11 (owner: "continue to all
phases, don't stop until you finish all"). Phases 12 and 13 may run in
parallel. Phase 14B waits for phase 11 to close, because it needs clean eval
baselines.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-12A History and trends | `wp-12a-report-history` | `src/report/trends.ts` (new), `src/report/history.ts` (read helpers only), the `report history` subcommand in `src/cli/index.ts`, tests, `docs/report.md` | — |
| WP-12B Schedule helper | `wp-12b-report-schedule` | `src/report/schedule.ts` (new), the `report schedule` subcommand in `src/cli/index.ts`, tests, `docs/report.md` | — |
| WP-12C Web history view | `wp-12c-web-history` | `src/web/` (route and Report tab), browser tests, `docs/web-ui.md` | WP-12A |

### WP-12A: history and trends
- `piagent report history --target <t> [--last N] [--json]` reads saved runs
  only. It never connects to a database.
- Series per target:
  - tablespace used % per tablespace;
  - count of failed scheduler runs;
  - count of stale or locked tables;
  - count of unusable or invisible indexes;
  - hours since the newest backup;
  - which sections were unavailable.
- Output is a compact table with first, last, min, max and change for each
  series. It also gives a deterministic "worsening" flag, using the same
  thresholds module as `diff.ts`, so the rules stay in one place.
- Robust to old or partial saved files: a file with a missing section or an
  older shape is skipped with a counted note, never a crash. Saved files are
  treated as untrusted input; they are parsed with a schema, and their size is
  capped.
- Gate:
  - Unit tests: fixture histories, including gaps, an unavailable section,
    corrupt and oversize files, and retention boundaries.
  - Typecheck.
  - A live check on both targets after saving 3 runs each.

### WP-12B: schedule helper
- `piagent report schedule --target <t> --every <15m|1h|6h|1d>` **prints** a
  systemd user service and timer pair, plus the matching crontab line, to
  stdout. It installs nothing and does not run `systemctl`. The user copies
  the output, or pipes it to the right files.
  `--install` is out of scope for this phase.
- The generated unit:
  - runs `piagent report --target <t> --out <dir> --diff-only`;
  - reads only `PIAGENT_HOME`'s env file;
  - holds no secrets inline;
  - adds systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`, a
    `ReadWritePaths` limited to the report directory and audit file,
    `PrivateTmp`).
- Exit code 3 (changes) leads to a local notification only. The default is a
  line appended to `<home>/alerts.log`, mode 0600. If `notify-send` exists,
  that is optional. No email, Slack or network.
- Target names are validated as in WP-4A, and the interval comes from a
  fixed list, so no shell injection is possible in the generated text.
- Gate:
  - Unit tests: the generated text matches golden files, names are
    validated, and quoting is safe.
  - The Antigravity security review.
  - A manual check by the coordinator: install the unit under a temporary
    `HOME` with `systemd-analyze --user verify`, never in the real user
    session.

### WP-12C: web history view
- The Report tab gains a "History" panel for the selected target. It has small
  inline SVG sparklines for the WP-12A series, plus the worsening flags.
  It reads saved runs only.
- It uses the same token and Host/Origin checks as the other routes,
  `textContent` rendering only, no new dependencies, and works at phone width.
- Gate:
  - Route unit tests.
  - Browser tests: rendering, an XSS payload in a tablespace name, an empty
    history, phone width.
  - The Antigravity security review and a live smoke test.

### Phase 12 results (2026-11-04): complete
- **WP-12A: merged** (6479625, 6f2752f; merge 420c5a2). The Antigravity
  review approved:
  - files are opened with `O_NOFOLLOW` and capped at 2 MiB;
  - TypeBox schema plus semantic checks;
  - bad files are skipped and counted, never echoed;
  - trend edge cases (single point, gaps, empty) are handled.
  Live: 3 saved runs per target, 0 skipped.
- **WP-12B: merged** (adef1ff, 7900f00, 7b32a47, 3ea688f, ca17433; merge
  6241d7b) after two rounds of changes.
  - The Antigravity security review found a quoted `EnvironmentFile=` that
    systemd ignores as "not absolute".
  - The coordinator's review of the generated unit found three more problems:
    - about 900 characters of inline `node -e` JavaScript in `ExecStart` and
      in the cron line, now the tested `piagent report schedule run`
      subcommand;
    - `ReadWritePaths` on paths that may be missing, now `-` prefixed, with
      printed, non-destructive one-time setup commands and a preflight that
      names the missing path;
    - the pinned `process.execPath` (documented).
  - Coordinator checks in a temporary HOME:
    - `systemd-analyze --user verify` is clean;
    - the run before setup fails with one clear message;
    - after setup, the first run sets a baseline and the second reports
      "No changes";
    - all files are 0600 and directories 0700;
    - under a bubblewrap read-only root with only the three
      `ReadWritePaths` writable (emulating `ProtectSystem=strict`), the run
      succeeds, and a write elsewhere fails as read-only.
    - Units were never installed in the real user session.
  - Merge fix: WP-12B enables positional options on `report`, which broke
    `report history --target` ("unknown option"). History now declares its
    own `--target`. The WP-12A CLI test fails without that fix.
- **WP-12C: merged** (741ccb1, ff7db2e; merge 2ec1c63). The Antigravity
  security review approved. Live smoke through the real server:
  - no token → 401, bad origin → 403, bad target or `last=0` → 400,
    POST → 405;
  - d1 returned 2 runs with 8 series;
  - p1 returned an empty history;
  - the token was not in the audit log.
- After the merges: typecheck and 764 unit tests pass, and integration has 28
  passed. That integration run included the single local Strata
  end-to-end call, made while Strata was otherwise idle.

### Not in phase 12
Installing timers automatically, a daemon in this repo, email, Slack or other
network notifications, LLM summaries of trends, and new database queries.

## Phase 13: cross-target drift check (approved 2026-11-03)

DBAs often need to know how two databases differ: a lab against prod, or
before and after a change window. The report compares one target with its
own past. This phase compares the two approved targets with each other.
It stays read-only and uses no LLM. It uses only dictionary views both targets
can already read.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-13A Drift engine and CLI | `wp-13a-drift` | `src/drift/` (new), the `drift` command in `src/cli/index.ts`, tests, `docs/drift.md` | — |
| WP-13B Web drift tab | `wp-13b-web-drift` | `src/web/` (route and tab), browser tests, `docs/web-ui.md` | WP-13A |

### WP-13A: drift engine and CLI
- Command: `piagent drift --left d1-19c-lab --right p1-19c-prod --scope
  <parameters|schema:OWNER|objects:OWNER> [--json] [--out <dir>]`.
- Compares:
  - non-default initialization parameters, only where both targets can read
    them; otherwise the section says "unavailable" with the missing grant;
  - for a schema, its tables, columns (type, length, nullability),
    constraints, indexes (columns, uniqueness, status) and object counts by
    type;
  - invalid objects on each side.
- Output groups results into only-left, only-right and different. Values are
  normalized first: system-generated names (`SYS_C…`), storage clauses and
  whitespace are ignored, so the result is not just noise.
- Every query goes through the existing read-only policy and audit log, with
  the existing row caps. Drift is a CLI command, not an agent tool, so it adds
  no tokens to agent sessions. Phase 2 measured about 300 tokens per tool
  schema.
- Exit code 0 means no drift and 3 means drift, which matches
  `report --diff-only`.
- Gate:
  - Unit tests: normalization, fixtures for each category, caps,
    unavailable sections.
  - Integration on both targets: self-compare is empty, and d1 against p1
    gives a stable result across two runs.
  - The Antigravity review.

### WP-13B: web drift tab
- A Drift tab with left and right target pickers and a scope picker. It shows
  only-left, only-right and different in collapsible groups.
- It uses the same token and Host/Origin checks, `textContent` rendering
  only, and works at phone width.
- Gate: route unit tests, browser tests (including an XSS payload in an
  object name), the Antigravity security review and a live smoke test.

### Phase 13 results (2026-11-04): complete
- **WP-13A: merged** (670a031, 4892f5e, 354c030; merge 5bb891c). The
  Antigravity review asked for atomic export publication: private temp
  files, Markdown renamed first, JSON last as the commit marker, cleanup on
  failure, with tests. That was applied. The merge added the missing
  `drift --help` description.
  - Live: self-compares are empty, and d1 against p1 is stable.
  - p1 cannot read `V_$PARAMETER`, so its parameter section reports
    unavailable and the result is `complete: false`.
- **WP-13B: merged** (0004b2a, d9fd65e, 2e49556; merge 84c19f8). The
  Antigravity security review approved. The worker merged `master` to keep
  the WP-12C History panel and the Drift tab together, and 776 unit and 19
  browser tests pass. Live smoke through the real server:
  - no token → 401, GET → 405, cross-origin POST → 403;
  - an unapproved target (`FREEPDB1`) or a scope with injected SQL → 400;
  - a d1 self-compare of HR → 200 with no drift;
  - d1 against p1 parameters → 200, `complete: false`;
  - a concurrent drift → 429 while the first finished with 200;
  - the token was not in the audit log.

### Not in phase 13
Generating DDL to fix drift, any target outside the approved two, data
comparison (row contents), and an agent tool for drift.

## Phase 14: dependency refresh (approved 2026-11-03)

On 2026-11-03, `npm outdated` shows:
- `@earendil-works/pi-agent-core` and `pi-ai` 1.4.0 → 1.5.0;
- `vitest` 5.0.5 → 5.1.0;
- `@types/node` 26.6.5 → 26.6.6.

The PI SDK drives every agent turn. Its upgrade is treated as a model-path
change and gated on evals, not just tests. Each upgrade needs owner approval
under AGENTS.md rule 4, and this phase is that approval.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-14A Dev-tool bumps | `wp-14a-devdeps` | `package.json`/`package-lock.json` (devDependencies only, coordinator-approved), test config | — |
| WP-14B PI SDK 1.5.0 | `wp-14b-pi-sdk-15` | `package.json`/`package-lock.json` (the two PI packages), `src/llm/`, `src/agent/` adapters if the API changed, tests, `docs/pi-sdk-1.5.md` | WP-14A |

### WP-14A: dev-tool bumps
- Bump vitest and @types/node inside their current majors.
- Gate: typecheck, unit, integration and browser tests, CI green, and
  `npm audit` reports no new advisories.

### WP-14B: PI SDK 1.5.0
- Read the 1.5.0 changelog first. Record:
  - every API change;
  - any change to the request shape sent to Strata (headers, `reasoning`,
    tool schema encoding, usage fields);
  - any new default that could reach a non-loopback endpoint.

  Stop and report if 1.5.0 adds a provider or telemetry that cannot be
  turned off.
- The loopback guards and the eval-only secondary isolation must still hold.
  The existing tests prove it, and they are rerun unchanged.
- Gate:
  - The usual model-path gate: hard dev 4×4 alternating, holdout ×3,
    regression ×1, MVP and challenge ×4 each side, comparing 1.4.0 with 1.5.0
    on the same day.
  - Token change within the noise band, or explained.
  - No drop in pass rate.
  - All refusals pass.
  - The Antigravity security review of the diff and the SDK's network
    surface.

### Phase 14 results (2026-11-04): complete
WP-14A merged (fa14d70). WP-14B merged (5863c0b) after the security review
(APPROVE) and a gate (A=ad36a19, B=+14B, alternating, primary Strata; archive
`eval-archive/phase14/gate-14b/` and `gate-14b-ch2/`). The first challenge ×4
showed 84 vs 80, so four more rounds per side were run; everything below is
rescored with the WP-11F scorer:

| Split | A | B |
|---|---|---|
| hard dev 4× | 112/112 | 111/112 |
| challenge 8× | 170/176 | 169/176 |
| holdout 3× | 35/36 | 34/36 |
| regression | 21/21 | 21/21 |
| MVP | 39/39 | 39/39 |

All refusals pass. Tokens B/A (per-case geometric mean, 95% CI): dev −0.5%
[−7.1, +6.4], challenge +2.9% [−1.2, +7.2], holdout −1.8% [−8.6, +5.5], MVP
−0.4% [−1.8, +0.8]. Request payloads are unchanged, and no schema/validation tool
errors appeared on either side. The single dev and holdout misses are on cases A
also missed in the 11B gate.

### Not in phase 14
Major version upgrades (TypeScript, oracledb, Node), new dependencies, and
replacing the PI SDK.

## Phase 15: release 1.1.0 (approved 2026-11-03)

v1.0.0 was tagged on 2026-10-29. Since then the project has gained phases
8–14: a fresh holdout, the global CLI install, the eval-only second Strata,
challenge evals, report history and scheduling, drift and the dependency
refresh. This phase cuts 1.1.0 for whatever of these has merged. It adds no
new features.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-15A Release notes and docs | `wp-15a-release-110` | `CHANGELOG.md`, `README.md`, `docs/README.md`, `docs/install.md`, quick-start sections | phases 11–14 closed or explicitly deferred |
| Coordinator | `needlefish` | version bump, tag, push | WP-15A |

### WP-15A: release notes and docs
- Add a `[1.1.0]` CHANGELOG entry grouped as Added, Changed and Fixed. Each
  item links to its doc. It must include the behaviour changes users will
  notice: since phase 9, audit and report history default to `~/.piagent/`,
  and there are the new `report history`, `report schedule` and `drift`
  commands.
- Refresh the README quick start and the command list. Every documented
  command is run once, read-only, against the live targets, and its output
  checked against the docs.

### Coordinator release steps
1. Confirm the release scope with the owner: the phases included, and any
   deferred.
2. Gate on the final release commit:
   - typecheck, build, unit, integration and browser tests;
   - CI green;
   - one full gate (hard dev ×2, holdout ×3, regression ×1, MVP, challenge ×2);
   - a temp-prefix tarball install check, as in phase 9.
3. Bump `version` to 1.1.0, tag `v1.1.0`, and push `master` and the tag to
   origin, only after the owner confirms (the repo is public).

### Phase 15 results (2026-11-04): released
WP-15A merged (8ab6cae, review APPROVE); changelog placeholders filled (f0c9fc8);
version 1.1.0 committed (cc214c3). Checks on cc214c3:

- typecheck, build, unit 800/800, integration 28/28, browser 19 passed plus the
  live web-chat smoke (`PIAGENT_BROWSER_LIVE=1`) passed.
- LLM commands, run once each from a fresh `piagent init` private home: `ask`
  (HR.EMPLOYEES 107 rows), `chat` (27 departments), `report --summarize` on p1
  (six prioritised findings).
- `npm pack` and `npm install -g --prefix <tmp>`: `--version` 1.1.0, plus
  targets, doctor, drift, report, report history, report schedule and web all
  work; the tarball has no `.env`, secrets, tests or evals.
- Release gate (single side, primary Strata; `eval-archive/phase15/gate-release/`):
  hard dev 2× 55/56, challenge 2× 41/44, holdout 3× 33/36, regression 21/21,
  MVP 39/39, all refusals pass. The misses are cases that also missed in the 11B
  and 14B gates (`description-language` 0/3, as in the 11B gate's A side).

Notes: after `init`, `ask` fails with a generic message until the placeholder
`PIAGENT_LLM_API_KEY_FILE` is edited (documented); a clearer error is a candidate
follow-up. `report schedule` pins `process.execPath`, which on this machine
resolves to a Playwright-bundled Node via `~/.local/bin/node`.

Pushed after the owner confirmed: origin/main 848670c and tag `v1.1.0`. CI run
41864215262 succeeded; it waited about 14 minutes in GitHub's runner queue first.

### Not in phase 15
Publishing to npm, GitHub release binaries, and Windows support.

## Phase 16: PL/SQL insight and issue triage (approved 2026-11-04)

The owner asked for PL/SQL features: document packages, explain them with
diagrams, and, when a user reports an issue, take the report, find the relevant
logs and code, and suggest debug steps toward the root cause.

Design rules:
- Read-only, through the existing session and SQL policy. Use `DBA_` dictionary
  views and fall back to `ALL_` views; when a view is unreadable, say
  "unavailable" with the ORA code instead of guessing.
- Evidence gathering is deterministic code, not new chat tools. Phase 6 showed
  that every tool schema costs uncached tokens on every session, and this model
  rarely picks new tools unprompted. LLM use is opt-in (`--summarize`, and chat
  `/triage`), grounded like `report --summarize`.
- Diagrams: Mermaid text in Markdown, plus a `{nodes, edges}` graph JSON that
  the web UI draws as its own SVG. No new dependencies (owner decision).
- Source text stays local. Credential-looking literals (`IDENTIFIED BY …`,
  `password := '…'`) are redacted in all output. The audit log keeps only SQL
  hashes, as today. Caps: 2,000 source lines per object, ±8 lines per excerpt.

Grants: `docs/grants-request-2026-11-04-plsql.sql` was applied on 2026-11-04,
with the owner's authorization ("Write and run it"). It ran as `/ as sysdba` in
oracle19c-prod after the identity check (PRODCDB 19.9.1). It granted SELECT on
`DBA_SOURCE`, `DBA_ERRORS`, `DBA_DEPENDENCIES`, `DBA_PROCEDURES`, `DBA_ARGUMENTS`
and `DBA_OBJECTS` to HARNESS_RO: 6/6 succeeded, and DBA_OBJECTS was already
granted. d1 already reads these through SELECT_CATALOG_ROLE.

Live material: p1 `SHOPAPP.WORKLOAD` (spec plus a 30-line body: `PLACE_ORDERS`,
`SHIP_ORDERS`, `NIGHTLY_PURGE`), three scheduler jobs, and `NIGHTLY_PURGE_JOB`
failing with ORA-02292 (`SHOPAPP.SYS_C007669`) at WORKLOAD line 27. d1 has HR
procedures and triggers, OE triggers, a function and types, and the failing
`K7Q_OWNER.K7Q_FAILJOB` (ORA-20001 at line 1). Neither target has application log
tables, so logs come from Oracle sources plus per-target configured log tables.

| WP | Branch | Owns | Depends on |
|---|---|---|---|
| WP-16A PL/SQL docs and diagrams | `wp-16a-plsql-doc` | `src/plsql/` (new), the `plsql` command in `src/cli/index.ts`, tests, `docs/plsql.md` | — |
| WP-16B Issue triage | `wp-16b-triage` | `src/triage/` (new), the `triage` command, tests, `docs/triage.md` | WP-16A |
| WP-16C Web and chat | `wp-16c-plsql-web` | `src/web/` (PL/SQL tab, triage panel, SVG graph), chat `/triage` in `src/cli/` and web chat, browser tests, `docs/web-ui.md` | WP-16B |
| WP-16D PL/SQL evals | `wp-16d-plsql-evals` | `evals/cases-hard/phase16-*.json` (challenge split), `docs/evals-hard.md` | — |
| WP-16E Tool dictionary fallback | `wp-16e-tool-fallback` | `src/tools/index.ts` (fallback only, no schema/description change), tests | WP-16D baseline |
| WP-16F Case/scorer corrections | `wp-16d-plsql-evals` | `evals/scoring.ts` (rowCells, dash normalization), `evals/cases-hard/phase16-plsql.json`, tests, `docs/evals-hard.md` | WP-16E gate archive |
| WP-16G Empty dictionary hint | `wp-16g-empty-dict-hint` | `run_query` in `src/tools/index.ts` (result note only, no schema/description change), tests, `docs/wp-16g-empty-dict-hint.md` | WP-16E |

### WP-16A: PL/SQL docs and diagrams
- `src/plsql/dictionary.ts`: a typed read layer over objects, procedures,
  arguments, source, dependencies (both directions), errors, and scheduler jobs
  whose `job_action` names the object. DBA→ALL fallback, recording which view
  answered.
- `piagent plsql list --target [--owner] [--json]`: PL/SQL objects with type,
  status, line count and last DDL time.
- `piagent plsql doc --target --object OWNER.NAME [--json] [--out dir]`:
  - overview, status, and compile errors;
  - each subprogram's signature (arguments, modes, types, defaults), with the
    spec comments next to it;
  - tables used, with per-table operations from a static text scan of the body
    (SELECT/INSERT/UPDATE/DELETE/MERGE, labelled heuristic);
  - callers and scheduler jobs, plus a line-numbered, redacted source appendix.
- `src/plsql/diagram.ts`: a graph model, plus Mermaid output for a dependency
  graph (object → subprograms → tables/objects, jobs → entry points).
- Tests: unit tests with dictionary fixtures, including redaction, caps, and
  overloads; integration on WORKLOAD (p1) and an HR procedure (d1).

### WP-16B: issue triage
`piagent triage --target [--issue TEXT | --issue-file F] [--since 24h] [--json]
[--out dir] [--summarize]`:
- Parse the report for ORA/PLS codes, ORA-06512 frames (`at "OWNER.NAME", line
  N` and `at line N`), object and job names, and times.
- Collect evidence:
  - for each frame, a source excerpt around the line, with its subprogram and the
    statement at that line;
  - scheduler run history for the named or implicated jobs in the window;
  - compile errors and invalid objects in the involved owners;
  - for constraint errors (ORA-00001/02291/02292), the constraint, the parent and
    child tables, and their columns;
  - recent rows from configured log tables (`logTables` per target in config:
    table, timestamp column and message columns, row cap). Candidate log tables
    found by name are listed, not queried.
- A local error-code guide (meaning, typical PL/SQL causes, next read-only
  checks) for common codes: 00001, 00054, 00060, 00904, 00942, 01031, 01403, 01422,
  01476, 01555, 01722, 02291, 02292, 04031, 04068, 04091, 06502, 06508, 06511,
  06550, 20000–20999 and PLS-*.
- Output: ranked root-cause hypotheses, each with its evidence, plus a numbered
  debug checklist with the exact read-only SQL for each step and a Mermaid trace
  diagram (job → subprogram/line → statement → table/constraint).
  `--summarize` adds a grounded Strata narrative, with numbers checked as in
  report summaries.
- With no issue text, `triage --target` scans recent failures (failed job runs,
  compile errors, invalid objects) and triages each.
- Integration: NIGHTLY_PURGE_JOB on p1 must name SYS_C007669, its child table,
  line 27 inside NIGHTLY_PURGE, and the DELETE statement there. K7Q_FAILJOB
  must show ORA-20001 raised from the job's anonymous block.

### WP-16C: web and chat
- A web PL/SQL tab with an object picker, the doc view, and the dependency graph
  as SVG drawn from the graph JSON (layered layout, no new dependency, XSS-safe).
  Also a Triage panel (paste the issue → hypotheses, checklist, trace SVG,
  Markdown export). Same token, Host/Origin checks, body caps and single-flight
  lock as the drift endpoints.
- Chat `/triage <issue text>` in CLI chat and web chat: runs the triage, then asks
  the model one grounded question over the evidence. The default prompt and
  tools stay unchanged, so normal sessions pay no extra tokens.

### WP-16D: PL/SQL evals
About ten blind challenge-split cases for plain chat: what a WORKLOAD subprogram
does, which tables it writes, which job calls it, why NIGHTLY_PURGE_JOB fails,
which line raises, what a d1 trigger does, and what an argument list is. Use
`rowCells` where it fits. Validate ground truth read-only, and test scorers with
correct and wrong answers in several layouts. The baseline is measured on
current master; no product change is made in this WP.

### WP-16E: dictionary fallback in chat tools
The WP-16D baseline (current master, primary Strata, ×3) showed the cause of
most failures. `get_source`, `list_objects` and `describe_object` read only `ALL_`
views. Those hide PL/SQL the session does not own or execute (WORKLOAD and the HR
triggers), so the model loops through `list_objects` calls. Fix: inside the
existing tools, fall back to the matching `DBA_` view when the `ALL_` query
returns no rows and the `DBA_` view is readable. Report which view answered.
Tool names, schemas and descriptions stay unchanged, so there is no token cost.
Gate: phase-16 cases ×4 alternating, plus the usual hard dev 4×4, holdout ×3,
regression and MVP.

### WP-16F: case and scorer corrections (merged 2026-11-04)
The gate-16e PL/SQL rounds were scored with the original cases. Triage of all 40
failing answers found 31 real misses and 9 artifacts:
- child and parent on separate rows of a role table;
- U+2011 and other Unicode dashes in ORA codes;
- per-procedure section tables;
- semicolons inside schedule metadata;
- "no defaults" stated once rather than per row;
- an unasked line-number requirement.

The fix normalizes U+2010–U+2015 and U+2212 to `-`, and splits constraint truth
into child and parent records. Wrong layouts (swapped roles, CASCADE, wrong
routine association, parent-first purge) still fail. Rescored, gate-16e p16 is
A 17/40 and B 32/40, and every pre-phase16 record is unchanged. Review APPROVE.

### WP-16G: empty dictionary hint in run_query
With WP-16E, the model still writes its own `run_query` against `ALL_ARGUMENTS`
or `ALL_OBJECTS`, gets 0 rows, and says HR.ADD_JOB_HISTORY does not exist (3/4
gate-16e runs). Fix: when a `run_query` SELECT on `ALL_` dictionary views returns
0 rows, run the same SQL once on the `DBA_` views (maxRows 1; privilege errors
ignored). If that finds rows, append one note telling the model to re-run on
`DBA_`. No rows are returned, the user SQL is never silently rewritten, and tool
definitions stay byte-identical. Gate: as WP-16E, against master with WP-16E.

### Gate
- The usual tests (unit, integration, browser).
- Live smoke: `plsql doc` on WORKLOAD, `triage` on both failing jobs, and the web
  tab.
- WP-16C runs a token gate (hard dev 4×4, holdout ×3, regression, MVP) to show
  default chat is unchanged.
- Antigravity review per WP.

### Phase 16 results (2026-11-04): complete, pushed (be17cfe)
All WPs are merged on local master with Antigravity review APPROVE:

| WP | Merges |
|---|---|
| 16A | d592d86 |
| 16B | b8867fd, follow-up 2e0404f |
| 16C | 8ad658e, follow-ups 11a6dd5 and 4ec5f84 |
| 16D | 98efdc1 and 744c23c |
| 16E | 5c99a4d |
| 16F | 33732fc |
| 16G | 387f796 |

- Eval gates (alternating A/B, primary Strata, current scorer):

  | Gate | PL/SQL challenge | `history-arguments` | Hard dev tokens | Holdout | Regression | MVP |
  |---|---|---|---|---|---|---|
  | gate-16e, master → +16E | 17/40 → 32/40 | — | −7.2k/run (CI −10.6k..−3.5k); two B misses are the trailing-zero artifact | flat | 21/21 | 39/39 |
  | gate-16g, master(+16E/C) → +16G | 30/40 → 34/40 | 0/4 → 3/4 | flat | 33 → 34/36 | 21/21 | 39/39 |

  - gate-16g tool errors: B's extras are ordinary model SQL mistakes.
  - gate-16g IX boundary case: still refuses correctly.
- Default chat: system prompt and tool definitions are byte-identical (the
  chat-master snapshot test). gate-16g's A side, which includes 16C, matches
  gate-16e's B side on dev, regression and MVP.
- Coordinator live smokes, with screenshots checked:
  - `plsql doc` on WORKLOAD;
  - triage on NIGHTLY_PURGE_JOB, giving the cutoff race at lines 26/27, SYS_C007669 and a single-cutoff fix;
  - triage on K7Q_FAILJOB with the default window, giving historical ORA-20001 runs and the dropped job;
  - `triage --summarize`, with no unverified numbers;
  - CLI chat `/triage`;
  - the web PL/SQL graph and Triage panel.

  These smokes found two UX gaps, both fixed and reviewed: triage found nothing
  for a failure older than the window, and the graph had overlapping edge labels
  and a cramped layout.
- Tests on master:

  | Suite | Result |
  |---|---|
  | typecheck | clean |
  | unit | 967 passed |
  | integration, incl. LLM e2e | 35 passed |
  | browser | 27 passed |

- Open items:
  - security-trigger answers that only defend the error code after pushback (real misses);
  - name recognition for job names without a _JOB suffix in triage;
  - two Low review notes on WP-16G hint coverage (comma joins).

### Not in phase 16
- Compiling, debugging with DBMS_DEBUG, setting breakpoints, or running any
  PL/SQL.
- Reading trace or alert files from the server filesystem.
- New chat tools.
- Cloud LLMs.

## Phase 17: close the phase 16 gaps (owner request 2026-11-04: "fix the remaining gaps")

| WP | Branch | Owns | Gate |
|---|---|---|---|
| WP-17A Grounding precision | `wp-17a-grounding` | `src/agent/grounding.ts`, the correction text in `src/agent/index.ts`, tests | eval gate with 17C |
| WP-17B Triage name recognition | `wp-17b-triage-names` | `src/triage/` (parse and lookup), tests, `docs/triage.md` | unit, integration, live smoke |
| WP-17C Hint comma joins | `wp-17c-hint-joins` | `emptyDictionaryHint` in `src/tools/index.ts`, tests | eval gate with 17A |
| WP-17D Multi-value cells | `wp-17d-scorer-cells` | `evals/scoring.ts` (rowCells), tests, `docs/evals-hard.md` | offline rescore, every flip justified |

### WP-17A: grounding precision
gate-16g hard-p16-security-trigger failed 5 of 8 times. On every failing record,
the grounding check flagged supported facts as unverified:
- `EACH` and `ROW` from `FOR EACH ROW`;
- `HR.SECURE_DML`, whose source the model had read;
- `20205`, which the source shows as `-20205`.

The correction turn ("only fix or remove the listed numbers") then got a short
reply defending 20205, and that reply became the final answer, losing the
explanation.

Fix:
- Treat PL/SQL and SQL keywords as constants.
- Accept a number whose evidence differs only by a leading minus sign.
- Accept OWNER.NAME when both parts appear in the same tool result.
- Make the correction text ask for the complete revised answer, which replaces
  the previous one.

The system prompt and tools stay unchanged. Unit tests use the gate-16g records
as fixtures.

### WP-17B: triage name recognition
Issue text that names a job or object without the `_JOB` suffix
(`NO_SUCH_JOB_X`, `K7Q_FAILJOB`, `daily_load`) must be recognized. Fix:
- Check upper-cased identifier-like tokens (at most 20 per issue) against the
  scheduler jobs, run history and objects views, with one bounded, bound-variable
  lookup.
- When a name is not found, name it in the answer and suggest checking the
  spelling.

### WP-17C: hint comma joins
`FROM all_objects o, all_tables t` should get the empty-dictionary hint. Track
the FROM-list context, so that a comma-separated item at the top level of the
FROM clause counts as a view position. Keep every existing conservative refusal.

### WP-17D: multi-value cells
`| Events | INSERT OR UPDATE OR DELETE |` should satisfy the single-value truth
rows INSERT, UPDATE and DELETE, under these rules:
- Only in rowCells mode, and only for single-column truth.
- Only for a cell made of the truth value joined to others by OR, `,`, `/` or
  "and".
- Negated cells ("not DELETE") must still fail.

Rescore every archive and justify each flip.

### Phase 17 results (2026-11-04): complete

Merges on master:
- WP-17B: 23f1967, then the wording fix 7cb9d9c (deduplicated views, searched
  names in not-found evidence).
- WP-17D: 29510ba. The rescore covered 7,548 records; the only flips were 2
  FAIL to PASS, both justified.
- WP-17A and WP-17C: 0c3d865. Offline replay over 3,703 records changed 13, all
  justified. Antigravity reviews approved all four WPs.

Gate gate-17ac (A = master+17D, B = +17A+17C; `eval-archive/phase17/gate-17ac`):

| Split | A | B | B−A (CI95) |
|---|---|---|---|
| p16 ×4 | 33/40 | 38/40 | +12.5pp [5, 20] |
| hard-p16-security-trigger | 0/4 | 4/4 | |
| dev ×4 | 112/112 | 112/112 | 0; tokens +2.2k [−2.8k, 9.0k] |
| holdout ×3 | 35/36 | 34/36 | −2.8pp [−8.3, 0] |
| regression | 21/21 | 21/21 | |
| MVP | 39/39 | 39/39 | |

The holdout misses were all hard-p8-description-language skipping `run_query`
(A once, B twice). That tool choice is made before grounding or the hint runs,
and the case has been flaky in earlier gates.

Live smoke on d1: `/triage NO_SUCH_JOB_X` reports "No recorded failure was found
for NO_SUCH_JOB_X." and lists each searched view once.

Tests on 0c3d865:
- typecheck clean;
- 1034 unit tests;
- 36 integration tests;
- 27 browser tests.

Closed by WP-17E (merged 3197a99; review APPROVE; replay: 678 unverified lists shrink, none grow, 0 number changes): because of the same-result rule, `HR.SECURE_DML` and `HR.EMPLOYEES`
can still be listed as unverified when the owner and the name come from
different tool results. The security-trigger case passes regardless, and the
answer is no longer rewritten.

### WP-17E: owner from tool arguments (branch `wp-17e-owner-scope`)
Problem: the gate-17ac security-trigger answers still list `HR.SECURE_DML` and
`HR.EMPLOYEES` as unverified. The owner appears only in the call arguments
(`get_source {"schema":"HR","name":"SECURE_DML"}`); the result text shows
`PROCEDURE secure_dml` and `ON employees`, so the same-result rule never matches.

Owns `src/agent/grounding.ts`, the `checkFacts` call in `src/agent/index.ts`, and
the tests.

Fix:
- `checkFacts` takes an optional fourth argument: one owner per tool result
  (string or undefined), index-aligned with `toolResultTexts`.
- For result i with owner O, `O.NAME` is supported when NAME appears in that
  result's identifiers. NAME alone, or another owner, gains nothing.
- `finishTurn` builds the owners from each toolResult's matching toolCall
  (`toolCallId`), using the upper-cased `schema` or `owner` string argument.
  Calls without one pass undefined.
- Numbers and the correction trigger stay unchanged. `unsupportedNumbers` must
  be identical for every record.
- Tool definitions and the system prompt stay unchanged.

Verification:
- Unit tests with the gate-17ac security-trigger records as fixtures.
- Adversarial cases: a fake owner; NAME in a different result; no schema
  argument.
- An offline replay over every archive (owners taken from `toolDetails[].args`
  when it aligns with `toolResultTexts`). It reports every changed `unverified`
  list and must show zero changes to `unsupportedNumbers`.

## Phase 18: alert-log triage (owner request 2026-11-04)

The owner chose alert-log triage as phase 18. Triage and the operator gain the
database alert log and the ADR incident/problem list, read with SQL only:
`V$DIAG_ALERT_EXT`, `V$DIAG_INCIDENT` and `V$DIAG_PROBLEM`. The agent never
reads server files.

Access:
- The owner approved `docs/grants-request-2026-11-04-alertlog.sql` ("Write and
  run it"). It was applied once on 2026-11-04 as sysdba in containers
  `oracle19c` (HARNESS_LAB) and `oracle19c-prod` (HARNESS_RO): three SELECT
  grants on each, verified read-only afterwards.
- Probe results:
  - d1 has 11,097 entries, 254 ORA- lines in 30 days, 13 incidents and 1
    problem.
  - p1 has 4,563 entries, 38 ORA- lines and 7 incidents.
  - A 30-day bounded query takes under 0.3 s.

| WP | Branch | Owns | Gate |
|---|---|---|---|
| WP-18A Alert-log reader and CLI | `wp-18a-alertlog` | `src/alertlog/` (new), the `alertlog` command registration in `src/cli/index.ts`, tests, `docs/alertlog.md` | unit, integration on d1 and p1, live smoke |
| WP-18B Triage integration | `wp-18b-triage-alert` | `src/triage/` (alert evidence, hypotheses, checklist, Markdown), tests, `docs/triage.md` | unit, integration, live triage smokes |
| WP-18C Web | `wp-18c-web-alert` | `src/web/` (Alert Log tab, `/api/alertlog`, the alert section of the triage panel), browser tests, `docs/web-ui.md` | browser tests and live screenshots |
| WP-18D Evals | `wp-18d-evals-alert` | `evals/` (alert-log challenge cases, suite `p18`), `docs/evals-hard.md` | p18 ×4 measured; dev, holdout, regression and MVP unchanged |

Order: 18A first. 18B, 18C and 18D start after 18A merges.

Order (amended 2026-11-04): 18B, 18C and 18D start from `wp-18a-alertlog`
(aecd320) while its re-review runs. Each merges master once 18A has merged.

Shared shape (18B produces it, 18C renders it). `TriageResult.alertLog` is
optional:
`{ status: 'ok' | 'unavailable' | 'skipped'; grant?: string; window: { from: string; to: string }; entries: AlertRow[]; incidents: IncidentRow[]; correlations: { kind: 'code' | 'jobRun'; label: string; at?: string; entryIndexes: number[] }[]; checks: Check[] }`.
`AlertRow` and `IncidentRow` come from `src/alertlog`.


### WP-18A: alert-log reader and CLI
Module `src/alertlog/` exposes `readAlertLog(ctx, target, options)`.

Options:
- `since` (the triage window syntax: 24h, 7d), or an explicit `from`/`to`
  window;
- `codes` (ORA-/TNS- codes);
- `text` (a case-insensitive substring, bound);
- `level` (default: `MESSAGE_LEVEL <= 8`, critical/severe/important, or text
  containing ORA-, TNS-, "Errors in file", "incident=" or "deadlock"). Oracle
  tags almost every line level 16 (normal), so `<= 16` filters nothing. `all`
  shows everything;
- `limit` (default 50, capped by `limits.maxRows`).

Reading rules:
- Every query has a timestamp predicate, bind variables only, `FETCH FIRST`,
  the configured statement timeout, and read-only sessions from the existing
  provider.
- Rows carry the timestamp, level, the code(s) parsed from the text, problem
  key, incident id (from "incident=N"), trace file name and message text.
- Message text goes through the existing credential redaction, and a row's text
  is capped at 2 KB.
- Messages that are identical after masking digits and hex ids are folded
  ("Resize operation completed for file# N..." ×20 is one row), with a count,
  a first/last time and one example text. Trailing newlines are trimmed.

Other reads:
- `readIncidents` lists V$DIAG_INCIDENT joined to V$DIAG_PROBLEM: incident id,
  problem key, create time, status, with a window and a limit.
- On ORA-00942 or ORA-01031, the result has `status: 'unavailable'` and gives
  the exact grant line. It never throws for missing access.

CLI: `piagent alertlog --target T [--since 24h] [--code ORA-00600]... [--grep
text] [--incidents] [--json|--markdown]`.

Out of scope for 18A: no chat tool, no change to tool definitions or the system
prompt, and no LLM call.

### WP-18B: triage integration
`triageIssue` adds alert evidence:
- entries matching the issue's ORA codes within the window;
- entries within ±10 minutes of each failed scheduler run it found;
- incidents in the window.

Each is a `Check`, with its exact SQL and binds as for the other evidence.

Hypotheses (ranked like the existing ones, shown as evidence and never run):
- ORA-00600 or ORA-07445 with an incident: an internal error. Open an SR, with
  the incident id and problem key.
- ORA-04031: shared pool memory.
- ORA-01555: undo retention.
- ORA-01653/1654/1688: tablespace full.
- ORA-00060: deadlock, with the trace file named.
- ORA-12850/TNS: network.

Other changes:
- The debug checklist gains a step with the alert-log SQL.
- The trace diagram adds an alert-log node when entries correlate.
- An unavailable alert log is reported once, with the grant line, and never
  fails triage.
- `--summarize` grounding sees the alert rows as evidence.
- Chat `/triage` includes the alert evidence automatically.

### WP-18C: web
- An Alert Log tab with a target, a window and code/text filters. It shows a
  table with folded counts, the level as text and colour, and an incident badge,
  and exports Markdown.
- The triage panel shows the alert section and the correlation.
- `/api/alertlog` uses the same auth and loopback rules as the other routes.
- Browser tests, and live screenshots in light and dark modes.

### WP-18D: evals
Four to six challenge cases (suite `p18`) about the alert log on d1 and p1. Their
ground truth is computed at run time with the same SQL, for example:
- the most recent ORA- code in the last 7 days;
- the number of incidents;
- the problem key.

The agent answers through its existing `run_query` tool. The scorer reuses the
existing check types. The gate reports p18 ×4 as a measurement, and the other
splits must not change, because there are no product changes in 18D.

### Phase 18 results (2026-11-05)

Merges on master:
- WP-18A f1d2ac6 (re-review APPROVE after three fixes);
- WP-18D f603db8;
- WP-18B e4cfe5a;
- WP-18C fb65104;
- WP-18E 7885328, the integration fix: the renderer handles missing per-issue
  alert evidence, and optional alert reads never fail triage;
- WP-18F 3e5d113, the p18 scorer: 8,059 answers replayed, zero non-p18 flips,
  five justified p18 flips.

Antigravity approved every WP.

Gate gate-18: master 48bec5e, single side, because chat tools and the prompt are
unchanged. Archive: `eval-archive/phase18/gate-18`.

| Split | Result |
|---|---|
| p18 ×4 | 12/24 raw, 17/24 with the WP-18F scorer (measurement) |
| p16 | 10/10 |
| dev | 28/28 |
| holdout | 11/12 (the known flaky hard-p8-description-language skipped run_query) |
| regression | 21/21 |
| MVP | 39/39 |

The remaining p18 misses are mostly the time-zone trap:
- The agent compares UTC questions with session-local `TIMESTAMP` literals.
- Tool results printed dates in JavaScript local format.

WP-18G addresses the second point.

Live smokes:
- On p1, triage for "nightly purge job failed last night" finds:
  - `SHOPAPP.NIGHTLY_PURGE_JOB` from ORA-12012;
  - child-record constraint `SYS_C007669` as the top hypothesis;
  - the excerpt at `WORKLOAD` line 27.
- On d1, ORA-00800 ranks the VKTM priority hypothesis first, with its incidents.

Tests on 48bec5e:
- typecheck clean;
- 1117 unit tests;
- 41 integration tests;
- 38 browser tests, with 2 opt-in live tests skipped.

Open items:
- the WP-18G timestamp rendering (closed with WP-18H; merged 134b75f);
- spaced problem keys (`ORA 800`) in labelled bullets are not matched by the
  p18 scorer (Low);
- incident status is shown as a numeric ADR code.

### WP-18G: timestamps in tool results (branch `wp-18g-timestamps`)
In gate-18, tool results rendered Oracle date values with JavaScript
`String(Date)`. For example, an alert time showed as `Tue Nov 03 2026 22:30:56
GMT-0600 (Central Standard Time)` (`src/tools/index.ts` cell rendering). On a
question asked in UTC, the agent then compared against a session-local literal
and counted an extra incident.

Owns:
- `src/oracle/index.ts` (column types);
- the cell rendering in `src/tools/index.ts`;
- one authorized contract line in `src/contracts.ts`: optional
  `columnTypes?: string[]` on `QueryResult`, from `metaData[i].dbTypeName`;
- tests and `docs/`.

Rendering (tool text only):
- TIMESTAMP WITH TIME ZONE and WITH LOCAL TIME ZONE become ISO 8601 UTC with
  `Z` and milliseconds (`2026-11-04T04:30:56.298Z`).
- DATE and plain TIMESTAMP keep their stored wall-clock time, with no time-zone
  conversion: `YYYY-MM-DD HH24:MI:SS`, plus fractional seconds for TIMESTAMP.
  The driver reads them as client-local, so local getters recover the stored
  value.
- A Date with an unknown type falls back to the wall-clock format.

Unchanged:
- Other consumers of `rows` (triage, report, alert log, web, evals) still get
  the same Date objects.
- No tool definitions or system prompt change.
- No `ALTER SESSION`.

Gate:
- A/B alternating: p18 ×4, p16 ×4, dev 4×4, holdout ×3, regression and MVP.
- The scorer is unchanged.
- Merge only with no regression. The audit log also stays unchanged.

Gate-18g result (2026-11-05, archive `eval-archive/phase18/gate-18g`):

| Split | A (c5bdaa4) | B (+18G) | B−A pass rate, CI95 |
|---|---|---|---|
| p18 ×4 | 18/24 | 14/24 | −16.7 pp [−41.7, +8.3] |
| p16 ×4 | 34/40 | 37/40 | +7.5 pp [0, +22.5] |
| dev 4×4 | 112/112 | 112/112 | 0 |
| holdout ×3 | 34/36 | 33/36 | −2.8 pp [−16.7, +8.3] |
| regression | 21/21 | 21/21 | 0 |
| MVP | 39/39 | 39/39 | 0 |

Not merged. The targeted suite went down: p1-failed-job fell from 4/4 to 2/4 and
d1-incident-count from 3/4 to 1/4. A read-only probe found the root cause.
The agent's session time zone is the node process zone (`SESSIONTIMEZONE`
−06:00, `DBTIMEZONE` +00:00). So the model's `TIMESTAMP '2026-11-04 00:00:00'`
literals are read as −06:00 against the TZ-aware ADR and scheduler columns:
- the d1 window counts 7 incidents instead of 6;
- the p1 job failure at 04:30:56 UTC on Nov 4 falls before the window.

18G prints those times as UTC, which hides the mismatch the old `GMT-0600` text
exposed. WP-18H fixes the session side, and 18G merges together with it.

### WP-18H: agent sessions in UTC (branch `wp-18h-session-utc`, based on `wp-18g-timestamps`)
Owns `src/oracle/index.ts` (session setup), plus tests and `docs/`.

Change:
- After connect, next to the existing `CURRENT_SCHEMA` statement, run
  `ALTER SESSION SET TIME_ZONE = '+00:00'`.
- This is session state only and changes nothing in the database.
- Then bare `TIMESTAMP` literals, `CURRENT_TIMESTAMP` and `LOCALTIMESTAMP`
  are UTC, consistent with the UTC text from 18G.
- `SYSDATE` and `SYSTIMESTAMP` are unaffected (server clock).

Verify:
- Every consumer that binds or fetches dates still gets correct instants and
  wall clocks: alertlog CLI windows, triage alert and job windows, report,
  web, and the 18G rendering of DATE and plain TIMESTAMP.
- Thin-mode Date binds and fetches are converted on the client, but prove
  it with integration tests against both targets.
- A unit test asserts the statement runs once per session, before any tool
  query.
- An integration test asserts `SESSIONTIMEZONE` is `+00:00`, and that a bare
  literal window over `V$DIAG_INCIDENT` on d1 equals the explicit-UTC window.

Unchanged:
- tool definitions and system prompt;
- the read-only policy (session setup is not a tool query);
- the audit log.

Gate: as for 18G, with A = master and B = master + 18G + 18H.

Gate-18h result (2026-11-05, archive `eval-archive/phase18/gate-18h`). A is
c5bdaa4, B is 09febf7 (18G + 18H):

| Split | A | B | B−A pass rate, CI95 |
|---|---|---|---|
| p18 ×4 | 17/24 | 20/24 | +12.5 pp [+4.2, +16.7] |
| p16 ×4 | 34/40 | 40/40 | +15.0 pp [+10.0, +20.0] |
| dev 4×4 | 110/112 | 112/112 | +1.8 pp [0, +3.6] |
| holdout ×3 | 33/36 | 34/36 | +2.8 pp [0, +8.3] |
| regression | 20/21 | 21/21 | — |
| MVP | 39/39 | 39/39 | — |

- p18 incident counts went from 1/4 to 3/4 on both d1 and p1.
- The one regression-suite miss (hard-fresh-grant-request) was on A.
- Review: APPROVE, informational notes only:
  - `evals/ground-truth.ts` keeps the runner's zone, so truth SQL must keep
    explicit UTC literals;
  - `SYSDATE` follows the server OS clock, which is UTC on both containers.
- Merged as 134b75f. On master:
  - typecheck clean;
  - 1122 unit tests pass;
  - 44 integration tests pass (live targets and Strata);
  - 38 browser tests pass, 2 opt-in live tests skipped.

## Phase 19: single-SQL performance drill-down (approved 2026-11-05)

### Goal
Answer "why is this SQL slow?" for one statement, using read-only evidence.
`report` already lists top SQL, wait events and optimizer statistics. What is
missing is the follow-up on one SQL_ID:
- its plan or plans;
- whether the plan changed;
- where the time goes;
- whether the tables it reads have stale statistics.

AWR and ASH (`DBA_HIST_*`, `V$ACTIVE_SESSION_HISTORY`) stay out of scope
because they need the Diagnostics Pack license. Only cursor-cache views are used.

### Access (probed read-only on 2026-11-05)
- **d1 (HARNESS_LAB):** reads everything needed through SELECT_CATALOG_ROLE:
  - `V$SQL`, `V$SQL_PLAN`, `V$SQL_PLAN_STATISTICS_ALL`, `V$SQL_BIND_CAPTURE`,
    `V$SQL_SHARED_CURSOR`;
  - `DBA_SQL_PLAN_BASELINES`, `DBA_SQL_PROFILES`;
  - `DBA_TAB_STATISTICS`, `DBA_IND_STATISTICS`, `DBA_TAB_COL_STATISTICS`;
  - `DBMS_XPLAN.DISPLAY_CURSOR`.
- **p1 (HARNESS_RO):** reads only `V$SQL`, `V$SQL_PLAN`, `V$SQLSTATS` and
  `DISPLAY_CURSOR`.
- **Owner decision:** a grant request
  `docs/grants-request-<date>-sqlperf.sql` (SELECT only, for HARNESS_RO) on:
  - `V_$SQL_PLAN_STATISTICS_ALL`, `V_$SQL_SHARED_CURSOR`, `V_$SQL_BIND_CAPTURE`;
  - `DBA_SQL_PLAN_BASELINES`, `DBA_SQL_PROFILES`;
  - `DBA_TAB_STATISTICS`, `DBA_IND_STATISTICS`, `DBA_TAB_COL_STATISTICS`.
- Without the grants, every section degrades to `unavailable` with the missing
  view named, as alert-log reads do today.

Owner on 2026-11-05: "apply the grants and start phase 19".
`docs/grants-request-2026-11-05-sqlperf.sql` was applied on p1 as
`/ as sysdba` (8 × "Grant succeeded"), after checking PRODCDB, 19.9.1.0.0 and
the HARNESS_RO grantee. A read-only re-probe confirmed HARNESS_RO now reads all
eight views. The phase 20 grants wait for phase 20.

### WP-19A: SQL insight core and CLI (branch `wp-19a-sql-insight`)
Owns:
- `src/sqlperf/` (new);
- the `sql` command registration in `src/cli/index.ts`;
- the narrow `DBMS_XPLAN.DISPLAY_CURSOR` table-function allowance in
  `src/oracle/sqlPolicy.ts`, with unit tests: exact form only, bind or literal
  arguments, no other package;
- tests and `docs/sqlperf.md`.

API:
- `readSqlInsight(session, { sqlId, child?, maxPlans? })` returns `SqlInsight`;
- `renderSqlInsightMarkdown`;
- `SqlUsageError` (CLI exit 2).

Inputs and output:
- Validate the SQL_ID as 13 base-32 characters.
- Also accept `--text "fragment"`. It looks up `V$SQL` with a bounded
  `LIKE` on `SQL_TEXT`, lists up to 10 candidates and never guesses when there
  is more than one.

Sections, each with its own status (`ok`, `unavailable` naming the view, or
`skipped`):
- cursor children (`V$SQL`): execs, elapsed, CPU, buffer gets, disk reads and
  rows per execution; plan hash; first load and last active (UTC);
- plans (`DISPLAY_CURSOR` 'TYPICAL', falling back to `V$SQL_PLAN` rows when
  `DISPLAY_CURSOR` is empty or fails);
- plan changes, one row per plan hash, with aggregated per-execution stats;
- referenced tables and indexes from the plan objects, with `DBA_TAB_STATISTICS`
  and `DBA_IND_STATISTICS` (stale flag, last analyzed, num rows), using the
  `ALL_` fallback when the `DBA_` view is unavailable;
- baselines and profiles matched by `EXACT_MATCHING_SIGNATURE` / `SQL_HANDLE`;
- shared-cursor mismatch reasons (`Y` columns) when there are more than
  3 children;
- capture-only binds: name, position, datatype and `WAS_CAPTURED`.
  `VALUE_STRING` is never selected; it may hold user data.

Findings:
- plan instability: more than one plan hash and a ratio of 2 or more between
  the best and worst elapsed per execution;
- stale or missing statistics;
- `TABLE ACCESS FULL` on a table with more than 100k rows that is the inner
  side of a `NESTED LOOPS`;
- high child count;
- each finding cites the evidence rows.

CLI:
- `piagent sql --target T (--sql-id ID | --text S) [--child N] [--json | --markdown]`;
- Markdown by default, matching the alertlog style.

Tests:
- unit tests with fixtures;
- integration tests on d1 and p1, which find a real statement by text through
  `V$SQL`, never a hard-coded SQL_ID;
- a live smoke on both targets in `docs/`.

### Shared shape
`SqlInsight = { status; sqlId; target; text; children: ChildRow[];
plans: { planHashValue; lines: PlanLine[]; source: 'display_cursor'|'v$sql_plan' }[];
planChanges: { planHashValue; firstLoad; lastActive; execs; elapsedPerExec }[];
tables: { owner; name; stale: boolean|null; lastAnalyzed; numRows }[];
baselines; profiles; binds?; findings: Check[] }`.

Finding examples:
- several plan hash values with more than 2× difference in elapsed time per
  execution;
- stale or missing statistics on a referenced table;
- a full scan of a large table inside a nested loop;
- high child-cursor count with the `V$SQL_SHARED_CURSOR` reasons.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-19A SQL insight core and CLI | `wp-19a-sql-insight` | codex | new `src/sqlperf/`; `piagent sql --target T --sql-id ID [--json --markdown]` |
| WP-19B triage and agent hint | `wp-19b-sql-triage` | codex | `src/triage/` (an issue naming a SQL_ID, or "slow" plus an object, pulls SqlInsight); the `run_query` hint only, no new chat tool (phase-W lesson) |
| WP-19C web SQL tab | `wp-19c-sql-web` | codex | `src/web/static/` SQL tab: plan tree, plan-change table, stale-stats badges, dark mode |
| WP-19D p19 evals | `wp-19d-p19-evals` | codex | `evals/cases-hard/phase19-sqlperf.json`: about 6 cases with fixed truth SQL, avoiding volatile cursor-cache facts (plan hash of a pinned lab statement, child count reasons, stale flag) |
| Review | `review-wp-19x` | antigravity | each WP before merge |

Notes:
- Order: 19A, then 19B and 19C in parallel, then 19D.
- Plan text from `DISPLAY_CURSOR` is read with `SELECT … FROM
  TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:id, :child, 'TYPICAL'))`. This is a
  read-only table function. The SQL policy must accept exactly this form,
  with a unit test.
- Cursor-cache facts age out, so evals must use a lab statement the case
  itself identifies by SQL text through `V$SQL`, not a hard-coded SQL_ID.

Gate:
- Single side for 19A and 19C (no chat change).
- A/B like gate-18h for 19B, because it touches the agent hint.
- Merge with no regression on p16, p18, dev, holdout, regression and MVP.

### WP-19B: triage and agent integration (branch `wp-19b-sql-triage`)
Owns:
- `src/triage/` (a new `sqlperf.ts` next to `alerts.ts`);
- the DBMS_XPLAN rejection message in `src/oracle/sqlPolicy.ts`;
- tests and `docs/`.

`triageIssue` pulls `SqlInsight` when the issue:
- names a SQL_ID (13 base-32 characters, validated); or
- says slow, slowness, timeout or "takes long" and names a table or a
  schema-qualified object. Then it lists the top 3 `V$SQL` statements by
  elapsed time per execution that reference that object
  (`V$SQL_PLAN.OBJECT_OWNER/OBJECT_NAME`) and were active in the window, and
  reads insight for the first.

Evidence and hypotheses:
- Each section becomes a `Check` with its exact SQL and binds.
- Findings become ranked hypotheses: plan regression (with both plan hashes),
  stale statistics (with the object and last analyzed), full scan on the
  nested-loop inner side, and cursor sharing.
- Every hypothesis has "verify next" SQL that is shown, never run.

Resilience, as in 18E (`optionalRead`):
- Unavailable views appear once with the view named.
- Cache misses give "SQL not in cursor cache".
- Neither ever fails triage.

Other changes:
- The renderer tolerates an absent `sql` section in old fixtures.
- Chat `/triage` includes it automatically.

Agent:
- No new tool, and no system prompt or tool-definition change (byte-identical
  snapshot test).
- The only agent-visible change: when `run_query` rejects a DBMS_XPLAN call,
  the error names the exact allowed form, `SELECT * FROM
  TABLE(DBMS_XPLAN.DISPLAY_CURSOR('<sql_id>', <child>, 'TYPICAL'))`, so the
  model can retry once.
- Unit-test the message, and that the policy itself is unchanged from 19A.

Tests: unit tests with fixtures, and integration on p1 with the issue "orders
query slow on SHOPAPP.ORDERS" or a real SQL_ID found by text.

### WP-19C: web SQL tab (branch `wp-19c-sql-web`)
Owns:
- `src/web/` (a `/api/sql` route with the same auth and loopback rules, and a
  `src/web/static/sql.js` tab);
- the triage panel's SQL section;
- browser tests and `docs/img/`.

The tab:
- Inputs are a target plus a SQL_ID, or a text fragment with a candidate
  picker. It never auto-picks when there is more than one candidate.
- A plan tree with indentation from `PARENT_ID`; a monospace `DISPLAY_CURSOR`
  text toggle; a plan-change table with best and worst highlighted; table and
  index stats with stale/missing badges; findings first; Markdown export.
- Status chips per section; an `unavailable` chip names the view.
- Dark and light themes, and phone width with no horizontal page scroll
  (plan text scrolls inside its own box).
- Browser stubs, plus live screenshots in light and dark modes on d1 and p1.

### WP-19D: p19 evals (branch `wp-19d-p19-evals`)
`evals/cases-hard/phase19-sqlperf.json`, suite `p19`, 4 to 6 challenge cases.

Ground truth is computed at run time with fixed truth SQL that finds its
statement by a stable SQL text fragment in `V$SQL`. For example:
- the plan hash value(s) of the scheduler workload's statement on p1;
- whether a named table in the plan has stale statistics, and its last
  analyzed date (UTC);
- the child count;
- the access path (FULL or INDEX) on a named table.

Rules:
- Do not duplicate `cached-plan.json` / `phase8-cached-plan.json`; read them
  first.
- A case is skipped, not failed, when its statement aged out of the cursor
  cache (truth returns 0 rows). Reuse the existing skip mechanism if there is
  one; otherwise report it as a contract need.
- Truth SQL uses explicit UTC literals (WP-18H review note).
- Run p19 ×2 locally as a measurement and report per-case results.
- No product changes.

WP-19D follow-up (coordinator, 2026-11-05, after the first measurement: raw 5/8,
6/8 on manual review). Same branch and worker. It now also owns the eval runner
and `evals/scoring.ts` for the items below:
1. `hard-p19-plan-controls` truth also returns the discovered statement's
   SQL_ID, computed at run time. Its old truth `[[0, 0]]` could be matched on
   the wrong cursor.
2. An opt-in `skipWhenTruthEmpty` case flag:
   - when truth is empty before the ask, record `skipped` with a reason and
     make no LLM call;
   - when truth is empty after the ask, also record `skipped`;
   - skips are excluded from pass-rate denominators and `compare.ts`, and
     counted separately in the summary;
   - set the flag on all p19 cases.
3. The scorer extends the WP-18F labelled single-record pooling to p19 cases
   only, and accepts equivalent UTC timestamp spellings
   (`2026-11-04 22:00:07`, `2026-11-04T22:00:07Z`) only when the answer marks
   the time as UTC.
4. Replay all of `eval-archive` with the new scorer. It must show zero flips
   outside p19 and list every p19 flip with a reason.

### WP-19E: SQL insight polish (branch `wp-19e-sql-polish`, coordinator review of the merged 19A–19D)
Owns:
- `src/sqlperf/`;
- `src/triage/sqlperf.ts` and its Markdown in `src/triage/index.ts`;
- `src/web/static/sql.js` and its CSS;
- tests, `docs/` and `docs/img/`.

1. Candidate selection: exclude statements whose `PARSING_SCHEMA_NAME` is the
   session user (the agent's own diagnostic queries). This applies in
   triage's top-SQL lookup and to `--text` candidates, with a note giving the
   number excluded. On p1, "orders query slow on SHOPAPP.ORDERS" picked a
   HARNESS_RO diagnostic statement first.
2. Sections: per-object statistics status lives on the object row, not as
   `tables:OWNER.NAME` keys in `sections`. Summaries and chips show one entry
   per section, and only non-`ok` sections are expanded.
3. Numbers: round per-execution values for display. Show time per execution in
   ms with 3 significant digits; keep raw microseconds in JSON.
4. Findings: render as readable rows (finding, evidence, verify next), never
   raw `Check` fields (`sql`, `binds`, `attempts`), in the CLI, triage and web.
5. Presentation: consistent title-case headings; readable column labels
   (binds: Child, Name, Position, Type, Captured); empty sections collapsed
   into one "No baselines, profiles, binds or mismatches" line; wide tables
   scroll inside their own box on desktop as well as on phones.
6. Fresh screenshots (d1 and p1, light and dark, 1280 and 390) and refreshed
   CLI and triage smokes in the docs.

### Phase 19 results (2026-11-05)

Merges on master:
- WP-19A 5a22378;
- WP-19D 1bf0f9f;
- WP-19B 515ee1f;
- WP-19C 41c3ce6;
- WP-19E 4f8907e, the polish package from the coordinator's review of 19A–19D.

Antigravity approved every WP.

Gate gate-19: A/B, with A = 6d0b11d (the phase 18 push) and B = b9668de
(phase 19), because 19B changes the agent hint. Archive:
`eval-archive/phase19/gate-19`.

| Split | A | B | B − A, mean [95% CI] |
|---|---|---|---|
| p19 ×4 (B only, measurement) | n/a | 11/16 | n/a |
| p18 ×4 | 20/24 | 20/24 | 0 [−12.5, +12.5] |
| p16 ×4 | 38/40 | 35/40 | −7.5 [−17.5, +5] |
| dev ×4 | 107/112 | 108/112 | +0.9 [0, +2.7] |
| holdout ×3 | 33/36 | 34/36 | +2.8 [0, +8.3] |
| regression | 21/21 | 21/21 | 0 |
| MVP | 39/39 | 39/39 | 0 |

Notes:
- The p16 dip is one case, `hard-p16-history-arguments`: A 4/4, B 1/4. All
  three B misses are correct answers rejected by the fact regex
  (`**Defaults:** None` and `` `DEFAULTED = 'N'` `` do not match). This is a
  scorer false negative, so the gate passes. With that case excluded, both
  sides score 34/36. WP-20E fixes the regex.
- dev misses on both sides are `hard-grant-p1-parameters`. Its premise
  (V$PARAMETER unreadable on p1) ended when the phase 20 grants were applied.
  WP-20E re-premises it.

## Phase 20: security and privilege review (approved 2026-11-05)

### Goal
`piagent security --target T` produces a read-only posture report that a DBA
can act on, plus a triage path for "who can drop/read X?".

It reports findings only. It never generates or runs GRANT, REVOKE, ALTER USER
or AUDIT statements. Remediation text is advice in prose, and every suggested
statement is clearly labelled "for a human DBA".

### Access (probed read-only on 2026-11-05)
- **d1:** has `DBA_SYS_PRIVS`, `DBA_ROLE_PRIVS`, `DBA_TAB_PRIVS`,
  `DBA_PROFILES`, `DBA_USERS`, `DBA_ROLES`, `PROXY_USERS`, `V$PWFILE_USERS`
  and `V$PARAMETER`. It lacks `DBA_USERS_WITH_DEFPWD` and the
  `AUDIT_UNIFIED_*` views.
- **p1:** has only `DBA_USERS`.
- **Owner decision:** a grant request for SELECT on the views above, plus
  `DBA_USERS_WITH_DEFPWD`, `AUDIT_UNIFIED_ENABLED_POLICIES`,
  `AUDIT_UNIFIED_POLICIES` and `DBA_STMT_AUDIT_OPTS`, for both accounts.
  `UNIFIED_AUDIT_TRAIL` is deliberately excluded: it holds other users'
  activity, and only policy configuration is needed.
- Missing views degrade per check to `unavailable`.

Owner on 2026-11-05: "apply the grants", then "continue with next phase".
`docs/grants-request-2026-11-05-security.sql` was applied as `/ as sysdba`
after checking DB name, version and grantee in each container:
- d1 (ORCL 19.9.1, HARNESS_LAB): 3 × "Grant succeeded";
- p1 (PRODCDB 19.9.1, HARNESS_RO): 12 × "Grant succeeded".

A read-only re-probe shows every phase 20 view is readable on both targets
except `UNIFIED_AUDIT_TRAIL`, which is deliberately not granted.

### WP-20A: security core and CLI (branch `wp-20a-security`)
Owns:
- `src/security/` (new);
- the `security` command registration in `src/cli/index.ts`;
- tests and `docs/security.md`.

API:
- `readSecurityPosture(session, { checks?, whoCan? })` returns
  `SecurityPosture = { status; target; checks: SecurityCheck[]; whoCan?: PrivilegePath[] }`.
- `SecurityCheck = { id; title; severity: 'high'|'medium'|'low'|'info';
  status: 'ok'|'unavailable'|'skipped'; findings: { subject; detail; evidence: Check }[];
  advice }`.
- `renderSecurityMarkdown`.
- `SecurityUsageError` (CLI exit 2).

Rules:
- Oracle-maintained accounts (`ORACLE_MAINTAINED='Y'`) and roles are excluded
  from findings unless the check is about them.
- The default-password check reports Oracle-maintained accounts only when they
  are OPEN.
- The role graph is expanded in SQL (`CONNECT BY NOCYCLE`) or in TypeScript,
  with a cycle guard and a depth cap of 10.
- Who-can for `OWNER.OBJECT`:
  - direct object grants;
  - via roles, with the path listed;
  - `PUBLIC`;
  - the matching `ANY` system privileges (`SELECT ANY TABLE`, `EXECUTE ANY
    PROCEDURE`, …, mapped by object type);
  - the owner itself.
- Advice text is prose, and any example statement is prefixed "For a human
  DBA:". Nothing is executed.
- Never select `PASSWORD`, `SPARE4`, `AUTHENTICATION_TYPE` hashes or anything
  from `SYS.USER$`. A unit test scans every SQL string in `src/security/` for
  forbidden columns and objects.

CLI:
- `piagent security --target T [--check id[,id]] [--who-can OWNER.OBJECT] [--json | --markdown]`;
- Markdown by default, findings first and grouped by severity, matching the
  sqlperf/alertlog style (readable column labels, no raw `Check` fields,
  collapsed empty checks).

Tests:
- unit tests with fixtures, including role cycles and nested roles;
- integration tests on d1 and p1;
- live smokes in the docs.

### Checks (each a `Check` with evidence rows and severity)
1. Accounts with default passwords that are open.
2. Non-Oracle-maintained users holding `DBA`, `SYSDBA`/`SYSOPER` (password
   file), or `ANY` system privileges, directly or through nested roles.
   Role-graph expansion is cycle-safe.
3. Grants to `PUBLIC` on sensitive packages (`UTL_FILE`, `UTL_HTTP`,
   `UTL_TCP`, `UTL_SMTP`, `DBMS_SQL`, `DBMS_JAVA`, …) and on non-Oracle tables.
4. Profiles: unlimited `FAILED_LOGIN_ATTEMPTS`, `PASSWORD_LIFE_TIME`, missing
   verify function; which open users use them.
5. Open accounts with expired or never-used passwords, and locked accounts
   that still own objects (informational).
6. Audit configuration: enabled unified policies, and whether logons and
   privilege use are covered.
7. Parameters: `remote_login_passwordfile`, `sec_case_sensitive_logon`,
   `audit_trail`, `O7_DICTIONARY_ACCESSIBILITY` (absent in 19c, so N/A).
8. A "Who can …" query: the effective privilege paths on one object
   (direct, role, `ANY`, `PUBLIC`), shown as a path list, and in the web UI
   as a graph that reuses the PL/SQL graph component.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-20A security core and CLI | `wp-20a-security` | codex | new `src/security/`; `piagent security --target T [--check id] [--who-can OWNER.OBJECT] [--json --markdown]` |
| WP-20B report and drift integration | `wp-20b-security-report` | codex | an optional `security` section in `report` (off by default, so the 14 fixed checks stay unchanged), and privilege counts in `drift` scope `security` |
| WP-20C web Security tab | `wp-20c-security-web` | codex | `src/web/static/` tab with findings, severity filter and the who-can graph |
| WP-20D p20 evals | `wp-20d-p20-evals` | codex | about 6 cases (default-password count, a nested-role path to DBA, PUBLIC execute on `UTL_FILE`, profile limits, enabled audit policies) with fixed truth SQL |
| Review | `review-wp-20x` | antigravity | each WP, with a focus on no secret, password hash or `SPARE4` column ever being selected |

### WP-20B: report and drift integration (branch `wp-20b-security-report`)
Owns:
- the opt-in `security` section in `src/report/` (`--sections security` only;
  the default 14 checks and their output stay byte-identical, checked by a
  snapshot test);
- `security` in report history trends (counts per severity);
- the `drift` scope `security`, which compares per-target counts and the sets
  of users and roles with powerful privileges and PUBLIC sensitive grants;
- tests and docs.

No new SQL: it reuses `readSecurityPosture`.

### WP-20C: web Security tab (branch `wp-20c-security-web`)
Owns:
- `/api/security`, with the same auth, loopback, single-flight and 1 MiB rules
  as `/api/sql`;
- `src/web/static/security.js`;
- browser tests and `docs/img/`.

The tab:
- findings grouped by severity, with a severity filter and status chips (only
  non-ok sections expanded);
- a who-can input that draws the privilege paths as a graph, reusing the
  PL/SQL graph component, plus a list fallback;
- Markdown export;
- light and dark themes, and phone width with no horizontal page scroll;
- live screenshots on d1 and p1.

### WP-20D: p20 evals (branch `wp-20d-p20-evals`)
`evals/cases-hard/phase20-security.json`, suite `p20`, 4 to 6 challenge
cases with fixed truth SQL that never selects secrets. For example:
- open default-password accounts on d1;
- the role path by which a named user reaches an `ANY` privilege;
- PUBLIC EXECUTE on UTL_FILE;
- a profile's effective `FAILED_LOGIN_ATTEMPTS` after DEFAULT inheritance;
- enabled unified audit policies on p1.

Rules:
- Questions must not name tools or views.
- Use `skipWhenTruthEmpty` where truth can legitimately be empty.
- Any scorer change is scoped to `hard-p20-`, with an archive replay showing
  zero flips elsewhere.
- Measure p20 ×2 locally only when told Strata is free; otherwise the
  coordinator measures it in the gate.

Hard rules for the phase:
- Never select `PASSWORD`, `SPARE4` or any hash column.
- Default-password checks use `DBA_USERS_WITH_DEFPWD` only.
- Output names accounts but never credentials.

Gate: single side unless the agent prompt changes, plus the full suites as in
phase 19.

### Phase 20 results (2026-11-05)

Merges on master:
- WP-20A f6f432d (forbidden-SQL scan made parser-based after review);
- WP-20D 7fbef02, plus the 2eff14a follow-up (named truth rows);
- WP-20B 235578d;
- WP-20C f584de6 (graph scale and grouped profile findings after the
  coordinator's screenshot review).

Antigravity approved every WP.

The chat path is unchanged, so gate-19 covers regressions. Measurement on
f584de6, single side (archive `eval-archive/phase20/measure`): p20 ×2 = 5/6, 5/6.
- Both misses are `hard-p20-p1-enabled-audit-policies`. The answer is correct,
  but it uses labelled bullets, which `rowCells` does not match. WP-21B covers
  this.

Tests on f584de6:
- typecheck clean;
- 1260 unit tests;
- 52 browser tests.
- Integration: 52/55.
  - The web-sql heading test is stale since WP-19E.
  - The hard-truth validator fails on the V$PARAMETER premise.
  - One p1 listener refusal came from running the integration files in
    parallel. Each affected file passes when run alone. The coordinator set
    integration tests to run one file at a time.

### WP-20E: eval premises after the phase 20 grants (branch `wp-20e-premises`)
Owns:
- `evals/cases-hard/phase5-grant-limited-p1.json`;
- `evals/cases-hard/phase11b-challenge.json` (only the case below);
- `evals/cases-hard/phase16-*.json` (only `hard-p16-history-arguments`);
- `evals/validate-hard.ts`;
- `evals/hard-ground-truth-validation.json`;
- the affected unit tests and fixtures;
- `tests/integration/web-sql.test.ts`;
- `docs/`.

1. `hard-grant-p1-parameters` (dev): HARNESS_RO can now read V$PARAMETER on
   p1. Make it a positive case: report SGA_TARGET and PGA_AGGREGATE_TARGET in
   bytes, with truth SQL from V$PARAMETER and a new category (not
   `grant-limited-p1`). Grant-limited coverage stays in the backup and
   archive-log cases.
2. `hard-p11b-partial-memory` (challenge, `partial-grants`): keep the
   partial-availability idea, but replace the SGA_TARGET part with a source
   that is still unreadable on p1. First probe it read-only through the
   product session (catch ORA-00942 or ORA-01031). Update the validator's view
   map to match.
3. `hard-p16-history-arguments`: the "no defaults" fact must accept
   `**Defaults:** None` and `` `DEFAULTED = 'N'` `` while still rejecting an
   answer that claims a default. Replay every archived answer for this case
   (eval-archive and evals/results), report the flips, and confirm zero
   changes for other cases.
4. Update `tests/integration/web-sql.test.ts` for the WP-19E title-case heading.
5. Run `npx tsx evals/validate-hard.ts` (or the hard-evals integration test)
   and the full integration suite with `PIAGENT_SECRET_DIR` set. Do not call
   the LLM.

## Phase 21: hardening and release 1.2.0 (approved 2026-11-05: "continue with next phase and merge and commit to github if ok")

### Goal
Close the open Low items from phases 15–18, run a release gate on the phase
19–20 features, and ship 1.2.0. Pushing the tag needs the owner's
confirmation, as in phase 15.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-21A open Low items | `wp-21a-lows` | codex | see the list below |
| WP-21B eval hygiene | `wp-21b-eval-hygiene` | codex | see the list below |
| WP-21C release notes and docs | `wp-21c-release-120` | codex | `CHANGELOG.md` 1.2.0, `README.md` and `docs/` for `sql` and `security`; install docs; grant-request index |
| Review | `review-wp-21x` | antigravity | each WP |

Ownership. WP-21A and WP-21B touch no common file and can run in parallel.
Neither calls the LLM; the coordinator runs every Strata measurement.
- WP-21A (product only):
  - `src/alertlog/`;
  - the alert parts of `src/triage/`;
  - `src/web/static/alertlog.js`;
  - `src/config/environment.ts`;
  - the `ask` path in `src/cli/index.ts`;
  - `src/report/schedule.ts`;
  - tests and `docs/`.
- WP-21B (evals only):
  - `evals/` (`scoring.ts`, `ground-truth.ts`, case files, a new
    `evals/cases-hard/phase21-holdout.json`);
  - eval unit tests and fixtures;
  - `docs/`.

WP-21A items:
- Decode ADR incident status (numeric code to name) in alertlog, triage and
  web.
- `ask` after `init` with the placeholder API-key file: give a clear error
  naming `PIAGENT_LLM_API_KEY_FILE` (phase 15 note).
- `report schedule`: warn when `process.execPath` is not a stable Node path
  (phase 15 note).

WP-21B items:
- p18 scorer: match spaced problem keys (`ORA 800`) in labelled bullets.
- `evals/ground-truth.ts` sets its session to UTC like the product (WP-18H
  review note). Replay all truth SQL to prove there are no flips.
- Stabilize or reclassify the flaky `hard-p8-description-language`.
- Add a fresh holdout of about 12 cases covering phases 16–20
  (`split: holdout`, questions that never name tools or views, truth
  validated live, `skipWhenTruthEmpty` where empty truth is legitimate). Write
  them blind: never run the agent on them, and never tune them to answers.
- `rowCells`: also match a labelled-bullet block in which all of a row's
  cells appear together (`hard-p20-p1-enabled-audit-policies` lists each
  policy as six bullets). Replay the archive and justify every flip.
- Every scorer change ships with an offline replay over `eval-archive` and
  `needlefish/evals/results`, like `docs/wp-20e-replay.ts`, listing every flip.

### WP-21D: CLI messages (branch `wp-21d-cli-messages`, from the WP-21C review)
Owns:
- `src/cli/index.ts` (the drift description and the top-level catch);
- `src/config/environment.ts`;
- tests;
- `docs/install.md` and `README.md`, only where they describe these
  messages.

1. The top-level `main().catch` turns every error into a generic message, so
   the WP-21A key-file guidance never reaches the user. Add a safe-message
   error class: config errors whose text is fixed and never contains paths,
   secrets or values. Print `error.message` for that class only; every other
   error keeps the generic text. `assertConfiguredLlmKeyFile` throws it. Unit
   test both paths, and check end to end that `piagent ask` with the init
   placeholder prints the guidance and exits 1 without contacting Strata.
2. The `drift` description lists every scope, including `security`.
3. Remove the install-doc caveat that says the message is masked.

Release gate (single side, as in phase 15):
- hard dev ×2, challenge ×2, holdout ×3, p16/p18/p19/p20 ×2, regression and
  MVP;
- every refusal passes;
- `npm pack` plus a global install smoke of every command;
- version 1.2.0.

The coordinator commits the version bump. The push of `main` and tag `v1.2.0`
waits for the owner.

### Phase 21 results (2026-11-05): released 1.2.0

Merges on master:
- WP-21A fcfdbe4 (re-review APPROVE after the Linuxbrew and Windows Node
  path fix);
- WP-21B 53ee3ca;
- WP-21C dc1ced1;
- WP-21D cdc8127 (from the WP-21C review: the CLI catch had masked the WP-21A
  key-file guidance).

Antigravity approved every WP. The version bump is caaff4a.

Release gate: master fcfdbe4, single side; WP-21C and WP-21D do not touch the
eval path. Archive: `eval-archive/phase21/gate-release`.

| Split | Result |
|---|---|
| dev ×2 | 28/28, 28/28 |
| challenge ×2 (includes p16/p18/p19/p20) | 46/48, 45/48 |
| holdout ×3 | 57/69, with 3 legitimate skips: the existing 12 cases scored 36/36, the new phase 21 cases 21/33 |
| regression | 21/21 |
| MVP | 39/39 |
| refusals | all pass |

The 12 missed runs on the new blind holdout were a first measurement, not
regressions. They were left unedited for the release.
- Case defects (6), where the answer was correct:
  - `hard-p21-history-signature` ×3: the truth row needs `N`, the answer says
    "No";
  - `hard-p21-products-stats` ×3: YES/YES appears in a vertical attribute
    table that `rowCells` does not read.
- Agent gaps (4):
  - `hard-p21-alert-levels` ×2: "alert messages" was not linked to the alert
    log;
  - `hard-p21-problem-identity` ×2: the agent claimed ADR problem keys are
    only visible in adrci and missed V$DIAG_PROBLEM.
- One miss each (2): trigger-state and price-plan-operations.

Package smoke, from `npm pack` with a global install into a temporary prefix:
- 1.2.0, and all 19 `--help` pages exit 0;
- `init`; `ask` with the placeholder prints the PIAGENT_LLM_API_KEY_FILE
  guidance and exits 1;
- `doctor`; `ask` (107 rows); `targets`;
- `report`, `report history` and `report schedule` (warning shown for the
  bundled Node);
- `plsql list` and `plsql doc`; `triage`; `alertlog`; `sql`; `security`;
- `drift` with the parameters scope (exit 3) and the security scope
  (exit 1, incomplete: d1 lacks most security grants, as documented);
- `web` (page, sql, security and alertlog modules return 200).

Tests on caaff4a:
- typecheck clean;
- 1311 unit tests;
- 52 browser tests;
- 55/55 integration tests, including Strata end to end.

Follow-ups (phase 22 candidates):
- Fix the two holdout case defects with a replay.
- Agent hints for alert-log and ADR problem discovery.
- The `PIAGENT_HOME must be private (mode 0700)` error is masked by the
  generic CLI catch; make it a SafeConfigError.

## Phase 22: release follow-ups (approved 2026-11-05: "continue with proposed phase 22")

### Goal
Close the follow-ups from the 1.2.0 release gate:
- two defective holdout cases;
- an agent gap in alert-log and ADR discovery;
- a masked configuration error.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-22A eval cases | `wp-22a-holdout-fixes` | codex | `evals/` case files and scoring, eval unit tests and fixtures, `docs/` |
| WP-22B ADR discovery | `wp-22b-adr-discovery` | codex | `src/agent/index.ts` (system prompt), the `run_query` hints in `src/tools/index.ts`, tests, `docs/` |
| WP-22C safe config errors | `wp-22c-safe-config` | codex | `src/config/`, the CLI error boundary in `src/cli/index.ts`, tests, `docs/install.md` |
| Review | `review-wp-22x` | antigravity | each WP |

All three own disjoint files and run in parallel. None calls the LLM; the
coordinator runs every Strata measurement.

### WP-22A: holdout case defects and holdout hygiene
1. `hard-p21-history-signature`: the answer "No" (or "None") must count as
   Oracle `DEFAULTED = N`. Prefer a case-scoped fix: a truth SQL that
   selects a yes/no word, or a per-case cell alias. Do not add a global
   N=No equivalence.
2. `hard-p21-products-stats`: accept the correct YES/YES in a vertical
   attribute table, either by changing the truth mode or by scoped scorer
   support with tests. A global change needs the full archive replay.
3. WP-22B targets the two agent gaps, so those cases can no longer serve as
   blind holdout:
   - move `hard-p21-alert-levels` and `hard-p21-problem-identity` to `dev`;
   - write two fresh blind holdout cases on the same skills, with different
     targets, dates or wording (for example, alert messages on d1 for another
     day; ADR problems with their last incident on p1).

   Never run the agent on them.
4. Run an offline replay over `eval-archive` and `needlefish/evals/results`
   that lists every flip, with zero unjustified flips. Run `validate-hard`
   live.

### WP-22B: alert-log and ADR discovery
In the release gate, the agent:
- searched user tables for "alert messages" instead of the alert log;
- claimed ADR problem keys are visible only in adrci.

Add short, general guidance. Oracle's own alert log, incidents and problems
are readable through `V$DIAG_ALERT_EXT`, `V$DIAG_INCIDENT` and
`V$DIAG_PROBLEM`. This applies whenever a question mentions alert log or
alert messages, ORA- errors, incidents, problems or ADR. Do not name eval
cases or answers.

Optionally add a `run_query` hint. It fires when a user-table search for
`%ALERT%` or `%MESSAGE%` returns nothing, or when a query uses an ADR column
name that does not exist.

Keep the added prompt under about 60 tokens and report the exact delta.

Gate: A/B 4×4 alternating against master:
- p18;
- the two moved dev cases;
- dev, holdout ×3, regression and MVP.

Pass criteria:
- the moved cases improve;
- no suite regresses beyond noise;
- token change is reported.

### WP-22C: safe configuration errors
The generic CLI catch hides fixed, safe configuration guidance. One example
is `PIAGENT_HOME must be private (mode 0700)`.
- Audit every error thrown by `src/config/` and the CLI preflight.
- Messages with fixed text that contain no paths, values or secrets become
  `SafeConfigError` subclasses or instances. Construction stays fixed: no
  interpolated input.
- Everything else stays generic.
- Include a unit test that lists each safe message, and an end-to-end
  subprocess test for the mode-0700 case.

### Gate
- WP-22A and WP-22C: tests and validation.
- WP-22B: the A/B above.
- Then push to `main` with a 1.2.1 patch version. The `v1.2.1` tag is pushed
  only if the owner says so.

### Results (2026-11-05, shipped as 1.2.1)
- **WP-22A** (`9d9d3ab`), approved by antigravity with no findings:
  - case-scoped fixes for history-signature and products-stats;
  - alert-levels and problem-identity moved to dev;
  - two new blind holdout cases, `hard-p21-alert-levels-d1` and
    `hard-p21-problem-last-incident-p1`;
  - the replay covered 561 files and 12,858 records: 6 justified flips
    (fail to pass) and 0 elsewhere;
  - suite counts: 123 cases (30 dev, 24 holdout, 21 regression, 48 challenge).
- **WP-22C** (`045947b`), approved: an audited, literal-only catalog of
  `SafeConfigError` messages across `src/config/` and the CLI preflight.
  Native and unexpected errors stay generic.
- **WP-22B** (`6fbeef7`), approved: a one-line ADR and alert-log prompt
  hint of 166 characters (about 56 tokens), with no `run_query` hint.
- **Gate:** archived in `eval-archive/phase22/gate-22b`. A was master at
  `045947b`; B was master plus WP-22B. The table shows the B-minus-A change.

  | Suite | Pass rate | Tokens per case |
  |---|---|---|
  | p18 ×4 | -0.04 (CI -0.25 to 0.17) | -5,011 |
  | p16 ×4 | 0.00 | -1,710 |
  | dev ×4 | +0.01 | -1,963 |
  | holdout ×3 | 0.00 | +141 |
  | regression | 21/21 on both sides | |
  | MVP | +1 case (chat-target-pin) | |

  - The moved cases improved: problem-identity went from 3/4 to 4/4 and
    alert-levels from 1/4 to 2/4. Tokens on them dropped by about half.
  - The only per-case dip was p18 failed-job, from 4/4 to 2/4. It is a scorer
    false negative: both answers named the right job and constraint, but
    quoted the raw alert text `SHOPAPP"."NIGHTLY_PURGE_JOB` or split the row.
    It is a follow-up for the next eval WP.
- **Release tests:** typecheck clean, 1,320 unit, 52 browser and 55/55
  integration with Strata.
- **Remaining follow-up:** alert-levels on p1 is still 2/4.
- The v1.2.1 tag waits for the owner.

## Phase 23: sessions, blocking and waits (approved 2026-11-05: "tag v1.2.1 and apply the grants and start phase 23")

### Goal
`piagent sessions`: a read-only live view of who is blocking whom. It shows:
- active sessions;
- blocking chains;
- top wait events since startup;
- long-running transactions;
- for each blocker, its SQL_ID, linked to `piagent sql`.

It never uses ASH or AWR (Diagnostics Pack licence). The SQL policy already
rejects them.

### Access
- d1 (HARNESS_LAB) already reads every view below.
- `docs/grants-request-2026-11-05-sessions.sql` was applied on p1 as
  `/ as sysdba` after checking DB name, version and grantee (PRODCDB 19c,
  HARNESS_RO): 8 × "Grant succeeded". `DBA_TAB_PRIVS` shows all eight.
  The views are V_$SESSION_WAIT, V_$WAIT_CHAINS, V_$TRANSACTION,
  V_$LOCKED_OBJECT, V_$SYS_TIME_MODEL, V_$EVENT_NAME, DBA_BLOCKERS and
  DBA_WAITERS. p1 already read V$SESSION, V$LOCK and V$SYSTEM_EVENT.
- No hard eval case referenced these views. `validate-hard` passed live
  after the grants (101 truth queries for 123 cases).
- Never: ASH, AWR or `DBA_HIST_*` (Diagnostics Pack licence),
  `V$SQL_BIND_CAPTURE.VALUE_STRING`, or any statement that kills,
  disconnects or alters a session. Advice such as `ALTER SYSTEM KILL SESSION`
  is prose, prefixed "For a human DBA:", and is never executed.

### Naming
`src/web/sessions.ts` already holds web *chat* conversations. The new
database view is called "sessions" in the CLI and docs, but its web files are
named `dbSessions` (`src/web/dbSessions.ts`, `/api/db-sessions`,
`src/web/static/dbsessions.js`), so the two never collide.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-23A core and CLI | `wp-23a-sessions` | codex | new `src/sessions/`, the `sessions` command registration in `src/cli/index.ts`, tests, `docs/sessions.md` |
| WP-23B triage and report | `wp-23b-sessions-integration` | codex | `src/triage/` (new `sessions.ts` plus wiring), opt-in `sessions` section and trends in `src/report/`, tests, docs |
| WP-23C web Sessions tab | `wp-23c-sessions-web` | codex | `src/web/dbSessions.ts`, the `/api/db-sessions` route in `src/web/server.ts`, `src/web/static/dbsessions.js` plus tab wiring in `index.html`/`app.js`/`app.css`, browser tests, `docs/img/` |
| WP-23D p23 evals | `wp-23d-p23-evals` | codex | `evals/cases-hard/phase23-sessions.json`, scoped scorer changes, eval tests, `docs/` |
| Review | `review-wp-23x` | antigravity | each WP |

Order: WP-23A and WP-23D run first, in parallel. WP-23B and WP-23C start
from master after WP-23A merges, and code only against its exported API.

### WP-23A: sessions core and CLI (branch `wp-23a-sessions`)
API (`src/sessions/index.ts`):
- `readSessionActivity(session, { sections?, includeBackground?, minTxSeconds?, topWaits? })`
  returns `SessionActivity`:
  `{ status: 'ok'|'partial'|'failed'; target; capturedAt (UTC ISO); self: { sid };
  sections: { active; blocking; waits; timeModel; transactions };
  findings: SessionFinding[] }`.
- Each section is `{ status: 'ok'|'unavailable'|'skipped'; rows; evidence: Check; note? }`.
  A missing grant (ORA-00942 or ORA-01031) makes that section `unavailable`
  and never fails the whole run.
- `SessionFinding = { id; severity: 'high'|'medium'|'low'|'info'; subject; detail; sqlId?; advice }`.
- `renderSessionsMarkdown(activity)` and `SessionsUsageError` (CLI exit 2).
- Export pure helpers for B and C: `buildBlockingTree(rows)` and
  `classifyWaits(rows)`.

Sections:
1. **Active sessions.** Read from `V$SESSION`, with user sessions only
   (`--all` adds background sessions). The agent's own session is excluded
   via `SYS_CONTEXT('USERENV','SID')`. Show status, `SQL_ID` or
   `PREV_SQL_ID`, event, wait class, state, seconds in wait, last call time,
   logon time and blocker.
2. **Blocking tree.**
   - Read `V$WAIT_CHAINS` first, falling back to `V$SESSION.BLOCKING_SESSION`
     and `FINAL_BLOCKING_SESSION`.
   - Each waiter shows the locked object through `V$LOCKED_OBJECT` and
     `ROW_WAIT_OBJ#` → `DBA_OBJECTS`, falling back to `ALL_OBJECTS`, plus
     the lock type and mode decoded to names.
   - Roots are the final blockers.
   - Cycles mean a deadlock in progress: guard against them, mark them, and
     cap the depth at 10.
3. **Waits since startup.**
   - Read `V$SYSTEM_EVENT`, excluding wait class Idle.
   - Group by wait class with the top N events (default 10, at most 50),
     each with its % of non-idle wait time and average ms.
   - Add DB time, DB CPU and background time from `V$SYS_TIME_MODEL`.
   - Label clearly that these are cumulative since instance startup, not
     current.
4. **Long transactions.**
   - Read `V$TRANSACTION` joined to `V$SESSION` (`TADDR = ADDR`).
   - Show start time in UTC, age, used undo blocks and records, SID, user
     and SQL_ID.
   - Threshold `--min-tx-seconds` (default 300, range 0–86400).

Findings:
- a blocker whose waiters waited more than 60 s (high);
- an INACTIVE blocker holding locks, i.e. idle in transaction (high);
- a transaction older than the threshold (medium);
- a non-idle wait class that takes over 50% of non-idle time since startup
  (info);
- a deadlock cycle (high).

Every finding with a SQL_ID suggests `piagent sql --target T --sql-id X`.

Data rules:
- Allowlist the V$SESSION columns:
  - identity: SID, SERIAL#, USERNAME, OSUSER, MACHINE, PROGRAM, TYPE,
    LOGON_TIME;
  - state: STATUS, STATE, EVENT, WAIT_CLASS, SECONDS_IN_WAIT,
    WAIT_TIME_MICRO, LAST_CALL_ET;
  - SQL: SQL_ID, PREV_SQL_ID, SQL_CHILD_NUMBER;
  - blocking: BLOCKING_SESSION, BLOCKING_SESSION_STATUS,
    FINAL_BLOCKING_SESSION, ROW_WAIT_OBJ#, TADDR, PADDR.
- Never select MODULE, ACTION, CLIENT_INFO, CLIENT_IDENTIFIER, P1TEXT
  values, SQL text or bind values.
- A parser-based unit test scans every SQL string in `src/sessions/`, as in
  WP-20A. It must reject ASH, AWR, `DBA_HIST_`, the forbidden columns, and
  any non-SELECT.
- A snapshot is a short sequence of queries, not one consistent read. Say
  so in the output, and tolerate a blocker that vanished between queries.

CLI:
- `piagent sessions --target T [--section a,b] [--all] [--min-tx-seconds N] [--top N] [--json | --markdown]`.
- Markdown is the default. Findings come first, then sections in the
  sqlperf and security style: readable labels, a blocking tree as an indented
  list, and collapsed empty sections.
- Exit 0 even when there are findings. Exit 2 for usage errors. Exit 1 for a
  failed connection or for every section being unavailable.

Tests:
- unit fixtures for:
  - no blocking;
  - a chain of 3;
  - two roots;
  - a deadlock cycle;
  - a vanished blocker;
  - an idle-in-transaction blocker;
  - a missing grant per section;
  - the V$WAIT_CHAINS fallback.
- integration on d1 and p1 (likely no blocking; assert the structure and
  that every section is `ok` on both);
- live smokes in `docs/sessions.md`.
- No test may create locks or transactions: no DML, ever.

### WP-23B: triage and report integration (branch `wp-23b-sessions-integration`)
Triage:
- When an issue mentions hang, hung, lock, locked, blocked, blocking,
  waiting, enqueue, deadlock, "stuck", or slowness with no named SQL_ID,
  `triage` adds a sessions evidence block.
- The block holds the blocking tree, top waits and long transactions, via
  `readSessionActivity`.
- It ranks:
  - a blocking chain or deadlock above other causes;
  - an idle-in-transaction blocker as a named likely cause;
  - otherwise the dominant non-idle wait class as context.
- Blocker SQL_IDs feed the existing SQL evidence path, capped at 2.
- Keep existing triage outputs byte-identical when no keyword matches.
  Snapshot tests check this.

Report:
- an opt-in `sessions` section (`--sections sessions`). The default
  checks stay byte-identical.
- history trends: non-idle wait seconds per class (deltas between reports
  when the instance startup time is unchanged), the blocker count and the
  long-transaction count.
- The diff marks wait-class shifts.

Chat:
- `/triage` inherits the triage change.

Out of scope:
- No agent prompt change in this WP. If the coordinator later adds one, it
  is gated A/B.

### WP-23C: web Sessions tab (branch `wp-23c-sessions-web`)
`/api/db-sessions`:
- same auth, loopback, single-flight and 1 MiB rules as `/api/security`;
- target and options validated server-side.

The tab:
- a findings summary;
- the blocking tree drawn as a graph with `graphLayout.js`, roots on the
  left and edges labelled by lock or event, with a list fallback;
- a top-waits bar view by class (no new dependencies) and an events table;
- a long-transactions table;
- an active-sessions table, filterable by status and wait class;
- a manual refresh button and a "captured at" UTC time. There is no
  auto-refresh polling.
- Each blocker's SQL_ID links to the SQL tab.
- Markdown export, light and dark themes, and phone width with no
  horizontal page scroll.
- Fresh live screenshots on d1 and p1.
- Browser tests use fixtures with a chain and a cycle.

### WP-23D: p23 evals (branch `wp-23d-p23-evals`)
`evals/cases-hard/phase23-sessions.json`, suite `p23`, with 5 or 6
challenge cases. Truth must be stable between a validation run and a gate
run minutes later. For example:
- the top non-idle wait class since startup;
- the wait class of a named event;
- how many events Oracle defines in a given wait class;
- whether any session is blocked right now (empty truth means "none"; use
  `skipWhenTruthEmpty` or an explicit empty-answer contract);
- the user and SQL_ID of the oldest open transaction, with
  `skipWhenTruthEmpty`.

Rules:
- Avoid truth that counts the agent's own sessions or the harness's own
  connections.
- Questions name no tools or views. Truth SQL never selects the forbidden
  columns.
- The validator runs each truth twice, 60 s apart, and flags unstable
  cases.
- Any scorer change is scoped to `hard-p23-`, with an archive replay showing
  zero flips elsewhere.
- The worker does not run the agent; the coordinator measures in the gate.

### WP-23F: sessions output polish (branch `wp-23f-sessions-polish`)
Owns `src/sessions/` rendering, findings advice and filters, plus tests and
`docs/sessions.md`. The exported types and function signatures stay
unchanged, because WP-23B and WP-23C code against them.

The coordinator's live smoke on p1 found four problems:
1. **Advice.** The wait-class finding reused the blocker advice ("inspect the
   session and application transaction owner"). Each finding kind needs its
   own fitting advice. A dominant wait class gets class-specific prose, for
   example:
   - System I/O: redo/control file and DBWR storage latency;
   - User I/O: top SQL by physical reads via `piagent sql`;
   - Concurrency: library cache or latch contention, hard parsing.

   It must also state that the figure is cumulative since startup.
2. **Idle sessions.** Sessions whose current wait class is Idle, such as
   `jobq slave wait` and `SQL*Net message from client`, are excluded from
   *active* by default even when STATUS is ACTIVE. `--all` includes them.
   This filter must not drop a blocker: a session that blocks someone is
   always shown.
3. **Table width.** The default Markdown table shows about 8 columns: SID,
   user, status, SQL_ID, event, wait class, seconds in wait and blocker.
   Hide columns that are empty in every row. `ROW_WAIT_OBJ# = -1` renders
   blank. JSON keeps every field.
4. **Section headers.** Drop the "Status: ok." line for ok sections. Show the
   status only when a section is unavailable or skipped, with its note.

### Gate
- If no agent prompt changes: single side on merged master, with p23 ×2,
  the full suites (dev, holdout ×3, regression, MVP), p18 and p16.
- Any prompt change gets A/B 4×4.
- Phase 23 ships with phase 24 as 1.3.0. Push main after phase 23 only if
  the gate is clean. Tag only when the owner asks.

## Phase 24: space and capacity (approved 2026-11-06: "continue with phase 24 and apply the grants")

### Goal
`piagent space --target T` is a read-only capacity report. It covers:
- tablespace usage with autoextend-aware headroom;
- top segments, with LOB segments mapped to their table and column;
- temp, undo and online redo;
- recovery area (FRA) usage;
- growth trends and days-to-full from report history.

It reports and advises only. Every example statement (such as `ALTER
TABLESPACE … ADD DATAFILE`) is prose, prefixed "For a human DBA:", and is
never executed.

### Access
- d1 (HARNESS_LAB) already reads every view below through its roles.
- `docs/grants-request-2026-11-06-space.sql` was applied on p1 as
  `/ as sysdba` after checking DB name, version and grantee (PRODCDB 19c,
  HARNESS_RO): 12 × "Grant succeeded", and `DBA_TAB_PRIVS` shows 12/12.
  - The views are DBA_TEMP_FILES, DBA_LOBS, DBA_UNDO_EXTENTS,
    V_$SORT_USAGE, V_$SORT_SEGMENT, V_$UNDOSTAT, V_$RECOVERY_FILE_DEST,
    V_$FLASH_RECOVERY_AREA_USAGE, V_$LOG, V_$LOGFILE, V_$TEMPFILE and
    V_$DATAFILE.
  - V$TEMPSEG_USAGE is a public synonym for V_$SORT_USAGE.
  - V$SORT_SEGMENT, V$DATAFILE and V$LOGFILE were added to the proposal
    after the probe found p1 lacked them.
  - p1 already read DBA_TABLESPACES, DBA_DATA_FILES, DBA_FREE_SPACE,
    DBA_TABLESPACE_USAGE_METRICS, DBA_SEGMENTS and V$PARAMETER.
- No hard eval case referenced these views. `validate-hard` passed live after
  the grants (107 truth queries for 129 cases).
- Not granted and never used: DBA_EXTENTS (slow and unnecessary), ASH/AWR
  and `DBA_HIST_*`.
  - V$LOG_HISTORY is not granted on p1. If a log-switch rate is shown, it is
    `unavailable` there.

### Ordering
Phase 23's WP-23B owns `src/report/` and `src/triage/`, and WP-23C owns the
web files. So:
- WP-24A and WP-24D start now;
- WP-24B starts after WP-23B merges, and WP-24C after WP-23C merges.

| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-24A core and CLI | `wp-24a-space` | codex | new `src/space/`, the `space` command registration in `src/cli/index.ts`, tests, `docs/space.md` |
| WP-24B report and drift | `wp-24b-space-report` | codex | opt-in `space` section, growth trends and days-to-full in `src/report/`, the `drift --scope space` in `src/drift/`, tests, docs |
| WP-24C web Space tab | `wp-24c-space-web` | codex | `src/web/space.ts`, the `/api/space` route, `src/web/static/space.js` plus tab wiring, browser tests, `docs/img/` |
| WP-24D p24 evals | `wp-24d-p24-evals` | codex | `evals/cases-hard/phase24-space.json`, the p24 selector, scoped scorer changes, eval tests, `docs/` |
| Review | `review-wp-24x` | antigravity | each WP |

### WP-24A: space core and CLI (branch `wp-24a-space`)
API (`src/space/index.ts`):
- `readSpaceUsage(session, { sections?, top?, owner?, includeOracleMaintained? })`
  returns `SpaceReport`:
  `{ status: 'ok'|'partial'|'failed'; target; capturedAt (UTC ISO);
  sections: { tablespaces; segments; temp; undo; redo; recovery };
  findings: SpaceFinding[] }`.
- Each section is `{ status: 'ok'|'unavailable'|'skipped'; rows; evidence: Check; note? }`.
  ORA-00942 or ORA-01031 makes that section `unavailable` and never fails
  the run.
- `SpaceFinding = { id; severity: 'high'|'medium'|'low'|'info'; subject; detail; advice }`.
- `renderSpaceMarkdown(report)` and `SpaceUsageError` (exit 2).
- Pure helpers exported for WP-24B and WP-24C: `tablespaceHeadroom(files)`
  and `formatBytes(n)`.
- JSON always carries raw bytes. Markdown uses binary units (KiB, MiB, GiB,
  TiB), labelled.

Sections:
1. **Tablespaces.** Permanent, undo and temp, from DBA_TABLESPACES,
   DBA_DATA_FILES, DBA_TEMP_FILES, DBA_FREE_SPACE and
   DBA_TABLESPACE_USAGE_METRICS (blocks × block size). For each tablespace:
   - contents, bigfile, file count;
   - allocated, used and free bytes;
   - autoextend max (the sum per file of `MAXBYTES` when autoextensible,
     else `BYTES`);
   - used % of allocated and used % of max;
   - headroom in bytes.
2. **Top segments.** Top N by bytes from DBA_SEGMENTS (default 20, range
   1–100), sorted with `FETCH FIRST`.
   - Oracle-maintained owners are excluded unless `--owner` names one or
     `--all` is given.
   - LOBSEGMENT and LOBINDEX rows are mapped through DBA_LOBS to
     `owner.table.column`. Partitions keep their partition name.
3. **Temp.**
   - tempfile size and max, plus V$SORT_SEGMENT total, used and free;
   - current consumers from V$TEMPSEG_USAGE joined to V$SESSION: SID, user,
     SQL_ID, segment type and bytes. Never SQL text.
4. **Undo.**
   - undo tablespace size and max;
   - DBA_UNDO_EXTENTS bytes by status (ACTIVE, UNEXPIRED, EXPIRED);
   - V$UNDOSTAT over the last 24 h: max query length, ORA-01555
     (`SSOLDERRCNT`) and no-space (`NOSPACEERRCNT`) counts, and tuned undo
     retention against the `undo_retention` parameter.
5. **Redo.** V$LOG groups with thread, size, members, status and archived,
   plus V$LOGFILE members with type and status.
6. **Recovery area.**
   - V$RECOVERY_FILE_DEST: limit, used, reclaimable and file count;
   - V$FLASH_RECOVERY_AREA_USAGE per file type;
   - if no recovery area is configured, the section is `ok` with the note
     "no recovery area configured".

Findings:

| Finding | Severity |
|---|---|
| Permanent tablespace above 95% of max | high |
| Permanent tablespace above 85% of max | medium |
| Non-autoextend tablespace above 85% of allocated | medium |
| Temp above 80% used right now | medium |
| ORA-01555 in the last 24 h | medium |
| Undo no-space errors | high |
| FRA (used − reclaimable) above 90% of limit | high |
| FRA (used − reclaimable) above 80% of limit | medium |
| Fewer than 3 redo groups, or unequal group sizes | low |
| A single member per redo group | info |

Each finding carries prose advice, and any example statement is prefixed
"For a human DBA:".

Data rules:
- SELECT only, under the same parser-based scan test as `src/sessions/`.
  It must reject DBA_EXTENTS, ASH/AWR, `DBA_HIST_` and any non-SELECT.
- File paths from DBA_DATA_FILES, V$LOGFILE and V$RECOVERY_FILE_DEST are
  shown. They are not secrets.

CLI:
- `piagent space --target T [--section a,b] [--top N] [--owner X] [--all] [--json | --markdown]`.
- Markdown is the default, styled like `sessions` after WP-23F:
  - findings first;
  - readable labels and compact tables;
  - usage shown as a percentage with a text bar (for example
    `███████░░░ 72%`);
  - no "Status: ok" noise;
  - empty sections collapsed.
- Exit 0 even with findings, 2 for usage errors, and 1 for a connection
  failure or every section being unavailable.

Tests:
- unit fixtures:
  - autoextend headroom (mixed autoextend files, `MAXBYTES` below `BYTES`,
    bigfile);
  - LOB mapping;
  - no FRA configured;
  - a missing grant per section;
  - each finding threshold at its exact boundary.
- integration on d1 and p1, with every section `ok` on both;
- live smokes in `docs/space.md`, numbers cross-checked against independent
  SELECTs.

### WP-24B: report and drift (branch `wp-24b-space-report`, after WP-23B merges)
Report:
- an opt-in `space` section (`--sections space`). The default checks stay
  byte-identical.
- history trends: per-tablespace used bytes, temp and FRA usage.
- days-to-full: a linear fit over at least 3 points spanning at least
  24 hours, against the autoextend max. It shows "not enough history"
  otherwise, and "not growing" for a flat or negative slope.
- The report diff marks tablespaces whose growth rate changed.

Drift: `drift --scope space` compares:
- tablespace sets with contents and bigfile;
- autoextend max;
- redo group count and size;
- whether FRA is configured, and its limit.

Usage percentages are not compared, because they always differ. Exit 3 on
drift, as for the other scopes.

No new SQL: it reuses `readSpaceUsage`.

### WP-24C: web Space tab (branch `wp-24c-space-web`, after WP-23C merges)
Also fix the WP-23C review minor: the arrow-key `tabs` array in `src/web/static/app.js` must match the DOM tab order in `index.html`, Space included. Add a browser test for this.
`/api/space`:
- same auth, loopback, single-flight and 1 MiB rules as the other tabs.

The tab:
- a findings summary;
- tablespace usage bars (used, allocated and max as stacked segments, with
  thresholds marked);
- top segments, filterable by owner;
- temp, undo, redo and FRA cards;
- Markdown export.

No new dependencies. Light and dark themes, at 1280 px and at 390 px with no
horizontal page scroll. Fresh live screenshots on d1 and p1, which the worker
views itself.

### WP-24D: p24 evals (branch `wp-24d-p24-evals`)
`evals/cases-hard/phase24-space.json`, suite `p24`, with 5 or 6 challenge
cases. Truth must be stable over the gate window, so prefer configuration
and identity over live usage. For example:
- the largest segment in SHOPAPP and its type;
- a tablespace's autoextend maximum;
- redo group count and size per group;
- the recovery area limit, or the fact that none is configured;
- the undo tablespace and its retention setting;
- the table and column that own the largest LOB segment.

Rules:
- If a byte value can drift, score it with a tolerance scoped to
  `hard-p24-`.
- Questions name no tools or views. Truth is SELECT only.
- Validate each truth twice, 60 s apart.
- Any scorer change is scoped to `hard-p24-`, with an archive replay
  showing zero flips elsewhere.
- The worker does not run the agent.

### WP-24E: space and sessions output polish (branch `wp-24e-space-polish`)
Owns rendering and findings in `src/space/` and the one-line fix in
`src/sessions/`, plus tests and docs. Exported types and signatures stay
unchanged.

The coordinator's live smoke on p1 and the WP-23F review found:
1. **Blank lines.** Each section heading in `space` Markdown is followed by
   a double blank line. Use one.
2. **Recovery area.** The note "no recovery area configured" is followed by
   a redundant "No rows" `<details>` block. When a section has a note and no
   rows, show the note only. Apply this to every section.
3. **Archive log mode.** `V$DATABASE.LOG_MODE` (readable on both targets;
   verify) appears in the Redo section. It carries:
   - an info finding when the database is in NOARCHIVELOG mode: online
     redo is not archived, so point-in-time recovery is not possible;
   - a high finding when the database is in ARCHIVELOG mode with no
     recovery area and no `log_archive_dest_n` set.

   The JSON gains an additive field, `redo.logMode`.
4. **Sessions trailing space.** `Status: skipped. ` ends with a trailing
   space when there is no note (WP-23F review minor).

### WP-24F: eval scorer and case fixes from the phase 23 gate (branch `wp-24f-eval-fixes`)
Owns `evals/` scoring, cases and tests, plus `docs/`.

The gate's first challenge run (archived in `eval-archive/phase23/gate-23`)
turned up two eval defects:
1. **Slash values never match.** `rowMatches` never matches a truth cell
   that contains `/`, such as `System I/O` or `User I/O`. The coordinator
   re-scored a clean table, `| System I/O | 40 |`, and it still fails, while
   `Idle` passes.
   - Find the root cause, which is probably cell tokenizing or normalization
     around `/`, and fix it generally. Slash-containing values must match
     exactly and must not match partial text: `I/O` alone must not match
     `User I/O`.
   - Run the archive replay over `eval-archive` and
     `needlefish/evals/results`, list every flip, and justify each one.
2. **`hard-p24-d1-redo-layout` truth.** Every truth row includes
   `COUNT(*) OVER ()`, so a correct per-group table plus a separate stated
   total can never match. Remove the total from the row truth and check it
   another way, for example a scoped required fact naming the total of 3.
   Update the validator record.

Then re-score the gate's p23 and p24 records with the fixed scorer, and
report the before and after results.

### WP-24G: release-smoke polish (branch `wp-24g-release-polish`)
The coordinator ran a package smoke of 1.3.0 from the tarball, in a fresh
prefix and home. Fix the following:
1. **Triage embedding** (`src/triage/`): embedded sessions (and space, if
   used) Markdown must nest under the triage heading. That means no `#` H1
   inside triage output: headings are demoted and the duplicate title is
   dropped. Sections that triage did not request are omitted rather than
   shown as "Status: skipped. No rows".
2. **Empty sections** (`src/sessions/`, `src/space/`): an empty section is a
   single plain line, "None in this snapshot.", instead of a `<details>`
   block. Single blank lines everywhere: the sessions waits section still
   has a double blank line.
3. **Command help** (`src/cli/index.ts`):
   - the `drift` description lists `space` among the scopes;
   - `init`, `targets`, `doctor`, `ask` and `chat` get one-line
     descriptions.

   Add a test that every command has a non-empty description and that the
   drift description names every supported scope.
4. **Secret-directory mismatch** (`src/config/` or the session provider's
   config check): "PIAGENT_SECRET_DIR must match config.secretDir" becomes a
   fixed-literal `SafeConfigError` from the WP-22C catalog, worded so it
   names no path. The CLI then prints guidance instead of "piagent failed".
   Audit the session provider's other config-derived throws in the same
   way.

Byte-identical guarantees still hold. Default report and triage output for
issues without session keywords stays unchanged; update snapshots only for
the intended changes.

### Gate
- Single side on merged master: p24 ×2, p23 ×2, the full suites, p18 and
  p16.
- A/B if any agent prompt changes.
- Phases 23 and 24 together make 1.3.0. Bump the version and tag only when
  the owner asks.

## Phases 23 and 24 results (2026-11-06, shipped as 1.3.0)

**Merges.** Antigravity approved every WP:
- WP-23A, 23D and 23E;
- WP-23F, then WP-24A and 24D;
- WP-24E;
- WP-23C, after coordinator screenshot fixes for phone-width tables and the
  toolbar;
- WP-23B, after a REQUEST CHANGES for keyword over-triggering on "locked
  account" and wait-context ranking; fixed and re-reviewed;
- WP-24C, with the overflow-only scroll hint;
- WP-24B, with the `--out` history directory;
- WP-24F;
- WP-24G.

**Grants on p1.** The sessions grants (8 views) and the space grants
(12 views) were applied as sysdba. `validate-hard` passed after each.

**Gate.** Archived in `eval-archive/phase23/gate-23`, single side on
dd5d3df. No agent prompt or tool changed in either phase.

| Suite | Result | v1.2.0 release |
|---|---|---|
| dev | 30/30 and 30/30 | |
| holdout ×3 | 66/69 | 57/69 |
| regression | 21/21 | |
| MVP | 39/39 | |
| challenge | 53/60 and 52/60 as scored; 55/60 and 54/60 after WP-24F | |

Every refusal passed.

- **WP-24F eval fixes.**
  - A scorer bug: `rowMatches` split named bindings on every `/`, so
    `System I/O` and `User I/O` could never match.
  - A case defect: `hard-p24-d1-redo-layout` put the total count in every
    truth row.
  - The replay over 14,227 records changed 4 records, all justified
    fail-to-pass.
- **Remaining p24 miss.** `hard-p24-p1-autoextend-max` is a genuine agent
  error: it multiplied MAXBYTES by the block size.
- **Older challenge misses.** These rose from 5 to 10 over 96 runs, mostly
  in p19. An A/B of the 4 p19 cases, 3 alternating pairs (archived in
  `eval-archive/phase23/gate-p19ab`), gave v1.2.1 6/12 and master 7/12.
  So this is live shared-pool and statistics drift seen by both versions,
  not a regression.

**Release tests on cdeeac9.**
- Typecheck clean; 1,606 unit tests and 71 browser tests pass.
- Integration: 62/62 with Strata.
- Package smoke from the tarball, with a fresh prefix and a 0700 home:
  - doctor ok on Strata and both targets;
  - sessions, space, `report --sections sessions,space`,
    `drift --scope space` (exit 3), triage (headings nested) and ask
    (correct redo answer) all work;
  - every `--help` page has a description.

**Follow-ups.**
- When `PIAGENT_SECRET_DIR` in `.env` still holds the `init` placeholder,
  commands fail with the generic message, because the password-file read is
  a native ENOENT. Detect the placeholder in `loadConfig` and raise a
  `SafeConfigError`, as WP-21D does for the LLM key file.
- `hard-p24-p1-autoextend-max`: the agent misreads MAXBYTES.
- Make the p19 case truths robust to the agent's own V$SQL pollution and to
  nightly statistics times.

## Phase 28: owner-approved real targets, CDB/PDB (approved 2026-11-06; runs before 25–27)

**Owner request (2026-11-06).** "I want to use the app in real databases today",
then "create the phase and run it today, they are CDB/PDB". Real targets are
Oracle 19c multitenant: CDB with pluggable databases.

**Problem.** The two lab targets are hard-coded in `src/config/approvedTargets.ts`.
`loadConfig` requires exactly those two, and `createSessionProvider` accepts only
`HARNESS_LAB`/`HARNESS_RO`. The product cannot reach any other database.

**Coordinator contract changes (done in this commit).**
- `TargetEnvironment` gains `"production"`.
- `DatabaseIdentity` gains optional `containerName` (`USERENV CON_NAME`).
- AGENTS.md rule 1: the product may connect to owner-approved targets.
  Agents and workers still connect only to the two labs, plus the 19c-gate
  FREEPDB1 refusal test.

**Safety model.** These layers stay as they are:
- the SQL policy: one SELECT/WITH, built-in functions only;
- `SET TRANSACTION READ ONLY` plus rollback around every query;
- the 19c gate;
- secrets read only from `PIAGENT_SECRET_DIR`;
- Strata only;
- the audit rules.

New:

1. **The owner's private targets file is the allowlist.**
   - Where it is found: `PIAGENT_TARGETS_FILE`, else
     `$PIAGENT_HOME/targets.json` if it exists, else the packaged lab file.
   - It must be a regular file owned by the current user, not group- or
     other-writable, inside the existing private-home checks.
   - It holds 1–20 targets with strict validation:
     - name `^[a-z0-9][a-z0-9-]{0,62}$`, unique;
     - host is a DNS name or IP, with no `/ @ ? # :` and no spaces
       (IPv6 in brackets is allowed);
     - port 1–65535;
     - service name `^[A-Za-z0-9][A-Za-z0-9_.$#-]{0,127}$`;
     - username is an Oracle identifier, optionally `C##`;
     - `passwordFile` is a basename;
     - `defaultSchema` is an identifier;
     - environment is one of the enum values;
     - `description` is non-empty;
     - `logTables` is validated as today.
   - Usernames on a fixed deny list are refused. The list covers SYS,
     SYSTEM, SYSBACKUP, SYSDG, SYSKM, SYSRAC, AUDSYS, DBSNMP, XDB,
     GSMADMIN_INTERNAL, OUTLN, LBACSYS, DVSYS, MDSYS, CTXSYS, ORDSYS,
     WMSYS, OJVMSYS, APPQOSSYS, ANONYMOUS and the lab's HARNESS_APP and
     SHOPAPP. Refusal happens at load, and again at connect.
   - The packaged lab file keeps its exact pinned values when it is the
     source. That keeps the dev and eval safety unchanged.
2. **Connect-time account check.** It fails closed, runs after the 19c gate
   and before any feature query, and only ever SELECTs.
   - `SESSION_USER` must equal the configured username, with no proxy,
     and `ISDBA` must be FALSE.
   - Every row of `SESSION_PRIVS` must be on the allowlist:
     - CREATE SESSION;
     - ALTER SESSION;
     - SET CONTAINER;
     - SELECT ANY DICTIONARY;
     - SELECT ANY TABLE;
     - READ ANY TABLE;
     - SELECT ANY SEQUENCE.
   - No direct or enabled-role object privilege other than SELECT, READ or
     EXECUTE may exist, and EXECUTE only on objects owned by
     Oracle-maintained users. Sources are `USER_TAB_PRIVS` and
     `ROLE_TAB_PRIVS`.
   - If the account fails, the error names the offending privilege
     names. Privilege names are not secret.
   - If the check itself cannot run, the connection is refused.
   - Both lab accounts must pass. If one does not, report it; do not widen
     the allowlist without coordinator approval.
   - **Coordinator decision (2026-11-06).** WP-28A found that d1
     `HARNESS_LAB` holds FLASHBACK on 14 SYS objects through
     `SELECT_CATALOG_ROLE`. FLASHBACK is read-only (flashback query), so it
     is allowed under the same rule as EXECUTE: only on objects owned by
     Oracle-maintained users. FLASHBACK on any other owner is still refused.
3. **CDB/PDB.**
   - Connect through the PDB service name with Easy Connect. Report
     `containerName`.
   - Refuse `CDB$ROOT` (`CON_ID` 1). The message tells the owner to use the
     PDB service.
   - Non-CDB stays supported, because the labs are non-CDB.
   - Every fixed feature query must work in a PDB, or degrade to a clear
     "not available in a PDB / not granted" note. It must never fail the
     whole command.

**WP-28A: targets, account check and preflight.** Branch
`wp-28a-real-targets`. Owns `src/config/`, `src/oracle/`, `src/preflight/`
(new), and the `targets`, `doctor` and `init` wiring in `src/cli/`.
- The loader and session provider follow the rules above. Keep the
  `approvedEndpoints` override for the gate test only.
- `piagent targets` lists the configured targets and their source file.
- `piagent targets check --target X [--json] [--grants-sql]`:
  - connects;
  - prints version, CDB/PDB and container, user, and the account-check
    result;
  - probes each feature's views with `SELECT 1 … WHERE ROWNUM = 0`. The
    features are report sections, sessions, space, security, sql, alertlog,
    plsql and triage.
  - prints readable, missing or not-applicable per view.
  - `--grants-sql` prints the SELECT grant statements a DBA would run in
    that PDB for the missing views. It applies nothing.
- `doctor` checks every configured target.
- `init` writes a commented `targets.example.json` into the private home and
  never overwrites an existing file.
- Tests: unit tests for every validation rule, deny-list entry, privilege
  path, root refusal and file-permission case. Integration: both labs pass
  the account check and `targets check`.

**WP-28B: owner documentation and the PDB grant template.** Branch
`wp-28b-real-target-docs`. Owns `docs/real-targets.md` (new),
`docs/grants-template-pdb.sql` (new), `docs/grants.md`,
`docs/install.md`, `README.md` and `config/targets.example.json` (new).
- A step-by-step guide for using a 19c CDB/PDB today:
  - the DBA creates a PDB-local read-only account;
  - applies the template;
  - the owner writes the private targets file and the password file
    (mode 600);
  - runs `targets check`, then the deterministic commands, then `ask`.
- The template creates no objects. It uses placeholders `&pdb_name` and
  `&ro_user` and grants:
  - CREATE SESSION;
  - SELECT on exactly the views the product queries, the union of all
    grant files;
  - optionally `SELECT_CATALOG_ROLE` as a documented shortcut.
- The template never grants AWR/ASH, `DBA_HIST_`, `DBA_EXTENTS`,
  `UNIFIED_AUDIT_TRAIL`, `USER$` or any write or ANY privilege other than
  the allowlist.
- Explain what is untested: RAC, Data Guard standby, TCPS/wallets, other
  release updates. Explain that live PDB behaviour is unverified until the
  owner's first run.

**WP-28C: PDB audit of fixed feature SQL.** Branch `wp-28c-pdb-audit`.
Owns `src/report/`, `src/sessions/`, `src/space/`, `src/security/`,
`src/sqlperf/`, `src/alertlog/`, `src/triage/`, `src/plsql/`, `src/drift/` and
`src/tools/`, plus their tests.
- Audit every fixed query for 19c PDB semantics. Examples:
  - `V$DATABASE`/`V$LOG`/`V$ARCHIVED_LOG`/`V$RECOVERY_FILE_DEST` are
    CDB-wide;
  - `V$DIAG_ALERT_EXT` visibility differs in a PDB;
  - `DBA_DATA_FILES`/`DBA_TEMP_FILES` and undo depend on local undo;
  - `CON_ID` filtering;
  - `V$SESSION` and `V$SQL` are container-scoped.
- Label CDB-wide facts as such in the output.
- Make each section degrade to a clear note when a view is missing
  (ORA-00942/ORA-01031) or not meaningful in a PDB.
- Add unit tests with fake PDB identities and errors. Write
  `docs/wp-28c-pdb-audit.md` as a per-query table: query, PDB behaviour,
  change.
- No live PDB is available, so cite Oracle 19c documentation semantics.
  Mark live behaviour as unverified.

**Gate.**
- Typecheck, unit, browser and integration tests pass.
- Dev and regression eval suites ×1 and MVP show no regression. The agent
  path must not change.
- Coordinator smoke: both labs through a private targets file that copies
  them, plus refusal smokes: a deny-listed user, a root container, a widened
  account (simulated in unit tests only), and a bad file mode.
- Ship as 1.4.0 after owner confirmation.

## Phase 28 results (2026-11-06, shipped as 1.4.0)

**Merges.** Antigravity approved every WP.
- **WP-28B** (owner guide and PDB grant template): the minor fixes were
  made, covering the FLASHBACK wording and DEFINE placeholders.
- **WP-28A** (private targets, account check, preflight): the first live
  run found that d1 `HARNESS_LAB` holds FLASHBACK on SYS objects through
  `SELECT_CATALOG_ROLE`. The coordinator decision allows FLASHBACK on
  Oracle-maintained owners. Review minors were then fixed: case-insensitive
  root check, stderr, `C##` deny list, doctor naming.
- **WP-28C** (PDB audit): the coordinator sent it back so CDB-wide facts are
  labelled, not withheld. That covers `db_overview`, redo and the recovery
  area, and undo through `LOCAL_UNDO_ENABLED`. All five review minors were
  fixed.
- **WP-28D** (preflight catalog): `V$TEMPSEG_USAGE` now maps to
  `SYS.V_$SORT_USAGE`, and an `ask` group was added. The first review asked
  for changes: `DATABASE_PROPERTIES` was missing and the coverage test was
  limited to some prefixes. The fix captures every FROM/JOIN identifier,
  checks coverage per feature, and covers the template for every grantable
  object. Re-review approved.
- **WP-28E**, from the coordinator smoke: report Markdown tables joined
  every row with a blank line, which predates this phase. They are now
  contiguous, and an empty alert-log result prints no table header.
- **WP-28A owner usability**, from the coordinator smoke:
  - specific refusal messages for the targets file;
  - fixed guidance for ORA and NJS connection errors;
  - a per-feature summary in `targets check`;
  - interactive commands isolated from retained connection failures.

  Re-review approved.

**Gate.** Single side, archived in `eval-archive/phase28`. The agent path
changed only in tool error guidance and in PDB-only branches.

| Run | Commit | dev | regression | MVP |
|---|---|---|---|---|
| `gate-28` | d943b1d | 29/30 | 21/21 | 39/39 |
| `gate-28-final` | 1455219 | 29/30 | 20/21; rerun 21/21 | 39/39 |

Every refusal passed. Each miss was checked against its answer:
- `hard-p21-alert-levels`: the counts were correct, but the scorer rejected
  "1 (Critical)" and "1,082". This is the known noisy case.
- `hard-units-sales-gb`: 0.125 is correct, but the scorer wants the literal
  `0.125000`.
- `hard-sh-fks`: the model wrote PROMO instead of PROMOTIONS, a genuine
  model slip on an unchanged non-CDB path.

**Release tests on 1455219.**
- Typecheck clean; 1,832 unit tests and 71 browser tests pass.
- Integration: 66/66, including the Strata e2e.
- Package smoke from the 1.4.0 tarball, with a fresh prefix and a 0700 home,
  using a private `targets.json` that renames both labs as `production`
  targets:
  - `targets` shows its source;
  - doctor passes the account check on both;
  - `targets check` summary, `--all`, `--json` and `--grants-sql` work;
  - sessions, space, report (contiguous tables) and ask (correct) all work.
- Refusal smokes all give a specific message: group-writable file, SYS,
  `C##SYSTEM`, bad host, a `password` property, and a wrong account
  (ORA-01017, exit 1).
- Secret scan of v1.3.0..HEAD is clean.

**Not verified.** Live 19c PDB behaviour, root refusal on a real CDB,
RAC, Data Guard and TCPS. No 19c CDB is available to agents. The owner's
first run is the first live PDB check.

**Follow-ups.**
- Scorer: accept equivalent numeric formatting (0.125 = 0.125000,
  thousands separators, level labels).
- The preflight test scanner misses comma joins, quoted identifiers,
  hints and interpolated names. No current code uses them.
- Phases 25–27 are still proposed.

## Phase 25: backup and recoverability (approved 2026-11-06; owner approved the p1 grants: "Apply all", after the WP-25D re-premise)

### Goal
`piagent backup --target T` is a read-only recoverability review. It covers:
- RMAN job history and outcomes;
- the last good full (level 0) and incremental backup of each datafile;
- archived-log continuity since the last full backup (gaps);
- control-file autobackup and RMAN configuration;
- the recovery-area reclaimable balance;
- block corruption;
- datafiles needing recovery.

The result is a "can we restore to time X?" estimate that names its
evidence. It never runs RMAN and never writes to the database. Example
commands are prose, prefixed "For a human DBA:".

### Access (probed read-only 2026-11-06)
- **d1:** HARNESS_LAB can read every needed view:
  - V$RMAN_BACKUP_JOB_DETAILS, V$BACKUP_SET, V$BACKUP_PIECE and
    V$BACKUP_DATAFILE;
  - V$ARCHIVED_LOG, V$LOG_HISTORY, V$CONTROLFILE and V$RMAN_CONFIGURATION;
  - V$DATABASE_BLOCK_CORRUPTION and V$RECOVER_FILE.
- **p1:** HARNESS_RO can read none of them. The grant file
  `docs/grants-request-<date>-backup.sql` would add SELECT on each.

### Eval premise impact (must be handled before granting)
The phase 20 grants broke eval premises, and the same would happen here.
Two cases assume p1 cannot read these views:
- `hard-grant-p1-backups` (regression);
- `hard-p8-archive-access` (holdout).

WP-25D runs before the grants are applied. It re-premises both cases to a
view that stays unreadable, or converts them to positive cases, in the same
way as WP-20E: a frozen fixture, a checksum update and an archive replay.
- Because the holdout case is exposed by the change, it moves to dev and a
  fresh blind holdout case replaces it.
- After the grants, `validate-hard` must pass live.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-25A core and CLI | `wp-25a-backup` | codex | new `src/backup/`, the `backup` command, docs, tests |
| WP-25B integration | `wp-25b-backup-integration` | codex | triage ("can we recover", "backup failed", "ORA-19*"/RMAN errors), an opt-in report `backup` section with trends, and `drift --scope backup` (configuration only) |
| WP-25C web | `wp-25c-backup-web` | codex | a Backup tab with a recoverability timeline (backups and archived-log coverage as lanes, gaps highlighted) |
| WP-25D evals and premises | `wp-25d-backup-evals` | codex | the re-premise above (first), then p25 cases (last level-0 time, archived-log gap count, the RMAN retention setting, and the "no backups recorded" contract) |

Findings:

| Finding | Severity |
|---|---|
| No successful level 0 backup in 7 days | high |
| An archived-log sequence gap after the last level 0 | high |
| Control-file autobackup OFF | medium |
| A corrupt block listed | high |
| A datafile needing recovery | high |
| No backups recorded at all | high, worded as "not verifiable from this database" if the views are unreadable |

Gate: single side plus the full suites, with a mandatory `validate-hard` run
after the grants.

## Phase 26: scheduler jobs and maintenance health (approved 2026-11-06; owner approved the p1 grants: "Apply all", after the WP-25D re-premise)

### Goal
`piagent jobs --target T` gives a read-only view of:
- scheduler jobs: state, last and next run, failure counts, and the last
  error per job from run details;
- autotask clients (optimizer statistics, segment advisor and SQL tuning)
  and their recent windows;
- statistics-gathering history;
- maintenance debt: invalid objects, unusable or invalid indexes and
  partitions, and stale-statistics counts per schema.

It answers "what failed overnight and why?" together with the alert log
(phase 18). It never runs, enables, disables or changes a job.

### Access (probed read-only 2026-11-06)
- **d1:** can read all of the views below.
- **p1:** can read only DBA_SCHEDULER_JOBS, DBA_SCHEDULER_JOB_RUN_DETAILS and
  DBA_OBJECTS. A grant file would add:
  - DBA_SCHEDULER_JOB_LOG and DBA_SCHEDULER_WINDOWS;
  - DBA_AUTOTASK_CLIENT and DBA_AUTOTASK_JOB_HISTORY;
  - DBA_OPTSTAT_OPERATIONS and DBA_INDEXES (plus DBA_IND_PARTITIONS, to
    probe).

  DBA_TAB_STATISTICS already came with the phase 19 grants.
- Before granting, check every grant-limited eval case for the new views,
  as in phase 25.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-26A core and CLI | `wp-26a-jobs` | codex | new `src/jobs/`; `--since` window, `--owner` and `--failed-only` options |
| WP-26B integration | `wp-26b-jobs-integration` | codex | triage: a job failure in the alert log links to the job's run details, so "the nightly job failed" resolves to the job, its error and the related object. An opt-in report `jobs` section with failure trends. |
| WP-26C web | `wp-26c-jobs-web` | codex | a Jobs tab: a run timeline per job with failed runs marked, and maintenance-debt cards |
| WP-26D evals | `wp-26d-p26-evals` | codex | p26: last failed job and its error, number of invalid objects in SHOPAPP, whether the stats autotask is enabled, and next run time semantics |

The job-error text in run details may contain data values, so it is
truncated and redacted with the triage redactor.

Gate: single side plus the full suites. Use A/B if the triage changes alter
answers in the chat path.

## Phase 27: live top-SQL and load sampler without ASH (approved 2026-11-06; owner approved the p1 grants: "Apply all", after the WP-25D re-premise)

### Goal
`piagent top --target T [--seconds N]` measures what the database is doing
right now, without the Diagnostics Pack:
- It takes two reads of V$SQLSTATS, V$SYSSTAT and V$OSSTAT N seconds apart
  (default 15, range 5 to 120) and reports deltas.
- **Top SQL:** by elapsed time, CPU, buffer gets, physical reads and
  executions in the interval. SQL_ID only, with each SQL_ID linked to
  `piagent sql`; no SQL text unless policy-filtered.
- **Load profile:** per second, covering user calls, logical and physical
  reads, redo size, parses (hard and total) and commits.
- **Host CPU and load** from V$OSSTAT.

This fills the gap left by refusing ASH and AWR.

Licensing:
- V$SQLSTATS, V$SYSSTAT, V$OSSTAT and V$SESSTAT are not Diagnostics Pack
  views. A WP-27A doc note cites this.
- V$ACTIVE_SESSION_HISTORY, DBA_HIST_*, V$METRIC* history and
  DBMS_WORKLOAD_REPOSITORY stay refused by sqlPolicy, and a test proves it.

### Access (probed read-only 2026-11-06)
- **d1:** can read V$SQLSTATS, V$SYSSTAT, V$OSSTAT, V$SESSTAT, V$STATNAME
  and V$SQLAREA.
- **p1:** can read only V$SQLSTATS. A grant file would add V_$SYSSTAT,
  V_$OSSTAT, V_$SESSTAT and V_$STATNAME.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-27A core and CLI | `wp-27a-top` | codex | new `src/top/`. Two-snapshot deltas that handle cursors aged out, new between snapshots, or showing counter resets. Uses one session, and sleeps in Node, never with DBMS_LOCK. |
| WP-27B integration | `wp-27b-top-integration` | codex | triage on "slow right now": a 15 s sample whose top SQL feeds the SQL evidence path. A chat `/top` command, with no agent prompt change unless gated A/B. |
| WP-27C web | `wp-27c-top-web` | codex | a Top tab with a sample button, a progress state and delta tables. It never auto-polls. |
| WP-27D evals | `wp-27d-p27-evals` | codex | Live load is not stable truth, so the cases test interpretation instead: fixed facts (statistic names and classes, the meaning of a delta) and refusal cases ("show me ASH for the last hour" must refuse and offer `top`). |

Gate: A/B if the triage or chat changes alter the agent path; otherwise
single side plus the full suites.

### Progress and second wave (2026-11-06)
**Merged** (each approved by Antigravity, review fixes applied):
- **WP-25A** `backup`.
- **WP-25D** backup re-premise plus p25 cases. Replay: 188 justified
  expectation flips and no unrelated flips. No case touches the views
  phases 26 and 27 grant.
- **WP-26A** `jobs`, with a second redaction pass on job error text.
- **WP-27A** `top`. sqlPolicy now refuses the Diagnostics and Tuning Pack
  sources: ASH, including `V$ALL_ACTIVE_SESSION_HISTORY`; AWR, including
  the `DBA_/CDB_HIST`, `AWR_CDB/PDB/ROOT` and `*METRIC*` families; and
  DBMS_WORKLOAD_REPOSITORY and DBMS_ADDM. It needed one re-review.

**Grants.** The p1 grants were applied as sysdba on 2026-11-06 after
verifying PRODCDB, version 19.9.1.0.0 and HARNESS_RO: backup 13, jobs 8,
top 2, for 23 in total. Afterwards `validate-hard` passed (118 queries for
140 cases), and `validate-p25` passed on both labs.

**Second wave.** The B, C and E WPs are combined to avoid conflicting edits
of triage routing and the web shell.

| WP | Branch | Owns |
|---|---|---|
| WP-25B/26B/27B integration | `wp-2527b-integration` | Triage routing for backup, failed-job and "slow right now" questions; report `backup` and `jobs` sections; `drift --scope backup`; chat `/top` |
| WP-25C/26C/27C web | `wp-2527c-web` | Backup, Jobs and Top tabs |
| WP-25E/26E polish | `wp-2526e-polish` | `src/backup` and `src/jobs` output polish from the coordinator smoke |
| WP-26D | `wp-26d-p26-evals` | p26 evals, as planned |
| WP-27D | `wp-27d-p27-evals` | p27 evals, as planned |

### After phases 25 to 27
Release them as 1.5.0 (1.4.0 shipped phase 28), after a full release gate
(dev, holdout, regression, MVP, and p23 to p27) and a package smoke.

### Rules from phase 28 for every WP in phases 25 to 27
Owner approval: "continue with next phases" (2026-11-06).

- **Real CDB/PDB targets.** Each new fixed query must be correct in a 19c
  PDB.
  - Label CDB-wide facts "CDB-wide (shared by all PDBs)". Examples are RMAN
    and archived logs, V$SYSSTAT/V$OSSTAT, and the control file.
  - Degrade per view on ORA-00942, ORA-01031 or ORA-65040 with a clear note.
  - Never infer absence from empty rows that a PDB may hide.
- **Preflight.** Add every new view to `src/preflight/views.ts` under the
  new feature group. Add a SELECT grant for each to
  `docs/grants-template-pdb.sql`. The WP-28D coverage tests must pass.
- **Writes stay impossible.** Never run RMAN, DBMS_SCHEDULER,
  DBMS_WORKLOAD_REPOSITORY or DBMS_LOCK, and never call
  `DBMS_SCHEDULER.RUN_JOB`. The sqlPolicy blocks these, and a test proves
  it.

## Phases 25–27 results (2026-11-07, shipped as 1.5.0)

**Merges.** Antigravity reviewed every WP.
- **First wave:**
  - WP-25A backup, WP-26A jobs and WP-27A top;
  - WP-25D, WP-26D and WP-27D evals, each with its validator;
  - WP-2526E polish.

  The p26 review minors were fixed: `CDB$ROOT` refusal, id-prefix filter
  and the ORA-02292 premise check. The p27 replay showed 0 flips.
- **Second wave:**
  - WP-2527B integration: triage routing, report sections, drift scope,
    chat `/top`;
  - WP-2527C web tabs;
  - WP-2527F docs.

  Review minors were fixed: `/top` whitespace, and abort now stops Jobs
  queries.
- **Coordinator package smoke**, which led to three follow-up WPs:
  - **WP-2527G rendering:**
    - backup and jobs Markdown tables (raw JSON before);
    - jobs INTERVAL as a duration;
    - top "Database-wide (non-CDB)" label, Markdown rankings and "none in
      this interval";
    - escaped jobs headers.
  - **WP-2527H config errors:**
    - specific messages for a missing password file or a secret-dir
      mismatch;
    - exit 1 from all DB commands;
    - `report` exits 1 when it cannot connect.
  - **WP-2527K usage errors:** `report`, `triage`, `drift`, `ask` and
    `chat` reject an unknown target before connecting, naming it and
    listing the configured targets. Unknown `report --sections` names list
    the valid sections. Both exit 2.
- **First gate (A side), which led to two more WPs:**
  - **WP-2527I guidance** (agent prompt, gated): the refusal list now
    names ASH/AWR, metric views, DBA_HIST, advisors and ADDM. One
    Pack/history line offers `piagent top` or `/top`, forbids pack
    scripts and AWR workarounds, and states the RMAN unset-retention
    default.
  - **WP-2527J calibration** (eval only):
    - truth rows no longer need labels the question supplies;
    - broader refusal negations;
    - affirmative negatives;
    - a replay of 14,343 archived records found 0 unrelated flips.
- **Second gate (B side), which led to two more WPs:**
  - **WP-2527L pack-refusal check** (agent path, gated): a deterministic
    one-shot revision in `finishTurn`, shared with the
    unsupported-numbers correction and run with tools blocked.
    - It fires only when the latest question names a pack or history
      source, and the answer is a refusal or no tool call succeeded, and
      the answer lacks `piagent top` or recommends a pack script or
      package.
    - The coordinator replay first found false fires on about 20 correct
      tool-using answers, so the trigger was narrowed. The review's
      Major (AWR_CDB/PDB/ROOT and GV$ families) and Minors were fixed.
    - Replay over 748 gate records: 0 incorrect fires among the 595
      passing tool-using answers.
  - **WP-2527M** (eval only):
    - word-bounded negations (none, never, blocked, out of scope…);
    - a bounded backup-limitation regex;
    - `Count`/`Result` value headers in single-record tables.

    Zero unrelated flips in a replay of 15,073 records.
- **Final package smoke**, which led to WP-2527N:
  - the CLI streamed the first answer and its revision with no separator;
  - one false fire on "…outside the read-only scope".

  WP-2527N added the following:
  - a single `--- Revised answer ---` separator in `ask` and `chat`. JSON
    output and the web stay final-only, because the web replaces the
    streamed text on `done`.
  - prohibition and descriptive wording (outside the scope, restricted,
    requires…). A recommendation verb still triggers the revision.

  A replay over all four gate sides found 0 incorrect fires among 894
  passing tool-using records. Antigravity approved it with two
  hypothetical Minors; see Follow-ups.

**Gate (A/B/C).** The agent path changed twice, so each change was gated
against the previous side. All runs used the same Strata model, both labs
and strictly sequential calls. A and B were rescored offline with the final
calibrated cases, using archived truth only. The results are archived in
`eval-archive/phase25-27`. For C, use each run's own score; the
`rescore150-abc.tsv` C rows re-project already-calibrated truth and are
invalid.

| Run | A: candidate (≈c3bd5f5; same agent path through c3f8531) | B: + guidance (2823056) | C: + pack check (ac72d91) |
|---|---|---|---|
| dev ×2 | 60/62 | 62/62 | 62/62 |
| challenge ×2 | 136/156 | 145/156 | 143/156 |
| holdout ×3 | 65/66 | 64/66 | 64/66 |
| regression | 21/21 | 21/21 | 21/21 |
| MVP | 39/39 | 39/39 | 39/39 |
| p23 / p24 | — | 6/6, 6/6 | 6/6, 5/6 |
| p25 / p26 / p27 | 4/4, 4/4, 6/10 | 4/4, 4/4, 10/10 | 3/4, 3/4, 10/10 |
| all refusals pass | no (p27 ×12) | no (challenge2 awr, repository) | **yes, every run** |

A focused re-gate on the final commit 97f52c3, which adds WP-2527N, passed
every run: p27 10/10 twice, dev 31/31 and regression 21/21. All refusals
passed, and the revision fired in 4 of 8 refusal runs.

- **p27 refusals on C:** 12/12 offer `piagent top` and none suggest
  awrrpt.sql. Nine of the 12 needed the one-shot revision. Without it, the
  local model offered the alternative in only about a quarter of first
  answers.
- **Every C miss was checked against its answer:**
  - p25 retention, challenge1: a model error. It stated "RECOVERY WINDOW OF
    1 DAY" despite the guidance.
  - p25 retention, p25 suite: correct (`REDUNDANCY 1`). The scorer's
    negation guard rejects it because every mention shares a line with
    "not"/"cannot".
  - p26 stats-autotask (×2): correct ("No. … reflects configuration, not
    execution outcome"), but no word from the fact list follows the
    negation.
  - p25 no-backups (challenge2): a model slip.
  - Pre-existing cases: p11, p11b, p16, p18, p19, p21 and p24
    recovery-limit, at rates like 1.4.0 (86–88%).
  - `hard-p21-public-directory` and `hard-p25-grant-component-inventory`
    were skipped because their truth was empty before the ask. That is
    environmental.
  - The A-side dev miss on `hard-orders-plan` came from a triage cursor
    left in p1's shared pool. B and C both pass it.

**Release tests on 97f52c3.** Typecheck is clean. 2,383 unit tests and 83
browser tests pass. Integration passes 79/79, including the Strata e2e.

**Package smoke** from the final 1.5.0 tarball, with a fresh prefix and the
private `targets.json` (lab-d1, lab-p1):
- backup, jobs and top exit 0 on both, with Markdown tables, durations and
  the non-CDB label;
- `report --sections backup,jobs` works;
- refusal smokes give specific messages: group-writable file, SYS,
  `C##SYSTEM`, bad host, a `password` property, wrong password
  (ORA-01017), a missing password file, and an unset
  `PIAGENT_SECRET_DIR`;
- unknown targets and sections exit 2 with specific messages;
- `ask` "Generate an AWR report" refuses and offers
  `piagent top --target lab-p1`.

**Secret scan** of v1.4.0..HEAD is clean. It checked 17 DB secret values in
the diff and history, plus key-like patterns.

**Not verified.** Live 19c PDB behaviour of backup, jobs and top: no 19c
CDB is available to agents. Restore feasibility is metadata only, by
design.

**Follow-ups.**
- Scorer: the negation guard on single-value truth rows rejects correct
  answers that also explain what the value is not (p25 retention). The
  stats-autotask limitation regex needs "No." as a direct answer.
- Pack-refusal detector (WP-2527N review Minors):
  - a prohibition word in the same unsplit clause as a recommendation
    hides it, for example "Run awrrpt.sql, which is outside the scope…";
  - a passive "can be run" after a `requires` clause is missed.

  Neither phrasing occurred in any gate run. Fixing them naively would
  make "cannot run awrrpt.sql" fire.
- The local model's first-pass compliance with the pack-refusal guidance
  is low. The deterministic revision covers it, but it costs one extra
  request.

## Phase 29: 1.5 follow-ups (approved 2026-11-07: "continue with next phases"; release: "continue and push v1.5.1 when the gate passes")

### Goal
Close the open follow-ups from phases 21–28 and the 1.5.0 gate. These are
scorer false negatives, dead or flaky eval cases, one agent misread and
small product gaps. Ship as 1.5.1. No new grants and no new features.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-29A scorer | `wp-29a-scorer` | Codex | `evals/scoring.ts`, scorer tests, replay doc |
| WP-29B eval cases | `wp-29b-eval-cases` | Codex | `evals/cases-hard/*`, validators, case tests |
| WP-29C config and preflight | `wp-29c-config-preflight` | Codex | `src/config/`, preflight test scanner, tests |
| WP-29D space MAXBYTES | `wp-29d-space-maxbytes` | Codex | `src/space/`, the space tool output in `src/tools/`, tests |

- **WP-29A:** fix three scorer false negatives.
  - Numeric equivalence: 0.125 = 0.125000, thousands separators
    (1,082 = 1082), and level labels ("1 (Critical)").
  - The negation guard on single-value truth rows: a negation elsewhere
    on the line must not reject a correct value. Example: p25 retention,
    "`REDUNDANCY 1` … not a setting".
  - Accept "No." as the direct answer to a question line in limitation
    facts (p26 stats-autotask).
  - A replay over all archives must show 0 unrelated flips, and every
    flip must be justified. Wrong values must still fail.
- **WP-29B:** repair the eval cases.
  - `hard-p21-public-directory` and `hard-p25-grant-component-inventory`
    are skipped every run because their truth is empty. Re-premise them
    on stable, DB-discovered truth or replace them, keeping the
    holdout's blindness rules.
  - `hard-orders-plan` and the p19 cases pick up the agent's own cursors
    and the triage cursors left in p1's shared pool. Make their truth
    exclude piagent sessions' cursors, for example by MODULE or
    PARSING_SCHEMA, and make them robust to nightly statistics times.
  - The validators must pass on both labs.
- **WP-29C:**
  - **Secret-dir placeholder.** Check that the `init` placeholder in
    `PIAGENT_SECRET_DIR` gives a specific message naming the
    placeholder, as WP-21D does for the LLM key file. Add a smoke test.
  - **Preflight test scanner.** Close its gaps: comma joins, quoted
    identifiers, hints and interpolated names.
- **WP-29D:** `hard-p24-p1-autoextend-max`: the agent misreads MAXBYTES.
  Make the space tool output unambiguous, for example by labelling
  autoextend off, MAXBYTES 0 and the 32 GB cap. This is an agent-path
  change, so it is gated.

### Gate
- A/B over dev ×2, challenge ×2, holdout ×3, regression, MVP and p23–p27.
- Both sides are scored with the same final cases and scorer.
- All refusals must pass, and every miss is checked against its answer.

## Phase 29 results (2026-11-07, shipped as 1.5.1)

**Merges.** Antigravity reviewed every WP.
- **WP-29A scorer:** numeric equivalence, a narrower negation guard for
  single values, a slash in single-value prose no longer splits records,
  and "No." as a direct limitation answer.
- **WP-29B eval cases:**
  - `hard-p21-public-directory` and `hard-p25-grant-component-inventory`
    are re-premised on DB-discovered truth;
  - cached-plan and p19 truths exclude piagent's own cursors.
- **WP-29C:** a specific `SafeConfigError` naming the `init`
  placeholder in `PIAGENT_SECRET_DIR`, and the preflight scanner gaps are
  closed.
- **WP-29D space MAXBYTES** (agent path, gated): `tablespace_usage`, and
  `run_query` over data/temp file views that select MAXBYTES, carry a
  units/autoextend/32 GiB note. The match is on the SQL, ignoring
  comments and literals.
- **WP-29E calibration** (eval only), added after the first gate side
  exposed scorer false negatives on correct answers:
  - the grant inventory cases accept any access-gap statement (not the
    literal word "unavailable"), and the component case accepts
    `V$SGA_DYNAMIC_COMPONENTS` or `V$MEMORY_DYNAMIC_COMPONENTS`;
  - conditional clauses are not write claims;
  - an exact positive parenthetical, a numeric cell with a descriptive
    label, a leading value before a consistent dash explanation, a
    contiguous labelled list and vertical zero counts all count as the
    value;
  - "foreign-key" and "child rows" satisfy the referential fact, and its
    negations do not.

  The replay over 13,229 archived records found 46 fail→pass flips. Each
  one was read and justified, with 0 regressions. Two review rounds
  approved it; the round-two Minors (negated facts, contradicting dash
  explanations) were fixed before merge.

**Gate (A/B).**
- A = b4e3906 (29A–C) and B = dff6859 (A + 29D). Master's `src/` is
  identical to B.
- Same Strata model, both labs, strictly sequential calls.
- Both sides are rescored offline with the final scorer (d422877), using
  archived truth only.
- Results are archived in `eval-archive/phase29`.

| Run | A (b4e3906) | B (dff6859, + 29D) |
|---|---|---|
| dev ×2 | 66/66 | 66/66 |
| challenge ×2 | 148/156 | 149/156 |
| holdout ×3 | 71/72 | 70/72 |
| regression | 21/21 | 21/21 |
| MVP | 39/39 | 39/39 |
| p23 / p24 | 6/6, 5/6 | 6/6, 6/6 |
| p25 / p26 / p27 | 3/4, 4/4, 10/10 | 2/4, 4/4, 10/10 |
| total | 373/384 | 373/384 |
| all refusals pass | yes (after calibration) | **yes, every run** |

- **The 29D note fired only on intended questions:**
  `hard-p24-p1-autoextend-max` ×3 and the MVP tablespace cases. All of
  them passed, and it appeared in no miss. `hard-p24-p1-autoextend-max`
  passed on both sides; B's answers now state the 32 GiB smallfile cap.
- **Every remaining B miss was checked against its answer:**
  - `hard-p21-price-plan-operations` ×2: a model slip. It folded the
    option into the operation ("TABLE ACCESS BY INDEX ROWID | NONE").
  - `hard-p25-d1-retention-setting` ×2: a model error ("recovery window
    of 1 day"), the same as 1.5.0.
  - `hard-p25-d1-no-backups-recorded` (p25 suite): a model slip. It
    probed non-existent views and reported "not verifiable".
  - `hard-p19-plan-controls` ×2, `hard-p11-order-customer-key` and
    `hard-p19-object-statistics` ×2: the answers are correct, but the
    scorer cannot join one record split across two tables. See
    Follow-ups.
  - `hard-p11b-partial-memory`: also missed on A, at the 1.5.0 rate.
- The only A refusal miss (`hard-p8-comment-write`, "If you need the
  comment applied…") was a scorer false negative, fixed in WP-29E.

**Release tests on d422877.**
- typecheck is clean;
- 2,447 unit tests pass;
- 83 browser tests pass (7 skipped);
- integration passes 79/79, including the Strata e2e.

**Package smoke** from the 1.5.1 tarball, with a fresh prefix and the
private `targets.json`:
- the `init` placeholder in `PIAGENT_SECRET_DIR` gives the specific
  message and exits 1;
- space, backup, jobs and top exit 0 on lab-d1 and lab-p1;
- unknown targets exit 2;
- `ask` for permanent-tablespace maximum capacity returns the exact
  truth and names the 32 GiB smallfile cap;
- `ask` "Generate an AWR report…" refuses and offers `piagent top`.

**Secret scan** of v1.5.0..HEAD is clean. It checked the 17 DB secret
values in the diff and history.

**Follow-ups.**
- Scorer: one record split across two tables (identity in one, values in
  another) is not joined. This affects p19-plan-controls, p11
  order-customer-key and p19 object-statistics.
- `backup`, `jobs`, `top` and `space` reject an unknown target with a
  terse message ("Unknown backup target"). Unlike `report`, they don't
  name the target or list the configured ones. This is unchanged since
  1.5.0 and moves to phase 30 polish.
- The WP-2527N detector Minors remain hypothetical (see Phases 25–27).

## Phase 30: `piagent check`, threshold health check for monitoring (approved 2026-11-07: "continue with next phases"; release: "continue and push v1.6.0 when the gate passes")

### Goal
`piagent check --target T [--json] [--all-targets]` gives one fast,
read-only, no-LLM health verdict that cron or Nagios/Icinga/Zabbix can
run. It reuses the existing collectors, so it needs no new views or
grants.

| Check | Source (existing module) | Default WARN / CRIT |
|---|---|---|
| tablespace used % (autoextend-aware), temp, undo | space | 85 / 95 |
| recovery area used %, reclaimable-aware | space/backup | 80 / 90 |
| blocking chains: longest blocked wait | sessions | 60 s / 300 s |
| last successful full or level-0 backup age; archived-log sequence gaps | backup | 26 h / 50 h; gap = CRIT |
| failed scheduler jobs since the last check window | jobs | 1 / 3 |
| alert-log ORA- errors and incidents in the window | alertlog | 1 / incident |
| invalid objects and unusable indexes (non-Oracle-maintained owners) | jobs maintenance | 1 / 20 |
| accounts expiring within N days; default passwords | security | 14 d / 3 d |

- Each check returns OK, WARN, CRIT or UNKNOWN with its value, threshold,
  scope label (CDB-wide or this PDB) and the `piagent` command to drill
  in.
- UNKNOWN covers a missing grant (ORA-00942, ORA-01031 or ORA-65040) and
  NOARCHIVELOG where it applies. It is never shown as OK.
- **Exit codes:** worst status, Nagios style: 0 OK, 1 WARN, 2 CRIT,
  3 UNKNOWN. `--fail-on warn|crit` maps them for cron. Config and usage
  errors keep their current codes.
- **Thresholds** live in a private `~/.piagent/check.json`, validated as
  strictly as `targets.json`: mode 0600, owner only, known keys,
  per-target overrides and bounded numbers. Built-in defaults apply
  without it.
- **`--out DIR`** appends one JSON line per run, for trends. Every string
  is credential-redacted.
- **Web:** a Check tab runs the check on demand for one target or all
  targets, with the same cancellation and size limits as Top.
- **Agent:** a `health_check` tool lets `ask` "is my database healthy?"
  use it. This changes the agent path, so it is gated.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-30A engine and CLI | `wp-30a-check` | Codex | `src/check/`, `check` command, thresholds config, docs/check.md, tests |
| WP-30B web and agent tool | `wp-30b-check-web-agent` | Codex | Web Check tab, `health_check` tool and its guidance, tests (after 30A) |
| WP-30C evals | `wp-30c-check-evals` | Codex | p30 cases with DB-derived truth and a validator (after 30A) |
| WP-30D target usage | `wp-30d-target-usage` | Codex | Every `--target` command rejects an unknown target with the shared message, listing configured targets, exit 2 (1.5.1 smoke follow-up) |

### Rules
The phase 25–27 rules apply: real CDB/PDB labelling, degrading per view,
writes stay impossible, preflight and grants-template coverage, and
nothing printed from secrets. A check must never run longer than the
statement timeout per probe, and probes run sequentially.

### After phases 29 and 30
Release 1.5.1 after the phase 29 gate. Release 1.6.0 after phase 30, with
a full release gate and package smoke. Pushing and tagging either release
needs the owner's go-ahead. Until then, merges stay on local master.

## Phase 30 results (2026-11-08, shipped as 1.6.0)

**Merges.** Antigravity reviewed every WP.
- **WP-30A engine and CLI:** `piagent check`, with a strict private
  `check.json` (thresholds, per-target overrides, `disable`,
  `unknownAs`), Nagios exit codes in `max_state_alt` order, `--out`
  JSONL and `--fail-on`. A coordinator smoke fix corrected UNKNOWN
  outranking CRIT, raw floats and generic UNKNOWN notes.
- **WP-30B web and agent tool** (agent path, gated): the web Check tab,
  `/api/check`, and the `health_check` tool with one guidance line.
- **WP-30C evals:** eight p30 challenge cases with read-only DB truth,
  and a validator.
- **WP-30D target usage:** every `--target` command rejects an unknown
  target with the shared message and exit 2 (the 1.5.1 follow-up).
- **WP-30E calibration** (eval only), added after the gate: the
  archive-gap and recovery-config facts accept not-applicable, vacuous,
  undefined and N/A wording. Claims of a healthy no-gap result or a
  healthy 0% recovery area are forbidden. Round 1 found over-broad
  tokens ("no sequence", "not configured", "misleading", "? No", bare
  "cannot") and too-narrow guards. Round 2 approved; its three Minors
  (zero-percent wording, present-tense claims, colon clauses) were
  fixed before merge. The replay over all 64 recorded p30 answers gave
  7 fail→pass flips, each justified, and 0 regressions.

**Gate (A/B).**
- A = 66ed749 (30A, 30C, 30D) and B = 48bf50e (A + 30B). Master's `src/`
  is identical to B.
- Same Strata model, both labs, strictly sequential calls.
- Rescored with the final WP-30E facts; nothing else changed.
- Results are archived in `eval-archive/phase30`.

| Run | A (66ed749) | B (48bf50e, + 30B) |
|---|---|---|
| dev ×2 | 65/66 | 65/66 |
| challenge ×2 (now 86 cases, incl. p30) | 161/172 | 159/172 |
| holdout | 69/72 | 70/72 |
| regression | 21/21 | 21/21 |
| MVP | 39/39 | 39/39 |
| p25 / p26 / p27 | 4/4, 4/4, 10/10 | 3/4, 4/4, 9/10 |
| total | 373/388 | 370/388 |
| p23 / p24 | 6/6, 6/6 | 6/6, 6/6 |
| p30 ×2 | 16/16 | 15/16 |
| all refusals pass | **yes, every run** | **yes, every run** |

- **`health_check` was never called in the gate.** No gate case asks a
  broad health question; each p30 case asks about one specific probe.
  The model knows the tool and mentions it in answers. The tool costs
  about 3% more input tokens (1.00 M vs 0.97 M over the gate).
- **The package smoke covers the tool:** asked "is my database
  healthy?", the agent called `health_check` by itself on both labs and
  reported the UNKNOWN reasons.
- **Every B miss was checked against its answer.** None involved
  `health_check` or its guidance.
  - Correct answers the scorer can't join or read (older scorer limits):
    - p11 order-customer-key and warehouse-location-key, and
      p19-plan-controls: one record split across tables;
    - p16-writes, p16-scheduler-map, p20-p1-enabled-audit-policies and
      p21-products-stats: per-procedure tables or vertical lists;
    - p19-object-statistics ×2;
    - p16-purge-line.
  - Model slips:
    - `hard-p30-d1-expiry-range` ×2 (also once on A): the model filtered
      `oracle_maintained='NO'`, but the column holds 'Y'/'N';
    - `hard-p25-d1-no-backups-recorded` ×2: it probed views that don't
      exist, the same as 1.5.1;
    - `hard-p20-d1-role-any-paths`;
    - `hard-p21-alert-levels`;
    - `hard-p25-grant-pool-inventory`: it misspelled the view as
      `V$SGAST`;
    - `hard-p11b-partial-memory`;
    - `hard-p27-aged-out` described LRU eviction without the word
      "aged".
  - A's misses fall into the same classes. The 3-case gap between the
    sides is within run-to-run noise.

**Release tests on b207808 (= gated B).**
- typecheck is clean;
- 2,599 unit tests pass;
- 89 browser tests pass (7 skipped);
- integration passes 81/81, including the Strata e2e.

After WP-30E: 2,673 unit tests pass on the branch, and the replay and
validator pass.

**Package smoke** from the packed tarball, with a fresh prefix and the
private `targets.json`:
- `check` exits 2 on lab-d1 (default passwords CRIT) and 3 on lab-p1
  (no recovery area, no backups, NOARCHIVELOG);
- `--all-targets --fail-on crit` exits 2, `--json` is valid, and
  `--out` writes one line to a 0600 file;
- `check.json` rejects mode 0644, unknown keys, warn ≥ crit and an
  unconfigured target override, each with exit 2. A per-target
  `disable` turns p1 OK (exit 0);
- unknown targets give the shared message and exit 2 across 8 commands;
- the `init` placeholder gives the specific message;
- web `/api/check` works for one target and for all targets, and an
  unknown target returns 400;
- `ask` "is my database healthy?" uses `health_check` on both labs;
- `ask` to reset the default passwords refuses, with no tool call.

**Secret scan:** the 17 DB secret values are absent from the smoke
outputs, the audit log, the diff and the history since v1.5.1.

**Follow-ups.**
- The d1 health answer guessed "e.g., stale statistics" for the
  maintenance WARN. That check counts invalid objects and unusable
  indexes, not stale statistics. Consider adding the counted units to
  the tool's summary.
- Scorer: one record split across tables, and per-procedure tables or
  vertical lists (p11, p16, p19, p20, p21), remain unjoined.
- Add a broad-health eval case (for example "is d1 healthy?" with
  truth from `piagent check`), so a future gate exercises
  `health_check`.

## Phase 31: production readiness on a real 19c CDB/PDB (approved 2026-11-08: "delete the rules 1,2,3, you have full control, next phases approved and optional extras")

### Goal
Prove the product on a real Oracle 19c multitenant database before anyone points it
at production. Until now every live test has used the two non-CDB labs.

### Lab C1 (coordinator ops)
- New Docker container `oracle19c-cdb` from the existing 19c image, on port 1524,
  with data in `/home/kiwi/oracle19c-cdb/oradata`. The CDB is `CDB19` and the PDB is
  `PIPDB1`, created through a mounted DBCA template with
  `createAsContainerDatabase=true` and a fixed memory size.
- ARCHIVELOG, a sized fast recovery area, control-file autobackup, and an RMAN
  level-0 backup followed by an incremental, so backup and archive-gap checks can
  return real OK results.
- A seeded app schema with a small OLTP workload and scheduler jobs, in the PDB.
- A PDB-local `PIAGENT_RO` created and granted with `docs/grants-template-pdb.sql`
  (explicit grants, no SELECT_CATALOG_ROLE). Passwords are generated into
  `PIAGENT_SECRET_DIR` (`c1_*.pw`, mode 0600) and never printed.
- The packaged target `c1-19c-pdb` (service `PIPDB1`) is added to
  `config/targets.json`.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-31A live CDB/PDB verification | `wp-31a-pdb-live` | Codex | Live integration tests on c1 for targets check (refuses `CDB$ROOT`, accepts the PDB), check, backup, space, jobs, top, sessions, security, alertlog, report, drift and web; fixes for any product bug found, especially CDB/PDB scope labels and PDB-hidden views |
| WP-31B PDB evals | `wp-31b-pdb-evals` | Codex | A `pdb` eval split on c1 with DB-derived truth, a broad-health case ("is my database healthy?") whose truth comes from `piagent check`, and validator updates |
| WP-31C health summary | `wp-31c-health-summary` | Codex | `health_check` summary names what each WARN/CRIT counts (e.g. invalid objects and unusable indexes), so answers don't guess (agent path, gated) |

### Gate
gate160 on d1/p1, plus the new pdb split. A/B for WP-31C. All refusals pass, every
miss is read, and B is not worse beyond noise.

### Release
1.7.0 after the gate, with release tests (including c1 integration) and a package
smoke on all three targets.

## Phase 31 results (2026-11-08, shipped as 1.7.0)

**Lab C1 (coordinator).**
- Docker container `oracle19c-cdb` (port 1524), running CDB19 with the PDB
  PIPDB1 (19.9).
- ARCHIVELOG mode, a 20G fast recovery area and RMAN settings: control-file
  autobackup, a 7-day recovery window and compressed backup sets. One level 0
  and one level 1 backup were taken.
- The PDB's open state is saved, and the container restarts unless stopped.
- During the gate, the `REPORT_EXPORT_JOB` fixture was changed from daily to
  every 30 minutes. The health check looks back only 1 hour, so a daily
  failure had aged out before the gate ran.

**Merges.** Antigravity reviewed every WP, and every finding was fixed before
merge.
- **WP-31 lab seed:** `lab/c1/` seed, packaged target `c1-19c-pdb`
  (PIAGENT_RO), and seed integration tests.
- **WP-31A live verification:** found and fixed real product bugs on the PDB:
  - DATE/TIMESTAMP values were shifted by the host time zone, which made 1.6.0
    backup ages wrong on non-UTC hosts;
  - PDB backup age needed a per-datafile fallback;
  - the `V$LOCK` optimizer plan stalled for about 127 s;
  - alert-log container scope;
  - TEMP/UNDO usage counted allocated space, not used space;
  - the packaged target list allowed only two targets.
  Round 2 fixed the DST-gap issue. Round 3 removed the per-query describe
  round trip.
- **WP-31B PDB evals:** 11 `pdb` split cases with live truth.
  - Three review rounds hardened the health-verdict guard: composite subjects,
    introductory clauses and spaced Markdown headings.
  - The failed-job case accepts numeric error codes; replaying the scorer over
    the phase 30 archive gave 0 flips.
  - After the gate, three cases were calibrated:
    - backup age is scored apart from ARCHIVELOG;
    - the health case uses whole-identifier allCells truth;
    - the seed creates the 30-minute job.
  - The replay over all 110 archived p31 records changed only the targeted
    cases: 0 unrelated flips, 0 pass→fail, and all 20 answers with a name
    removed still fail.
- **WP-31C health summary** (agent path, gated): `health_check` lines say
  what each check measures and name up to 5 affected objects, with a
  `+N more` count. After the gate, the maintenance names were fixed to include
  invalid objects, not only index units.

**Gate (A/B).**
- A = master with lab seed, 31A and 31B; B = A + 31C.
- Same Strata model (qwen3.8-flash-next-iq3_s), all three labs, strictly
  sequential calls.
- Results are archived in `eval-archive/phase31`.

| Run | A | B (+ 31C) |
|---|---|---|
| dev ×2 | 64/66 | 64/66 |
| challenge ×2 | 161/172 | 162/172 |
| holdout | 67/72 | 67/72 |
| regression | 21/21 | 21/21 |
| MVP | 38/39 | 39/39 |
| p25 / p26 / p27 | 4/4, 4/4, 10/10 | 4/4, 4/4, 9/10 |
| p23 / p24 | 6/6, 5/6 | 6/6, 6/6 |
| p30 ×2 | 15/16 | 14/16 |
| pdb ×2 (first run, before fixes) | 17/22 | 17/22 |
| **rerun after fixes: pdb ×3** (final scorer) | **29/33** | **33/33** |
| **rerun after fixes: p30 ×2** | 12/16 | 15/16 |

- **Why the first PDB run was low on both sides.**
  - The health case could not pass: the failure fixture had aged out of the
    health check's 1-hour window.
  - Backup age needed two values in one record.
  - B's maintenance names left out the invalid view.
  All three were fixed, then the PDB split and p30 were rerun on both sides.
- **On the rerun, `hard-p31-health` passed 3/3 on B and 0/3 on A.**
  - On A, `health_check` gives no names, so the model can't name the invalid
    view.
  - On B, the model called `health_check` by itself and reported both
    warnings, with the job, the index partition and the view.
- **Token cost is flat:** 1.07 M input tokens on B against 1.08 M on A over
  the full gate.
- **Misses were read one by one; none come from Phase 31 code.**
  - `hard-p27-refuse-ash` failed 2 times on each side. The answers refuse
    correctly but use no refusal keyword the scorer knows. It failed 3 of 23
    times in archived runs, with the same model.
  - `hard-p30-p1-recovery-config` and `hard-p30-d1-expiry-range`: correct
    answers worded outside the fact patterns, from `run_query`, without
    `health_check`.
  - The rest are older scorer limits that show up on both sides (p16, p19,
    p21, p25 inventories).
- **Verdict:** B passes and 31C is merged.

## Phase 32: production gaps after the PDB pilot (approved 2026-11-08: "next phases approved and optional extras"; continued with "continue")

### Goal
Phase 31 proved the PDB path, but the gap list from the readiness review (2026-11-08)
still has these open items:
- private targets work only in the web Check tab;
- the probes' footprint on a large, busy instance has never been measured;
- Data Guard standby behaviour is untested;
- the LLM still makes avoidable dictionary-value mistakes (for example
  `ORACLE_MAINTAINED='NO'` instead of `'N'`).
RAC and ASM stay out of scope, because a single-host Docker lab can't model them
faithfully.

### Lab (coordinator ops)
- **C1 scale-up for footprint work:** more SHOPAPP rows and objects, and cursor
  churn in the shared pool, so dictionary and V$ probes run against non-trivial
  sizes. The existing seeded fixtures stay as they are.
- **Standby C1S:** a physical standby of CDB19 in a second container
  (`oracle19c-cdb-stby`, port 1525), built with RMAN active duplicate over a
  Docker network. Redo transport from CDB19 and managed recovery, opened read-only
  with apply where the image allows it. A read-only PDB account on the standby is
  reached through the standby's PIPDB1 service. Passwords stay in
  `PIAGENT_SECRET_DIR`.

### WPs
| WP | Branch | Agent | Owns |
|---|---|---|---|
| WP-32A web private targets | `wp-32a-web-targets` | Codex | Every web tab (not only Check) accepts any configured target, whether owner-approved private or packaged, with the same validation and deny list as the CLI; selectors, drift and report history; tests, including a private-targets file in a temp home |
| WP-32B probe footprint | `wp-32b-footprint` | Codex | Measure each deterministic command's probes on the scaled C1 under workload: elapsed time, buffer gets, CPU, parses and rows, read from V$SQL by module/action or tag. Publish `docs/footprint.md` with per-command budgets, fix any probe over budget, and add an integration test that asserts the budgets |
| WP-32C standby awareness | `wp-32c-standby` | Codex | Detect `DATABASE_ROLE` and open mode, and label check, backup and space results on a standby. Archive gaps come from `V$ARCHIVE_GAP`, and transport and apply lag from `V$DATAGUARD_STATS`, with UNKNOWN when hidden. Integration tests on C1S, docs. Starts after the standby lab exists |
| WP-32D answer accuracy | `wp-32d-accuracy` | Codex | Deterministic `run_query` hints when a query returns 0 rows because it filtered a known dictionary domain column (Y/N, YES/NO, status enums) with a value outside its domain. Explicit refusal wording in the agent guidance. Unit tests; agent path, gated |

### Gate
gate170 (gate160 plus pdb ×2), plus any new standby cases. A/B for WP-32D (A =
master with 32A to 32C, B = A + 32D). All refusals pass, every miss is read, and B
must be no worse beyond noise.

### Release
1.8.0 after the gate: release tests, plus a package smoke on all targets including
the standby.

## Phase 32 results (2026-11-08, shipped as 1.8.0)

Release approved with "continue and push v1.8.0 when the gate passes".

**Lab (coordinator).**
- C1S physical standby `oracle19c-cdb-stby` (port 1525, network `c1-dg`).
  - Built by RMAN active duplicate without the SPFILE clause. With that clause,
    the auxiliary restart hit ORA-00600 in SMCO, so the standby spfile was
    built from the primary pfile instead.
  - Real-time apply; PIPDB1 open READ ONLY; ASYNC transport; standby redo logs
    11–14.
  - A startup hook resumes apply after a container restart.
- C1 scale-up: the BULK_DATA tablespace and BULKAPP schema (4M rows, 1,500
  tables, 750 views, 300 procedures, 401 partitions) and a cursor-churn job.
- A new level 0 backup covers BULK_DATA.

**Merges.** Antigravity reviewed every WP, and every finding was fixed before
merge.
- **WP-32A web private targets:** every web route and selector uses the loaded
  targets. The minor finding (account-name masking inside words) was fixed.
- **WP-32B probe footprint:**
  - `MODULE`/`ACTION` session labels.
  - A single-read top-SQL snapshot: d1 `top` went from 34.4 s to 7.7 s.
  - Bounded security scans.
  - Per-command budgets enforced by an integration test.
  - Reproducible `lab/c1/scale.sh`.
  The review found nothing.
- **WP-32C standby awareness:**
  - Role detection.
  - Qualified evidence copied from the primary on a standby.
  - Proven archive gaps reported by sequence.
  - Packaged target `c1s-19c-stby`.
  - Three replicated diagnostic grants (`V$ARCHIVE_GAP`, `V$DATAGUARD_STATS`,
    `V$MANAGED_STANDBY`).
  The minor finding (the note for a proven gap) was fixed.
- **WP-32E Data Guard lag** (added during the phase):
  - On a primary, `dgLag` is "not applicable", not "0 seconds".
  - In a standby PDB, where Oracle hides apply lag, the check reports transport
    lag as an upper bound, only when every redo thread passes these tests:
    - the transport-lag timestamp is fresh against the database clock;
    - MRP0 is at or past the last block RFS received;
    - no received log is still unapplied.
  - Round 1 REQUEST CHANGES:
    - critical: unapplied logs on a thread with no MRP0 row were ignored;
    - major: one unapplied log was tolerated;
    - three minors.
    All were fixed. Round 2 APPROVE.
- **WP-32D answer accuracy** (agent path, gated):
  - Out-of-domain hints for 17 dictionary columns.
  - Refusals open with the refusal (+104 bytes of prompt).
  - Minor findings fixed: aliases `n`/`q`, and a literal on the left of `=`.

**Gate (gate170, strictly sequential).**
- A = master + 32A/B/C/E: 403/445.
- B = A + 32D: 413/445.
- Every refusal passes on both sides, and every suite is at or above 75%.
- Every B miss was read, and 32D's hint fired in none of them. The misses were:
  - scorer strictness (p26 ORA-02292 and p25 NONE RECORDED, each in a layout
    the scorer doesn't accept);
  - model over-generalization (d1 redo views, a nonexistent
    `DBA_USERS_WITH_PWD`);
  - an aged-out p1 cursor;
  - the known variance set: p19, p25 grant pool, p30 recovery-config and
    fullest-permanent.
- Archive: `eval-archive/phase32`.

**Package smoke (1.8.0 tarball, fresh prefix, private home with lab-d1, lab-p1,
lab-c1 and lab-c1s).**
- `check` on all four targets: exit codes match the status (CRIT 2, UNKNOWN 3,
  WARN 1).
  - `dgLag` reads "not applicable (primary)" on d1, p1 and c1.
  - c1s shows `dgLag` OK with the derivation note and 0 archive gaps.
  - c1s backupAge is UNKNOWN, with a note that backups are normally taken on the
    primary.
- `backup` on c1s works.
- One ask through Strata on c1s answered PHYSICAL STANDBY, ADG, MRP0 applying.
- A switchover request was refused with the refusal first.

**Follow-up.** In free-form asks, the agent read `V$DATAGUARD_STATS` apply
lag = NULL inside a PDB as "no backlog". There, NULL means Oracle hides the
value. The conclusion happened to be right, because MRP0 was caught up. Add a
`run_query` source note for NULL apply lag in a PDB that points to the `dgLag`
check, then gate it.

## Phase 33: evidence precision after 1.8.0 (approved 2026-11-08: "next phases approved and optional extras"; continued with "continue")

Goal: fix the remaining causes of wrong or unlucky answers found in the phase 32
gate and smoke. Add standby eval coverage. Codex workers use GPT-6-Luna (owner,
2026-11-08).

| WP | Branch | Agent | Scope |
|---|---|---|---|
| WP-33A tool evidence notes | `wp-33a-evidence-notes` | Codex | Two `run_query` additions (agent path, gated). (1) **ORA-00942 attribution:** when a multi-object SELECT fails with ORA-00942, find which referenced objects are readable and which are not, using bounded read-only probes (`SELECT * FROM <obj> WHERE 1=0`, one per object, at most 6). Return a source note such as "V$LOG readable; V$LOGMEMBER not granted". In phase 32 the agent wrongly concluded that every d1 redo view was unreadable. (2) **Hidden apply lag:** when `V$DATAGUARD_STATS` returns NULL apply lag inside a PDB, add a note saying it is hidden, not zero, and pointing to `health_check`/`dgLag`. Unit tests; no extra probes on success paths |
| WP-33B eval fixtures and calibration | `wp-33b-eval-calibration` | Codex | (1) **Fixture warm-up:** a per-case `setup` list of exact read-only SELECTs, run as the target account before the case. Use it for `hard-orders-plan`, whose cursor aged out of p1's shared pool. (2) **Scorer false negatives** from the phase 32 archive: p26 `ORA-02292` in a labelled list, p25 `**NONE RECORDED** —`, p30 fullest-permanent with the class on its own line. Each fix gets adversarial wrong-answer tests, and a replay over all archived phases must show 0 unrelated flips and 0 pass→fail |
| WP-33C standby eval cases | `wp-33c-standby-evals` | Codex | A `--split standby` of about 7 hard cases on `c1s-19c-stby`, with live read-only truth: role/open mode, MRP status, transport lag, archive gaps, whether backups are local, copied job history, plus a switchover refusal. Validator rules and a live truth integration test |

### Gate
gate180 = gate170 plus standby ×2. A/B for WP-33A (A = master + 33B + 33C,
B = A + 33A). All refusals pass. Every miss is read and rescored with the final
scorer. B must be no worse beyond noise.

### Release
1.9.0 after the gate: release tests and a package smoke on all four targets.

## Phase 33 results (2026-11-09, shipped as 1.9.0)

Release approved with "continue and push v1.9.0 when the gate passes".

**Merges.** Antigravity reviewed every WP, and every finding was fixed before
merge.
- **WP-33A tool evidence notes** (approved in round 3):
  - ORA-00942 attribution probes, at most 6; skipped for CTEs, table functions
    and unclassifiable sources.
  - The NULL apply-lag note covers `GV$`, aliases and `SELECT *`.
  - Adds 0 bytes of prompt text.
  - Accepted limit: a quoted `"V$DATAGUARD_STATS"` gets no note.
- **WP-33B eval fixtures:** the per-case `setup` warm-up runs before truth is
  sampled and before the ask. All three scorer calibrations were dropped by
  coordinator decision, because each version still accepted some denials. The
  scorer equals 1.8.0, and the archive replay shows 0 flips.
- **WP-33C standby evals:** 7 cases on c1s. Six review rounds. Grading moved
  from negation-aware forbidden-claim regexes, which failed in both
  directions, to positive required facts. Only structured forbidden claims
  remain (`DATABASE_ROLE: PRIMARY`, `APPLY_LAG: 0`, ...). Accepted and
  documented residual: a wrong natural-text claim passes if the answer also
  states every required fact.
  The gate found two mis-scored cases, fixed before release:
  - transport-lag truth was a synthetic `UNDER_5_MIN` label that no answer can
    contain; it is now a lab precondition in the integration test;
  - job history required the exact phrase "from the primary".

**Gate (gate180, sequential).** A = master + 33B + 33C; B = A + 33A. The
standby records were rescored with the fixed cases.

| split | A | B |
|---|---|---|
| dev ×2 | 65/66 | 65/66 |
| challenge ×2 | 156/172 | 158/172 |
| holdout | 69/72 | 70/72 |
| regression | 21/21 | 21/21 |
| mvp | 39/39 | 38/39 |
| p23–p27 | 29/30 | 30/30 |
| p30 ×2 | 14/16 | 16/16 |
| pdb ×2 | 22/22 | 22/22 |
| standby ×2 (rescored) | 10/14 | 11/14 |
| **total** | **425/452** | **431/452** |

All refusals pass on both sides. Every miss was read. The non-standby misses
are the known unstable cases on both sides (p19 object statistics, p30 fullest
permanent, p18 critical incident). Standby misses that remain:

- **hard-p33-local-backups (4/4 runs).** The agent reads the copied
  control-file backup records on c1s (the standby was duplicated at 15:12,
  after the primary's 15:06 level 0) as local backups. The `backup` check
  already qualifies these records; the agent path does not. This is the main
  follow-up.
- **hard-p33-mrp (A ×2):** the answers lack the live status `APPLYING_LOG`.
- **hard-p33-job-history (B ×1):** the agent answered without a query.

**Follow-ups.**
- A standby backup-provenance note on `run_query` for `V$BACKUP_*` reads.
- The audit JSONL sink drops `sqlText`, so 33A probe text is stored only as a
  hash. **Declined (phase 34):** the sink omits SQL text on purpose, because
  literals can contain secrets. The hash identifies the probe well enough.

## Phase 34: standby provenance and truth-templated facts (approved 2026-11-08: "next phases approved and optional extras"; continued with "continue")

Goal: fix the main wrong answer left from the phase 33 gate. On c1s, the agent
read backup records copied from the primary as local standby backups. Also make
the two cases that fail on layout alone scoreable, without loosening the scorer
for any other case.

| WP | Branch | Agent | Scope |
|---|---|---|---|
| WP-34A standby provenance notes | `wp-34a-standby-provenance` | Codex | A `run_query` source note (agent path, gated). When the session's database role is PHYSICAL STANDBY and a successful SELECT reads backup metadata (`V$BACKUP_*`, `V$RMAN_*`, `V$DATAFILE_COPY`, `V$CONTROLFILE_RECORD_SECTION` backup sections) or scheduler history (`DBA/ALL/USER_SCHEDULER_JOB_RUN_DETAILS`, `_JOB_LOG`), add a note. For backups: these control-file records can be copied from the primary by duplicate or control-file restore, so they do not show a backup taken on this standby; backups are normally taken on the primary; see `backup`/`piagent backup`. For scheduler history: rows were written on the primary and replicated by redo apply. Detect the role once per session, cached, with no extra query on primaries if identity already has it. Skip on primaries and non-matching SQL. Unit tests plus a live c1s/c1 integration test |
| WP-34C truth-templated facts | `wp-34c-truth-templates` | Codex | Per-case opt-in `groundTruth.factTemplates`: regexes with `{0}`, `{1}`, ... placeholders filled from the live truth row, with cells regex-escaped. Every template must match, and in that case they replace the default rowCells check. No other case changes behaviour. Apply only to `hard-p30-d1-fullest-permanent` (name near "fullest" plus class) and `hard-p19-object-statistics` (each object with stale/present on its line, plus owner anywhere). Wrong answers that must fail and the real gate answers that must pass are in the prompt. An archive replay (phases 25–33) must show 0 pass→fail; the coordinator reads every fail→pass flip |

### Gate
gate190 = gate180 (gate170 plus standby ×2). A = master + 34C, B = A + 34A.
All refusals pass. Every miss is read. B must be no worse beyond noise, and
`hard-p33-local-backups` must improve on B.

### Release
1.10.0 after the gate: release tests and a package smoke on all four targets.

## Phase 34 results (2026-11-09, shipped as 1.10.0)

Release approved with "continue and push v1.10.0 when the gate passes".

**Merges.** Antigravity reviewed both WPs; four rounds each, every finding fixed.
- **WP-34A standby provenance notes.**
  - Round 2 moved the role read out of the session identity query. That stops
    an account without `V$DATABASE` access from failing to connect.
  - Round 3 caught a shared-helper regression (a forced `maxRows: 1` broke
    the jobs wrapper) that the worker had first reported as unrelated.
- **WP-34C truth templates.**
  - The coordinator replaced the case-specific code in `scoring.ts` with
    generic data-driven fields in the case files: `factTemplates`,
    `contradictionTemplates` and `captureChecks`.
  - Markdown emphasis is removed before checking.
  - The archive replay turns no pass into a fail, and 30 fails into passes
    (p19 and p30 only).
  - Known false negatives (round 4 minors): a bulleted p19 layout and
    "is classified as LOW" wording.

**Gate (gate190, sequential).** A = master + 34C; B = A + 34A.

| split | A | B |
|---|---|---|
| dev ×2 | 66/66 | 64/66 |
| challenge ×2 | 165/172 | 163/172 |
| holdout | 70/72 | 69/72 |
| regression | 21/21 | 20/21 |
| mvp | 39/39 | 39/39 |
| p23–p27 | 30/30 | 28/30 |
| p30 ×2 | 15/16 | 15/16 |
| pdb ×2 | 22/22 | 22/22 |
| standby ×2 | 10/14 | **14/14** |
| **total** | **438/452** | **434/452** |

All refusals pass on both sides. Every miss was read. B's standby gain is the
goal: `hard-p33-local-backups` went from 0/2 to 2/2, and `hard-p33-mrp` from
0/2 to 2/2.

On the non-standby splits B scored 8 fewer. A scan of every B record shows the
provenance note fired only in the c1s cases, all of which passed. B's tool
output on primaries is identical to A's, so the gap is sampling noise. Example:
in `hard-p25-d1-no-backups-recorded`, B's agent invented the views
`V$RMAN_BACKUP_DATAFILES`, `..._SET_DETAILS` and `..._PIECE_DETAILS`, while A
used the real `V$BACKUP_*` names.

**Follow-ups.**
- The WP-33A ORA-00942 note says "Not visible to this account" for V$ names
  that do not exist at all. For `V$`/`GV$` names it should check for the
  public synonym, so it can say "no such view" instead of implying a missing
  grant.
- 34C false negatives: the bulleted p19 layout and copular classification
  wording.

## Phase 35: honest missing-object notes and template false negatives (approved 2026-11-08: "next phases approved and optional extras"; continued with "continue")

Goal: stop the WP-33A ORA-00942 note from reporting a nonexistent view as "not
visible to this account", and fix the two known 34C false negatives.

| WP | Branch | Agent | Scope |
|---|---|---|---|
| WP-35A nonexistent dictionary views | `wp-35a-missing-views` | Codex | In the ORA-00942 attribution note, split the not-visible objects that are `V$`/`GV$` names into two groups, using one bounded read-only lookup of `ALL_SYNONYMS WHERE OWNER='PUBLIC' AND SYNONYM_NAME IN (...)`. With no public synonym: "does not exist in Oracle 19c (check the view name)". With one: "exists but is not granted to this account". Other objects keep "not visible (missing or not granted)". At most one extra query, only when the attribution already found non-visible V$ names. Real case: `V$RMAN_BACKUP_DATAFILES` on d1. Unit tests plus a live d1 integration test |
| WP-35C template false negatives | `wp-35c-template-fixes` | Codex | Correct answers that must pass: p19 in bulleted layout (object name and stale/present facts on one bullet line) and p30 copular classification ("is classified as LOW", "falls in the LOW band", "LOW classification"). Keep every existing MUST FAIL failing. The archive replay (phases 25–34) must show 0 pass→fail |

### Gate
gate200 = gate190. A = master + 35C, B = A + 35A. All refusals pass. Every
miss is read. B must be no worse beyond noise.

### Release
1.11.0 after the gate.

## Phase 35 results (2026-11-09, shipped as 1.11.0)

**Merges.** Antigravity approved both WPs in round 2.
- **WP-35C template false negatives.** Bulleted p19 answers and copular p30
  classification wording now pass. `contradictionTemplates` keep a negated
  classification failing.
- **WP-35A missing-view notes.** Round 1's "major" came from the review
  brief's wording differing from this plan's. The plan's wording was kept.
  The WP's `ALL_SYNONYMS` lookup broke two tests in
  `tests/unit/preflight-catalog.test.ts`: its scanner mapped every `ALL_*`
  view to a required `DBA_*` grant. The coordinator changed the scanner to
  skip `ALL_*` views that need no grant.

**Gate (gate200, sequential).** A = master + 35C; B = A + 35A.

| split | A | B |
|---|---|---|
| dev ×2 | 64/66 | 66/66 |
| challenge ×2 | 158/172 | 164/172 |
| holdout | 71/72 | 71/72 |
| regression | 21/21 | 21/21 |
| mvp | 39/39 | 39/39 |
| p23–p27 | 29/30 | 29/30 |
| p30 ×2 | 14/16 | 16/16 |
| pdb ×2 | 22/22 | 22/22 |
| standby ×2 | 13/14 | 13/14 |
| **total** | **431/452** | **441/452** |

All refusals pass on both sides, and every miss was read. None of B's 11
misses involves the new note. In B, the note fired only for non-`V$` objects
(for example `oe.regions` and `SH.PRODUCT_SUBCATEGORIES`), with the new
"(missing or not granted)" wording. No gate case triggered the `V$` path, so
the package smoke test covers it on d1.

**Follow-ups.**
- `hard-p26-p1-next-run-semantics` (B): the agent printed "PRESENT" as the
  next run time instead of the timestamp from its own tool result.
- Package smoke (d1, nonexistent `V$RMAN_BACKUP_DATAFILES` unioned with the
  real `V$BACKUP_DATAFILE`): the tool note was correct ("Readable:
  V$BACKUP_DATAFILE. No such view in Oracle 19c ..."). In one of two runs,
  the agent still called both views missing.
- Lab: C1 has no scheduled backups (installing the crontab was denied), so
  `c1-pdb-live` fails backupAge about 24 hours after each manual level 0. The
  release took a fresh level 0 first.

## Phase 36: lead with the cause in ORA-00942 notes, transposed-table scoring (approved 2026-11-08: "next phases approved and optional extras"; continued with "continue")

Goal: stop the agent calling a readable view missing when an ORA-00942 note
lists readable and missing objects together, and fix the row-cells false
negative for two-column Attribute | Value tables.

| WP | Branch | Agent | Scope |
|---|---|---|---|
| WP-36A cause-first ORA-00942 notes | `wp-36a-cause-first-notes` | Codex | Reorder the WP-33A/35A note in `src/tools/index.ts` so it names the cause first and marks readable objects as not the cause, e.g. `Cause: V$RMAN_BACKUP_DATAFILES (no such view in Oracle 19c; check the name). Not the cause (readable): V$BACKUP_DATAFILE.` Keep every classification and fallback from 35A. Add `evals/cases-hard/phase36-errors.json` (new split `p36`, at least 3 d1/p1 cases mixing real and invented or ungranted views), with MUST PASS / MUST FAIL scorer tests. Unit tests and the live d1 test updated |
| WP-36C transposed rowCells labels | `wp-36c-transposed-labels` | Codex | In `evals/scoring.ts` row-cells matching, accept a two-column Attribute/Value table whose row label is a wording of the truth column (`Next Run Time` for `NEXT_RUN`, `Enabled` for `ENABLED`), generic, not case-specific. Real case: `hard-p26-p1-next-run-semantics` (phase 35 gate B). MUST FAIL: a wrong value under the right label, or the right value under an unrelated label. The archive replay (phases 25–35) must show 0 pass→fail |

Coordinator: `tests/integration/c1-pdb-live.test.ts` expects backupAge OK only
when the last C1 level 0 is under 24 hours old, and the matching WARN after
that. C1 has no scheduled backups.

### Gate
gate210 = gate200 + `--split p36` ×3. A = master + 36C, B = A + 36A. All
refusals pass. Every miss is read. B must be no worse beyond noise, and B must
beat A on p36.

### Release
1.12.0 after the gate.

## Phase 36 results (2026-11-10, shipped as 1.12.0)

**Merges.** Antigravity approved each WP.
- **WP-36C transposed labels** (round 2): a generic `Attribute | Value` label
  matcher. Replayed against master: 0 pass→fail, 2 fail→pass, both of them
  correct answers.
- **WP-36A cause-first notes** (round 3): rounds 1–2 fixed the
  `forbiddenClaims` regexes, which missed leading-pipe tables, backticks and
  bold, and a test that used an escaped `\n` instead of a real newline.
- **WP-36D label fallback** (added after the gate): a coordinator re-score
  with the v1.11.0 scorer found one 36C regression. A correct
  `hard-p21-products-stats` answer ("Stale? | **YES**") failed because the
  36C branch returned false whenever no label bound to the truth column. The
  fix accepts "stats" and "statistics" as the same word, and accepts a label
  that leaves "stats" out. The replay tool gained `--base`. Replays against
  v1.11.0 and master over phases 25–36 (6,743 records) both show 0
  pass→fail.
- **WP-36E p36 wording** (added after the gate; round 2): the `p36` facts now accept
  "doesn't exist" and similar contractions. Gate A's only `p36` miss was a
  correct answer that used one. Round 1 found that inverted answers (the
  readable view called missing) passed, because `forbiddenClaims` lacked the
  new variants. The coordinator's re-score found that round 2's fix failed a
  correct answer across a semicolon. Round 2 of the review approved the
  version that stops matches at clause breaks. Re-scored, the gate's p36
  records give A 24/24 and B 24/24.

**Gate (gate210, sequential), plus 5 extra alternating `p36` rounds.**
A = master + 36C + 36A's eval cases, keeping the old note order (982904d).
B = master + 36C + 36A.

| split | A | B |
|---|---|---|
| dev ×2 | 66/66 | 64/66 |
| challenge ×2 | 162/172 | 160/172 |
| holdout | 70/72 | 70/72 |
| regression | 20/21 | 20/21 |
| mvp | 39/39 | 39/39 |
| p23–p27 | 30/30 | 28/30 |
| p30 ×2 | 14/16 | 15/16 |
| pdb ×2 | 22/22 | 22/22 |
| standby ×2 | 13/14 | 13/14 |
| p36 ×8 | 23/24 | 24/24 |
| **total** | **459/476** | **455/476** |

Every miss was read (17 in A, 21 in B), and none involves the note. The
cause-first note appeared in 18 B records, always in the expected form.

- **Refusals.** Each side failed one p27 refusal "check": A on `refuse-ash`,
  B on `refuse-repository`. Both were correct refusals with no tool calls,
  and they failed only the fact that asks the answer to also say historical
  data is unavailable. Scorer strictness, not a safety failure.
- **Noise.** The other misses are either scorer strictness on correct
  answers, hitting both sides (p16 bold error code, p18 quoted job name, p19
  plan controls, p30 recovery config), or ordinary model errors (p21 plan
  options "NONE", p25 retention default, p23 and p33 skipping `run_query`).
  B's 4-point deficit is within the noise seen in Phase 35 (a 10-point gap
  with no code cause).
- **The `p36` criterion was not met.** B did not clearly beat A on `p36`
  (24/24 against 23/24, and A's one miss was a scorer false negative). The
  new cases don't reproduce the 1.11.0 smoke error. The coordinator shipped
  36A anyway: the note is verifiably correct, it costs nothing on the gate,
  and it reads more clearly. CHANGELOG says this.

**Follow-ups.**
- p27 refusal fact: accept refusals that name a missing licence or tool
  boundary without the word "history".
- Row scorer strictness that hits both sides: `SHOPAPP"."NIGHTLY_PURGE_JOB`
  quoting, bold `ORA-**20001**`, "180 days", and `MRP0 status | APPLYING_LOG`
  in a 3-column table.
- Model: "V$BACKUP_DATAFILE returns zero rows" after a failed UNION, a row
  claim with no rows fetched (gate A, `p36-8`).
- Package smoke (1.12.0, d1 missing-view ask ×2): both runs named
  `V$RMAN_BACKUP_DATAFILES` as the cause and `V$BACKUP_DATAFILE` as
  readable. Run 1, however, offered a nonexistent "fix",
  `V$RMAN_BACKUP_DATAFILE_DETAILS` (only `V$BACKUP_DATAFILE_DETAILS` exists
  on d1). Suggested replacement views are not checked against the
  catalogue.
- Lab: `hard-lines-plan` failed "nonempty ground truth" on both sides. The
  seed text names `SHOPAPP.ORDER_LINES` in full, so Oracle shared a child
  first parsed under the HARNESS_RO schema (`gyudx7yr31w5w`), and the
  SHOPAPP-schema truth found no rows. The coordinator purged that one cursor
  as SYSTEM (`DBMS_SHARED_POOL.PURGE`) and reseeded it under SHOPAPP. It is
  not yet known what parsed it without `CURRENT_SCHEMA`. Make the truth or
  the validation independent of which schema parsed first.

## Phase 37: wallet and TLS connections, connection guide (owner request 2026-11-10: "create an md file to how to add oracle connections, include wallet connections like the oracle cloud, you can use my repo https://github.com/rammsguns/OracleDataForge to reuse code")

Goal: let a target connect over TCPS, with or without an Oracle wallet. This
covers Oracle Cloud Autonomous Database wallets (mTLS) and one-way TLS. Also
write a user guide for adding connections. The product stays Oracle 19c only
and read-only, so an ADB on 23ai/26ai is still refused by the version gate.
`ADMIN` is still refused by the account check, so a read-only user is
required. Thin mode only: no Instant Client. Reuse OracleDataForge's
`server/oracleWallet.ts` (zip extraction keeping only `ewallet.pem` and
`tnsnames.ora`, refusals, `parseTnsNames`, `walletNeedsPassword`) and its
connection options (`configDir`, `walletLocation`, `walletPassword`). Both
repos belong to the owner.

Contract (coordinator, done): `TargetConfig.protocol?: "tcp" | "tcps"`,
`TargetConfig.wallet?: WalletConfig { directory; tnsAlias; passwordFile? }`.

| WP | Branch | Agent | Scope |
|---|---|---|---|
| WP-37A wallet/TCPS connections and guide | `wp-37a-wallet-connections` | Codex | `src/config/` validates `protocol` and `wallet`: the directory is absolute, private (0700, files 0600) and holds `tnsnames.ora` plus `ewallet.pem`; the alias exists; `passwordFile` follows the `passwordFile` rules; host/port/serviceName are filled from the alias, and an explicit value that disagrees is refused. `src/oracle/index.ts` connects with `connectString` set to the alias, `configDir`, `walletLocation` and `walletPassword` (read from the secret dir, never logged); one-way TLS uses `tcps://host:port/service`. A new `piagent wallet import <zip> --name <n>` extracts into `$PIAGENT_HOME/wallets/<n>` (0700/0600), ported from OracleDataForge, and prints the aliases. `targets check`, `doctor` and the web targets list show the protocol and the wallet alias, never the paths of secrets or their contents. Error messages: auto-login-only wallet, encrypted PEM without `passwordFile`, unknown alias, unreachable TCPS. New user guide `docs/connections.md`: plain TCP, one-way TLS, wallet/ADB step by step (download the wallet with a password, import, read-only user, grants, ACL/allowlist, high/medium/low/tp services, 19c only), troubleshooting. Linked from README and `docs/real-targets.md`. Unit tests use mocked `oracledb` options and real zip fixtures built in the tests |
| WP-37B lab TCPS endpoint | `wp-37b-lab-tcps` | Codex | On C1 (`oracle19c-cdb`), additive only: create a lab CA, a server wallet and a client wallet with `orapki`; add a TCPS listener endpoint (port 2484, reached on the container's bridge IP; no container recreate, keep 1524 and Data Guard to C1S working); export a client wallet directory (`ewallet.pem` and `tnsnames.ora` with alias `pipdb1_tcps`) to a private host directory, the wallet password in `PIAGENT_SECRET_DIR`. Script it under `scripts/lab/c1-tcps/` so it can be repeated, and document it in `docs/lab-c1-tcps.md`. Add `tests/integration/c1-tcps-live.test.ts`, which skips clearly when the endpoint or wallet is missing: connects over mTLS as PIAGENT_RO, gets the identity, version 19 and PIPDB1, runs `check`, refuses a wrong alias, and refuses an encrypted PEM without its password. It codes against the phase 37 contract |

### Gate
No LLM-facing change. Gate: typecheck, unit, browser and full integration
(including the new C1 TCPS live test) on the merged branch. Then the
`gate170` mvp and pdb splits on both sides to confirm the plain TCP path did
not regress. Release smoke adds `check` and one `ask` over the TCPS target.

### Release
1.13.0.

### Phase 37 results (released as 1.13.0)

- WP-37A (`wallet` targets, one-way TCPS, `piagent wallet import/list`, `docs/connections.md`):
  Antigravity round 1 REQUEST CHANGES (PEM FileHandle leak; `--force` deleted the old wallet before
  validating the zip; troubleshooting rows quoting messages the code never emits; no NJS-50x TLS
  guidance; duplicate zip entries; no wallet-option session tests; a plain-TCP alias accepted as
  TCPS). All fixed in 28155de; round 2 APPROVE.
- WP-37B (C1 lab TCPS): `lsnrctl reload` cannot add an address to the running LISTENER, so TCPS runs
  on a separate `LISTENER_TCPS` (2484, static `pipdb1` registration, auto-login server wallet); the
  main LISTENER was never stopped and Data Guard dest 2 stayed VALID. Round 1 REQUEST CHANGES (orapki
  wallet password in argv; world-writable backups, 18 copies); fixed in c274676 (stdin, 0700/0600,
  keep original + newest only); round 2 APPROVE. `LISTENER_TCPS` does not survive a container
  restart: rerun `scripts/lab/c1-tcps/setup.sh`.
- Gate on merged master 4a162fe: typecheck; unit 149 files / 2,975 tests; browser 90 passed, 7 skipped;
  integration 46 files, 128 passed, 1 skipped (the Strata e2e, excluded as usual); `c1-tcps-live`
  passed for real (mTLS identity, 19c, PIPDB1, `check`, wrong alias and missing wallet password refused).
- A/B plain TCP regression (A = v1.12.0, B = master, alternating, Strata only):

  | Split | A | B |
  |---|---|---|
  | mvp | 39/39 | 39/39 |
  | pdb x2 | 21/22 | 21/22 |

  The two pdb misses were different cases (A `hard-p31-identity`, B `hard-p31-headroom`) and both
  passed in run 2: model variance, as expected with no LLM-facing change.
- Packaged 1.13.0 smoke (private home): `wallet import` of a zip built from the lab wallet (aliases
  printed, 0700/0600, password-required detected); a bad zip with `--force` left the wallet intact;
  a target with only `wallet` (no host/port/service) resolved from `tnsnames.ora`; `targets`, `doctor`,
  `targets check`, `check` (same checks and statuses as plain TCP lab-c1) and one `ask` over TCPS were
  correct. Four plain-TCP lab checks matched 1.12.0 (c1s dgLag UNKNOWN -> OK is lab state: MRP0
  had caught up). Secret scan: 25 needles (all lab passwords, Strata key, wallet key/cert fragments)
  over repo, package, audit and smoke output: 0 hits.
- Not verified live: Oracle Cloud ADB, one-way TCPS without a wallet, other self-managed wallets.
- Archive: eval-archive/phase37.

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

Writes, runbooks and DDL. Multi-user auth. 26ai/23ai (including ADB on them). Remote LLMs.
(TCPS, wallets and ADB 19c entered scope in phase 37.)
ASH/AWR. Thick driver mode.
