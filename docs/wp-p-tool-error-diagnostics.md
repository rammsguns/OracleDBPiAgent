# WP-P: tool error diagnostics

Eval-only diagnostics explain tool failures without changing product tools, prompts,
audit behavior, usage accounting, existing tool call counts, or the optimize ledger.

Each record in `evals/results/<timestamp>.json` now contains `toolDetails`, in assistant
tool-call order. Calls match result messages by assistant `toolCall.id` and result
`toolCallId`, including across conversation turns.

| Field | Meaning |
|---|---|
| tool | Assistant's requested tool name |
| args | JSON serialization of arguments, cut to 300 characters for the entire value |
| isError | Result's error flag; null if no matching result exists |
| error | Only for errors: first line of result text, cut to 200 characters |
| resultBytes | UTF-8 byte length of full result text; null if no matching result exists |

Text blocks are joined with newlines. Images and result metadata are not recorded.
Successful result text is not stored. Truncated args are a diagnostic string and
may no longer parse as JSON. SQL strings remain visible as short text; nested
fields whose names indicate binds, passwords, credentials, secrets, tokens, or API
keys are omitted before serialization. No secrets are loaded by this collector.

The report's top-level `toolErrors` contains:

- `totalCalls`: number of assistant tool calls represented in toolDetails.
- `totalErrors`: number of matched results explicitly flagged as errors.
- `byTool[tool]`: calls, errors, and a byCode error-count map for that tool.
- `byCode[code]`: error counts across all tools.

An error key is the first ORA-NNNNN code in the saved first-line error text,
normalized to uppercase. Otherwise, each digit becomes N and the key is cut to
80 characters. Missing results count toward calls but not confirmed errors.
These diagnostic call counts include requested calls; existing report toolCalls
continues using admitted/executed calls as before. Cases that fail outside normal
result collection retain the existing generic failure message and have an empty
toolDetails list; their partial tool history is unavailable.

Read the console's final `Tool errors: errors/calls` line or the companion
`.md` file's Tool errors table to identify frequent failures. Use the JSON
byTool/byCode maps to select a tool and error, then inspect records' toolDetails
for the short SQL or options that triggered it. No ledger fields were added.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 13 files passed, 273 tests passed.
- Coverage includes success, ORA tool failure, policy refusal, missing results,
  ID matching, UTF-8 bytes, argument/error truncation, sensitive-field omission,
  grouped counts, and persisted JSON/Markdown/console output.
- No DB/LLM calls, integration tests, evals, or optimize runs were performed.
- No shared contract changes are needed; ToolDetail and the extended result type
  are local to evals/runtime.ts.
