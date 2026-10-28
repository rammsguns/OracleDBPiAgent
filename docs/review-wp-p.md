# Code Review: OracleDBPiAgent (WP-P Eval Tool Call Error Diagnostics)

**Date:** 2026-10-27  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Commit `52547ed34b5594c718d46a6121539c839243ce85` on branch `rammsguns/wp-p-tool-error-diagnostics`  
**Files Under Review:**
- `docs/wp-p-tool-error-diagnostics.md`
- `evals/run.ts`
- `evals/runtime.ts`
- `tests/unit/wp-f-runner.test.ts`
- `tests/unit/wp-i-optimizer.test.ts`
- `tests/unit/wp-p-tool-error-diagnostics.test.ts`

Verdict: APPROVE

---

## Executive Summary

Commit `52547ed` implements Work Package WP-P ("tool error diagnostics") in `evals/runtime.ts` and `evals/run.ts`. It provides detailed per-call tool diagnostics (`toolDetails`) in individual eval records and a top-level error summary (`toolErrors`) grouped by tool and Oracle error code (or normalized policy string).

The changes were reviewed against the specification in `PLAN.md` and the four review criteria:
1. **Correctness:** Message matching strictly conforms to `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` message structures (`part.type === 'toolCall'` with `id`, `name`, `arguments`; `role === 'toolResult'` with `toolCallId`, `content`, `isError`). Tool calls across multi-turn conversations are accurately indexed and matched. Unmatched/missing results are handled cleanly (`isError: null`, `resultBytes: null`) and excluded from error counts. Oracle error codes are normalized to uppercase `ORA-NNNNN`, while non-ORA errors have digits masked to `N` and are capped to 80 characters.
2. **Safety & Security:** Arguments are recursively stripped of keys matching `/bind|password|passwd|secret|api.?key|credential|token/i` prior to truncation. Length limits are strictly enforced (300 chars for serialized arguments, 200 chars for first error line, 80 chars for normalized error codes). The catch handler in `evals/run.ts` safely discards exception objects without binding or persistence, emitting generic error strings and empty `toolDetails`.
3. **No Behaviour Change:** Production code under `src/`, agent prompts, tool executions, and the optimize ledger (`var/optimize/ledger.jsonl`) are completely untouched. Pre-existing eval metrics (`toolCalls`, `executedToolCalls`, `usage`, `passRate`) remain identical.
4. **Test Suite:** The unit suite thoroughly exercises ID matching, call ordering, UTF-8 byte calculations, argument/error truncation, sensitive-field stripping, ORA grouping, markdown escaping, and eval persistence. Both `npm run typecheck` and `npm test` pass (13 files, 273 tests).

---

## Detailed Evaluation Against Review Criteria

### 1. Correctness

#### Message Shapes & ID Matching (`evals/runtime.ts`)
- The `@earendil-works/pi-ai` library defines `AssistantMessage` containing `content: (TextContent | ThinkingContent | ToolCall)[]` where `ToolCall` has `{ type: 'toolCall', id: string, name: string, arguments: JsonObject }`.
- `ToolResultMessage` defines `{ role: 'toolResult', toolCallId: string, toolName: string, content: (TextContent | ImageContent)[], isError: boolean }`.
- In `collectResult` ([evals/runtime.ts](file:///home/kiwi/orca/workspaces/OracleDBPiAgent/review-wp-p/evals/runtime.ts)):
  ```typescript
  const results = new Map(messages.filter(message => message.role === 'toolResult' && typeof message.toolCallId === 'string').map(message => [message.toolCallId, message]));
  const toolDetails: ToolDetail[] = assistants.flatMap(message => (message.content ?? [])
      .filter((part: any) => part.type === 'toolCall')
      .map((part: any): ToolDetail => {
          const result = typeof part.id === 'string' ? results.get(part.id) : undefined;
          ...
      }));
  ```
  This indexes results by `toolCallId` and matches them to calls using `part.id`.

#### Multi-Turn Chats
- `assistants.flatMap` iterates over all assistant messages across all conversation turns, preserving the exact chronological sequence of tool requests.
- The `results` map collects all `toolResult` messages from the entire conversation history, ensuring tool results in later turns match their corresponding calls regardless of intervening messages.

#### Missing Results
- If an agent turn ends prematurely, is blocked, or a tool call lacks a result, `result` resolves to `undefined`.
- The tool detail explicitly sets `isError: null` and `resultBytes: null` (distinguishing missing results from successful runs where `isError: false`).
- In `summarizeToolErrors` ([evals/run.ts](file:///home/kiwi/orca/workspaces/OracleDBPiAgent/review-wp-p/evals/run.ts)):
  ```typescript
  summary.totalCalls++;
  tool.calls++;
  if (!detail.isError) continue;
  ```
  Missing results increment `totalCalls` and `tool.calls` as requested calls, but are skipped for `totalErrors` and `byCode`.

#### Error Grouping by ORA Code
- `summarizeToolErrors` inspects `detail.error`:
  ```typescript
  const text = detail.error ?? '';
  const code = text.match(/ORA-\d{5}/i)?.[0].toUpperCase() ?? text.replace(/\d/g, 'N').slice(0, 80);
  ```
  - Standard Oracle error codes are identified via `/ORA-\d{5}/i` and normalized to uppercase (e.g. `ORA-00904`).
  - Other errors (such as policy rejections or driver errors) have dynamic numbers replaced by `N` and are truncated to 80 characters.
  - Summaries are aggregated per-tool (`byTool[tool].byCode`) and globally (`byCode[code]`).
  - Dictionaries use `Object.create(null)` to eliminate prototype collision risks.

---

### 2. Safety & Security

- **Credential & Bind Protection:**
  `JSON.stringify` uses a defensive recursive replacer function:
  ```typescript
  const args = JSON.stringify(part.arguments ?? {}, (key, value) =>
      /bind|password|passwd|secret|api.?key|credential|token/i.test(key) ? undefined : value).slice(0, 300);
  ```
  Any key indicating sensitive data (bind values, database passwords, API tokens, credentials) is completely omitted before serialization.
- **String Length Limits:**
  - `args`: Capped at 300 characters via `.slice(0, 300)`.
  - `error`: Only the first line is extracted (`text.split(/\r?\n/)[0]!`) and capped at 200 characters via `.slice(0, 200)`.
  - `code`: Fallback codes are capped at 80 characters.
  - Markdown table output properly sanitizes pipes (`|` -> `&#124;`) and line breaks to prevent table breaking.
- **Catch Handler Isolation:**
  In `evals/run.ts`, the evaluation execution loop wraps each case in `try ... catch`:
  ```typescript
  } catch {
      // Driver/provider errors can contain connection details; never persist raw errors.
      records.push({ iteration, id: test.id, target: test.target, refusal: test.expect.mustRefuse, pass: false, error: 'Case failed during ground truth or agent execution', toolCalls: [], toolDetails: [], usage: { input: 0, output: 0, cached: 0 }, wallMs: Math.round(performance.now() - start) });
  }
  ```
  Raw driver exceptions (which might contain connection strings, usernames, or network addresses) are never captured or serialized.

---

### 3. Non-Regression & Zero Behavior Change

- **Product Isolation:** No files in `src/` were modified.
- **Prompt Isolation:** No agent prompts, system instructions, or tool definitions were altered.
- **Tool Output Isolation:** Database tools and session handling continue to operate identically.
- **Metrics Consistency:** Existing fields `toolCalls` and `executedToolCalls` continue to report requested and admitted calls as before.
- **Optimize Ledger:** `evals/optimize.ts` projection retains its explicit whitelist of properties; `toolDetails` and `toolErrors` do not enter the optimization ledger.

---

### 4. Test Coverage & Verification

- `tests/unit/wp-p-tool-error-diagnostics.test.ts` covers:
  - `matches results by ID, preserving call order, UTF-8 byte counts and short SQL`: validates ID-based joining, UTF-8 byte count, call ordering, and missing results.
  - `caps the entire serialized arguments and first error line, omitting sensitive fields recursively`: validates redaction of binds, passwords, tokens, API keys, credentials, and 300/200 char truncation.
  - `groups Oracle codes and normalized policy errors per tool and across tools`: validates multi-tool error tallying, code extraction, and markdown formatting.
  - `caps normalized keys and escapes markdown cells`: validates 80-char key truncation and pipe escaping.
- Updated `tests/unit/wp-f-runner.test.ts` and `tests/unit/wp-i-optimizer.test.ts` to assert against `toolDetails` and `toolErrors`.
- Vitest unit suite: **13 files passed, 273 tests passed**.
- TypeScript typecheck (`tsc -p tsconfig.json --noEmit`): **passed with 0 errors**.

---

## Required Fixes

None. The implementation is clean, safe, and fully conforms to the project specification and invariants.
