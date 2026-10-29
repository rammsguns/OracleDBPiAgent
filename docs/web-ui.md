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
