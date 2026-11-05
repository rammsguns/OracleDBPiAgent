# WP-18E integration fix

The reproduced `/api/triage` failure was HTTP 500 (`Request failed`). Calling the
Markdown renderer directly exposed `TypeError: Cannot read properties of undefined
(reading 'status')` at `renderTriageAlerts`. The browser triage stub bypassed
`triageIssue` and supplied only top-level alert evidence, omitting the per-issue
field consumed by the merged renderer. It was not an unsupported Oracle query in
this reproduction.

The renderer now tolerates absent optional per-issue alert evidence. Browser
fixtures populate both levels and use `collectAlerts` against fake Oracle alert
and incident query responses, exercising actual code and failed-run correlations.
Unexpected fake queries still throw and no real database connection is made.

All optional alert reads in triage (job discovery, recent evidence, code matches,
failed-run windows and incidents) now catch unexpected failures, including session
acquisition and close failures. They produce unavailable checks and a short,
constant reason without exposing raw errors. Existing grant handling remains.
Successful evidence from other reads is retained. Unit tests exercise unexpected
query/acquisition/close errors and the absent-field renderer regression.

Local interface addition: `TriageAlertLog.reason?: string`, included in Markdown.
No shared contracts, dependencies or coordinator-owned files require changes.

Validation:
- `npm run typecheck`: passed.
- `npm test`: 1110 passed.
- `npm run test:browser`: 38 passed, 2 opt-in live tests skipped.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/triage.test.ts tests/integration/alertlog.test.ts`: 7 passed.

The initial attempt to select integration files through the npm script also
selected the entire integration directory. It was interrupted after an unrelated
drift failure; the requested two files were then run directly with Vitest.
