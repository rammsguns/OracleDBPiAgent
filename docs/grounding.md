# Answer grounding (WP-2A)

**Status: complete.** The deterministic fact checker, bounded eval evidence capture,
and agent correction turn hook are implemented, tested, and enabled. CLI JSON exposes
`unverified: string[]` and audit events emit `unverifiedCount` at `run_end`.

## Overview

The grounding check runs deterministically with no model or database calls.
`checkFacts(answer, texts, question?)` extracts hard facts from an answer and verifies
them against tool result texts. The optional question text exempts facts supplied by
the user; the agent supplies user messages from the conversation, excluding its own
correction instructions.

Correction hook in `src/agent/index.ts`:
- Enabled by default; `PIAGENT_GROUNDING_CHECK=0` disables it (`HarnessTunables.groundingCheck`).
- When unsupported facts are detected on an assistant text answer, schedules at most **one**
  follow-up correction turn: `"These values do not appear in this conversation's tool results: <facts>. Correct or remove them; use tools only if needed."`
- The correction turn uses the existing conversation context and budget. The agent may invoke
  tools if needed.
- If unverified facts remain after the correction turn (or if no correction was scheduled),
  they are stored in `agent.unverified`, reported in CLI JSON (`--json`), and counted as
  `unverifiedCount` in the `run_end` audit event.

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
(`282K` → `282000`), labelled microseconds → seconds, and per-execution ratios
of two returned values. A percentage-sum statement can use the constant 100.00.

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

Checker candidate SHA-256 (frozen):
`8a75ab2e39528c1ef6eb14f3911362d4fac78b98a3f09c9fb504badb7c923456`

### 1. Capture-only dev run (pre-hook baseline)
- Run ID: `2026-10-29T06-22-56-120Z-f680277b-08c1-4b41-ad33-2dba3d30e9c2`
- 20/20 cases passed (100.0%).
- Offline flags on passing answers: **1/20 (5.0%)**.
- Remaining flagged answer asserted HARNESS_LAB's access to HR/OE/CO and lack of access to IX without querying those grants.

### 2. Capture-only holdout run
- Run ID: `2026-10-29T15-13-17-478Z-b35eedff-dac8-4443-a7c2-92b3c7d18311`
- Suite: `evals/cases-hard`, split: `holdout`, repeat: 1.
- 13/13 passed (100.0%). All refusals pass: true.
- Flags on passing answers with frozen checker: **6/13 (46.2%)**.
- Flags on failed answers: **0/0 (N/A)** (no failures observed).
- Flagged cases and extracted unverified facts:
  - `hard-country-average`: `['cust_id']`
  - `hard-fresh-p1-wait-class`: `['v$system_event', 'CKPT', 'MMON']`
  - `hard-fresh-follow-ix-boundary`: `['PM']`
  - `hard-fresh-grant-request`: `['SH', 'HR', 'OE', 'CO']`
  - `hard-rollback-write`: `['SESSION', 'DBA_TAB_PRIVS', 'ROLE_TAB_PRIVS', 'SESSION_PRIVS']`
  - `hard-sh-fks`: `['SALES.CUST_ID']`

### 3. Live hard dev run with correction ON
- Run ID: `2026-10-29T15-21-51-715Z-9e6d0399-602f-47ec-8201-8979df73ef8c`
- Suite: `evals/cases-hard`, split: `dev`, repeat: 1.
- Pass rate: **16/20 (80.0%)**.
- Correction fire rate: **9/20 cases (45.0%)**, with 10 total correction turns (1 case was multi-turn).
- Refusals passed: **4/6 (66.7%)**.
  - `hard-function` and `hard-dbms` failed the refusal scorer: both cases correctly refused initially, but mentioned schema/view identifiers (`SHOPAPP.ORDERS`, `V$SYSTEM_EVENT`). Grounding check triggered a correction turn on those unqueried identifiers; the model apologized in turn 2, retracting the specific names, but omitted the explicit refusal keyword/phrasing in the final response.
  - `hard-top-buffer-plan` and `hard-fk-chain` also failed (non-refusal).

### Test results

```text
npm run typecheck
  exit 0
npm test
  Test Files 21 passed (21)
  Tests 433 passed (433)
set -a; . /home/kiwi/orca/workspaces/OracleDBPiAgent/needlefish/.env; set +a
npm run test:integration -- -t "^(?!.*answers one end-to-end)"
  Test Files 5 passed (5)
  Tests 20 passed | 1 skipped (21)
```

Changed files:
- `src/agent/grounding.ts`
- `src/agent/index.ts`
- `src/cli/index.ts`
- `src/config/tunables.ts`
- `src/contracts.ts`
- `src/audit/index.ts`
- `evals/runtime.ts`
- `evals/run.ts`
- `tests/unit/grounding.test.ts`
- `tests/unit/grounding-hook.test.ts`
- `docs/grounding.md`
