# Code Review: OracleDBPiAgent (WP-R Per-Request Usage Diagnostics)

**Date:** 2026-10-28  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Commit `0d052d203dbc8684e6e8d45590dc3e551fda09b0` on branch `rammsguns/review-wp-r`  
**Files Under Review:**
- `docs/wp-r-request-usage.md`
- `evals/run.ts`
- `evals/runtime.ts`
- `tests/unit/wp-f-runner.test.ts`
- `tests/unit/wp-i-optimizer.test.ts`
- `tests/unit/wp-r-request-usage.test.ts`

---

## Executive Summary

Commit `0d052d2` implements Work Package WP-R ("request usage diagnostics") in `evals/runtime.ts` and `evals/run.ts`. It introduces per-request diagnostic accounting (`requests`) on individual eval records and an aggregate summary (`requestUsage`) in eval results and reports.

The implementation was evaluated against `PLAN.md` (Token saving, WP-R) and the four review requirements:
1. **Message Shapes & Request Attribution:** Correctly aligns with `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` message schemas (`role: 'user'` with string or text/image content parts, `role: 'assistant'` with thinking, text, toolCall blocks and usage, and `role: 'toolResult'` with text blocks). Multi-turn conversations accurately increment turn counters, carry previous assistant content lengths across user turns, reset pending user/tool-result counts upon each assistant message, and handle multiple content blocks cleanly.
2. **Safety, Privacy & Catch Path:** Only numeric counts are recorded in `RequestUsage` and `requestUsage`; no raw text, bind values, database credentials, or Strata API keys are persisted or logged. Tool call arguments are serialized solely to determine character length and discarded immediately. The catch block in `evals/run.ts` preserves the safety invariant by persisting a static error message with empty `requests: []` rather than raw error objects.
3. **No Behavioral Change to Core:** Zero modifications were made to `src/`, prompts, or tool execution. Core eval fields (`toolCalls`, `executedToolCalls`, `usage`, `toolDetails`) remain identical. The optimization ledger in `evals/optimize.ts` uses an explicit property whitelist and is unaffected by `requests` or `requestUsage`.
4. **Test Suite:** Comprehensive unit tests in `tests/unit/wp-r-request-usage.test.ts` exercise multi-turn histories, multiple thinking/text/toolResult/toolCall blocks, partial/missing usage, character counting (UTF-16 code units), sensitive field redaction, and aggregate markdown/console generation. All 15 unit test files (304 tests) and TypeScript typecheck pass cleanly.

---

## Detailed Evaluation Against Review Criteria

### 1. Correctness of Message Shapes and Request Attribution

#### Message Representation (`evals/runtime.ts`)
In `@earendil-works/pi-ai`:
- `UserMessage`: `content: string | (TextContent | ImageContent)[]`
- `AssistantMessage`: `content: (TextContent | ThinkingContent | ToolCall)[]`, `usage: Usage { input, output, cacheRead, ... }`
- `ToolResultMessage`: `content: (TextContent | ImageContent)[]`, `toolCallId: string`

The extractor functions in `evals/runtime.ts` correctly process these types:
- `textChars(content)`:
  - If `content` is a string, returns `content.length`.
  - If `content` is an array of blocks, sums `part.text.length` for blocks with `part.type === 'text'`. Images (`part.type === 'image'`) and metadata/signatures are ignored.
- `collectRequests(messages)`:
  - `user`: Increments `turn` (1-based for real chats) and accumulates `newUserChars += textChars(message.content)`.
  - `toolResult`: Accumulates `newToolResultChars += textChars(message.content)`.
  - `assistant`: Emits a `RequestUsage` row capturing:
    - `turn`: The current user turn index (0 if headless/synthetic).
    - `input`: `message.usage?.input ?? 0` (uncached input tokens).
    - `cached`: `message.usage?.cacheRead ?? 0`.
    - `output`: `message.usage?.output ?? 0`.
    - `newUserChars`: User text accumulated since the previous assistant message.
    - `newToolResultChars`: Tool result text accumulated since the previous assistant message.
    - `prevThinkingChars`: Cumulative length of thinking blocks from the preceding assistant message (0 on the first request).
    - `prevTextChars`: Cumulative length of text blocks from the preceding assistant message (0 on the first request).
    - `prevToolCallArgChars`: Cumulative length of `JSON.stringify(part.arguments ?? {})` from the preceding assistant message (0 on the first request).

#### Multi-Turn Chats and Attribution Continuity
- Across turns, `turn` advances with each user turn.
- The state from the final assistant message of a turn (`prevThinkingChars`, `prevTextChars`, `prevToolCallArgChars`) is held across the next user message, attributing the previous assistant's output characters to the first request of the subsequent turn when replayed in chat history.
- `newUserChars` and `newToolResultChars` reset to 0 immediately upon recording a request, preventing double-counting.
- Absent thinking, text, or tool calls in an assistant message reset their respective `prev*` counts to 0 for the next request.

#### UTF-16 Code Units
- String length measurement is based on JavaScript UTF-16 code units (`length`), matching string indexing conventions and avoiding encoding ambiguities. Tests verify multi-byte characters (e.g. `'é😀'` resulting in length 3).

---

### 2. Safety, Privacy, and Catch Path

#### Numerical Diagnostics Only
- `RequestUsage` contains only primitive numbers:
  ```typescript
  export interface RequestUsage {
      turn: number;
      input: number;
      cached: number;
      output: number;
      newUserChars: number;
      newToolResultChars: number;
      prevThinkingChars: number;
      prevTextChars: number;
      prevToolCallArgChars: number;
  }
  ```
- No conversation strings, prompts, SQL statements, bind values, or tokens are retained in `requests`.
- `part.arguments` in tool calls are serialized inline only to compute `.length`, and the serialized string is immediately dropped:
  ```typescript
  prevToolCallArgChars = (message.content ?? []).reduce(
      (n: number, part: any) => n + (part.type === 'toolCall' ? JSON.stringify(part.arguments ?? {}).length : 0),
      0
  );
  ```
- Unit tests verify that serialized requests do not contain sensitive bind strings, SQL keywords, or reasoning text:
  ```typescript
  expect(JSON.stringify(result.requests)).not.toMatch(/private-value|select|reason|answer|ignored/);
  ```

#### Catch Path Safety
In `evals/run.ts`, the evaluation loop wraps case execution in a `try ... catch`:
```typescript
} catch {
    // Driver/provider errors can contain connection details; never persist raw errors.
    records.push({ iteration, id: test.id, target: test.target, refusal: test.expect.mustRefuse, pass: false, error: 'Case failed during ground truth or agent execution', toolCalls: [], toolDetails: [], requests: [], usage: { input: 0, output: 0, cached: 0 }, wallMs: Math.round(performance.now() - start) });
}
```
Raw error objects are discarded, avoiding leakage of database credentials, connection strings, or internal stack traces. The record correctly supplies `requests: []`.

---

### 3. Non-Regression and Zero Behavior Change

- **Product Integrity:** Zero edits in `src/`. No changes to database tools, sessions, configuration, or agent runtime behavior.
- **Prompt Integrity:** No changes to system prompts, appendices, or tool descriptions.
- **Eval Contracts:** `toolCalls`, `executedToolCalls`, `usage`, and `toolDetails` maintain identical semantics and calculation logic.
- **Optimization Ledger:** `evals/optimize.ts` explicitly whitelists fields for `var/optimize/ledger.jsonl` records; neither `requests` nor `requestUsage` pollute the ledger schema.

---

### 4. Test Coverage and Verification

- **`tests/unit/wp-r-request-usage.test.ts`:**
  - `attributes new content to each request and carries the previous assistant across user turns`: Validates multi-request, multi-turn history, tool results, thinking blocks, tool calls, and redaction verification.
  - `keeps requests with missing or partial usage and resets absent thinking and arguments`: Tests headless/partial histories, empty/absent fields, and reset behavior.
  - `summarizes records independently of turn numbers and renders every total`: Tests aggregation across records and markdown table generation.
- **`tests/unit/wp-f-runner.test.ts` & `tests/unit/wp-i-optimizer.test.ts`:** Updated to assert `requests` and `requestUsage` presence in eval results and reports.
- **TypeScript Typecheck:**
  ```
  npm run typecheck
  > tsc -p tsconfig.json --noEmit
  ```
  Passed with 0 errors.
- **Vitest Unit Suite:**
  ```
  npm test
  > vitest run tests/unit
  Test Files  15 passed (15)
  Tests       304 passed (304)
  ```

---

## Required Fixes

None.

---

Verdict: APPROVE
