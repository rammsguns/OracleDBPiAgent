# WP-O: optional per-request thinking budget

Set `PIAGENT_LLM_REASONING_BUDGET` to an integer from 64 through 8192 to send
`reasoning_budget_tokens` in every Strata chat completions request. Empty,
non-integer and out-of-range values fail configuration loading. Unset preserves
the existing request body, leaving Strata's server default of 2048 in effect.
The existing thinking level and maximum output token settings still apply.

The local `TunableLlmConfig` adapter exposes `reasoningBudgetTokens`; no shared
contract change is required. pi-ai 1.4.0's supported `StreamOptions.samplingParams`
(`node_modules/@earendil-works/pi-ai/dist/types.d.ts`, lines 120–127) accepts
arbitrary OpenAI-compatible request fields. Its `openai-completions.js` adapter
merges these fields into the request body (lines 752–754). We use that hook,
preserving other per-request sampling parameters and the existing loopback,
port and redirect guards. No fetch wrapper or dependency patch is needed.

Read-only evidence:

- `/home/kiwi/llm-rig/strata/RUN.md`, lines 45–82: documents the default thinking
  budget of 2048, client overrides and closing reasoning to leave room for an answer.
- `/home/kiwi/llm-rig/strata/engine/serve/frontend.py`, around lines 655–680:
  describes closing thinking after the token budget and giving an explicit
  request `reasoning_budget_tokens` priority over the Anthropic budget mapping.

The optimizer allowlist accepts this key and removes inherited values for
baseline runs. The `reasoning-budget-1024.json` and `reasoning-budget-512.json`
variants change only this setting relative to the promoted baseline.

Unit tests validate boundaries and invalid inputs, load both variants, and run
the real SDK against a fake fetch to capture the outgoing JSON. Removing the
budget field produces the identical baseline body string. All network requests
in that unit test, including health, are fake; its key is a temporary test fixture.

Answer quality, refusal behavior and token savings remain unverified until the
coordinator runs sequential A/B evaluations under the existing acceptance gate.
No LLM calls, evals or optimizer runs were made during this work.

Validation results:

- `npm run typecheck`: passed.
- `npm test`: 12 files passed, 269 tests passed.
- `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  4 files passed, 12 tests passed, 1 skipped (the excluded LLM end-to-end test),
  after loading the copied `.env` paths into the shell. An initial run without
  those environment settings skipped all 13 tests.

Changed files: `src/config/tunables.ts`, `src/llm/index.ts`, `evals/optimize.ts`,
`evals/variants/reasoning-budget-1024.json`,
`evals/variants/reasoning-budget-512.json`,
`tests/unit/wp-o-reasoning-budget.test.ts`, and this document.
Shared contract changes needed: none.
