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
`d1-19c-lab` and `p1-19c-prod`.

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
npm run piagent -- report --target d1-19c-lab --sections identity,tablespaces --md
```

Set `PIAGENT_SECRET_DIR` to the directory containing the password files named in
`config/targets.json`. `PIAGENT_LLM_API_KEY_FILE` points to Strata's existing key
file. `.env` holds settings and paths, not secrets; never commit secrets.
The CLI reads process environment settings, so copying `.env` alone does not load it.

`ask` accepts `--json`. After `npm run build`, run the compiled CLI with
`node --env-file=.env dist/cli/index.js targets`. The package's `piagent` executable
points to that file; after `npm link`, use `piagent targets|doctor|ask|chat|web|report`
(choose one command, with the same arguments as above).

`report` requires `--target` and runs 14 bounded read-only DBA checks without the
LLM. Markdown is the default (`--md`); `--json` emits one report object.
`--sections identity,tablespaces,top_sql` selects checks; `--owner HR` selects the
schema for statistics/index checks. Missing grants become section notes.
`--summarize` adds one local LLM call with prioritised read-only advice. It appends
text even with `--json`; omit it for a single JSON value. Summary numbers are
checked against the report and unsupported values appear as Unverified, with no
correction call. See [report details](docs/report.md).

The default grounding check compares hard facts with tool evidence, accepting
rounding and unit conversions. Only unsupported numbers with four or more
significant digits can trigger one correction turn; identifiers are flagged only.
Refusals and runs without successful tools skip the check. `ask --json` includes
`unverified: string[]` for remaining unsupported facts. Set
`PIAGENT_GROUNDING_CHECK=0` to disable checking or `=1` to enable it (also for
report summaries). This lexical check does not prove reasoning or row attribution.
See [grounding details](docs/grounding.md).

## Web UI

`web` binds only to `127.0.0.1` on port 8765 (`--port N` overrides it).
Open the printed `http://127.0.0.1:N/#token=...` URL and keep it private.
The page shows a target picker, streamed chat, tool-call trace, session audit and
health checks, with a Stop button. The Report tab runs the selected target's DBA
checks with an optional summary; chat and report summaries show Unverified notes
when facts remain unsupported. Export Markdown downloads the displayed conversation,
grounding notes and trace; trace arguments omit SQL, binds and connection fields.
The token stays in browser memory; reopen the original URL after reloading. The build copies the page into `dist/web/static/`.
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
