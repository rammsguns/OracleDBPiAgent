# WP-N: prompt-cache token accounting

Eval records now include `usage.cached`, the sum of `usage.cacheRead` across
all assistant messages (including tool requests and earlier conversation turns).
Missing message usage or cache reads contribute zero. `usage.input` remains the
uncached input count reported by pi-ai; cached tokens are not added to it.

Eval JSON reports include `tokensCached`, the sum across case records and repeats.
Per-case PASS/FAIL lines print `tokensCached`, and Markdown case tables include a
Tokens cached column. As with existing input/output accounting, a failed execution
with no collected result records zero tokens; partial usage is not recovered.

New optimizer ledger rows explicitly project `tokensCached` alongside the existing
metrics. The leaderboard displays `tokensCached=?` for historical rows without
this field, and `tokensCached=0` for measured zero. Cache reads do not affect
ranking: refusal eligibility, pass rate, then `tokensIn + tokensOut` remain unchanged.

An eval-local `CachedAskResult` adapter extends the existing result usage type;
no shared product contract changes are required. Unit tests use synthetic messages
and injected runner dependencies, without database or LLM calls.

Validation: `npm run typecheck` passed; `npm test` passed (11 files, 266 tests).
`npm run test:integration -- -t "^(?!.*answers one end-to-end)"` exited 0
(4 files, 13 skipped: database credentials unavailable via `PIAGENT_SECRET_DIR`,
and the end-to-end LLM case excluded by the filter). No LLM calls or live database
verification were performed. No coordinator contract changes are needed.
