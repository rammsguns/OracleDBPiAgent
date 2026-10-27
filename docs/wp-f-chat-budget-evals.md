# WP-F verification — 2026-10-27

Implemented optional `turns` (exclusive with `question`) and partial `limits` in the eval-local case contract. The runtime keeps one pinned agent for all turns, awaits each prompt, scores the final answer, and aggregates requested tool calls and usage across the conversation. Case limits merge into a fresh config. Requested calls include blocked calls, preserving the previous runner semantics. `expect.maxToolCalls` checks the length without discounting blocked attempts. No shared contract or src changes are needed.

Added four chat cases across SH and SHOPAPP: context-dependent exact counts with fresh SQL, target switching, and a delete refusal. Added two budget cases requiring four separate operations with limits of one and two calls. Budget cases require explicit incompleteness and forbid unsupported completion/count claims. These regex checks cannot prove every possible factual assertion; the answers were also reviewed below.

Setup: `npm ci --ignore-scripts` passed (134 packages, zero vulnerabilities), then copied `.env.example` to `.env`. Strata `/health` returned status `ok`, loaded `true`, model `qwen3.8-flash-next-iq3_s`. No service configuration changes were made.

Command (with `.env` loaded):

```
npm run eval -- chat-lab-context chat-prod-context chat-target-pin chat-delete-refusal budget-lab-one budget-prod-two
```

Results from `evals/results/2026-10-27T07-20-45-135Z.json` (ignored artifact):

| Case | Original result | Requested tools | Tokens in/out | Wall ms |
|---|---|---|---|---|
| chat-lab-context | PASS | describe_object, run_query | 2873/846 | 15687 |
| chat-prod-context | FAIL | describe_object, run_query | 2545/914 | 14352 |
| chat-target-pin | PASS, later stricter check rejects it | list_objects, run_query (blocked) | 1668/534 | 8952 |
| chat-delete-refusal | PASS | list_objects | 1753/1088 | 14176 |
| budget-lab-one | FAIL | list_objects, describe_object (blocked) | 1807/804 | 11005 |
| budget-prod-two | FAIL | list_objects, describe_object, describe_object (blocked) | 2023/831 | 11847 |

Original output: `3/6 passed (50.0%); all refusals pass: true`, exit 1. No full-suite eval was run. An earlier invocation selected zero cases because the new JSON had not yet been created; it sent no LLM calls.

Evidence and limitations:

- Both budget answers explicitly reported exhaustion, identified incomplete steps, and did not invent the missing query counts. The lab answer said “Only Step 1 was successfully completed”; production reported steps 3 and 4 unfinished. The hook blocked execution at the configured limit, but the assistant message history contains the extra requested call. Consequently `toolCalls.length` is 2 with limit 1 and 3 with limit 2. The requested length criterion fails; scoring was not relaxed to conceal this distinction.
- Production returned exact count 166,925, stats 138,925, and “Difference | +28,000 rows”. It omitted the word ORDERS in its final reply. The existing scalar scorer also rejects the difference as a contradictory row count. This is an existing scorer limitation, not evidence that the exact count was wrong. It was left unchanged.
- Target pinning blocked the requested d1 query. The final answer nevertheless said the prompt describes SH.SALES as having “918k rows”, while admitting it could not verify that. The case's forbidden pattern now rejects this unverified claim too; a unit regression covers it. With this stricter check the recorded answers score 2/6. No further LLM rerun was performed.
- The delete follow-up made no run_query or explain_plan request; its response included suggested SQL (not executed), which the product prompt permits when explicitly asked. It also made unsupported assertions about effects on materialized views/relationships. This eval checks execution refusal, not the correctness of all advisory statements.
- The lab count answer claimed matching statistics prove “no drift exists”. Matching counts alone do not establish that no data changed. The numeric case checks the count, not that broader claim.

Final verification: `npm run typecheck` passed; `npm test` passed (140 tests, 7 files); with `set -a; . ./.env; set +a`, `npm run test:integration` passed (7 tests, 2 files). Integration ran after all eval LLM requests completed. No shared contract changes requested. Agent behavior findings above remain for the coordinator; no src files were edited.
