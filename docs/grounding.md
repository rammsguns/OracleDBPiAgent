# Answer grounding (WP-2A)

**Status: complete and verified.** The deterministic fact checker, bounded eval evidence capture,
refusal/tool call exemption gates, numeric-only correction turn hook, and unverified tracking are
implemented, tested, and enabled. CLI JSON exposes `unverified: string[]` and audit events emit
`unverifiedCount` at `run_end`.

## Overview

The grounding check runs deterministically with no model or database calls.
`checkFacts(answer, texts, question?)` extracts hard facts from an answer and verifies
them against tool result texts. The optional question text exempts facts supplied by
the user; the agent supplies user messages from the conversation, excluding its own
correction instructions.

Correction hook in `src/agent/index.ts`:
- Enabled by default; `PIAGENT_GROUNDING_CHECK=0` disables it; `=1` enables it (`HarnessTunables.groundingCheck`).
- **Gating**: The check and correction turn are skipped entirely when:
  1. The run made no successful tool calls (`successfulCalls === 0`), or
  2. The answer is a refusal (`isRefusal(answer)`).
- **Numeric-only correction**: The correction turn fires **only** for unsupported numeric facts
  (4+ significant digits). Unsupported identifiers never trigger a correction turn; they are only
  listed in `agent.unverified` (CLI `--json`) and counted in the audit (`unverifiedCount`).
- When unsupported numeric facts are detected, schedules at most **one** follow-up correction turn:
  `"These numbers do not appear in this conversation's tool results: <facts>. Keep the rest of your answer, including any refusal, and only fix or remove the listed numbers; use tools only if needed."`
- The correction turn uses the existing conversation context and budget. The agent may invoke
  tools if needed.
- If unverified facts (numbers or identifiers) remain after the correction turn (or if no correction
  was scheduled), they are stored in `agent.unverified`, reported in CLI JSON (`--json`), and counted
  as `unverifiedCount` in the `run_end` audit event.

## Fact extraction rules

It checks quoted identifiers, uppercase Oracle identifiers, SQL IDs, and numbers with
at least four significant digits. Identifier matching uses case-insensitive whole
names, with owner and object components accepted when tools show them separately.
Numeric matching removes thousands separators and rounds to the displayed precision.
Direct numeric comparisons use exact decimal coefficients, retaining Oracle NUMBER
digits beyond JavaScript floating-point precision. Derived ratios use floating point
and conservatively refuse to certify precision below its numeric resolution.
Byte conversions accept both decimal and binary KB/MB/GB/TB (explicit KiB etc. use
binary only). Percentages can match directly or be derived from two tool values, including
ratios, growth and complements.
SQL vocabulary, units, years and Oracle 19c are exempt. An explicit list of standard
Oracle dictionary views and column names is also exempt: referring to `V$SESSION`
or `ALL_CONSTRAINTS` as a source does not assert that the view returned that name.
This is not a blanket exemption for `V$*`/`ALL_*`; invented view names still fail.
Tool names, standard lock/process abbreviations and Oracle number format masks
are treated as vocabulary. The checker also handles compact plan quantities
(`282K` → `282000`), labelled microseconds → seconds (`/ 1e6`) and milliseconds (`/ 1e3`),
and per-execution ratios of two returned values. A percentage-sum statement can use the constant 100.00.

This is a lexical evidence check: it does not prove a value belongs to the right row,
validate reasoning, or catch every invented claim. Small numbers and unquoted lowercase
names are outside its scope. The same precision rule that accepts rounded answers can
also accept a different value that rounds identically. Percentage support checks pairs
of values, without proving their semantic relationship.

Eval records retain `toolResultTexts` next to `toolDetails`, capped at 4,096 UTF-8 bytes
per result. Only text blocks are captured, never tool arguments or result metadata.
Long results can lose evidence at this cap; the product checker uses the conversation's
actual bounded tool results, rather than the eval capture.

## Verification and measurements

### 1. Offline re-score of dev baseline (Measurement a)
- Run ID: `2026-10-29T06-22-56-120Z-f680277b-08c1-4b41-ad33-2dba3d30e9c2`
- Passing cases: 20/20 (100.0%).
- Offline correction triggers on correct answers: **0/20 (0.0%)** (target <=5.0%).
- Unverified identifiers retained for audit/CLI only: 1 case (`hard-follow-lab-boundary`: `['HARNESS_LAB', 'HR', 'OE', 'CO', 'IX']`).

### 2. Offline re-score of holdout run (Measurement a)
- Run ID: `2026-10-29T15-13-17-478Z-b35eedff-dac8-4443-a7c2-92b3c7d18311`
- Suite: `evals/cases-hard`, split: `holdout`, repeat: 1.
- Passing cases: 13/13 (100.0%). All refusals pass: true.
- Offline correction triggers on correct answers: **0/13 (0.0%)** (target <=5.0%).
- Previously flagged holdout cases were entirely unsupported identifiers (`cust_id`, `v$system_event`, `CKPT`, `MMON`, `PM`, `SALES.CUST_ID`) or refusals. With refusal exemption and numeric-only correction turns, zero correct holdout answers trigger corrections.
- Unverified identifiers retained for audit/CLI only: 4 cases (`hard-country-average`, `hard-fresh-p1-wait-class`, `hard-fresh-follow-ix-boundary`, `hard-sh-fks`).

### 3. Live capture-only MVP run (Measurement b)
- Run ID: `2026-10-29T15-52-31-772Z-ed620402-7d79-4e0f-925d-0d43abcfdf1d`
- Suite: `evals/cases`, repeat: 1, `PIAGENT_GROUNDING_CHECK=0`.
- Pass rate: **39/39 (100.0%)**. All refusals pass: true.
- Offline correction triggers on correct answers: **1/39 (2.6%)** (target <=5.0%).
  - Flagged case: `chat-prod-context` (`~53,000` delta between exact count and optimizer stats).

### 4. Live hard dev run with correction ON (Measurement c)
- Run ID: `2026-10-29T16-13-13-644Z-48877a24-f98c-4385-9952-be9bc9ee191d`
- Suite: `evals/cases-hard`, split: `dev`, repeat: 1.
- Pass rate: **20/20 (100.0%)** (baseline 20/20 restored, up from failed 16/20).
- All refusals pass: **true (6/6)** (up from 4/6). Refusals `hard-function` and `hard-dbms` maintain refusal wording cleanly with zero tool calls and no correction turn.
- Correction fire rate: **2/20 cases (10.0%)** (down from 9/20 = 45.0%).
  - Cases triggering correction: `hard-top-buffer-plan` (1 turn), `hard-follow-ratio` (2 turns). Both passed.

### Test results

```text
npm run typecheck
  exit 0
npm test
  Test Files 21 passed (21)
  Tests 438 passed (438)
set -a; . /home/kiwi/orca/workspaces/OracleDBPiAgent/needlefish/.env; set +a
npm run test:integration -- -t "^(?!.*answers one end-to-end)"
  Test Files 5 passed (5)
  Tests 20 passed | 1 skipped (21)
```

Changed files:
- `src/agent/grounding.ts`
- `src/agent/index.ts`
- `evals/runtime.ts`
- `tests/unit/grounding.test.ts`
- `tests/unit/grounding-hook.test.ts`
- `docs/grounding.md`

## Final merged gate — 2026-10-29

The first design was rejected after flagging 6/13 correct holdout answers and
reducing hard dev to 16/20. The numeric-only redesign above passed the final
hard dev 4×4 gate (80/80; 5/80 corrections), holdout ×3 (39/39) and MVP (39/39).
Hard-dev tokens rose 4.0% overall, with 1.2% attributable to correction turns;
the owner approved that cost. MVP tokens fell 0.3%. Earlier measurements and
test counts above describe implementation checkpoints, not the final gate.

Report summaries now use the same checker through a numeric-only adapter, with
one LLM call and no correction turn. See [report.md](report.md) for evidence
normalization and the verified zero-flag live reruns on both targets.
