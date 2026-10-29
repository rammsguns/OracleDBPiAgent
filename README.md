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

## Quick start

Use Node 24 and npm. Have the two approved Oracle 19c targets in
[config/targets.json](config/targets.json) available: `d1-19c-lab` on
`localhost:1522/ORCL` and `p1-19c-prod` on `localhost:1523/PRODCDB`, with their
configured read-only accounts and grants. The local OpenAI-compatible LLM endpoint
must be loaded Strata at `http://127.0.0.1:8080/v1`, with the model named in
[.env.example](.env.example). A generic cloud endpoint is not supported.

From a clone of this repository:

```bash
npm ci
cp .env.example .env
chmod 600 .env
```

Edit `.env` before continuing: replace the example machine paths with your own
absolute paths, such as `PIAGENT_SECRET_DIR=/absolute/path/to/db-secrets` and
`PIAGENT_LLM_API_KEY_FILE=/absolute/path/to/strata-api-key`. Keep the loopback URL
and approved target definitions. `.env` holds settings and file paths, never
passwords or the API key, and must stay uncommitted.

Provision these existing credentials outside the repository; setup does not
create accounts or change database grants:

| File | Format |
|---|---|
| `<PIAGENT_SECRET_DIR>/d1_lab.pw` | Plain UTF-8 password for the configured `HARNESS_LAB` account on d1. |
| `<PIAGENT_SECRET_DIR>/p1_harness_ro.pw` | Plain UTF-8 password for the configured `HARNESS_RO` account on p1. |
| `<PIAGENT_LLM_API_KEY_FILE>` | Plain UTF-8 Strata API key. |

Each file contains only its credential, with an optional trailing newline (the
reader trims surrounding whitespace); use mode `600` and a private directory.
Do not put credentials into commands, docs or git.

Load the settings explicitly; copying `.env` alone does not load it:

```bash
npm run build
node --env-file=.env dist/cli/index.js report --target d1-19c-lab
```

The report runs bounded read-only checks without the LLM. Before asking a
question, check Strata:

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/health
```

Continue only if health reports the model loaded. If it is unloaded or
unavailable, stop and ask its operator; do not restart or reconfigure it.
Run requests one at a time:

```bash
node --env-file=.env dist/cli/index.js ask "How many rows are in SH.CHANNELS?" --target d1-19c-lab
node --env-file=.env dist/cli/index.js web
```

Open the private loopback URL printed by `web`, then stop the server with
Ctrl-C when finished. Starting the UI does not itself ask the LLM a question.
The compiled CLI needs no global installation. `ask` also accepts `--json`;
`targets`, `doctor` and `chat` are available through the same Node invocation. See the [documentation index](docs/README.md)
and [changelog](CHANGELOG.md) for more.

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
