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

In CLI chat or web chat, enter `/triage [--since <duration>] <issue text>` to gather deterministic
triage evidence for the pinned target (or configured default), then ask Strata to
explain the likely root cause and next read-only steps. Empty commands display
usage; issue text is capped at 64 KiB of UTF-8. Evidence context is bounded to
24,000 characters, with at most five rows per check. Incomplete evidence and
hypotheses must remain qualified. This adds no tool and changes neither the
default system prompt nor tool descriptions. Ordinary chat turns are unchanged.
The web Triage panel and the CLI `triage` without `--summarize` need no LLM.

The optional leading window flag uses the same validation as CLI `triage --since`:
positive integer minutes (`m`), hours (`h`) or days (`d`), at most 30 days.
For example, `/triage --since 7d NIGHTLY_PURGE_JOB ORA-02292` searches seven days;
omitting the flag keeps the 24-hour default. Invalid windows show usage without
collecting evidence or sending a model prompt. The web Triage panel's **Since**
field accepts the same durations and defaults to `24h`.

### Names in free text

Names need no `_JOB` suffix or keyword: `daily_load failed` and
`NO_SUCH_JOB_X failed` are accepted. Triage extracts up to 20 unique identifier
candidates (at least three characters), normalizes them to uppercase and skips
common English/SQL words and ORA/PLS codes. `OWNER.NAME` restricts the owner.
One lookup with bind variables checks scheduler jobs, retained scheduler run
names (including dropped jobs), and objects. It uses DBA views with ALL fallback
on missing-view or privilege errors, returning at most 200 matches (also subject
to the configured row cap). Found objects and jobs use the existing diagnostic
and latest-five historical-run paths.

Unmatched candidates containing underscores or digits, or written in all caps,
are listed under limitations as `not found: X - check spelling, owner visibility,
or whether it was dropped`. This means no visible match, not proof of absence;
unavailable or capped lookups are marked partial. Ordinary lowercase prose is
looked up but produces no missing-name notice.

WP-17B verification (2026-11-04): typecheck clean; 971 unit tests passed;
read-only integration suite 35 passed, 1 skipped (the explicitly excluded LLM
e2e test), run with `--no-file-parallelism -t '^(?!.*answers one end-to-end ask)'`.
The existing NIGHTLY_PURGE_JOB and K7Q_FAILJOB integration assertions passed.
Live CLI smokes confirmed the missing-name message for `NO_SUCH_JOB_X failed`
and ORA-20001 historical evidence for `k7q_failjob failed`. No LLM calls or evals
were run. No shared contract changes are required.

## Phase 18B alert-log integration and live smokes

Triage now returns the Phase 18 shared `TriageResult.alertLog` shape (also on each issue). It uses only the public alertlog reader API. Code matches use the requested triage window; failed scheduler runs get separate ±10 minute queries, including historical fallback runs. Incidents use the triage window. Each read contributes its exact SQL, binds, access status and cap marker to the evidence and numbered checklist. Correlation indexes refer to the returned entries, starting at zero. A temporal correlation is a diagnostic lead, not causal proof.

Alert evidence is included in Markdown used by summary grounding and chat /triage. Missing grants are deduplicated into one alert access notice. All new hypotheses are suggestions supported by fetched rows; no remediation is executed.

These live CLI smokes ran at approximately 2026-11-05T05:04Z. The host UTC date had advanced past November 4; the wider windows below retain the requested failures. Both used HARNESS read-only accounts and PIAGENT_SECRET_DIR, with no LLM calls or server file reads. Trace paths below are metadata from SQL, never files opened by the agent. Output excerpts are rendered from the actual CLI JSON (unrelated sections omitted).

### Live smoke: p1 nightly purge

```sh
npm run piagent -- triage --target p1-19c-prod --since 2d --issue 'nightly purge job failed last night' --json
```

### Alert log

ok; 2026-11-03T05:03:15.035Z to 2026-11-05T05:03:15.035Z (exclusive). Job-run queries use their own ±10 minute windows, including historical runs.

| Index | First / last | Count | Codes | Incident / problem / trace | Message |
|---|---|---|---|---|---|
| 0 | 2026-11-04T04:30:56.298Z / 2026-11-04T04:30:56.298Z | 1 | ORA-12012, ORA-02292, ORA-06512 | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1 |
| 1 | 2026-11-04T04:29:49.671Z / 2026-11-04T04:29:49.671Z | 1 | ORA-00800 | 86767; ORA 800; /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_vktm_87.trc  (incident=86767):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |
| 2 | 2026-11-04T04:29:44.395Z / 2026-11-04T04:29:44.395Z | 1 | ORA-27167, ORA-27300, ORA-27301, ORA-27302, ORA-27303 | /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc | Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_ora_21.trc:<br>ORA-27167: Attempt to determine if Oracle binary image is stored on remote server failed<br>ORA-27300: OS system dependent operation:parse_df failed with status: 2<br>ORA-27301: OS failure message: No such file or directory<br>ORA-27302: failure occurred at: parse failed<br>ORA-27303: additional information: Filesystem     1K-blocks      Used Available Use% Mounted on<br>overlay        951012720 359290200 543339972  40% / |

Correlation (code): ORA-12012 jobs discovered from alert log: SHOPAPP.NIGHTLY_PURGE_JOB; entry indexes 0. Temporal matches are diagnostic leads.

Correlation (code): Alert log matching ORA-12012, ORA-02292, ORA-06512; entry indexes 0. Temporal matches are diagnostic leads.

Correlation (jobRun): Alert log within ±10 minutes of SHOPAPP.NIGHTLY_PURGE_JOB (temporal correlation only) at 2026-11-04T04:30:02.953Z; entry indexes 0, 1, 2. Temporal matches are diagnostic leads.

Incident 86767: ORA 800; 2026-11-04T04:29:49.671Z; status 2.

### Ranked hypotheses

1. A child foreign key still references the parent rows being deleted.

- SHOPAPP.SYS_C007669: table SHOPAPP.ORDER_LINES, type R.
- SHOPAPP.WORKLOAD line 27 inside NIGHTLY_PURGE: `DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;`
- SHOPAPP.NIGHTLY_PURGE_JOB line 1 inside anonymous block (job_action): `BEGIN shopapp.workload.nightly_purge; END;`
- Alert code match at 2026-11-04T04:30:56.298Z: Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1

2. Cutoff evaluated twice / predicate mismatch: rows crossing the boundary between statements keep child rows.

- SHOPAPP.WORKLOAD.NIGHTLY_PURGE, line 26: `DELETE FROM order_lines WHERE order_id IN (SELECT order_id FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY);`
- SHOPAPP.WORKLOAD.NIGHTLY_PURGE, line 27: `DELETE FROM orders WHERE ordered_at < SYSTIMESTAMP - INTERVAL '7' DAY;`
- Both statements evaluate a time-relative cutoff separately; the later statement can include parents that crossed the boundary.
- This is a source-based hypothesis; current aggregates cannot reconstruct the failing transaction.
- Current matching child row count: 0 (a new read-only snapshot, not proof of the historical cause).
- Alert code match at 2026-11-04T04:30:56.298Z: Errors in file /opt/oracle/diag/rdbms/prodcdb/PRODCDB/trace/PRODCDB_j005_704.trc:<br>ORA-12012: error on auto execute of job "SHOPAPP"."NIGHTLY_PURGE_JOB"<br>ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1


### Live smoke: d1 ORA-00800

```sh
npm run piagent -- triage --target d1-19c-lab --since 30d --issue 'ORA-00800 errors in the alert log' --json
```

### Alert log

ok; 2026-10-06T05:02:46.555Z to 2026-11-05T05:02:46.555Z (exclusive). Job-run queries use their own ±10 minute windows, including historical runs.

| Index | First / last | Count | Codes | Incident / problem / trace | Message |
|---|---|---|---|---|---|
| 0 | 2026-10-13T03:05:03.725Z / 2026-11-04T04:29:49.671Z | 7 | ORA-00800 | 245813; 225332; 204851; 184370; 163889; 143408; 122927; ORA 800; /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc; /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_58.trc; /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_57.trc; /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_87.trc | Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], [] |

Correlation (code): Alert log matching ORA-00800; entry indexes 0. Temporal matches are diagnostic leads.

Incident 245813: ORA 800; 2026-11-04T04:29:49.671Z; status 2.

Incident 225332: ORA 800; 2026-10-22T23:21:11.147Z; status 2.

Incident 204851: ORA 800; 2026-10-21T03:38:14.898Z; status 2.

Incident 184370: ORA 800; 2026-10-21T03:15:07.830Z; status 2.

Incident 163889: ORA 800; 2026-10-16T23:36:52.002Z; status 2.

Incident 143408: ORA 800; 2026-10-13T03:31:29.243Z; status 2.

Incident 122927: ORA 800; 2026-10-13T03:05:03.725Z; status 2.

### Ranked hypotheses

1. The recorded run or error is visible, but the cause is not yet established.

- ORA-00800
- Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], []
- Alert code match at 2026-11-04T04:29:49.671Z: Errors in file /opt/oracle/diag/rdbms/orcl/ORCL/trace/ORCL_vktm_86.trc  (incident=245813):<br>ORA-00800: soft external error, arguments: [Set Priority Failed], [VKTM], [Check traces and OS configuration], [Check Oracle document and MOS notes], []


The p1 alert independently confirms the job name, ORA-12012/ORA-02292, constraint and line 27. The ±10 minute query also returns VKTM and filesystem diagnostics; this timing does not link those errors to the FK violation. The child-record constraint hypothesis ranks first; the separately evaluated cutoff at lines 26/27 is the next, source-based hypothesis. The job is explicitly labelled discovered from alert log (ORA-12012).

The d1 row folds seven ORA-00800 occurrences and preserves all seven incident ids. Its message reports Set Priority Failed for VKTM and asks for traces/OS configuration checks. This does not establish the exact host configuration cause; the generic hypothesis intentionally leaves that unresolved. There is a code correlation and no scheduler correlation.

Natural-language discovery regression: `job failed` previously parsed FAILED as a job name via the `job X` pattern in `parse.ts`. Parsing and candidate lookup now share a common-word exclusion list. A bounded ORA-12012 window read discovers qualified scheduler jobs when the issue mentions a job or shares a word of at least four letters with the job name. Only matched alert text enters the code/frame/constraint pipeline. With no codes or recognized names and no discovered job, a separate default-severity query returns at most ten recent errors, labelled **recent errors in the window, not matched to the issue**. Its rows do not become stack-frame or constraint evidence. Both discovery queries retain exact SQL/binds and cap markers.

The alert table now emits contiguous header, separator and data lines. Issues without graph nodes omit the Trace diagram section entirely. Entries fetched by several alert queries are deduplicated, preserving correlation indexes.
