# WP-2527N: revision output and descriptive pack refusals

The package-smoke stdout is preserved unchanged in
`docs/wp-2527l-smoke-ask-awr.md`. Its first answer already offered `piagent top`.
A descriptive package restriction triggered an unnecessary revision, and the CLI
printed both answers together without a boundary.

## Changes

`src/agent/index.ts` exposes `isCorrectionMessage(message): boolean`, backed by
the existing private correction-message set. It identifies both pack and number
corrections without exposing their text. `src/cli/index.ts` uses it on user
`message_start` events to print `--- Revised answer ---` before the replacement
answer in non-JSON ask and chat. JSON still returns only the final assistant
answer. The shared single-correction allowance and tool restrictions are unchanged.

`src/agent/packRefusal.ts` now recognizes outside/out-of-scope restrictions,
restricted, prohibited, disallowed, blocked, not allowed/permitted, and descriptive
requires/require/rely-on/relies-on clauses. Dependency wording does not exempt a
clause that directly recommends running a forbidden script/package/report.
Contrast and causal splitting still catches “cannot query AWR, but run awrrpt.sql”.
The exact first smoke answer now produces no correction.

Tests cover real-agent correction identification for both correction types, fake
agent CLI streams for ask/chat separators, final-only JSON, unchanged ordinary
answers, the exact smoke answer, restriction wording, descriptive dependencies,
and direct recommendations including ones that mention license requirements.

## Web check

No web changes were needed. `src/web/sessions.ts` emits the final assistant
answer in `done`; `src/web/static/app.js` handles `done` by assigning
`answer.textContent = payload.answer`, replacing all accumulated deltas. Thus the
completed web answer is final-only. Browser tests were not required because no
web files changed.

## Stored gate replay

Ran `docs/wp-2527l-fire-replay.mts` from `../coord-score` over the supplied
scratchpad directories `gate150`, `gate150b`, `gate150b-p2324`, and `gate150c`.

| Replay | Records | Passing with tools | Incorrect fires | Total fires |
|---|---:|---:|---:|---:|
| All four directories | 1,116 | 894 | **0** | 16 |
| C side only | 368 | 299 | **0** | **2** |

The two C-side records that still fire are passing, zero-tool records:
`hard-p27-refuse-metric-history` and `hard-p27-refuse-repository`. These remain
lexical detector triggers; passing tool-using answers remain untouched.

The combined replay still catches all 11 eligible failing refusal records. It
exits 1 solely for the same three historical metric-history records excluded by
condition (2), as documented in WP-2527L. The C-only replay exits 0.

## Scope and verification

No system prompt or shared contract changes, dependencies, DB calls or LLM calls.
The coordinator owns the live package smoke and gated model evaluation.

Changed files: `src/agent/index.ts`, `src/agent/packRefusal.ts`,
`src/cli/index.ts`, `tests/unit/grounding-hook.test.ts`,
`tests/unit/pack-refusal.test.ts`, `tests/unit/revision-cli.test.ts`,
`docs/wp-2527l-smoke-ask-awr.md`, and this report.

Validation: `npm run typecheck` passed (exit 0);
`npm test -- --maxWorkers=2` passed (128 files, 2,383 tests, exit 0).
Browser tests were not run because web implementation was unchanged.
