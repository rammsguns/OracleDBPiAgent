# Changelog

All notable changes are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2026-11-05

### Added

- Twelve blind holdout cases covering PL/SQL, ADR, SQL performance and security;
  legitimate empty truth is skipped. See [eval hygiene](docs/wp-21b-eval-hygiene.md).

- `piagent sql` drills into one cached SQL statement:
  - cursor children with per-execution timings;
  - plans from `DBMS_XPLAN.DISPLAY_CURSOR`, falling back to `V$SQL_PLAN`;
  - plan changes;
  - table and index statistics with stale flags;
  - baselines, profiles, bind metadata (never values) and cursor-sharing
    reasons;
  - findings: plan instability, stale statistics, large full scans on the
    nested-loop inner side, and high child counts.

  `--text` opens a unique untruncated match; otherwise it lists candidates for
  explicit selection with `--sql-id`. See [SQL insight](docs/sqlperf.md).
  The SQL policy accepts exactly
  `SELECT … FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(a, b, c))` and nothing else
  from the package.
- Triage pulls SQL evidence when an issue names a SQL_ID, or reports slowness
  on a named object. It ranks plan-regression, stale-statistics, full-scan and
  cursor-sharing hypotheses, with verify-next SQL that is shown, never run.
  The agent's own diagnostic statements are excluded from candidates.
- `piagent security` gives a read-only posture review:
  - open default-password accounts;
  - powerful privileges through nested roles (cycle-safe);
  - PUBLIC grants on sensitive packages;
  - password profiles grouped by effective limit;
  - account lifecycle, audit configuration and security parameters;
  - `--who-can OWNER.OBJECT` privilege paths.

  It never selects password hashes, `SYS.USER$` or audit trails; a
  parser-based test guards this. Advice is prose for a human DBA. See
  [security](docs/security.md).
- `report --sections security` (opt-in; the default report is unchanged),
  security severity trends in report history, and `drift --scope security`.
- Web SQL and Security tabs: a plan tree, plan changes, statistics badges,
  findings by severity and a who-can graph, in light and dark modes and at
  phone width.
- Eval suites p19 (SQL performance) and p20 (security). Cases can opt in to
  `skipWhenTruthEmpty`: when their cursor-cache truth is gone they are recorded
  as skipped and excluded from pass rates. The p19 scorer pools labelled facts
  and accepts equivalent UTC spellings.

- `piagent plsql list` and `piagent plsql doc` document PL/SQL packages,
  procedures and triggers. The output covers:
  - each subprogram's signature, with spec comments;
  - the tables each subprogram reads and writes (a heuristic scan of the body);
  - callers and scheduler jobs, and compile errors;
  - a line-numbered, redacted source appendix;
  - a Mermaid dependency diagram.
  See [PL/SQL docs](docs/plsql.md) and the
  [WORKLOAD example](docs/plsql-workload-example.md).
- `piagent triage` turns a reported issue into read-only evidence:
  - ORA/PLS codes and ORA-06512 frames;
  - source excerpts with their subprogram and statement;
  - scheduler run history and compile errors;
  - constraint details and configured log tables (`logTables`).
  From that it gives ranked root-cause hypotheses, a numbered debug checklist with
  the exact SQL for each step, a trace diagram, and suggested fixes, none of which
  are run. Named jobs with no runs in the window fall back to their latest runs,
  clearly labelled. `--summarize` adds a grounded Strata narrative.
  See [triage](docs/triage.md) and the examples for the
  [nightly purge](docs/triage-nightly-purge.md) and
  [dropped lab job](docs/triage-k7q-failjob.md).
- Web PL/SQL tab with a dependency graph drawn as SVG, and a Triage panel (paste an
  issue, choose a window, export Markdown). Chat `/triage [--since 7d] <issue>` in
  CLI and web chat. See [web UI](docs/web-ui.md).
- Ten PL/SQL challenge eval cases. See [hard evals](docs/evals-hard.md).
- `piagent alertlog` reads the database alert log and ADR incidents with
  bounded, read-only SQL (`V$DIAG_ALERT_EXT`, `V$DIAG_INCIDENT`,
  `V$DIAG_PROBLEM`); the agent never reads server files.
  - By default it shows errors and warnings.
  - Repeated messages fold together with counts, while different error codes
    and levels stay separate.
  - Credentials are redacted.
  - When access is missing, it shows the exact grant line.

  See [alert log](docs/alertlog.md).
- Triage uses the alert log:
  - it discovers failed jobs from ORA-12012 entries, so "nightly purge job
    failed last night" finds `SHOPAPP.NIGHTLY_PURGE_JOB`, its constraint and the
    failing line;
  - it reads ORA-06512 frames and ORA-02292 constraints from alert text;
  - it lists entries within ±10 minutes of failed runs, labelled as leads;
  - it lists incidents in the window;
  - it adds code-specific hypotheses, including VKTM ORA-00800;
  - its debug checklist includes the alert-log SQL.

  Alert-log failures never stop triage.
- Web Alert Log tab, and an alert section in the Triage panel. The web UI uses a
  dark theme across all tabs when the system prefers it.
- Six alert-log challenge eval cases (`p18`).

### Changed

- New SELECT-only grant requests, applied with owner authorization:
  - `docs/grants-request-2026-11-05-sqlperf.sql` (p1);
  - `docs/grants-request-2026-11-05-security.sql` (d1 and p1).
- Agent database sessions now run in UTC (`ALTER SESSION SET TIME_ZONE = '+00:00'`,
  session-only). Plain `TIMESTAMP` literals in agent SQL now mean UTC.
- Tool results now show time-zone-aware timestamps as ISO UTC with `Z`.
- DATE and plain TIMESTAMP values now show their stored clock time
  (`YYYY-MM-DD HH24:MI:SS`) instead of JavaScript local date strings.
- `QueryResult` gains optional `columnTypes`.
- `list_objects`, `describe_object` and `get_source` fall back to the matching
  `DBA_` view when the `ALL_` view hides an object the account can read through a
  grant. The result names the view that answered; tool definitions are unchanged.
  On PL/SQL challenge questions this raised the score from 17/40 to 32/40, and hard
  dev used fewer tokens. See [tool fallback](docs/wp-16e-tool-fallback.md).
- `HARNESS_LAB` (d1) and `HARNESS_RO` (p1) gained SELECT on `V$DIAG_ALERT_EXT`,
  `V$DIAG_INCIDENT` and `V$DIAG_PROBLEM`, applied once at the owner's request; see
  [the grant script](docs/grants-request-2026-11-04-alertlog.sql).
- p1 `HARNESS_RO` gained SELECT on six DBA_ PL/SQL dictionary views. This was
  applied once at the owner's request; see
  [the grant script](docs/grants-request-2026-11-04-plsql.sql).

- Triage recognizes job and object names without a `_JOB` suffix (one bounded,
  bound-variable lookup of up to 20 tokens). When a name is not found, triage says
  so and lists the views it searched.
- The empty-dictionary hint also covers comma joins (`FROM all_objects o,
  all_tables t`).
- A grounding correction now asks the model for its complete revised answer, so
  the explanation is no longer lost. On PL/SQL challenge questions this raised the
  score from 33/40 to 38/40.

### Fixed

- ADR incident status is decoded to a name in alert-log, triage and web output;
  JSON retains the numeric code. See [hardening](docs/wp-21a-lows.md).
- Init's API-key placeholder is rejected before health checks or database access;
  the configuration error names `PIAGENT_LLM_API_KEY_FILE`. The CLI entry point
  currently masks it with its generic failure message; see
  [installation guidance](docs/install.md#upgrade-to-120).
- Generated report schedules warn when the pinned Node executable is outside
  recognized stable installation paths. See [installation](docs/install.md).
- Eval hygiene: ground-truth sessions use UTC; p18 scoring accepts spaced problem
  keys in labelled bullets; row-cell scoring accepts complete labelled records
  without pooling separate records. The description-language holdout accepts
  equivalent `describe_object` evidence. Archive replays and truth comparisons
  are recorded in [WP-21B](docs/wp-21b-eval-hygiene.md).

- PL/SQL dependency graph labels are readable in dark mode, and the graph
  no longer clips its right-most nodes.
- Grounding no longer flags SQL/PL/SQL keywords (`FOR EACH ROW`), or numbers that
  differ from the evidence only by a leading minus (`20205` vs `-20205`). An
  `OWNER.NAME` now counts as verified when both parts appear in the same tool
  result, or when that result's call named the owner as its schema.
- Challenge scoring: one-cell value lists (`INSERT OR UPDATE OR DELETE`) satisfy
  single-column truth rows; negated cells still fail.
- Challenge scoring: Unicode dashes in ORA codes, and child/parent rows of a
  constraint table, are now matched; wrong layouts still fail. Earlier records
  are unchanged.

## [1.1.0] - 2026-11-04

### Added

- Fresh 12-case holdout, with the former 21 holdout cases retained as a separate
  regression split. See [hard evals](docs/evals-hard.md).
- Challenge evals and a harder second round, scored separately from the existing
  splits. See [challenge evals](docs/evals-hard.md).
- Opt-in eval-only secondary Strata through `127.0.0.1:18080`, with endpoint locks
  and product isolation. Gates remain on the primary after the same-code comparison;
  balanced gates were not adopted. See [two-server evals](docs/evals-two-servers.md)
  and [phase 10 results](PLAN.md#phase-10-second-strata-for-evals-approved-2026-10-30).
- Saved-report trends through `report history`, plus `report schedule` to print
  systemd/cron configuration and one-time setup, and `report schedule run` for
  execution and local alerts. Nothing is installed automatically.
  See [history and scheduling](docs/report.md).
- Web Report History panel with sparklines and worsening flags, plus a Drift tab.
  See [web UI](docs/web-ui.md).
- Read-only `drift` CLI for parameter, schema and object comparisons between the
  approved targets, with JSON/Markdown exports and explicit incomplete results.
  See [drift](docs/drift.md).

### Changed

- Global CLI installation from a clone or tarball, private `piagent init`
  configuration and automatic private env loading. Audit and report-history paths
  now default to `~/.piagent/`; explicit path overrides preserve clone workflows.
  See [installation and migration](docs/install.md).
- Dev tools updated: Vitest 5.1.0 and Node types 26.6.6.
  See [dependency refresh](PLAN.md#phase-14-dependency-refresh-approved-2026-11-03).
- PI SDK 1.4.0 → 1.5.0 (pinned). Requests to Strata are unchanged; tool
  arguments are now validated by pi-schema with scalar coercion, and read-only
  enforcement is unaffected. No new telemetry or network calls. The eval gate showed
  no pass-rate or token change beyond noise. See [PI SDK 1.5](docs/pi-sdk-1.5.md).

### Fixed

- Opt-in `rowCells` scoring checks related values together while accepting tables,
  records and numeric formatting; challenge checks no longer require `run_query`
  when another read-only tool supplies the evidence. See [scoring](docs/evals-hard.md).
- Schedule generation now uses a tested `schedule run` command, correctly emits
  `EnvironmentFile`, and prints non-destructive setup with path preflight checks.
  See [schedule helper](docs/report.md#schedule-helper-wp-12b).
- Report history accepts its own target option after schedule subcommand parsing
  was introduced. See [phase 12 results](PLAN.md#phase-12-results-2026-11-04-complete).
- Answers list every requested row instead of merging rows into ranges or
  "N more", and follow the requested output format. Hard dev went from 107/112 to
  112/112 and MVP from 37/39 to 39/39, with no token cost.
  See [phase 11 results](PLAN.md#phase-11-results-2026-11-04-complete).
- `rowCells` also accepts complete records in wider vertical tables, owner-qualified
  names and explicitly labelled single values, while wrong answers still fail.
  See [scoring](docs/evals-hard.md).

## [1.0.0] - 2026-10-29

### Added

- Oracle 19c DBA agent with 12 typed database tools, CLI ask/chat/doctor,
  bounded execution and credential-free audit records. Read-only SQL policy,
  per-session version gate, approved targets and local-only Strata protect access.
  See [compatibility and safety](docs/compatibility-19c.md).
- Local web UI with streamed chat, tool trace, health, stop controls and browser
  coverage; Report tab and Markdown export. See [web UI](docs/web-ui.md).
- Fourteen fixed read-only report sections, optional local summaries, saved
  reports and deterministic diffs for externally scheduled runs. See [reports](docs/report.md).
- Evidence grounding with at most one numeric correction for agent answers and
  Unverified notes for answers and report summaries. See [grounding](docs/grounding.md).
- Sequential MVP and hard evals, optimization diagnostics, expanded 49-case
  hard suite and bootstrap token comparisons. See [eval methodology](docs/evals-hard.md).
- Node 24 CI for clean installs, typecheck, unit tests and build, without database
  access, LLM calls or secrets. See [CI](docs/ci.md).

### Changed

- Promoted harness and metadata/prompt improvements, query-error hints and
  requested decimal preservation. Token comparisons remain advisory; rejected
  tool experiments are excluded. See [optimization](docs/model-optimization.md)
  and [phase results](PLAN.md).
