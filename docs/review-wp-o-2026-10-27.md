# Code Review: OracleDBPiAgent (WP-O Strata Reasoning Token Budget)

**Date:** 2026-10-27  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Commit `d47eaff233c12c4544f080f2e966e9425b59a869` on branch `rammsguns/wp-o-reasoning-budget` (reviewed against `needlefish`)  
**Files Under Review:**
- `docs/wp-o-reasoning-budget.md`
- `evals/optimize.ts`
- `evals/variants/reasoning-budget-1024.json`
- `evals/variants/reasoning-budget-512.json`
- `src/config/tunables.ts`
- `src/llm/index.ts`
- `tests/unit/wp-o-reasoning-budget.test.ts`

**Verdict:** **APPROVE**

---

## Executive Summary

Commit `d47eaff` implements the opt-in `PIAGENT_LLM_REASONING_BUDGET` tunable under work package WP-O ("Token saving"). The tunable allows capping the thinking/reasoning phase of requests sent to the local Strata LLM (`qwen3.8-flash-next-iq3_s`) by passing `reasoning_budget_tokens` via `@earendil-works/pi-ai` 1.4.0 `StreamOptions.samplingParams`.

The review confirms that:
1. When `PIAGENT_LLM_REASONING_BUDGET` is unset, outgoing HTTP requests to Strata remain byte-for-byte identical to baseline.
2. Configuration loading rigorously validates integer boundaries (64–8192) and rejects malformed or non-integer inputs.
3. The field reliably reaches the request body in pi-ai 1.4.0 `openai-completions` via `samplingParams` and `resolveSamplingParams`.
4. Strata engine documentation and frontend code confirm native support for per-request `reasoning_budget_tokens`.
5. Loopback-only, Strata-only, and secret safety invariants strictly hold.
6. The optimizer allowlist and evaluation variants (`reasoning-budget-1024.json`, `reasoning-budget-512.json`) are correctly wired.
7. Unit tests verify all parsing, boundary, variant loading, and payload serialization behaviors with fake network fixtures; non-LLM integration tests pass.

---

## Detailed Evaluation Against Review Criteria

### 1. Strata Compatibility & Protocol Evidence Analysis

Evidence from Strata documentation and codebase was analyzed:
- **`/home/kiwi/llm-rig/strata/RUN.md` (lines 45–82):**
  - Confirms a server default thinking budget of 2,048 tokens (`reasoning_budget_tokens`).
  - Line 80–82: "The thinking budget closes the reasoning phase to leave room for an answer; clients can explicitly override this budget. These safeguards were added after a 620-token prompt generated over 80,000 thinking tokens without an answer."
- **`/home/kiwi/llm-rig/strata/engine/serve/frontend.py` (lines 655–680):**
  - Line 662–665: "0.1.45: Anthropic's budget_tokens is a real budget, not only a level: the thinking is closed (wrap-up, `</think>`, the answer) after that many tokens. A reasoning_budget_tokens of the request's own wins."
  - Line 678: "A request that gives its own reasoning_budget_tokens (#123) asks for thinking, so it thinks as before."
- **`/home/kiwi/llm-rig/strata/engine/serve/test_server.py` (lines 4383–4415, 4580–4587):**
  - Demonstrates that Strata's OpenAI-compatible completions endpoint directly accepts `reasoning_budget_tokens` as a top-level JSON request body parameter (e.g. `self.openai(reasoning_budget_tokens=20)`), validates that bad values yield HTTP 400, and triggers the reasoning wrap-up when the token threshold is reached.

Conclusion: Strata's server protocol directly supports and honors top-level `reasoning_budget_tokens` on `/v1/chat/completions`.

---

### 2. pi-ai SDK Request Wiring Analysis

The package `@earendil-works/pi-ai` 1.4.0 in `node_modules/@earendil-works/pi-ai/dist/` was analyzed to verify how sampling parameters are handled:
- **`types.d.ts` (lines 120–127):**
  - `StreamOptions.samplingParams?: SamplingParams;`
  - Explicitly documented: *"Arbitrary sampling parameters merged into the request body as-is, after the named request fields, so keys here override them. Lets custom OpenAI-compatible servers (llama.cpp, vLLM, SGLang, ...) receive parameters pi does not model... Merged over `Model.samplingParams` per key. Only applied by OpenAI-compatible adapters (completions, responses, Azure responses); other APIs ignore it."*
- **`api/simple-options.js` (lines 11–16):**
  - `resolveSamplingParams(model, thinkingLevel, requestParams)` merges `{ ...model.samplingParams, ...thinkingLevelParams, ...requestParams }` if any exist, or returns `undefined` if none exist.
- **`api/openai-completions.js` (lines 752–754):**
  ```javascript
  const samplingParams = resolveSamplingParams(model, options?.reasoningEffort ?? "off", options?.samplingParams);
  if (samplingParams) {
      Object.assign(params, samplingParams);
  }
  ```
- **Implementation in `src/llm/index.ts` (lines 38–39):**
  ```typescript
  const reasoningBudget = (cfg as TunableLlmConfig).reasoningBudgetTokens;
  const stream = models.streamSimple(m, context, {
      ...options,
      ...((cfg as TunableLlmConfig).temperature === undefined ? {} : { temperature: (cfg as TunableLlmConfig).temperature }),
      ...(reasoningBudget === undefined ? {} : { samplingParams: { ...options?.samplingParams, reasoning_budget_tokens: reasoningBudget } }),
      fetch: strataFetch
  });
  ```
  When `reasoningBudget` is defined, `samplingParams` is passed with `{ ...options?.samplingParams, reasoning_budget_tokens: reasoningBudget }`, which `Object.assign` places directly into the final `params` object serialized to JSON in the HTTP request body.

Conclusion: `reasoning_budget_tokens` genuinely and cleanly reaches the request body sent to Strata without requiring dependency patches or fetch wrappers.

---

### 3. Unset Request Byte-for-Byte Invariance Verification

- When `PIAGENT_LLM_REASONING_BUDGET` is unset:
  - `(cfg as TunableLlmConfig).reasoningBudgetTokens` is `undefined`.
  - The spread `...(reasoningBudget === undefined ? {} : ...)` evaluates to `{}`.
  - No `samplingParams` property is injected into the call to `models.streamSimple`.
  - In `pi-ai`, `options?.samplingParams` is undefined and `model.samplingParams` is undefined, causing `resolveSamplingParams` to return `undefined`.
  - `Object.assign(params, samplingParams)` is skipped.
- **Test Verification:**
  - Unit test `tests/unit/wp-o-reasoning-budget.test.ts` (lines 30–57) sets up a fake fetch capturing raw request bodies.
  - It executes `createStrataProvider` and `streamFn` with `undefined`, `'512'`, and `'1024'`.
  - Line 49–50: asserts that `baseline` has no `reasoning_budget_tokens`.
  - Line 55: deletes `payload.reasoning_budget_tokens` from the 512 and 1024 requests and verifies `expect(JSON.stringify(payload)).toBe(bodies[0])`.
  - This guarantees byte-for-byte identity of the serialized JSON payload when the budget is unset.

---

### 4. Configuration Validation & Boundary Checks

In `src/config/tunables.ts` (lines 30–35):
```typescript
if (env.PIAGENT_LLM_REASONING_BUDGET !== undefined) {
    const raw = env.PIAGENT_LLM_REASONING_BUDGET;
    const n = Number(raw);
    if (!raw.trim() || !Number.isInteger(n) || n < 64 || n > 8192) throw new Error('Invalid PIAGENT_LLM_REASONING_BUDGET');
    result.reasoningBudgetTokens = n;
}
```
Validation properties:
- **Unset handling:** `env.PIAGENT_LLM_REASONING_BUDGET === undefined` bypasses the block; `reasoningBudgetTokens` is absent from the config object.
- **Empty / whitespace string:** `!raw.trim()` triggers an error.
- **Integer check:** `!Number.isInteger(n)` rejects floats (e.g. `512.5`), `NaN`, `Infinity`, and non-numeric strings (e.g. `'no'`).
- **Lower boundary:** `n < 64` rejects values below 64 (including negative numbers and 0).
- **Upper boundary:** `n > 8192` rejects values above 8192 (matching Strata's max default output limit).
- **Unit test coverage:** `tests/unit/wp-o-reasoning-budget.test.ts` covers `64`, `512`, `1024`, `8192`, and invalid values `''`, `' '`, `'63'`, `'8193'`, `'512.5'`, `'NaN'`, `'Infinity'`, `'-1'`, `'no'`.

---

### 5. Optimizer Allowlist & Evaluation Variants

- **Allowlist (`evals/optimize.ts`):**
  - Line 10: `export const TUNABLE_KEYS = ['PIAGENT_LLM_REASONING_BUDGET', ...]`
  - Line 31: `validateVariant` verifies that keys in variant `env` are members of `TUNABLE_KEYS`.
  - Line 60: `variantEnvironment` loops over `TUNABLE_KEYS` and removes them from the inherited environment, ensuring that baseline runs never leak any outer shell reasoning budget setting.
- **Variant Files:**
  - `evals/variants/reasoning-budget-1024.json`:
    ```json
    {
        "name": "reasoning-budget-1024",
        "description": "Cap Strata thinking at 1024 tokens per request; answer quality awaits coordinator A/B",
        "env": { "PIAGENT_LLM_REASONING_BUDGET": "1024" }
    }
    ```
  - `evals/variants/reasoning-budget-512.json`:
    ```json
    {
        "name": "reasoning-budget-512",
        "description": "Cap Strata thinking at 512 tokens per request; answer quality awaits coordinator A/B",
        "env": { "PIAGENT_LLM_REASONING_BUDGET": "512" }
    }
    ```
  - Both variants conform to the schema required by `validateVariant` (name pattern, description length, valid JSON).
  - Tested in `tests/unit/wp-o-reasoning-budget.test.ts` with `loadVariant` and `variantEnvironment`.

---

### 6. Safety, Security & Architecture Rules Compliance

- **Strata-only & Loopback-only (`AGENTS.md` rules 1 & 2):**
  - `src/llm/index.ts` preserves `assertLoopbackUrl(cfg.baseUrl)` and the custom `strataFetch` wrapper checking loopback port 8080 and `/v1/` prefix with `redirect: "error"`.
  - Provider registration remains strictly `'strata'`.
  - Sequential queuing via `streamQueue` is preserved.
- **Secret Hygiene (`AGENTS.md` rule 3):**
  - No credentials, API keys, or passwords are logged or leaked.
  - The unit test creates a transient fixture file with a dummy API key in `os.tmpdir()` and cleans it up in a `finally` block.
- **Contract & Scope Discipline (`AGENTS.md` rule 4):**
  - Shared contracts (`src/contracts.ts`), `package.json`, and `PLAN.md` remain untouched.
  - Local typing extension uses `TunableLlmConfig` in `src/config/tunables.ts`.
  - All modified files fall strictly within the WP-O lane specified in `PLAN.md`.

---

## Verification & Test Results

All verification commands were executed in the local worktree without making any LLM calls or modifying databases.

| Check / Test Suite | Result | Details |
|---|---|---|
| TypeScript Typecheck | **PASS** | `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) succeeded with 0 errors. |
| Unit Tests | **PASS** | `npm test` (`vitest run tests/unit`): 12 files passed, 269 tests passed in 597ms. |
| Integration Tests (non-LLM) | **PASS** | `node --env-file=../needlefish/.env ./node_modules/vitest/vitest.mjs run tests/integration -t "^(?!.*answers one end-to-end)"`: 4 files, 12 passed, 1 skipped (the excluded LLM end-to-end test) in 4.48s. |
| Git Formatting & Whitespace | **PASS** | `git diff --check needlefish..rammsguns/wp-o-reasoning-budget` reported no whitespace errors. |

---

## Numbered Findings

None. The implementation is complete, well-tested, compliant with all repo and Strata safety constraints, and ready for coordinator A/B evaluation.

---

## Final Verdict

**APPROVE**
