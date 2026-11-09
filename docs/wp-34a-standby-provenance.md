# WP-34A standby provenance notes

## Built

Added gated `run_query` source notes for successful backup metadata and scheduler history reads on standby databases. The role helper is reused and caches detection per session; known primary identity skips the extra role query. Unknown roles silently omit the note. Matching uses the existing SQL tokenizer and adds no prompt or tool-description text.

## Files changed

- `src/tools/index.ts`
- `tests/unit/tools.test.ts`
- `tests/integration/query-error-hints.test.ts`

## Tests

- `npm run typecheck` — could not start: `tsc: not found` (worktree has no `node_modules`).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm test -- --maxWorkers=2` — could not start: `vitest: not found`.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)' tests/integration/query-error-hints.test.ts` — could not start: `vitest: not found`.
- `git diff --check` — passed.

## Contract changes

None required.

## Unverified

Unit and live integration tests could not execute because dependencies are absent from this worktree. No database or LLM calls were made.
