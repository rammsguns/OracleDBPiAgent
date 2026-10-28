# WP-U completion report

Implemented the node:http loopback web server and `piagent web [--port N]`, with
random in-memory tokens, constant-time authorization, strict Host/Origin checks,
security headers, all API routes, SSE, a process-wide LLM lock, bounded request
input, generic error responses and safe static serving. Implemented injectable
agent sessions with per-conversation DB providers/runIds, target pinning, a
four-session cap including pending initialization, idle expiry, disconnect abort,
wait-for-idle cleanup and SIGINT/SIGTERM shutdown. The health API reuses doctor
through a new optional structured reporter; audit responses filter by runId and
allowlist metadata. Configured login names are removed from target descriptions.

Files changed:

- `src/web/server.ts`
- `src/web/sessions.ts`
- `src/cli/index.ts`
- `tests/unit/web-server.test.ts`
- `docs/web-ui.md` (server documentation only)
- `docs/wp-u-web-server-report.md`

Validation on Node v24.18.1:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
exit 0

npm test
Test Files  17 passed (17)
     Tests  328 passed (328)
exit 0

set -a; . ./.env; set +a
npm run test:integration -- -t "^(?!.*answers one end-to-end)"
Test Files  5 passed (5)
     Tests  20 passed | 1 skipped (21)
exit 0
```

The new web suite has 21 tests, using fake agents/providers without Oracle or
Strata. It covers security checks/headers, stream ordering and metadata, cross-server
serialization, disconnect abort with delayed settlement, generic failures, session
cap/idle cleanup, target pinning, filtered audit records and static traversal/symlinks.
The skipped integration test is the deliberately excluded end-to-end LLM case.
Existing dependency and environment files from the coordinator checkout were
linked locally for validation, without package/dependency changes.

Shared contract changes required: **none**. `DoctorDependencies.report` is a local,
optional CLI hook. Wire payloads are documented in `docs/web-ui.md` and were sent
to the coordinator for WP-V alignment. Errors use a generic tool failure line
rather than forwarding driver/provider error text.

Not verified here: the coordinator-owned live UI/API smoke test and Antigravity
security review. WP-V static assets are outside this branch. Compiled distributions
need static assets copied alongside `dist/web/server.js`; the existing TypeScript
build does not copy them, and package.json is coordinator-owned. Running
`npm run piagent -- web` serves `src/web/static/` directly. Both WPs own parts of
`docs/web-ui.md`, so retain both sections when merging their additions.
