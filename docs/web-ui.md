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
and merged server checks remain the coordinator's integration gate.

Page validation (2026-10-28): `npm run typecheck` passed; `npm test` passed
17 files / 315 tests; `node --check` passed for both JavaScript modules.
The worktree initially lacked dependencies; validation used a temporary local
`node_modules` symlink to the coordinator worktree's installed dependencies, removed after testing.
No contract changes or additional dependencies are needed. No DB/LLM code was
changed and no live database or model requests were made. Browser rendering,
merged-server integration, and the end-to-end smoke test were not verified here.
