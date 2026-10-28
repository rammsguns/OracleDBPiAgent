# Local read-only web UI: server

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
| `tool_start` | `{ name, args }`, where args is serialized JSON cut to 300 characters |
| `tool_end` | `{ name, isError, error?, resultBytes }` |
| `done` | `{ answer, usage }`, with usage an array of assistant-message usage objects |
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
The TypeScript build does not copy assets: compiled deployments must copy the
static directory alongside the compiled server; `npm run piagent -- web` serves
source assets directly. No dependency or build-script change is required here.

## Validation

`tests/unit/web-server.test.ts` injects fake agents and DB providers. It exercises
loopback binding, random tokens, authentication, Host/Origin checks, headers, safe
target output, SSE ordering/metadata, cross-server prompt serialization, disconnect
abort, failure recovery, session limits/expiry/cleanup, target pinning, audit
filtering, static content types, traversal and escaping symlinks. Unit tests require
neither Oracle nor Strata. The coordinator performs the live browser/API smoke test
and security review before merging WP-U and WP-V.
