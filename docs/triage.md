# Issue triage

`triage` gathers deterministic, read-only Oracle 19c evidence. No model is used
unless `--summarize` is given.

```sh
piagent triage --target p1-19c-prod --issue NIGHTLY_PURGE_JOB
piagent triage --target p1-19c-prod --issue-file issue.txt --since 24h --json
piagent triage --target d1-19c-lab --issue K7Q_OWNER.K7Q_FAILJOB --since 30d
piagent triage --target p1-19c-prod --out ./triage-reports
piagent triage --target p1-19c-prod --issue NIGHTLY_PURGE_JOB --summarize
```

`--issue` and `--issue-file` are exclusive. The default window is 24h; positive
minute/hour/day durations up to 30d are accepted. Issue text is capped at 64 KiB.
With no issue text, recent failed runs, compile errors and invalid objects seed
at most 10 triages. Compile/invalid recency uses LAST_DDL_TIME because dictionary
errors do not have an occurrence timestamp. Scan limits and unavailable views
are reported. An empty window is not evidence that no historical failure exists.

Evidence includes job actions and bounded run history, both ORA-06512 stack
forms, redacted source excerpts ±8 lines with enclosing subprogram and a lexical
statement, owner compile errors/invalid objects, and constraint/key columns.
For constraint failures, all visible child FKs referencing the parent key are
paged across owners (at most 2,000; caps remain explicit). DBA views fall back to
ALL views only for ORA-00942/01031. ALL visibility can hide other schemas; an empty
result must not be interpreted as proof that no other child exists. No ASH/AWR,
trace files, DML, DDL, execution or recompilation is used.

The report contains ranked hypotheses with evidence, a local guide for the
Phase 16 error codes, numbered checks with exact SELECT statements, and a
Mermaid trace. JSON graph nodes/edges use `PlsqlGraph` from `src/plsql/diagram.ts`;
statement and constraint nodes use its existing `object` kind. Call associations,
subprogram ranges and statement boundaries are explicitly heuristic. The
product does not execute the PL/SQL displayed as source evidence.

Configure application logs on a target in the private targets JSON:

```json
"logTables": [
  { "table": "SHOPAPP.APP_LOG", "timestampColumn": "CREATED_AT", "columns": ["LEVEL_NAME", "MESSAGE"] }
]
```

Only simple uppercase OWNER.TABLE and column identifiers are accepted; expressions,
quoted names, links, extra fields, duplicate columns and more than eight message
columns are rejected. At most 16 configured tables, each with 1–8 columns.
Configured tables are queried newest-first in the window, capped at 50 rows (or
the smaller configured session limit). Candidate tables found by LOG/ERROR names
are listed only. Structural table/column identifiers cannot be SQL binds; only
strictly validated identifiers are interpolated there. All query predicate values
use binds. Checklist SQL substitutes only non-secret identifier and numeric
literals. Audit records contain SQL hashes and no SQL text, binds or credentials.
Source uses WP-16A's conservative literal redaction, including cross-line literals.

`--out` writes private Markdown/JSON files through exclusive temporary files and
atomic rename. JSON is published last as the commit marker. `--json` emits a
single JSON document, including a summary if requested. Summary generation uses
one invocation of the existing report summarizer, with no tools/retries; its
numeric claims are checked against the full evidence. Tests inject a fake model.
No live LLM calls were made during WP-16B work (coordinator requested exclusion).

Programmatic API for WP-16C: `triage(ctx, {target, issue?, since?})` returns
`{target, issues, scan}`; `renderTriageMarkdown(result)` renders it. Each issue
contains `hypotheses`, `excerpts`, `checks`, `guide`, `graph` and `mermaid`.
`triageIssue` handles a single issue. `summarizeTriage(markdown, config)` returns
`{narrative, unverified}`; callers must health-check and serialize model use.

## Live verification, 2026-11-04

p1 history shows ORA-02292 on SHOPAPP.SYS_C007669, WORKLOAD body line 27 inside
NIGHTLY_PURGE, DELETE FROM orders. The current ALL_CONSTRAINTS mapping is
ORDER_LINES(ORDER_ID) → ORDERS(ORDER_ID), not another child table. DBA_CONSTRAINTS
and DBA_CONS_COLUMNS return ORA-00942. Line 26 clears ORDER_LINES, so another
child table is an explicitly unconfirmed hypothesis; concurrency and predicate
coverage also need investigation. No other child table was invented.

On d1 the K7Q_FAILJOB job no longer exists in DBA_SCHEDULER_JOBS. Its historical
runs are visible with `--since 30d`: ORA-20001 and anonymous line 1. Its historical
job_action cannot be recovered from the available dictionary. Unit fixtures
verify anonymous-block attribution and the raising statement when an action is
available. The live integration reports that limitation instead of fabricating
source or creating a job.

The complete p1 Markdown output is saved in
[triage-nightly-purge.md](triage-nightly-purge.md).

Verification results:

- `npm run typecheck`: passed.
- `npm test`: 54 files, 860 tests passed.
- `PIAGENT_SECRET_DIR=… npm run test:integration -- --no-file-parallelism -t '^(?!.*answers one end-to-end ask)'`: 11 files passed; 30 tests passed, 1 skipped (the LLM e2e).
- The initial parallel integration run had 3 existing drift/report availability
  failures on p1; two sequential runs passed in full with the LLM test excluded.
- Live p1 and d1 triage smoke runs used only the approved read-only sessions.

No shared contract changes are needed. `src/plsql/` was imported without edits.
