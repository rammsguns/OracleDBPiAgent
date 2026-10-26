# WP-E verification — 2026-10-26

Approved target identities now live in `src/config/approvedTargets.ts`. Both
configuration validation and the session provider use this frozen code allowlist,
independent of the editable JSON. The Oracle module preserves its endpoint exports
and optional override for the non-19c gate integration test. Target JSON is unchanged.

Doctor accepts optional health-check and session-provider factories. Failures name
the check using fixed text, omit dependency error messages and privilege values,
and set exit code 1 through `main()`. Tests simulate unloaded Strata, one unreachable
target, a rejected version and unexpected privileges; no services were disrupted.

Validation:

- `npm ci --ignore-scripts`: succeeded; zero vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: 118 passed in six files.
- With `.env` exported, `npm run test:integration -- -t '^(?!.*answers one end-to-end ask)'`:
  six passed, one excluded. Both 19c targets and real non-19c refusal passed.
  The end-to-end LLM ask was excluded to comply with the health-GET-only instruction.
- With `.env` exported, `npm run piagent -- doctor`: passed, Strata loaded and both
  targets Oracle 19.9.1.0.0 with CREATE SESSION only. Only the health GET contacted
  Strata; no inference requests were made.

No shared contract changes are needed. Actual outages and changed database grants
were not exercised; failure paths are verified with injected unit-test dependencies.
