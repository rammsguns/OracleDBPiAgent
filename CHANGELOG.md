# Changelog

All notable changes are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.9.0] - 2026-11-09

Phase 33: evidence precision after 1.8.0, and standby eval coverage.

### Added

- **Which objects are missing on ORA-00942.** When a `run_query` SELECT over
  several objects fails with ORA-00942, the tool probes each referenced object
  with `SELECT * FROM <object> WHERE 1=0`. It probes at most six, and returns a
  note saying which are readable and which are not visible. Before this, the
  agent could conclude that every view in a query was unreadable when only one
  was. The probes skip queries with a `WITH` clause and sources they cannot
  classify safely, and they never run when the query succeeds.
- **Hidden apply lag is labelled.** When `V$DATAGUARD_STATS` or
  `GV$DATAGUARD_STATS` returns a NULL `apply lag` inside a PDB, the result
  carries a note: Oracle hides the value there, so NULL does not mean zero.
  The note points to `health_check` and `piagent check dgLag`.
- **Standby eval split (`--split standby`).** Seven hard cases on
  `c1s-19c-stby` cover role and open mode, managed recovery, transport lag,
  archive gaps, whether backups are local, copied scheduler history and a
  switchover refusal. Expected values are read live and read-only, and a
  validator and an integration test check them.
- **Per-case eval warm-up (`setup`).** A hard case can list exact read-only
  SELECTs that run as the target account before the case starts. This keeps
  cursor-cache cases such as `hard-orders-plan` stable after the cursor ages
  out of the shared pool.

## [1.8.0] - 2026-11-08

Phase 32: production gaps found after the PDB pilot.

### Added

- **Physical standby support and the packaged target `c1s-19c-stby`.** It is
  the Active Data Guard standby `CDB19S` of the c1 lab, on
  `localhost:1525/PIPDB1`. It runs real-time apply with PIPDB1 open read-only.
  Checks now detect the database role. On a standby, they qualify recovery,
  backup and job evidence that is copied from the primary. They also report
  proven archive gaps by sequence. See
  [physical standby](docs/check.md#physical-standby-phase-32) and
  [lab/c1](lab/c1/README.md).
- **Data Guard lag (`dgLag`) on standbys, including from inside a PDB.** Oracle
  hides apply lag in a PDB. In that case, the check reports transport lag as an
  upper bound, but only when every redo thread passes these tests:
  - the transport-lag timestamp is fresh against the database clock;
  - MRP0 is applying at or past the last block RFS received;
  - no received log is still unapplied.
  If any test fails, the check reports UNKNOWN and names the test that failed.
  On a primary, `dgLag` now reads "not applicable (primary)" instead of
  "0 seconds".
- **Diagnostic sessions are labelled.** Every Oracle session sets
  `MODULE=piagent` and an `ACTION` naming the command or tool. A DBA can then
  find and attribute the agent's work in `V$SESSION` and `V$SQL`.
- **C1 scale lab (`lab/c1/scale.sh`).** It adds a BULKAPP schema with 4 million
  rows, 1,500 tables, 750 views, 300 procedures, 401 partitions, and a job that
  floods the cursor cache. Repeated runs leave the existing data unchanged.

### Changed

- **The web UI uses your configured targets everywhere.** Every web route and
  selector now follows the loaded `targets.json`, including private lists in
  `~/.piagent/targets.json`. Previously some used only the packaged names.
  Unknown names get HTTP 400 before any connection is opened. Target
  descriptions mask the account name only where it appears as a whole word.
- **Smaller probe footprint.** `top` reads its bounded SQL snapshot once instead
  of paging through it repeatedly, which cut `top` on d1 from 34.4 s to 7.7 s.
  Security checks scan only the application owners they report on. Per-command
  SQL budgets are measured on c1 and enforced by an integration test; see
  [footprint](docs/footprint.md).

### Fixed

- **Empty results from an out-of-domain filter now say why.** Example: a query
  filtering `DBA_USERS.ORACLE_MAINTAINED = 'NO'` returns no rows, because the
  column only holds `Y` or `N`. `run_query` now adds a source note naming the
  column's valid values. It covers 17 documented Oracle 19c dictionary columns,
  each checked against live labs. The SQL is never rewritten or re-run. The note
  appears only for simple single-view equality or `IN` filters whose values are
  all invalid.
- **Refusals open with the refusal.** The agent guidance now asks the agent to
  state a refusal first and then offer supported alternatives (+104 bytes of
  prompt).

## [1.7.0] - 2026-11-08

Phase 31: production readiness on a real Oracle 19c CDB/PDB.

### Added

- **Packaged multitenant lab target `c1-19c-pdb`.** It is the PDB `PIPDB1`
  in the container database `CDB19`, on `localhost:1524/PIPDB1`. It runs in
  ARCHIVELOG mode with a fast recovery area and RMAN level 0 and level 1
  backups. It connects as a dedicated read-only `PIAGENT_RO` account with the
  PDB grants template. `lab/c1/` holds an idempotent seed. The seed sets up a
  live order workload and deliberate problems for the checks to find: a job
  that fails every 30 minutes, an invalid view, an unusable index partition,
  stale statistics and a fixed-size tablespace. See [lab/c1](lab/c1/README.md).
- **PDB eval split (`--split pdb`).** It has eleven hard cases on c1, with live
  read-only ground truth. They cover container identity, PDB versus CDB-wide
  scope, backup age, failed jobs, maintenance, stale statistics, headroom,
  jobs, a broad "is the database healthy?" question, and a refusal.
- **`health_check` explains each finding.** Each line now says what the check
  measures and names up to five affected objects, with a `+N more` count. For
  example, it lists failed jobs, unusable index partitions, invalid objects and
  default-password accounts.

### Fixed

- **Oracle DATE and plain TIMESTAMP values were shifted by the host's time
  zone.** The thin driver read wall-clock values in the host zone. On hosts not
  running in the database's zone, 1.6.0 reported wrong backup ages and other
  times. Values are now formatted on the server and converted using the
  database's own offset. Results no longer depend on the host's time zone or its
  DST gaps. Queries without date columns no longer pay for an extra describe
  round trip.
- **PDB backup age.** In a PDB, `V$RMAN_BACKUP_JOB_DETAILS` can be empty. Backup
  age now falls back to the per-datafile full or level-0 completion records it
  can verify. These are labelled CDB-wide and fall back to UNKNOWN when the
  evidence is incomplete.
- **Blocking-session probe stall in PDBs.** On a PDB, the optimizer plan for
  `V$LOCK` could take about two minutes and hit the statement timeout. A
  query-local hint now makes it return in under a second.
- **Alert log scope in PDBs.** Alert rows are now limited to the current
  container, plus instance-level rows that the PDB can see.
- **TEMP and UNDO usage** now count active sort blocks and active or
  unexpired undo extents, not allocated space. This removes false alarms near
  100%.
- **The packaged target list** now allows all three packaged labs, not two.

### Changed

- The README and [real targets](docs/real-targets.md) now describe verified
  live PDB behaviour.

## [1.6.0] - 2026-11-08

### Added

- **`piagent check --target T | --all-targets [--json] [--out DIR]
  [--fail-on warn|crit]`: a fast, read-only health verdict for cron and
  Nagios, Icinga or Zabbix.** It never calls the LLM, and it reuses the
  existing collectors, so it needs no new views or grants. It checks:
  - tablespace, temp and undo use (autoextend-aware), and recovery area
    use (reclaimable-aware);
  - the longest blocking wait;
  - the age of the last full or level-0 backup, and archived-log
    sequence gaps;
  - failed scheduler jobs, and alert-log ORA- errors and incidents in
    the window;
  - invalid objects and unusable indexes;
  - expiring accounts and default passwords.

  Each check reports OK, WARN, CRIT or UNKNOWN, with its value,
  threshold, CDB/PDB scope and the `piagent` command to drill in. A
  missing grant or an inapplicable check (for example NOARCHIVELOG) is
  UNKNOWN, never OK. The exit code is the worst status, Nagios style:
  0 OK, 1 WARN, 2 CRIT, 3 UNKNOWN. Thresholds, per-target overrides,
  disabled checks and UNKNOWN mappings live in a private
  `~/.piagent/check.json` (mode 0600, strictly validated). `--out`
  appends one credential-redacted JSON line per run. See
  [check](docs/check.md).
- **Web Check tab.** It runs the check on demand for one target or all
  targets, with the same cancellation and size limits as Top.
- **`health_check` agent tool.** `ask` and chat can answer "is my
  database healthy?" from the same check, and report UNKNOWN results and
  probe or window limits.

### Changed

- **Every `--target` command rejects an unknown target the same way.**
  It names the target, lists the configured targets, points to
  `piagent targets`, and exits 2 before connecting. `jobs` still gives
  its own message for a configured target outside its pinned scope.

### Changed (evaluation only)

- Eight phase 30 health cases with read-only truth from the database,
  and a validator for them (WP-30C).
- Calibrated the phase 30 not-applicable and unconfigured-area facts
  (WP-30E). Correct wording such as "vacuous" or "undefined" now
  passes, and claims of a healthy no-gap result or a healthy 0% recovery
  area are rejected.

## [1.5.1] - 2026-11-07

### Fixed

- **Space answers no longer misread MAXBYTES.** `tablespace_usage`
  results, and `run_query` results over the data/temp file views that
  select MAXBYTES, now carry a short note:
  - BYTES and MAXBYTES are bytes, not blocks;
  - AUTOEXTENSIBLE=NO caps capacity at the current BYTES;
  - the smallfile limit at an 8 KiB block size is about 32 GiB, not
    32 TiB.

  The note is matched on the SQL itself; comments and string literals
  are ignored.
- **A specific error for the `init` placeholder in `PIAGENT_SECRET_DIR`.**
  If `.env` still holds `/absolute/path/to/db-secrets`, every DB command
  now names the placeholder and says how to fix it. Before, it gave a
  generic missing-file error.
- The preflight test scanner now handles comma joins, quoted
  identifiers and aliases, optimizer hints, identifier case and string
  literals.

### Changed (evaluation only)

- Scorer calibration (WP-29A, WP-29E):
  - numeric equivalence (0.125 = 0.125000, 1,082 = 1082);
  - a negation elsewhere on the line no longer rejects a correct single
    value;
  - "No." counts as a direct answer to a limitation question;
  - an exact positive parenthetical (`Statement-level (BEFORE
    STATEMENT)`) counts as the value;
  - contiguous labelled single-record lists are accepted;
  - conditional clauses ("If you need the comment applied…") are no
    longer write claims.

  Archive replays found no unjustified flips.
- Eval cases (WP-29B, WP-29E):
  - the empty-truth grant cases are re-premised on DB-discovered access
    gaps;
  - the component inventory accepts `V$SGA_DYNAMIC_COMPONENTS` or
    `V$MEMORY_DYNAMIC_COMPONENTS`;
  - cached-plan and p19 truths exclude piagent's own cursors.

## [1.5.0] - 2026-11-07

### Added

- **`piagent backup --target T [--json]`: backup and recoverability
  evidence from control-file metadata.** It never runs RMAN. It reports:
  - backup sets and pieces, and full, level-0 and incremental coverage
    for each datafile;
  - gaps in the archived-log sequence for each thread, in the current
    incarnation;
  - control-file autobackup, block corruption, files that need recovery,
    and the recovery area balance;
  - a conservative restore-to-time estimate. It is metadata only and
    clearly bounded.

  Under NOARCHIVELOG it says that point-in-time recovery is not possible.
  See [backup](docs/backup.md).
- **`piagent jobs --target T [--since] [--owner] [--failed-only] [--json]`:
  scheduler and maintenance evidence.** It covers:
  - jobs, recent runs, and the latest failure for each job;
  - scheduler windows, autotask history and statistics operations;
  - maintenance debt: invalid objects, unusable indexes and stale
    statistics.

  Every string is credential-redacted and length-capped. Display
  timestamps are in UTC; JSON keeps the source time zone. See
  [jobs](docs/jobs.md).
- **`piagent top --target T [--seconds N] [--json]`: what the database is
  doing now.** It takes two bounded snapshots 5–120 seconds apart and
  reports:
  - the top 10 SQL by elapsed time, CPU, buffer gets, disk reads and
    executions;
  - load rates and host CPU.

  SQL text is never fetched. A counter that is new, aged out or reset is
  shown as unknown, never as work done in the interval. See
  [top](docs/top.md).
- **The new evidence in other commands:**
  - Triage routes backup and RMAN or ORA-19xxx issues to the backup
    evidence, and failed scheduler jobs or ORA-12012 to the jobs evidence.
  - Triage turns "slow right now" into one 15-second top sample and drills
    into the heaviest SQL.
  - `report --sections backup,jobs` adds the new sections, with history
    trends.
  - `drift --scope backup` compares RMAN settings and log mode.
  - Chat has `/top [--seconds N]`, which Ctrl-C cancels and which never
    calls the LLM.
- **Web Backup, Jobs and Top tabs.**
  - Backup and Jobs show UTC timelines, with failures and sequence gaps
    marked.
  - Top samples only when you press Sample. Its duration is bounded, it
    can be cancelled, and its response size is capped.
- The `targets check` preflight groups and
  [`docs/grants-template-pdb.sql`](docs/grants-template-pdb.sql) cover the
  backup, jobs and top views.
- New eval cases for phases 25–27 (backup, jobs, top). Each has a
  validator: `evals/validate-p25.ts`, `validate-p26.ts` and
  `validate-p27.ts`.
  Ground truth comes only from the database.

### Changed

- The SQL policy refuses ASH, AWR, metric, advisor and other Diagnostics
  and Tuning Pack sources, including the multitenant `CDB_HIST`, `AWR_*`
  and `V$ALL_ACTIVE_SESSION_HISTORY` variants. This covers
  agent-generated SQL too.
- When asked for pack-only or historical performance data (ASH, AWR,
  metric history, advisors, ADDM), the agent refuses and offers
  `piagent top` or `/top` for a live interval. It no longer suggests
  AWR reports, snapshots or other writes as workarounds. It also no
  longer guesses RMAN defaults. If a refusal still omits `piagent top` or
  names a pack script or package, the agent asks the model once for a
  revised answer without tools. `ask` and `chat` print a
  `--- Revised answer ---` line before any revised answer. These changes
  were A/B gated against the 1.5.0 candidate.
- Backup, jobs and top text output uses Markdown tables. Jobs show
  INTERVAL values as durations. Top labels a non-CDB as
  "Database-wide (non-CDB)" and says "none in this interval" for empty
  rankings.
- Configuration errors are specific: a missing or unreadable password
  file, or a `PIAGENT_SECRET_DIR` that does not match the configured
  directory, names the target and the fix instead of a generic failure.
  Every database command exits 1 on these errors, and `report` exits 1
  when it cannot connect.
- `report`, `triage`, `drift`, `ask` and `chat` reject an unknown target
  before connecting. The message names the target and lists the configured
  targets. An unknown `report --sections` name lists the valid sections.
  Both exit 2, like the other evidence commands.
- The phase 25–27 eval truth rows no longer require labels the question
  supplied, and refusal and limitation checks accept more negation forms
  and table headers. Replays of over 15,000 archived eval records found no
  unrelated score changes.

## [1.4.0] - 2026-11-06

### Added

- **Your own Oracle 19c databases, including CDB/PDB.**
  - List your targets in a private `~/.piagent/targets.json`, or point
    `PIAGENT_TARGETS_FILE` at one. The file must be owned by you and not
    group- or other-writable. It holds 1–20 strictly validated targets.
  - Without that file, the packaged lab targets are used, pinned as before.
  - See [real targets](docs/real-targets.md).
- **Read-only account check on every connect.** The connection is refused
  if:
  - the account is not the configured user;
  - the session is a proxy session or has DBA (`ISDBA`) status;
  - it holds any system privilege beyond CREATE SESSION, ALTER SESSION,
    SET CONTAINER and the SELECT/READ ANY family;
  - it holds any object privilege other than SELECT or READ. EXECUTE and
    FLASHBACK are accepted only on objects owned by Oracle-maintained
    users.

  `CDB$ROOT` is refused: connect through the PDB service. System accounts
  such as SYS and SYSTEM are refused when the file is loaded.
- `piagent targets check --target T [--json] [--grants-sql]` shows the
  version, the container, the account-check result and which views each
  feature can read. `--grants-sql` prints the SELECT grants a DBA would run.
  It never applies them.
- [`docs/grants-template-pdb.sql`](docs/grants-template-pdb.sql) is a
  SELECT-only PDB grant template for a DBA.
- `piagent init` writes a commented `targets.example.json`.
- `doctor` checks every configured target.

### Changed

- In a PDB, container-wide facts are shown with a "CDB-wide" label instead
  of being presented as PDB facts. This covers the instance, memory, redo,
  recovery area, and undo when shared.
- A view that is missing, not granted or unavailable in a PDB
  (ORA-00942, ORA-01031 or ORA-65040) gives a per-section note. It no
  longer fails the whole command.

- Target-file and connection problems give specific guidance. The common
  Oracle login and network errors (ORA-01017, ORA-28000, ORA-28001,
  ORA-01045, ORA-12514/12505, ORA-12541/12170 and NJS-503) each get a fixed
  hint. No secret, host or path is echoed.
- `targets check` prints one summary line per feature by default. `--all`
  lists every view.

### Fixed

- Markdown tables in `report` output are contiguous, so they render as
  tables. Before, each row was separated by a blank line.
- An alert-log query with no rows no longer prints an empty table header.
- `--grants-sql` maps `V$TEMPSEG_USAGE` to its real base object,
  `SYS.V_$SORT_USAGE`.

### Not yet verified

- Live behaviour inside a 19c PDB: the development labs are non-CDB.
- RAC, Data Guard standby and TCPS/wallets.

## [1.3.0] - 2026-11-06

### Added

- `piagent sessions --target T` is a read-only live view of who is blocking
  whom. It shows:
  - active user sessions (sessions waiting on an Idle event are hidden
    unless `--all`, but a blocker is always shown);
  - the blocking tree from `V$WAIT_CHAINS`, falling back to
    `BLOCKING_SESSION`, with the locked objects and deadlock-cycle
    detection;
  - non-idle waits by class since instance startup, and the time model;
  - long transactions.

  Findings cover long blocking, idle-in-transaction blockers, deadlocks,
  old transactions and a dominant wait class. Each finding comes with prose
  advice for a human DBA, and each blocker's SQL_ID links to `piagent sql`.
  It never uses ASH or AWR, never reads MODULE, ACTION, CLIENT_INFO, SQL
  text or bind values, and never kills or alters a session. See
  [sessions](docs/sessions.md).
- `piagent space --target T` is a read-only capacity report covering:
  - tablespaces with autoextend-aware headroom and usage bars;
  - the top segments, with LOB segments mapped to their table and column;
  - temp usage and its consumers;
  - undo (extent status and 24 h ORA-01555 and no-space counts);
  - online redo, with archive log mode;
  - recovery-area usage.

  Findings cover tablespace, temp, undo and FRA thresholds, plus redo
  layout and NOARCHIVELOG. It never uses DBA_EXTENTS. See
  [space](docs/space.md).
- Triage adds session evidence when an issue describes hangs, lock waits,
  blocking or deadlocks. Real blocking ranks first. Account-lock and login
  wording does not trigger it, and wait-class context never outranks a
  concrete error.
- Two opt-in report sections:
  - `--sections sessions`, with wait-class trends that reset on instance
    restart;
  - `--sections space`, with growth trends and a days-to-full forecast
    (least squares over at least 3 points spanning 24 h, against the
    autoextend maximum).

  `report --out DIR` reads its forecast history from DIR. The default
  report output is unchanged.
- `drift --scope space` compares tablespace configuration, redo layout and
  recovery-area configuration across targets. It does not compare usage.
- Two web tabs:
  - **Sessions**, with a blocking-tree graph, wait-class bars and filters;
  - **Space**, with stacked usage bars and threshold markers.

  Both have Markdown export and work in light and dark themes and at phone
  width. Wide tables scroll inside their container and show a hint only
  when they overflow.
- Evals: suites `p23` (sessions and waits) and `p24` (space), with
  two-sample truth-stability validation.
- Grant requests for p1:
  - [`grants-request-2026-11-05-sessions.sql`](docs/grants-request-2026-11-05-sessions.sql),
    8 views;
  - [`grants-request-2026-11-06-space.sql`](docs/grants-request-2026-11-06-space.sql),
    12 views.

  Both are SELECT only. See [grants](docs/grants.md).

### Fixed

- Eval scorer: Markdown table cells containing `/` (such as `User I/O`) now
  bind correctly. An archive replay changed only 4 records, all justified
  fail-to-pass.
- The web tab arrow-key order now matches the visual tab order.
- The live purge-triage integration test now derives its window from the
  age of the retained alert, instead of a fixed 2-day window.
- A secret-directory mismatch now prints fixed configuration guidance
  instead of the generic failure message.
- Every command now has a one-line `--help` description, and the `drift`
  description lists all of its scopes.

## [1.2.1] - 2026-11-05

### Fixed

- Configuration mistakes now print their fixed, reviewed guidance through the
  CLI instead of the generic failure message. Examples are a private home that
  is not mode 0700, a bad environment file, a non-loopback Strata URL, an
  unapproved target and out-of-range limits. Messages never include
  configuration input. Unexpected errors stay generic.
- The agent now looks in Oracle's alert log and ADR views (`V$DIAG_ALERT_EXT`,
  `V$DIAG_INCIDENT`, `V$DIAG_PROBLEM`) for questions about alert messages,
  ORA- errors, incidents or problems. It no longer searches user tables or
  says that problem keys are visible only in adrci.

### Changed

- Evals: two holdout case defects are fixed with case-scoped scoring. The two
  cases exposed while tuning are moved to dev, and two fresh blind holdout
  cases replace them. See [WP-22A](docs/wp-22a-holdout-fixes.md).

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
