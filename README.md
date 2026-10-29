# OracleDBPiAgent

A read-only Oracle 19c DBA assistant built on the PI agent SDK. It uses only the
local Strata LLM at `http://127.0.0.1:8080/v1`.

## Rules

- Use only the two approved targets in `config/targets.json`. Every session checks for Oracle 19c.
- No database writes, DDL or changing PL/SQL. No SYS, SYSTEM, HARNESS_APP or SHOPAPP credentials.
- No cloud LLMs. Send Strata requests one at a time. Do not restart or reconfigure Strata; stop if it is unloaded.
- Keep passwords and API keys outside the repo. Audit records omit bind values and credentials.
- No ASH/AWR. Plans come from cached cursors; `EXPLAIN PLAN` is never executed.

See [PLAN.md](PLAN.md) for scope and [AGENTS.md](AGENTS.md) for contributor rules.

## Setup and commands

Use Node 24, npm, loaded Strata, and the two local 19c containers:
`d1-19c-lab` (`localhost:1522/ORCL`) and `p1-19c-prod` (`localhost:1523/PRODCDB`).

```bash
npm ci
cp .env.example .env
# Edit .env with local paths, then load it for npm commands:
export NODE_OPTIONS="--env-file=.env"
npm run piagent -- targets
npm run piagent -- doctor
npm run piagent -- ask "Which SH channels had the highest sales amount in 2001?" --target d1-19c-lab
npm run piagent -- chat --target p1-19c-prod
npm run piagent -- web
```

Set `PIAGENT_SECRET_DIR` to the directory containing the password files named in
`config/targets.json`. `PIAGENT_LLM_API_KEY_FILE` points to Strata's existing key
file. `.env` holds settings and paths, not secrets; never commit secrets.
The CLI reads process environment settings, so copying `.env` alone does not load it.

`ask` accepts `--json`. After `npm run build`, run the compiled CLI with
`node --env-file=.env dist/cli/index.js targets`. The package's `piagent` executable
points to that file; after `npm link`, use `piagent targets|doctor|ask|chat|web`
(choose one command, with the same arguments as above).

## Web UI

`web` binds only to `127.0.0.1` on port 8765 (`--port N` overrides it).
Open the printed `http://127.0.0.1:N/#token=...` URL and keep it private.
The page shows a target picker, streamed chat, tool-call trace, session audit and
health checks, with a Stop button. The token stays in browser memory; reopen the
original URL after reloading. The build copies the page into `dist/web/static/`.
See [web UI details](docs/web-ui.md) for the API and controls.

## Tools

These are the 12 tools registered in `src/tools/index.ts`:

| Tool | Purpose |
|---|---|
| `list_targets` | List configured database targets. |
| `db_overview` | Show database identity, startup, character set, size and memory. |
| `list_schemas` | List application schemas with object counts and segment bytes. |
| `list_objects` | List schema objects with filters and paging. |
| `describe_object` | Show columns, constraints, indexes and statistics; FK parents need a dictionary lookup. |
| `get_source` | Read paged view or PL/SQL source, at most 200 lines per call. |
| `run_query` | Run one bounded read-only SQL statement. |
| `explain_plan` | Read a cached plan by SQL ID or matching SQL text. |
| `top_sql` | Rank SQL by elapsed time, CPU, buffer gets or executions. |
| `session_activity` | Show active sessions, waits, blockers and lock counts. |
| `wait_events` | Show top non-idle system wait events. |
| `tablespace_usage` | Show tablespace allocation, free bytes and autoextend. |

## Checks and evals

```bash
npm run typecheck
npm test
npm run test:integration
npm run eval
npm run eval -- --suite evals/cases-hard --split dev --repeat 2
npm run optimize:report
```

Unit tests need no DB or LLM. Integration tests skip with a reason when a dependency
is down. Evals need both targets and loaded Strata; run only one eval or optimizer
process at a time. Results go to ignored `evals/results/`.

See the [documentation index](docs/README.md) for status, evals, reports and reviews.
