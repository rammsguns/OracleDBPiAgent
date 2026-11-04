# Changelog

All notable changes are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - unreleased

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
