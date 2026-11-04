# Issue triage

`triage` gathers deterministic, read-only Oracle 19c evidence. No model is used
unless `--summarize` is given.

```sh
piagent triage --target p1-19c-prod --issue NIGHTLY_PURGE_JOB
piagent triage --target p1-19c-prod --issue-file issue.txt --since 24h --json
piagent triage --target d1-19c-lab --issue "K7Q_FAILJOB on the lab keeps failing, what is wrong?"
piagent triage --target p1-19c-prod --out ./triage-reports
piagent triage --target p1-19c-prod --issue NIGHTLY_PURGE_JOB --summarize
```

`--issue` and `--issue-file` are exclusive. The default window is 24h; positive
minute/hour/day durations up to 30d are accepted. Issue text is capped at 64 KiB.
With no issue text, recent failed runs, compile errors and invalid objects seed
at most 10 triages. Compile/invalid recency uses LAST_DDL_TIME because dictionary
errors do not have an occurrence timestamp. Scan limits and unavailable views
are reported. For a named job or an object’s implicated jobs, an empty window
search triggers
one bounded read-only lookup of the latest five runs per missing job scope,
without a time filter. Historical evidence is labelled **outside the requested
window (last run …)** and does not change the requested window. A per-row
OUTSIDE_WINDOW marker distinguishes historical runs from any recent run omitted
by a cap or appearing between reads. Codes and hypotheses use the retained runs;
compile/invalid-object diagnostics use their discovered owners, not the default
schema. Unqualified object names also get bounded dictionary owner discovery.
An entirely empty search states names, views, window and owner scope, then
suggests `--since 30d`, checking spelling/qualification, and asking a DBA about a
dropped job or an owner hidden from this account. Empty code lists render as
`Codes: none`, and hypothesis evidence never contains empty bullets.

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
strictly validated identifiers are interpolated there. Dictionary query predicate values
use binds. Checklist SQL substitutes only non-secret identifier and numeric
literals. Audit records contain SQL hashes and no SQL text, binds or credentials.
Triage supplies credential-only redaction to WP-16A's dictionary reader through
an optional constructor hook. The hook is a three-line change to
`src/plsql/dictionary.ts`; the default WP-16A redactor is unchanged. Password,
pwd, secret, token and API key assignments/named arguments, IDENTIFIED BY, and
password-bearing connections are redacted across source lines/pages. Ordinary
literals such as `'7'`, `'SHIPPED'`, `'NEW'` and application error messages are
preserved. Statements appear in Markdown code spans, preserving `<` in CLI text;
HTML escaping remains in prose and table cells.

For foreign-key failures, triage compares earlier child DELETE statements with
the frame's parent DELETE or parent-key UPDATE **within the same subprogram**.
Separately evaluated relative clocks (SYSDATE, SYSTIMESTAMP, CURRENT_DATE,
CURRENT_TIMESTAMP, LOCALTIMESTAMP), or non-identical parent-selection predicates,
produce a source-based cutoff/predicate mismatch hypothesis citing both lines.
Identical static predicates or a shared cutoff variable are not flagged. There
is no fixed rule about ORDER_LINES or another child table.

Triage also runs an aggregate-only data check when it can safely reconstruct the
parent predicate and positional FK columns: `COUNT(*)` of child rows referencing
currently eligible parents. A strict comparison grammar accepts simple columns,
ordinary numeric/string literals and clock/interval arithmetic; functions,
subqueries and unresolved PL/SQL variables are never copied into executable SQL.
Unsupported predicates are reported without execution. Structural identifiers
are validated; the parent predicate retains its non-secret source literals.
The normal session timeout applies and results contain counts only, never row
data. ORA-00942/other query errors are explicitly unavailable. Counts reflect a
new snapshot and cannot establish the historical transaction's cause.

The concurrency review checks other jobs calling subprograms in the same source
object and their child-insert paths. It distinguishes a returned newly inserted
parent key from an unverified concurrent insert into existing parents. Suggested
fixes are developer advice, never executed: reuse one cutoff, use one captured
parent key set for child/parent operations, consider cascading deletes only as a
design choice, and log exceptions without credentials. Every checklist step has
a specific interpretation instruction.

`--out` writes private Markdown/JSON files through exclusive temporary files and
atomic rename. JSON is published last as the commit marker. `--json` emits a
single JSON document, including a summary if requested. Summary generation uses
one invocation of the existing report summarizer, with no tools/retries; its
numeric claims are checked against the full evidence. Tests inject a fake model.
No live LLM calls were made during WP-16B work (coordinator requested exclusion).

Programmatic API for WP-16C: `triage(ctx, {target, issue?, since?})` returns
`{target, issues, scan}`; `renderTriageMarkdown(result)` renders it. Each issue
contains `hypotheses`, `suggestions`, `concurrency`, `limitations`, `excerpts`,
`checks`, `guide`, `graph` and `mermaid`.
`triageIssue` handles a single issue. `summarizeTriage(markdown, config)` returns
`{narrative, unverified}`; callers must health-check and serialize model use.

## Live verification, 2026-11-04

p1 history shows ORA-02292 on SHOPAPP.SYS_C007669, WORKLOAD body line 27 inside
NIGHTLY_PURGE, DELETE FROM orders. The current ALL_CONSTRAINTS mapping is
ORDER_LINES(ORDER_ID) → ORDERS(ORDER_ID). DBA_CONSTRAINTS and DBA_CONS_COLUMNS
return ORA-00942. Lines 26 and 27 independently evaluate SYSTIMESTAMP minus seven
days; this cutoff/predicate mismatch ranks first. The aggregate read succeeded
and found currently matching child references (see the generated report for its
snapshot count). PLACE_ORDERS_JOB calls a path that inserts a new order and uses
its returned key to insert child rows; that path cannot explain old-parent rows.

On d1 K7Q_FAILJOB no longer exists in DBA_SCHEDULER_JOBS, but its historical runs
are found even with the default 24h window: the latest-five fallback shows
ORA-20001 and anonymous line 1, explicitly outside that window (last run
2026-10-26T06:12:12.333Z). Diagnostics are scoped to K7Q_OWNER rather than SH.
The report
explains RAISE_APPLICATION_ERROR in the job's own PLSQL_BLOCK as the recorded
stack's interpretation and explicitly lists what the dropped/auto-dropped action
prevents verifying: exact action/type, guard, source and historical dependencies.
No job was recreated or executed.

Complete generated Markdown examples:

- [triage-nightly-purge.md](triage-nightly-purge.md) — p1, 24h window.
- [triage-k7q-failjob.md](triage-k7q-failjob.md) — d1, default 24h window with explicitly labelled historical evidence.

Verification results:

- `npm run typecheck`: passed.
- `npm test`: 61 files, 921 tests passed.
- `PIAGENT_SECRET_DIR=… npm run test:integration -- --no-file-parallelism -t '^(?!.*answers one end-to-end ask)'`: 12 files passed; 32 tests passed, 1 skipped (the LLM e2e).
- The initial parallel integration run had 3 existing drift/report availability
  failures on p1; two sequential runs passed in full with the LLM test excluded.
- Live p1 and d1 triage smoke runs used only the approved read-only sessions.

No shared contract changes are needed. The only WP-16A change is the optional
dictionary redactor hook described above. The LLM remained unused during both
the original implementation and coordinator review fixes.

### Chat `/triage`

In CLI chat or web chat, enter `/triage <issue text>` to gather deterministic
triage evidence for the pinned target (or configured default), then ask Strata to
explain the likely root cause and next read-only steps. Empty commands display
usage; issue text is capped at 64 KiB of UTF-8. Evidence context is bounded to
24,000 characters, with at most five rows per check. Incomplete evidence and
hypotheses must remain qualified. This adds no tool and changes neither the
default system prompt nor tool descriptions. Ordinary chat turns are unchanged.
The web Triage panel and the CLI `triage` without `--summarize` need no LLM.
