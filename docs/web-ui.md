# Local read-only web UI

Run `npm run piagent -- web` (or `piagent web` after building/installing the CLI).
Use `--port N` to override port 8765. The listener always binds **127.0.0.1**.
Open the printed `http://127.0.0.1:N/#token=...` URL. Each server generates a
256-bit random token; it stays in memory and the startup URL, never the audit.
Treat that URL as a credential. The fragment is not sent to the HTTP server.

Every `/api` route requires `Authorization: Bearer <token>`. The server compares
SHA-256 digests with `crypto.timingSafeEqual`. All requests require a Host of
`127.0.0.1:N` or `localhost:N`; a supplied Origin must be the HTTP origin of that Host. There is no CORS allowance. Responses include
`Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff`
and `Referrer-Policy: no-referrer`; API responses also use `Cache-Control: no-store`.

## HTTP API

- `GET /api/targets`: array of `{ name, environment, description }`. No connection
  settings or credentials are returned. A configured login name appearing in a
  description is replaced with `read-only account`.
- `POST /api/sessions` with `{ target? }`: status 201, `{ sessionId }`. A target pins
  the whole conversation. Unknown targets and invalid input return 400. At most
  four conversations may exist, including those still initializing; a full server
  returns 409. Each conversation has its own DB provider, agent and audit runId.
- `POST /api/sessions/:id/ask` with `{ question }`: SSE response. All conversations
  and server instances share one process-wide prompt lock; concurrent asks return
  409. Request bodies are limited to 64 KiB and questions to 32,000 characters.
- `DELETE /api/sessions/:id`: status 204 after aborting the agent, waiting for it
  to become idle, and closing its DB provider. Missing sessions return 404.
- `GET /api/sessions/:id/audit`: array of this conversation's records, filtered by
  runId. Only `kind`, `tool`, `target`, `sqlSha256`, `rows`, `elapsedMs` are retained;
  absent fields are omitted. Missing audit files return an empty array, and
  incomplete/malformed JSONL lines are ignored. SQL text and bind values are omitted.
- `GET /api/health`: array of `{ name, status: "ok" | "fail" }`. Reuses the CLI
  doctor checks (Strata, connection/version/account/privileges/view dependencies),
  with a structured reporter so neither connection details nor driver errors reach
  the response or console. Returns 409 while an ask/health check holds the lock.

Each SSE event has a JSON object in its `data:` line:

| Event | Payload |
| --- | --- |
| `text` | `{ delta }` |
| `tool_start` | `{ name, args }`, where args contains only scalar target/owner/name/type/limit/sql_id fields, serialized and cut to 300 characters |
| `tool_end` | `{ name, isError, error?, resultBytes }` |
| `done` | `{ answer, unverified, usage }`, with usage an array of assistant-message usage objects |
| `error` | `{ message: "Request failed" }` |

Tool failure `error` is the generic first line `Tool execution failed`; raw driver,
provider and stack messages are never copied into server errors. `resultBytes` is
the UTF-8 byte length of the serialized tool result. Model text is application data;
the page must render it using `textContent` as required by PLAN.md.

Disconnecting an SSE client calls PI's `agent.abort()`. The LLM lock is released
when that prompt actually settles, preventing a new request from overlapping its
cleanup. Idle conversations expire after 30 minutes (checked every minute); active
prompts do not expire. SIGINT/SIGTERM stop accepting requests, abort conversations,
wait for prompt cleanup, close all DB providers and HTTP connections, and remove
the installed signal listeners. Closing also waits for session initialization.

Static assets are resolved from `src/web/static/` relative to `import.meta.url`
(`dist/web/static/` when compiled). Allowed extensions are HTML, JS, CSS, JSON,
SVG, PNG, ICO and TXT. Decoded traversal segments, backslashes, NULs and symlinks
escaping the static root are rejected. An absent index gets a tiny HTML placeholder.
`npm run build` copies `src/web/static/` to `dist/web/static/`, so the compiled
`piagent web` serves the page too; `npm run piagent -- web` serves source assets
directly.

## Server validation

`tests/unit/web-server.test.ts` injects fake agents and DB providers. It exercises
loopback binding, random tokens, authentication, Host/Origin checks, headers, safe
target output, SSE ordering/metadata, cross-server prompt serialization, disconnect
abort, failure recovery, session limits/expiry/cleanup, target pinning, audit
filtering, static content types, traversal and escaping symlinks. Unit tests require
neither Oracle nor Strata. The coordinator completed the live API smoke test
and Antigravity approved WP-U and WP-V before merge.

## Page

The page lives in `src/web/static/`: `index.html`, `app.css`, `app.js`, and the
pure `lib.js` helpers. Serve these files together at the origin root. There is
no build step, framework, external asset, or dependency. The module script and
stylesheet are external files compatible with `default-src 'self'`.

Open the URL printed by `piagent web`. The page reads `#token=…` once, immediately
removes the fragment with `history.replaceState`, and keeps the token only in
module memory. Every fetch, including health and audit, sends its bearer header.
Reload using the original printed URL because the token is deliberately not
persisted in browser storage.

The target picker creates a conversation with either `{}` (Default) or
`{ target }`, closing the previous session. Questions stream on the left;
sequential tool starts and ends update one trace row per call on the right.
Arguments are capped at 300 characters; status, first error line and result byte
count are shown. The Audit tab fetches only the current session's records and
shows kind, tool, target, SQL hash, rows and elapsed milliseconds.

Streaming uses a fetch reader and an incremental SSE parser with CR/LF/CRLF,
chunk boundary, comment and multiline-data support. JSON `text` payloads accept
`{ delta }` or a string; `tool_end` uses `name`, `isError`, `error` and
`resultBytes`; `done` uses `answer`. HTTP 404/410 on an ask creates a fresh
session and retries that question once, clearing the expired conversation.
HTTP 409 reports busy without retrying. Network failures, interrupted streams
and generic SSE errors leave partial text visible. Stop aborts the fetch;
inputs and the target selector are disabled while it runs.

All dynamic content is assigned with text nodes. Answers retain whitespace and
never render Markdown or HTML. Labels, live answer/status regions, keyboard
submission (Enter; Shift+Enter for newline), keyboard tabs and a stacked phone
layout support accessible use. Health is checked on entry and with Refresh health.

`tests/unit/web-page.test.ts` covers parser chunk boundaries and Unicode, trace
matching and immutability, argument bounds, and static restrictions against HTML
execution sinks, inline handlers/styles/scripts, dynamic evaluation and external
URLs. These tests need neither a browser, Oracle nor Strata. End-to-end browser
and merged server checks subsequently passed; see the phase 2 results below.

Page validation (2026-10-28): `npm run typecheck` passed; `npm test` passed
17 files / 315 tests; `node --check` passed for both JavaScript modules.
The worktree initially lacked dependencies; validation used a temporary local
`node_modules` symlink to the coordinator worktree's installed dependencies, removed after testing.
No contract changes or additional dependencies are needed. No DB/LLM code was
changed and no live database or model requests were made during that work.
Subsequent browser and merged-server checks passed, including a live smoke test.

## Phase 2 report, export and grounding (WP-2C)

`GET /api/report?target=<configured-name>[&sections=identity,tablespaces][&summarize=1]`
returns `{ report, summary?, unverified? }`. Summary requests include
`unverified: string[]`, empty when supported or checking is disabled. Omitted
target uses the configured default; omitted sections selects all report sections. Names are validated against the report module's
section list (including its grouped selection behavior). Invalid targets, empty or
unknown sections and invalid summary flags return 400. Authentication, Host, Origin,
CSP and no-store behavior match the other API routes. Report/provider/summary/cleanup
failures return only `Report failed`, without driver details or connection settings.

The route calls `generateReport` through a dedicated session provider with an audit
run ID and pinned target, then closes the provider. Optional summaries call
`renderMarkdown` and `summarizeReport` under the same process-wide lock as chat and
health; a busy lock returns 409 before creating a provider. The lock stays held
through report generation, summary and provider cleanup. Deterministic reports
can run while chat is busy and never invoke the LLM. Test seams inject report,
summary and provider implementations without Oracle or Strata.

The Report tab runs for the selected target, optionally requests a summary, and
renders tables and availability notes with DOM nodes and textContent. Tables scroll
inside their panel on phone screens. Changing targets clears the displayed report.
WP-3A checks summary numbers against report evidence after the single LLM call,
without a correction turn. A nonempty list adds an Unverified note below the
summary using textContent; `PIAGENT_GROUNDING_CHECK=0` disables this check.
The SSE done payload carries `unverified: string[]`; nonempty values produce a
visible Unverified note attached to that answer. WebAgent has a local optional
property adapter, so no shared contract changes are required.

Export Markdown downloads `piagent-conversation-<ISO timestamp>.md` entirely in the
browser. Its conversation, grounding notes and trace cells come from displayed DOM
text; HTML characters and table delimiters are escaped. The export never reads the
token, API response metadata, audit, report, or agent state. Trace events now expose
only scalar diagnostic argument fields (target, owner, name, type, limit, sql_id),
omitting SQL text, binds and connection/credential fields before they reach the page.
The export includes the current trace even when another evidence tab is selected.
No dependencies or CSP changes were needed.

Validation on 2026-10-29:

- `npm run typecheck`: passed.
- `npm test`: 25 files, 525 tests passed.
- `npm run build && npm run test:browser`: build passed; 11 browser tests passed,
  1 opt-in live smoke skipped. Fake report tests cover hostile cells and summary,
  unavailable notes, phone overflow, export filename/content and grounding notes.
- With the coordinator `.env` loaded,
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'`: 6 files passed,
  22 tests passed, 1 live LLM end-to-end test skipped (7.32 seconds).
- Antigravity approved all seven security checks. Coordinator live smoke verified
  authentication and input refusals, all 14 d1 sections, 11 p1 sections plus three
  named grant notes, a read-only d1 summary (42 s), chat `unverified: []`, and no
  token in the audit. WP-3A summary reruns on both targets produced zero flags.

## Phase 4 saved-run comparison (WP-4B)

`GET /api/report` also returns `diff`, comparing the generated report against the
newest saved report for the selected target. History defaults to `var/reports`;
there is currently no report-directory field in AppConfig. Loading history never
creates directories, changes file modes, or saves a run. An absent baseline has
`previousGeneratedAt: null`. The response preserves the shared diff fields and
adds web-local `before` and `after` display strings to each change, using matching
snapshot rows (or availability/backup states). No shared contract change is needed.

`POST /api/report/save?target=<name>` generates a fresh report, compares it to the
previous saved run, and then saves JSON and Markdown using the shared history API
(private 0600 files, atomic publication and retention of 30 runs). It returns
`{ report, diff, savedAt, summary?, unverified? }`; `savedAt` is the newly saved
report's generation timestamp. It accepts the same selection and summary options
as GET. Authentication and Host/Origin protections are identical to the existing
POST routes: a bearer token is required and any supplied Origin must match Host.
Invalid targets are rejected before database/history access; history errors return
only `Report failed`. Provider cleanup completes before persistence. No paths are
returned to the browser. Existing summary locking and grounding checks are retained.

The Report tab displays a Changes since last saved run panel, with baseline time,
rule, item key and before → after values. It shows No changes. for an unchanged
baseline and No saved run yet. when none exists; comparison notes remain visible.
Save this run is enabled after a successful report and explicitly runs/saves a
fresh report (it does not persist a client-supplied snapshot). Target changes clear
the report and disable saving. All values use DOM nodes and textContent, including
hostile values. The panel wraps long strings on phone screens.

Tests use fake database/report seams and temporary history directories, never the
repository's report history. Route tests cover authorization, Host/Origin, bad
targets, side-effect-free reads, private saves, pre-save comparisons and scrubbed
history failures. Browser fixtures supply fake history and cover changes, no
baseline, no changes, hostile values, phone overflow and explicit saving.

WP-4B validation (2026-10-29):

- `npm run typecheck`: passed.
- `npm test`: 29 files / 579 tests passed.
- `npm run build && npm run test:browser`: passed; 14 browser tests passed,
  1 opt-in live smoke test skipped. An initial existing assertion needed to select
  one cell after the fake report gained a second table; the final suite passed.
- With the coordinator environment loaded,
  `npm run test:integration -- -t '^(?!.*answers one end-to-end)'`: passed;
  7 files / 24 tests passed, 1 LLM test skipped (8.35 seconds).
- No LLM calls were made. Antigravity review and the live web smoke remain
  coordinator gates. No shared contract, config or dependency changes are needed.
  Validation used a temporary node_modules symlink to the coordinator worktree's
  installed dependencies; the symlink was removed afterward.

### Cross-target drift

The Drift tab compares the two approved targets without an agent or LLM call.
Choose left/right targets, then Parameters, Schema or Objects. Schema and Objects
also require an owner (for example HR). Self-comparisons are allowed. Results
show source views, unavailable-section notes, and collapsible Only left, Only
right and Different groups. An incomplete comparison does not establish equality
for unavailable sections. Object and column names render as literal text.

The authenticated `POST /api/drift` accepts JSON
`{"left":"d1-19c-lab","right":"p1-19c-prod","scope":"schema:HR"}`.
It uses the existing bearer-token, loopback Host and same-origin Origin checks;
other methods are rejected. Targets must be both approved and configured, and
scope validation reuses the drift engine. Queries use its read-only policy,
audit and row limits unchanged. One comparison per server is allowed through
provider cleanup; concurrent requests return 429. JSON responses over 1 MiB
return 413 instead of partial results; choose a narrower scope. Internal failures
return a generic error without connection details. No results are saved.

WP-13B validation: route tests cover authentication, Host/Origin, method and
selection validation, cleanup locking, error scrubbing and response bounds.
Mocked browser tests cover literal hostile object/column names, unavailable
sections, collapsible groups, 375px layout and concurrent rejection. Live browser
and LLM smoke tests are deliberately excluded from this work package's run.

### Saved report history

The Report tab's History panel reads up to the newest 30 saved runs for the selected
target. Opening the tab, changing targets, saving a report, or pressing Refresh
history refreshes it. No report is generated by a history refresh: it reads local
saved files only and uses neither Oracle nor Strata.

Each series shows an inline SVG sparkline (oldest to newest, independent scales),
first/last/min/max/change and the deterministic WP-12A worsening flag. Missing
observations and changes of source break the line; a single observation is a dot.
`—` indicates missing or non-comparable values. Section availability is expandable,
and skipped-file and partial-history notes remain visible. Empty history prompts
the user to run and save a report. Counts describe saved observations, not changes
between report intervals.

`GET /api/report/history?target=<configured-target>&last=<1..30>` returns the
WP-12A `ReportTrends` shape. Both parameters are optional (default target, 30 runs).
It uses the existing bearer token and Host/Origin checks, sends `Cache-Control:
no-store`, rejects other methods, and returns a generic error on read failures.
Labels and notes use `textContent`; SVG coordinates are computed from numeric
observations. No dependencies or shared contracts were added.

### PL/SQL and triage

The **PL/SQL** tab lists objects for its selected approved target, optionally
filtered by owner. Choose an object and **Document object** to see signatures,
comments, status, errors, heuristic table operations, callers, jobs and redacted
source. Expand the evidence sections to inspect dictionary availability and caps.
The dependency SVG uses the documented `{nodes, edges}` JSON from
[PL/SQL documentation](plsql.md). It lays nodes out left to right and fits the panel width, with independent scrolling
below 600px. Edge colors and dash patterns distinguish calls, contains, reads,
writes, dependencies and job runs; a legend explains them and hover titles preserve
the original edge kind and operation. Parallel reads and writes have separate paths.
Long node labels have full SVG titles.
All dictionary labels are inserted as text, including SVG labels.

The **Triage** tab accepts issue text, a target and a `since` window such as `24h`
(maximum `30d`). **Run triage** collects deterministic, read-only evidence without
an LLM. It shows ranked hypotheses, suggested fixes (never executed), limitations,
frame excerpts, numbered SQL checks, evidence tables and a trace SVG.
**Download Markdown** exports the latest successful result. A failed run disables
export so a stale result cannot be mistaken for the new incident.

Authenticated endpoints:

| Method | Endpoint | Input |
|---|---|---|
| GET | `/api/plsql/list` | `target`, optional `owner` |
| GET | `/api/plsql/doc` | `target`, `object=OWNER.NAME` |
| POST | `/api/triage` | JSON `target`, nonempty `issue`, optional `since` |

Targets default to the configured default and must be one of the two approved
configured targets. Names must be unquoted Oracle identifiers (letters followed
by letters, digits, `_`, `$`, `#`, at most 128 characters per component).
The existing bearer token, Host and Origin checks apply. These three routes share
a single-flight lock through session cleanup (`429` when busy). Issue text is
limited to 64 KiB of UTF-8; the JSON envelope is capped at 400 KiB to allow JSON
escaping. Responses including Markdown are capped at 1 MiB (`413`). Narrow the
owner/object or incident when a cap is reached. Failures return generic messages.
Neither the tab nor the panel sends evidence to Strata.

In web chat, `/triage [--since <duration>] <issue text>` collects evidence for the conversation target,
then submits one bounded grounded question through the existing model path.
Normal turns keep their original prompt and tools. This command uses Strata;
the deterministic Triage panel does not. See [triage](triage.md).

Oracle-supplied dependency nodes (owner `SYS` or `PUBLIC`) collapse to one
`Oracle-supplied (N)` node in SVG and Mermaid rendering. Its tooltip lists the
names; JSON graph nodes and edges remain complete. Source and dictionary evidence
sections are unchanged.

The SVG layout gives edges room between roughly 200px boxes, orders each column
with three alternating neighbour-barycenter sweeps, and spreads attachments along
each box side. Box heights follow their text. Owners appear on a muted line above
identifier labels; labels wrap at dots and underscores, splitting inside a token
only when that token cannot fit. Kind tags distinguish jobs, packages, procedures,
tables and Oracle-supplied nodes. The legend sits immediately above the diagram.

### Alert Log (WP-18C)

The **Alert Log** tab reads `V$DIAG_ALERT_EXT` and the joined ADR incident/problem
list through `src/alertlog`. Choose either approved target, a relative window
(default `24h`, maximum `30d`), optional comma-separated five-digit ORA-/TNS-
codes, and a case-insensitive message substring. The default reader severity
filter includes diagnostic text markers even when Oracle labels them Normal.
No LLM is involved.

The table shows first/last timestamps, textual and coloured severity, folded
counts, incident badges, problem keys and trace names. Trace names are evidence
text; the web server never reads those files. Text/metadata caps and partial row
results are labelled. ADR incidents use the same time window; message/code
filters apply only to alert entries. Missing access displays the exact SELECT
grant request as text, without executing it. Markdown exports both tables.

`GET /api/alertlog?target=d1-19c-lab&since=7d&codes=ORA-00600&text=incident`
returns `{ entries, incidents, markdown }`, where the first two are the reader's
`AlertResult<AlertRow>` and `AlertResult<IncidentRow>`. It shares the insight
routes' bearer token, loopback Host/Origin checks, approved target validation,
1 MiB response cap and single-flight lock through session cleanup. The readers
run sequentially, with the configured row and statement-timeout limits.

The Triage panel renders optional `TriageResult.alertLog` from the Phase 18 shared
shape: status, window, grants, entries, incidents and code/job-run correlations
with one-based entry references. Older triage responses remain supported.
WP-18B supplies this evidence; WP-18C does not change triage collection or its
Markdown renderer.

Browser fixtures cover both colour modes at phone width, literal hostile text,
folded metadata, filters, downloads, missing/empty/unavailable/skipped evidence,
and failure recovery. Unit route tests cover auth, Host/Origin, input validation,
the shared lock, cleanup and sequential reader calls without DB/LLM access.

To reproduce the four live SQL-only captures:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
PIAGENT_ALERTLOG_LIVE=1 npm run test:browser -- tests/browser/alertlog-live.spec.ts
```

The capture server stubs health and every agent path, binds loopback, and uses
real read-only Oracle sessions. Its credential URL stays in memory. Cleanup
resolves the actual listening PID using `ss -ltnp` and sends SIGTERM to it.
The ordinary browser suite skips both opt-in live tests; the Strata live test
must remain disabled for WP-18C validation.

Live captures (30-day window; bounded, partial evidence):

| Target | Light | Dark |
|---|---|---|
| d1 | [Light](img/alertlog-d1-19c-lab-light.png) | [Dark](img/alertlog-d1-19c-lab-dark.png) |
| p1 | [Light](img/alertlog-p1-19c-prod-light.png) | [Dark](img/alertlog-p1-19c-prod-dark.png) |

WP-18C validation (2026-11-04):

- `npm run typecheck`: passed.
- `npm test`: 71 files, 1,071 tests passed; no DB or LLM.
- `npm run test:browser`: 32 passed, 2 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=… npx vitest run tests/integration/alertlog.test.ts`:
  2 passed (d1 and p1), no LLM tests selected.
- The SQL-only live capture command above: 1 passed, four screenshots captured
  and inspected; capture listener stopped by its resolved listening PID.
- No shared-contract or `src/alertlog/` changes required. Live WP-18B triage
  integration remains for the coordinator after that branch merges; shared
  shape rendering is verified with fixtures here. No LLM calls were made.

WP-18C visual-review follow-up:

- Alert entries now give Message the remaining width after compact timestamp,
  severity and count columns. Codes and incident badges sit with the message.
  Alert evidence uses a wider desktop evidence pane. Timestamps omit milliseconds,
  preserve exact ISO values in their titles, and show last time on a second line
  only when it differs from first time.
- Messages have a three-line preview and a native **Show full message** disclosure
  only when the rendered preview overflows. Trace paths are replaced with basenames
  in message text and collected in a separate collapsed
  **Trace files (N)** list. Items show basenames with full paths in their titles.
  Markdown exports retain the reader's complete bounded evidence.
- Incident badges wrap inline, with at most five followed by **+N more**.
  The ADR numeric status column is labelled **Status code**.
- The white surround was a stylesheet issue, not a screenshot media-setting issue:
  existing PL/SQL/Triage dark rules themed their inner panels but the root, section
  and tab bar retained light backgrounds. The fix uses the existing dark colours
  (`#19282e`, `#223b45`, `#e0edf0`) for the page, section and tab shell across
  **every tab**, including PL/SQL, and the conversation. The initial alert-scoped
  version was broadened after coordinator review.
  [PL/SQL dark shell screenshot](img/plsql-dark-shell.png) uses the WORKLOAD
  browser fixture at a 1280px viewport; no LLM or DB access is needed.
- Desktop screenshots above were retaken with a **1280px viewport**, now including
  the full page to show the shell. [390px phone capture](img/alertlog-p1-19c-prod-phone.png)
  uses stacked alert entries and has no horizontal page scroll. The ADR table can
  scroll within its own wrapper. [Fixture triage alert section](img/alertlog-triage-fixture.png)
  demonstrates the shared shape and job-run correlation.
- To reproduce the fixture screenshot, run
  `PIAGENT_ALERTLOG_CAPTURE_FIXTURE=1 npm run test:browser -- tests/browser/alertlog.spec.ts`.
- Follow-up validation: typecheck passed; 1,071 unit tests passed; browser suite
  34 passed, 2 opt-in live tests skipped. The separate Oracle-only live capture
  test passed against both approved targets and stopped its server by listening
  PID. Browser tests verify details toggling, preview height, basename/title paths,
  five-badge cap, Message width, compact timestamps, Status code, dark shell colours,
  and no page overflow at 1280px and 390px. No DB or LLM code changed and no LLM
  calls were made; no contract changes are needed.

Final visual follow-up:

- Trace references preserve their basenames inline (for example,
  `Errors in file PRODCDB_j005_704.trc:`); full paths remain in trace-list titles.
- A ResizeObserver checks actual preview overflow, including tab activation and
  viewport resizing. Short messages have no full-message toggle. The three-line
  preview gains a toggle only when clipped; the separate text-cap note still
  reports upstream reader truncation independently.
- The dark shell now applies globally across all seven evidence tabs and the
  conversation. A browser test checks root/body, both sections and the tab bar
  on each tab; the PL/SQL screenshot above confirms the WORKLOAD fixture view.
- Validation: `npm run typecheck` passed; `npm test` passed all 1,071 tests;
  `PIAGENT_ALERTLOG_CAPTURE_FIXTURE=1 npm run test:browser` passed 36 tests,
  with the 2 opt-in live tests skipped. The separate Oracle-only capture test
  passed on both targets, refreshed the five live images and stopped its server
  by listening PID. No DB/LLM code or contracts changed; no LLM calls were made.

PL/SQL graph contrast and bounds follow-up:

- Node fills, outlines, owner/name labels and kind tags use graph theme tokens.
  Light uses pale nodes with dark labels; dark uses `#223b45` nodes with
  `#e0edf0` labels and `#b0bdc8` owner/kind text. Each of the six edge styles has
  separate light/dark colours, retaining its distinct dash pattern and legend.
- The viewBox already included all nodes. Clipping in the earlier desktop image
  came from the SVG's 600px minimum width exceeding its evidence pane. Desktop
  SVGs now fit their container, and the PL/SQL pane gets the same wider desktop
  allocation as alert evidence. Phones retain a horizontal scroll region that
  can be focused with the keyboard; its right edge exposes the last column.
- [Dark graph](img/plsql-dark-shell.png) and [light graph](img/plsql-light-shell.png)
  were retaken with the WORKLOAD browser fixture at a 1280px viewport and inspected.
  Both show the full right-most table column.
- Browser tests check every node rectangle against the SVG viewBox, desktop fit,
  phone scroll reachability and lack of horizontal page overflow. They calculate
  contrast from computed SVG colours: every label/owner/kind tag is at least
  4.5:1 against its node fill; outlines are at least 3:1 against node fill and
  edges/legend swatches at least 3:1 against the surrounding surface. All six
  colour/dash styles remain distinct in both themes. These are graph-specific
  contrast checks, not a claim of an application-wide accessibility audit.
- Validation: `npm run typecheck` passed; `npm test` passed all 1,071 tests;
  `PIAGENT_ALERTLOG_CAPTURE_FIXTURE=1 npm run test:browser` passed 38 tests,
  with 2 opt-in live tests skipped. No DB or LLM paths changed or ran; no shared
  contract changes are needed. The screenshots use browser fixtures.

## SQL and Security tabs (1.2.0)

The evidence tab bar now includes Tool trace, Audit, Report, Drift, PL/SQL, SQL,
Security, Alert Log and Triage. Chat remains alongside the evidence panels.

The **SQL** tab reads one cached statement by SQL ID or text fragment. Text searches
list candidates for explicit selection, even when only one matches. The CLI
opens a single untruncated match automatically.
It shows child metrics, plan trees and changes, table/index statistics, optional
controls and metadata, findings and per-section availability. Bind values are
never displayed. Markdown export preserves the evidence. See [SQL insight](sqlperf.md).

The **Security** tab groups posture findings by severity, provides a severity
filter, and shows availability notes. Supply `OWNER.OBJECT` to draw who-can
privilege paths, with a list fallback. Markdown export includes the report.
A status of `ok` describes available evidence, not a clean security assessment.
See [security](security.md) for reachability limits and deliberately excluded data.

Both tabs use deterministic read-only database evidence without an LLM. They
support light/dark themes and contain wide content inside scrolling regions.
The Alert Log tab now shows decoded ADR status names alongside raw codes.
