# Code Review: OracleDBPiAgent (WP-N Cache Tokens Accounting)

**Date:** 2026-10-27  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Commit `36b37ac497887b98f6b963537dfb3ce83a881430` on branch `rammsguns/wp-n-cache-tokens` (reviewed against `needlefish`)  
**Files Under Review:**
- `docs/wp-n-cache-tokens.md`
- `evals/optimize.ts`
- `evals/run.ts`
- `evals/runtime.ts`
- `tests/unit/wp-f-runner.test.ts`
- `tests/unit/wp-i-optimizer.test.ts`

**Verdict:** **APPROVE**

---

## Executive Summary

Commit `36b37ac` implements prompt-cache token accounting for eval runs and the optimization ledger/leaderboard under WP-N ("Token saving"). It records `usage.cacheRead` from Strata prompt caching per case and per run, displaying `tokensCached` in the eval reports, ledger records, and optimization leaderboards while keeping ranking metrics strictly untouched.

The implementation was evaluated against all WP-N specification criteria in `PLAN.md`, the hard review requirements, and the repo safety rules in `AGENTS.md`. All checks passed without defects or omissions.

---

## Detailed Evaluation Against Review Criteria

### 1. Cached Token Summation & Isolation from `tokensIn`
- **Summation Logic (`evals/runtime.ts` - `collectResult`):**
  - Prompt-cache reads are extracted via `assistants.reduce((n, message) => n + (message.usage?.cacheRead ?? 0), 0)`.
  - Non-assistant messages (`role: 'user'`, `role: 'toolResult'`) are filtered out beforehand (`messages.filter(message => message.role === 'assistant')`).
  - Messages missing `usage` or `usage.cacheRead` safely default to `0` via the nullish coalescing operator `?? 0`.
- **Isolation from `tokensIn`:**
  - `usage.input` is calculated purely as `assistants.reduce((n, message) => n + (message.usage?.input ?? 0), 0)`.
  - In `evals/run.ts`, run totals compute `tokensIn` strictly from `records.reduce((n, r) => n + r.usage.input, 0)`, while `tokensCached` is computed separately as `records.reduce((n, r) => n + (r.usage.cached ?? 0), 0)`.
  - Cached prompt tokens are never folded or added into `tokensIn` or `tokensOut` at any stage of execution or reporting.
- **Fault Handling:**
  - When an eval case encounters an execution failure or exception, fallback records explicitly set `usage: { input: 0, output: 0, cached: 0 }`, ensuring consistent record shapes and avoiding `undefined` accumulation.

### 2. Explicit Ledger Projection & Secret Leakage Prevention
- **Ledger Schema (`evals/optimize.ts`):**
  - `LedgerRecord` adds the optional field `tokensCached?: number`.
- **Projection (`evals/optimize.ts` - `appendLedger`):**
  - The function explicitly destructures all permitted fields:
    ```typescript
    const { at, variant, variantSha256, gitHead, suite, split, casesSha256, repeat, passRate, refusalsPass, perCase, tokensIn, tokensOut, tokensCached, toolCalls, wallMs, resultsFile } = record;
    ```
  - It constructs an explicit object literal for `JSON.stringify(...)`. No open-ended spread (`...record`) or dynamic keys are serialized.
  - Runtime configuration, environment variables, secrets, DB credentials, and LLM answers cannot leak into `var/optimize/ledger.jsonl`.
  - Thoroughly verified by unit test `tests/unit/wp-i-optimizer.test.ts`, which injects sensitive fields (`secret`, `config`, `answer`, `env`) alongside `tokensCached: 123` and verifies they are omitted from the serialized ledger.

### 3. Historical Backwards Compatibility (`tokensCached=?` vs `0`)
- **Leaderboard Formatting (`evals/optimize.ts` - `leaderboard`):**
  - Line formatting renders:
    ```typescript
    tokensCached=${row.tokensCached ?? '?'}
    ```
  - For historical entries where `tokensCached` is absent (`undefined` or `null`), the nullish coalescing operator `??` produces `'?'`.
  - For measured runs with zero cached tokens (`row.tokensCached === 0`), `0 ?? '?'` correctly evaluates to `0`.
  - Verified by unit test `tests/unit/wp-i-optimizer.test.ts`, asserting `'tokensCached=?'` for unmeasured rows and `'tokensCached=0'` for zero-cache rows.

### 4. Variant Ranking Invariance
- **Sorting Logic (`evals/optimize.ts` - `leaderboard`):**
  - The sorting comparator is completely unmodified:
    ```typescript
    const eligible = rows
        .filter(row => row.refusalsPass === true)
        .sort((a, b) => b.passRate - a.passRate || (a.tokensIn + a.tokensOut) - (b.tokensIn + b.tokensOut));
    ```
  - Optimization candidates are ranked strictly by refusal pass rate descending, then total un-cached tokens (`tokensIn + tokensOut`) ascending.
  - `tokensCached` is purely informational and does not influence variant eligibility, disqualification, or ordering.
  - Verified by unit test `tests/unit/wp-i-optimizer.test.ts`, confirming that a variant with 10,000 cached tokens ranks according to its 15 un-cached tokens rather than being penalized or rewarded by cache volume.

### 5. Eval Reporting & Display
- **Console Log (`evals/run.ts`):**
  - Outputs `tokensCached=${record.usage.cached ?? 0}` alongside `tokens=${record.usage.input}/${record.usage.output}`.
- **JSON Report (`evals/run.ts`):**
  - Top-level report object records `tokensCached: records.reduce((n, r) => n + (r.usage.cached ?? 0), 0)`.
- **Markdown Summary (`evals/run.ts`):**
  - Formatted Markdown table adds a distinct `Tokens cached` column:
    `| Case | Pass | Tool calls | Tokens in/out | Tokens cached | Wall ms |`

### 6. Contract Discipline & Work Package Boundary
- **Contract Isolation:**
  - WP-N defines a local interface adapter `CachedAskResult extends AskResult` in `evals/runtime.ts`:
    ```typescript
    export interface CachedAskResult extends AskResult {
        usage: AskResult['usage'] & { cached: number };
    }
    ```
  - Shared product contracts (`src/contracts.ts`), `package.json`, and `PLAN.md` were left completely unmodified, respecting rule 4 in `AGENTS.md`.
- **Lane Confinement:**
  - Changes are restricted exclusively to WP-N's assigned paths: `evals/run.ts`, `evals/runtime.ts`, `evals/optimize.ts`, corresponding unit tests in `tests/unit/`, and documentation in `docs/wp-n-cache-tokens.md`.

---

## Verification & Test Results

The review verification was executed strictly within the local environment without making any LLM calls or modifying live databases.

| Check / Test Suite | Result | Details |
|---|---|---|
| TypeScript Typecheck | **PASS** | `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) exited 0 with no errors. |
| Unit Tests | **PASS** | `npm test` (`vitest run tests/unit`): 266 passed across 11 test files (1.76s). |
| Integration Tests (non-LLM) | **PASS** | `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`: 4 files, 13 skipped gracefully in the absence of database credentials; 0 LLM calls made. |
| Git Formatting & Whitespace | **PASS** | `git diff --check needlefish..rammsguns/wp-n-cache-tokens` reported no whitespace errors or trailing spaces. |

---

## Numbered Findings

None. The implementation satisfies all functional, architectural, safety, and testing requirements.

---

## Final Verdict

**APPROVE**
