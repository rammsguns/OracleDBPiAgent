# WP-A integration notes

Public entry points are `loadConfig(env?)`, `createOracleAgent(ctx)` (async, returns
PI `Agent`), `JsonlAuditSink(file)`, and `createStrataProvider(llmConfig)`.
`createOracleAgent` accepts an optional provider wiring argument for offline tests.
The CLI entry is `src/cli/index.ts`; the existing npm script invokes it.

The DB tool adapter dynamically imports `src/tools/index.js:createDbTools(ctx)`.
Only a genuinely absent module falls back to the schema-validated `list_targets`
stub; broken installed tools fail instead of silently falling back.
For CLI session construction it looks for
`src/oracle/index.js:createSessionProvider(config): SessionProvider`. That factory
is not specified in the shared contracts: WP-B/coordinator must confirm it or
adjust the local adapter. Until present, doctor reports failure for both targets.
No shared contract change is required for the agent itself.

Doctor checks the 19c identity and configured account, enabled session privileges,
and direct/enabled-role object grants. Unexpected privileges fail conservatively.
It does not establish that the database is read-only through an active write probe.
No database connections were made during WP-A development.

Audit stores allowlisted event metadata and SQL SHA-256, deliberately omitting raw
SQL text and free-form details because literals/errors may contain secrets. Start
and completion records both use `tool_call` because AuditEvent has no completion
kind. If distinct completion records or sanitized SQL previews are wanted, the
coordinator can extend the shared contract. Truncation is recorded in completion
metadata and the returned details. Truncated content/details fit the byte budget.

Context pruning replaces old tool payloads while preserving call IDs, then removes
complete oldest user turns. The system prompt and newest user turn are retained;
a single oversized newest turn cannot be reduced safely by this strategy.
UTF-8 byte count is used as a conservative token approximation.

LLM requests use only the Strata provider and a constrained fetch with redirects
disabled. An in-process queue serializes requests across agents; separate processes
and other applications must also respect the shared Strata single-stream policy.
Health checks never load, restart or reconfigure Strata. The configured request
timeout aborts provider requests. Tool budgets reset per prompt; exhausted runs
get exactly one final request with tool declarations removed.
