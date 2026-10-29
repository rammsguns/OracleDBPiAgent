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

### Housekeeping
Remove the merged phase 2 worktrees and archive their eval results in
`eval-archive/phase2/`.

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

Writes, runbooks and DDL. Multi-user auth. 26ai/ADB/TCPS. Remote LLMs.
ASH/AWR. Thick driver mode.
