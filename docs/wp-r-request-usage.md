# WP-R: request usage diagnostics

Each eval result record now has `requests`, in assistant-message order, covering
all user turns. Each assistant message represents one request, even when usage
is missing. No conversation content is stored in these new diagnostics: every
field is a number.

| Field | Meaning |
|---|---|
| `turn` | One-based user-message index; zero only for synthetic/incomplete histories with no preceding user message |
| `input` | That assistant message's `usage.input`: uncached input tokens (pi-ai already subtracts cache reads) |
| `cached` | That message's `usage.cacheRead` |
| `output` | That message's `usage.output` |
| `newUserChars` | User text added since the previous assistant message, or since history began for the first request |
| `newToolResultChars` | Sum of tool-result text blocks added over the same interval |
| `prevThinkingChars` | Sum of `thinking` fields in the immediately preceding assistant message |
| `prevTextChars` | Sum of text blocks in the immediately preceding assistant message |
| `prevToolCallArgChars` | Sum of compact `JSON.stringify(arguments)` lengths for the preceding assistant's tool calls |

The first request has zero `prev*` counts. The first request of a later user turn
keeps the preceding turn's last assistant counts. Each new assistant message
resets the pending user/tool-result counts and replaces the preceding assistant
counts, including resetting absent thinking or tool calls to zero. Multiple tool
results and multiple blocks are summed without inserted separators. Missing
usage fields are zero. Arguments default to `{}` if absent in incomplete
histories; only their serialized length is retained, including the length of any
bind values, never the values themselves.

Characters mean JavaScript string length (UTF-16 code units), not UTF-8 bytes or
tokens. Images, thinking signatures, role delimiters, system prompts, tool
schemas and other provider framing are excluded. The final assistant's output
content has no subsequent request to enter, so it contributes output tokens but
no `prev*` characters unless another request follows. Trailing user/tool-result
messages without a following assistant likewise do not enter a request row.

The results JSON includes a top-level `requestUsage`: `count` is the number of
request rows; `input`, `cached`, `output` and all five character fields are sums
across those rows. The console prints one `Request usage:` line with these
values, and the Markdown summary includes a short **Request usage** table.
Existing per-case usage totals and the optimize ledger are unchanged.

Compare request-level uncached input with the five content parts, preferably
across several requests with different part sizes. For example, if uncached input
tracks `prevThinkingChars / approximately 4`, that is evidence consistent with
Strata's template keeping prior reasoning. The ratio is only a rough heuristic:
actual tokenization, cache boundaries, history pruning and provider formatting
can change it. These counts describe retained agent history, not a captured
provider payload, and cannot prove what the template does alone. First requests
also include fixed system/tool overhead not counted here. The coordinator can
use a subsequent hard-dev eval to investigate this; WP-R ran no live evals.

## Validation and delivery

- `npm run typecheck`: passed (`tsc -p tsconfig.json --noEmit`).
- `npm test`: passed, 15 test files and 304 tests.
- Unit coverage includes multi-request/multi-turn histories, multiple thinking
  and text blocks, multiple tool results/calls, absent thinking/usage, numeric-only
  serialization, aggregate totals, persisted JSON and Markdown/console output.
- No DB or LLM calls, evals, optimize runs, or integration tests were performed.
  Provider payload/template behavior remains unverified.
- No shared contract changes or dependencies are needed; `RequestUsage` and the
  required `requests` member extend the eval-local `CachedAskResult` adapter.

Files changed: `evals/runtime.ts`, `evals/run.ts`,
`tests/unit/wp-r-request-usage.test.ts`, `tests/unit/wp-f-runner.test.ts`,
`tests/unit/wp-i-optimizer.test.ts`, and this document.
