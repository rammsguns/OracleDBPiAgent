# WP-34A standby provenance notes

## Built

Added gated `run_query` source notes for successful backup metadata and scheduler history reads on standby databases. The role helper is reused and caches detection per session; known primary identity skips the extra role query. Unknown roles silently omit the note. Matching uses the existing SQL tokenizer and adds no prompt or tool-description text.

## Files changed

- `src/tools/index.ts`
- `tests/unit/tools.test.ts`
- `tests/integration/query-error-hints.test.ts`

## Tests

- `npm run typecheck` — passed.
- `npm test -- --maxWorkers=2` — attempted, but did not complete within the available command window; an earlier attempt showed the WP unit issues that were fixed.
- `npx vitest run tests/unit/tools.test.ts tests/unit/preflight-catalog.test.ts --maxWorkers=2` — passed (78 tests).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/query-error-hints.test.ts --no-file-parallelism --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'` — passed (20 tests), including live c1s standby notes and no notes on c1 primary.
- The requested `npm run test:integration ... tests/integration/query-error-hints.test.ts` invocation was also attempted, but the package script runs the full integration directory despite the file argument and did not finish; the direct Vitest invocation above passed.
- `git diff --check` — passed.

## Contract changes

None required.

## Unverified

The full 147-file unit suite did not return a completion summary during this session; the affected unit files passed directly. Live integration coverage passed against c1s and c1. The Strata e2e test was excluded; no LLM calls were made.
