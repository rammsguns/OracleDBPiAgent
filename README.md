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

## Install

With Node 24 and npm, install from a clone:

```bash
git clone https://github.com/rammsguns/OracleDBPiAgent.git
cd OracleDBPiAgent
npm ci
npm install -g .
piagent --version
piagent init
```

Edit the placeholder credential-file
paths in `~/.piagent/.env`, then run `piagent targets` from any directory.
The CLI loads that private file automatically; existing environment variables
win. Set `PIAGENT_HOME` or `PIAGENT_ENV_FILE` to select another location.
See [install details](docs/install.md) for permissions, defaults and overrides.

## Quick start

Use Node 24 and npm. Have the two approved Oracle 19c targets in
[config/targets.json](config/targets.json) available: `d1-19c-lab` on
`localhost:1522/ORCL` and `p1-19c-prod` on `localhost:1523/PRODCDB`, with their
configured read-only accounts and grants. The local OpenAI-compatible LLM endpoint
must be loaded Strata at `http://127.0.0.1:8080/v1`, with the model named in
[.env.example](.env.example). A generic cloud endpoint is not supported.

After the clone/global install above, `piagent init` creates a private
`~/.piagent/.env`. Edit its placeholder paths:

- `PIAGENT_SECRET_DIR`: private directory containing `d1_lab.pw` for `HARNESS_LAB`
  and `p1_harness_ro.pw` for `HARNESS_RO`.
- `PIAGENT_LLM_API_KEY_FILE`: private file containing the existing Strata key.

Credential files contain only their credential with an optional trailing newline;
use mode 600 and a private directory. Setup creates no accounts or grants.
The CLI automatically loads the private env file; existing environment variables
win. It never automatically loads the working directory's `.env`.

```bash
piagent targets
piagent report --target d1-19c-lab --sections identity
```

Reports use bounded read-only queries and no LLM unless `--summarize` is supplied.
Audit defaults to `~/.piagent/audit.jsonl`; saved report history defaults to
`~/.piagent/reports`. Set `PIAGENT_HOME` for another private home, or explicit
`PIAGENT_AUDIT_FILE` / `PIAGENT_REPORT_DIRECTORY` paths to retain clone-local
artifacts. Reports save only with `--out` or a diff option. See
[installation and migration](docs/install.md).

Before LLM use, have the operator confirm Strata is loaded. Stop if it is unloaded;
do not restart or reconfigure it. Run requests one at a time:

```bash
piagent ask "How many rows are in SH.CHANNELS?" --target d1-19c-lab
piagent web
```

Open the private loopback URL printed by `web`; stop with Ctrl-C.
Starting the server alone makes no LLM call; browser health checks contact Strata.
For clone development, the equivalent invocation is
`node --env-file=.env dist/cli/index.js targets` after building and configuring a
private `.env`. See the [documentation index](docs/README.md).

## Commands

`piagent --help` lists commands; each command accepts `--help`.

| Command | Behavior / options |
|---|---|
| `piagent --version` | Installed package version. |
| `piagent init` | Create private configuration without overwriting it. |
| `piagent targets` | List approved targets; no DB or LLM call. |
| `piagent doctor` | Check Strata health, both 19c targets and account privileges. |
| `piagent ask "question" --target d1-19c-lab --json` | One agent question; target and JSON are optional. Uses the LLM. |
| `piagent chat --target d1-19c-lab` | Interactive agent conversation; optional target. Uses the LLM. |
| `piagent web --port 8765` | Loopback web server; port is optional. |
| `piagent report --target d1-19c-lab` | Fourteen fixed checks; `--md` (default), `--json`, `--sections`, `--owner`, `--out`, `--diff`, `--diff-only`, optional LLM `--summarize`. |
| `piagent report history --target d1-19c-lab --last 10 --json` | Saved-file trends; last 1–30 (default 30), optional JSON. No DB/LLM. |
| `piagent report schedule --target d1-19c-lab --every 1h` | Print setup, systemd service/timer and alternative cron line; optional `--out`. No installation or DB/LLM. |
| `piagent report schedule run --target d1-19c-lab` | Run the scheduled read-only report; optional absolute `--home` and `--out`. |
| `piagent drift --left d1-19c-lab --right p1-19c-prod --scope schema:HR --json` | Compare visible metadata; scopes `parameters`, `schema:OWNER`, `objects:OWNER`; optional JSON and `--out`. No LLM. |

Manual `schedule run` defaults to `<PIAGENT_HOME>/reports`; pass `--out`
explicitly when using a separate report directory. The generated schedule pins
the directory selected when it was printed.

Before `report schedule run`, initialize the private home env file and execute the
printed one-time setup outside the service sandbox. Choose either timer or cron
and one writer per output directory. Exit 3 from a report diff records a local
alert and the schedule runner succeeds. See [reports and scheduling](docs/report.md).
Drift exits 0 for complete equality, 3 for observed differences, or 1 for incomplete
results without observed differences/failure. Inspect `complete` even on exit 3;
p1 parameter visibility can be unavailable. See [drift](docs/drift.md).

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
checks with an optional summary and includes a saved-file History panel with
sparklines and worsening flags. The Drift tab compares parameters, schema or object
metadata without an LLM. Chat and report summaries show Unverified notes
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
process at a time. Hard splits are `dev`, fresh `holdout`, `regression` and
separately reported `challenge`; opt-in `rowCells` checks row attribution. The
[secondary endpoint](docs/evals-two-servers.md) is eval-only and opt-in; gates
remain on the primary. Results go to ignored `evals/results/`.

See the [documentation index](docs/README.md) for status, evals, reports and reviews.
