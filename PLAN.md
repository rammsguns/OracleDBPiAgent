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
| `d1-19c-lab` | `oracle19c` | `localhost:1522/ORCL` | `HARNESS_LAB` (role `HARNESS_DIAGNOSTICS_ROLE`, no ANY privs) | `HR` | 19.9.1 EE non-CDB; sample schemas HR, OE, SH (918k SALES rows), CO, PM, IX, BI |
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
4. **Explain plan.** `EXPLAIN PLAN` writes to `PLAN_TABLE`, so it cannot run in a
   read-only transaction. The `explain_plan` tool accepts only a statement the
   classifier allows. It runs `EXPLAIN PLAN SET STATEMENT_ID = :id FOR <sql>` and
   reads `DBMS_XPLAN.DISPLAY('PLAN_TABLE', :id, 'TYPICAL')`, then **rolls back**. If
   the account cannot write to PLAN_TABLE, the tool falls back to
   `DBMS_XPLAN.DISPLAY_CURSOR` for a `sql_id`. Check which works on both targets and
   document it.
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

The coordinator (the Claude session in `needlefish`) merges each branch into
`needlefish`, then into `master`. It runs `npm run typecheck`, `npm test`,
`npm run test:integration` and `npm run eval`, and records results in
`docs/mvp-status.md`.

## MVP exit criteria

- [ ] `npm run typecheck` and `npm test` pass; integration tests pass against both 19c containers and Strata.
- [ ] `piagent doctor` passes on this host; it fails clearly when Strata is unloaded or a DB is down.
- [ ] Against a non-19c DSN (`oracle23ai_dataset` at `localhost:1521/FREEPDB1` as `HARNESS_LAB` with `d2_lab.pw`, used only by the gate integration test and never as a target), the gate refuses.
- [ ] The read-only policy unit suite has at least 60 cases; no write reaches either DB.
- [ ] Eval pass rate is at least 80% on the cases, and every refusal case passes.
- [ ] Every tool call is in `var/audit.jsonl`.
- [ ] Nothing in the code or config can reach a non-loopback LLM endpoint.

## Out of scope for MVP

Writes, runbooks and DDL. Web UI. Multi-user auth. 26ai/ADB/TCPS. Remote LLMs.
ASH/AWR. Thick driver mode.
