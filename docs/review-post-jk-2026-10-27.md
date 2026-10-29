# Code Review: OracleDBPiAgent (Post-JK Review)

**Date:** 2026-10-27  
**Reviewer:** Antigravity (Review Agent)  
**Target:** `git diff 58536d7..HEAD -- . ":!docs/review-wp-jk-2026-10-27.md"` on branch `review-post-jk`  
**Scope:**
- **Commit (A) `418497a`:** Generic `run_query` column-name note in `src/tools/index.ts`, eval case tweaks in `evals/cases/oracle19c.json` and `evals/cases-hard/follow-up.json`, variant notes in `evals/variants/describe-runquery-notes.json`, and test in `tests/unit/wp-j-defaults.test.ts`.
- **Commit (B) `454f889`:** `isContextualSyntax` in `src/oracle/sqlPolicy.ts`, positional acceptance of non-reserved keywords (`YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `NUMERIC`, `DECIMAL`, `DEC`, `FIRST`, `NEXT`, `NULLS`, `OFFSET`), unit tests in `tests/unit/sqlPolicy.test.ts`, and documentation in `docs/compatibility-19c.md` and `docs/model-optimization.md`.
- **Commit (C) `d152b58`:** DBA SELECT grants integration on p1 and d1, updated ground truth SQL in `evals/cases/oracle19c.json` and `evals/cases-hard/diagnosis.json`, lab boundary case in `evals/cases-hard/follow-up.json`, updated description in `config/targets.json`, integration tests in `tests/integration/oracle.test.ts`, and documentation updates in `docs/compatibility-19c.md` and `docs/mvp-status.md`.

**Verdict:** **APPROVE**

---

## Executive Summary

The three commits following the WP-J/K review successfully address previous findings, reinforce policy safety, and migrate the harness and eval suite to the DBA-granted diagnostic paths:

1. **Commit (A) `418497a` (Generic column-name guidance):**
   - The promoted note on `run_query` instructs the model to use only column names seen in tool results, verify unseen names with `describe_object`, and never substitute similarly named columns.
   - The note avoids eval gaming: it uses generic illustrative examples (`ORDER_STATUS` for `STATUS`, and generic "SUB-prefixed" phrasing) rather than naming eval-specific columns (`COUNTRY_REGION` / `COUNTRY_SUBREGION`). Neither `ORDER_STATUS` nor `STATUS` appears in any eval question or assertion regex.
   - Safety rules remain uncompromised: tool execution remains bounded, read-only, and audited. Allowing `list_objects|run_query` on `shop-tables` accepts both standard read-only table enumeration methods while still requiring real tool invocation and scoring against live ground truth.

2. **Commit (B) `454f889` (Contextual syntax and function-call policy):**
   - Positional grammar acceptance (`isContextualSyntax`) correctly addresses Findings 1–4 from `docs/review-wp-jk-2026-10-27.md` without allowlisting non-reserved keywords globally.
   - **Bypass Resistance:** Exhaustive adversarial probing (15 distinct bypass vectors, including preceding string literals, `TO`, `AS`, `FETCH`, `INCLUDE`/`EXCLUDE`, quoted keywords, table/column aliases, subqueries, and nested parentheses) confirmed that `classifySql` does not permit invoking user-defined functions or synonyms named `DAY`, `FIRST`, `NEXT`, `OFFSET`, `NULLS`, `NUMERIC`, etc.
   - **Remaining False Rejections:** Two low-severity edge cases in legitimate Oracle 19c SQL were identified and recorded as findings: signed interval literals with explicit precision (`INTERVAL + '1' DAY(3)` / `INTERVAL - '1' DAY(3)`) and ANSI character datatype synonyms in `CAST` (`CAST(1 AS CHARACTER(10))`). These do not affect any eval case or tool query.

3. **Commit (C) `d152b58` (DBA grants & live ground truth):**
   - The 31 read-only SELECT grants requested in `docs/grants-request-2026-10-26.sql` were applied with explicit project owner authorization. No passwords were read; all grants succeeded.
   - The updated target description for `d1-19c-lab` in `config/targets.json` accurately reflects access: SH, HR, OE, and CO are readable, while PM and IX remain ungranted.
   - The new ground truth SQL statements (`V$SYSTEM_EVENT`, `V$INSTANCE`, `HR.EMPLOYEES`, `DBA_OBJECTS`) are syntactically valid Oracle 19c SQL, dynamically score against live database state, and ensure no case passes trivially.
   - In `tests/integration/oracle.test.ts`, the primary DBA_/V$ paths on p1 are verified against live Oracle 19c containers, while the ORA-00942 fallback branches remain fully unit-tested in `tests/unit/tools.test.ts`.

---

## Verification Results

| Check | Result | Details |
|---|---|---|
| `npm ci --ignore-scripts` | **PASS** | 134 packages installed, 0 vulnerabilities |
| `cp .env.example .env` | **PASS** | Local environment file configured (git-ignored) |
| `npm run typecheck` | **PASS** | `tsc -p tsconfig.json --noEmit` exited 0 |
| `npm test` | **PASS** | 239/239 unit tests passed across 10 files (1.57 s) |
| `npm run test:integration -- -t "^(?!.*answers one end-to-end)"` | **PASS** | 9 passed, 1 skipped (Strata LLM e2e skipped by filter) across 3 files (5.59 s) |
| `npm run eval` / `npm run optimize` | **SKIPPED** | Avoided in strict compliance with AGENTS.md hard rules and reviewer instructions |

---

## Detailed Evaluation by Work Area

### (A) Commit `418497a`: Tool Notes and Eval Case Tweaks
- **Generic Column-Name Note:** In `src/tools/index.ts:18`, `run_query` description was updated:
  > *"Execute bounded read-only SQL\n\nUse only column names you have seen in a tool result in this conversation. If the question names a column you have not seen yet, confirm its exact name with describe_object first, and never substitute a similarly named column (for example ORDER_STATUS for STATUS, or a SUB-prefixed column for the one asked about)."*
  - **No Eval Gaming:** The earlier variant in `evals/variants/describe-runquery-notes.json` had explicitly named `COUNTRY_REGION` and `COUNTRY_SUBREGION`. The committed note replaces this with generic examples (`ORDER_STATUS` for `STATUS`, and an abstract "SUB-prefixed column"). A search across all eval cases in `evals/cases/` and `evals/cases-hard/` confirms neither `ORDER_STATUS` nor `STATUS` appears in any question or expected regex.
  - **Safety Preservation:** The note reinforces safety discipline by requiring explicit schema verification via `describe_object` before issuing ad-hoc SQL with unfamiliar column names.
- **Eval Case `shop-tables` (`evals/cases/oracle19c.json:448`):** Accepting `list_objects|run_query` allows the agent to list tables either via the catalog discovery tool or via dictionary queries (`SELECT table_name FROM all_tables WHERE owner = 'SHOPAPP'`). The requirement for tool execution remains intact, and the answer is validated against live ground truth (`SELECT MIN(TABLE_NAME) FROM ALL_TABLES WHERE OWNER = 'SHOPAPP'`).
- **Boundary Phrasing (`evals/cases-hard/follow-up.json:61`):** Phrasing regex was widened to accommodate natural explanations of missing grants (`ORA-00942`, `inaccessible`, `no access`, or schema-specific negation).

### (B) Commit `454f889`: Contextual Syntax & Function Policy
- **Implementation in `src/oracle/sqlPolicy.ts`:**
  - `isContextualSyntax(tokens, at, upper)` handles non-reserved keywords that can legally precede `(` in Oracle 19c grammar:
    - Interval units (`YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`): accepts only integer precision `/^\(\d+(?:,\d+)?\)$/` after `INTERVAL`, `TO`, or `INTERVAL <literal>`.
    - ANSI numeric types (`NUMERIC`, `DECIMAL`, `DEC`): accepts only integer precision after `AS` (e.g. `CAST(... AS NUMERIC(p, s))`).
    - `FIRST` and `NEXT`: accepts only after `FETCH`.
    - `NULLS`: accepts only after `INCLUDE` or `EXCLUDE`.
    - `OFFSET`: accepts only when preceded by valid clause tokens (not `SELECT`, `,`, or `(`) and followed by `ROW`/`ROWS` and end-of-block tokens (`undefined`, `FETCH`, `)`, or `;`).
- **Adversarial Probing & Bypass Resistance (Local `classifySql` only):**
  - Probes attempted to bypass `isContextualSyntax` to invoke user-defined functions or synonyms named after contextual keywords:
    - `SELECT DAY(3) FROM dual` -> Rejected (`Function DAY is not allowed`).
    - `SELECT "DAY"(3) FROM dual` -> Rejected (`Function "DAY" is not allowed`).
    - `SELECT sys.DAY(3) FROM dual` -> Rejected (`Function SYS.DAY is not allowed`).
    - `SELECT 'INTERVAL' DAY(3) FROM dual` -> Rejected (`Function DAY is not allowed`).
    - `SELECT "INTERVAL" DAY(3) FROM dual` -> Rejected (`Function DAY is not allowed`).
    - `SELECT "TO" DAY(3) FROM dual` -> Rejected (`Function DAY is not allowed`).
    - `SELECT 1 "AS" NUMERIC(10, 2) FROM dual` -> Rejected (`Function NUMERIC is not allowed`).
    - `SELECT * FROM t FETCH FIRST (my_func(1)) ROWS ONLY` -> Rejected (`Function my_func is not allowed`).
    - `SELECT * FROM t FETCH FIRST (FIRST(1)) ROWS ONLY` -> Rejected (`Function FIRST is not allowed`).
    - `SELECT * FROM t FETCH FIRST (NEXT(1)) ROWS ONLY` -> Rejected (`Function NEXT is not allowed`).
    - `SELECT * FROM t OFFSET (my_func(1)) ROWS` -> Rejected (`Function my_func is not allowed`).
    - `SELECT * FROM t ORDER BY id OFFSET (OFFSET(5)) ROWS` -> Rejected (`Function OFFSET is not allowed`).
    - `SELECT * FROM t OFFSET (FIRST(1)) ROWS` -> Rejected (`Function FIRST is not allowed`).
    - `SELECT * FROM t OFFSET (NEXT(1)) ROWS` -> Rejected (`Function NEXT is not allowed`).
    - `SELECT * FROM t ORDER BY id OFFSET (0) ROWS FETCH NEXT (FIRST(1)) ROWS ONLY` -> Rejected (`Function FIRST is not allowed`).
    - `SELECT * FROM sales UNPIVOT INCLUDE NULLS (my_func(1) FOR quarter IN (q1, q2))` -> Rejected (`Function my_func is not allowed`).
  - **Verdict on Bypass Testing:** All tested bypass vectors failed. In every case where `classifySql` accepted the SQL, the construct is genuine grammar where Oracle never executes user-defined code.

### (C) Commit `d152b58`: DBA Grants, Ground Truth, and Target Metadata
- **Target Description (`config/targets.json`):**
  - Updated to: `"Local Docker oracle19c (19.9.1 EE, non-CDB). HARNESS_LAB can read the SH (918k SALES rows), HR, OE and CO sample schemas; PM and IX are not granted."`
  - Accurately reflects the state of grants applied via `docs/grants-request-2026-10-26.sql`.
- **Ground Truth Correctness and Robustness:**
  - `prod-waits` (`evals/cases/oracle19c.json:539`): `SELECT event FROM v$system_event WHERE wait_class <> 'Idle' ORDER BY time_waited_micro DESC FETCH FIRST 1 ROWS ONLY`. Dynamically reads the live top non-idle wait event on p1.
  - `prod-overview` (`evals/cases/oracle19c.json:649`): `SELECT TO_CHAR(startup_time, 'YYYY-MM-DD') FROM v$instance`. Accurately checks the startup date rendered as `YYYY-MM-DD`.
  - `hr-access` (`evals/cases/oracle19c.json:626`): `SELECT COUNT(*) FROM HR.EMPLOYEES`. Verified against live data (`107`), requiring tool execution and forbidding data substitution.
  - `prod-schemas` (`evals/cases/oracle19c.json:675`): `SELECT COUNT(*) FROM dba_objects WHERE owner = 'SHOPAPP'`. Evaluates against live dictionary counts (now 20, reflecting all SHOPAPP objects rather than the 12 visible prior to `DBA_OBJECTS` grant).
  - `hard-wait-limits` (`evals/cases-hard/diagnosis.json:62`): Same SQL as `prod-waits`, verifying instance-wide cumulative metrics against session activity.
  - `hard-follow-lab-boundary` (`evals/cases-hard/follow-up.json:73`): Updated turn 2 from OE to `PM.PRINT_MEDIA` (which remains ungranted), preserving the test of boundary adherence and refusal to fabricate data.
- **Integration Test Updates (`tests/integration/oracle.test.ts`):**
  - Tests now assert that on `p1-19c-prod`, `db_overview`, `list_schemas`, `tablespace_usage`, `top_sql`, and `wait_events` succeed on the primary DBA_/V$ path (`result.details.sourceNote` is `undefined`, and columns like `STARTUP_TIME` and `SEGMENT_BYTES` are populated).
  - Fallback logic for accounts lacking these grants remains protected and verified by unit tests in `tests/unit/tools.test.ts`.

---

## Numbered Findings

### Finding 1: False rejection of signed INTERVAL literals with explicit precision
- **File & Line:** [`src/oracle/sqlPolicy.ts:50`](../src/oracle/sqlPolicy.ts#L50)
- **Severity:** **LOW**
- **Exact Probe SQL & Results:**
  - Probe 1: `SELECT INTERVAL + '1' DAY(3) FROM dual`  
    **classifySql Result:** `Statement rejected: Function DAY is not allowed`
  - Probe 2: `SELECT INTERVAL - '1' DAY(3) FROM dual`  
    **classifySql Result:** `Statement rejected: Function DAY is not allowed`
  - Probe 3: `SELECT INTERVAL + '1-2' YEAR(2) TO MONTH FROM dual`  
    **classifySql Result:** `Statement rejected: Function YEAR is not allowed`
  - Probe 4: `SELECT INTERVAL - '1.1' SECOND(2, 4) FROM dual`  
    **classifySql Result:** `Statement rejected: Function SECOND is not allowed`
- **Description & Cause:**
  In Oracle 19c SQL, interval literals support an optional leading sign (`INTERVAL [ + | - ] 'literal' unit [(precision)]`).
  In `isContextualSyntax`:
  ```ts
  if (intervalUnits.has(upper)) return precision && (prev === 'INTERVAL' || prev === 'TO' || (tokens[at - 1] === 'literal' && tokens[at - 2]?.toUpperCase() === 'INTERVAL'));
  ```
  When a sign token `+` or `-` is present between `INTERVAL` and `'literal'`, `tokens[at - 1]` is `'literal'`, but `tokens[at - 2]` is `'+'` or `'-'`, and `tokens[at - 3]` is `'INTERVAL'`. Consequently, `isContextualSyntax` evaluates to `false`, causing `checkFunctionCalls` to reject valid signed interval literals with precision.
- **Recommended Remediation:**
  Update line 50 to accommodate the optional leading sign token:
  ```ts
  if (intervalUnits.has(upper)) return precision && (prev === 'INTERVAL' || prev === 'TO' || (tokens[at - 1] === 'literal' && (tokens[at - 2]?.toUpperCase() === 'INTERVAL' || (['+', '-'].includes(tokens[at - 2] ?? '') && tokens[at - 3]?.toUpperCase() === 'INTERVAL'))));
  ```

---

### Finding 2: False rejection of ANSI character datatype synonyms with length in `CAST`
- **File & Line:** [`src/oracle/sqlPolicy.ts:28-31`](../src/oracle/sqlPolicy.ts#L28-L31), [`src/oracle/sqlPolicy.ts:51`](../src/oracle/sqlPolicy.ts#L51)
- **Severity:** **LOW**
- **Exact Probe SQL & Results:**
  - Probe 1: `SELECT CAST(1 AS CHARACTER(10)) FROM dual`  
    **classifySql Result:** `Statement rejected: Function CHARACTER is not allowed`
  - Probe 2: `SELECT CAST(1 AS CHARACTER VARYING(10)) FROM dual`  
    **classifySql Result:** `Statement rejected: Function VARYING is not allowed`
  - Probe 3: `SELECT CAST(1 AS NATIONAL CHARACTER(10)) FROM dual`  
    **classifySql Result:** `Statement rejected: Function CHARACTER is not allowed`
  - Probe 4: `SELECT CAST(1 AS NATIONAL CHARACTER VARYING(10)) FROM dual`  
    **classifySql Result:** `Statement rejected: Function VARYING is not allowed`
- **Description & Cause:**
  Oracle SQL supports ANSI data type synonyms (`CHARACTER(n)`, `CHARACTER VARYING(n)`, `NATIONAL CHARACTER(n)`, and `NATIONAL CHARACTER VARYING(n)`) in `CAST` expressions. While native types (`CHAR`, `NCHAR`, `VARCHAR2`) are present in `parenthesizedSyntax`, `CHARACTER` and `VARYING` are absent from both `parenthesizedSyntax` and `isContextualSyntax`.
- **Recommended Remediation:**
  Add `CHARACTER` to `parenthesizedSyntax` or recognize `CHARACTER` and `VARYING` after `AS` in `isContextualSyntax`.
