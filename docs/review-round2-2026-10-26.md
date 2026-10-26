# Code Review: OracleDBPiAgent (Round 2)

**Date:** 2026-10-26  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Implementation merged on branch `review-round2` (`git diff 5650b15..HEAD`)  
**Scope:** Merged WP-D (p1 fallbacks in `src/tools/index.ts`, `docs/compatibility-19c.md`, `docs/grants-request-2026-10-26.sql`) and WP-E (single approved-target allowlist in `src/config/approvedTargets.ts`, `src/config/index.ts`, `src/oracle/index.ts`, testable doctor in `src/cli/index.ts`, `tests/unit/doctor.test.ts`, `docs/wp-e-allowlist-doctor.md`).  
**Verdict:** **APPROVE**

---

## Executive Summary

A comprehensive code review and security audit was conducted on `git diff 5650b15..HEAD` across `src/`, `tests/`, and `docs/`.

All five priority areas established for Round 2 were thoroughly examined and verified:
1. **SQL Policy & Read-Only Transactions:** All four fallback queries (`top_sql`, `tablespace_usage`, `db_overview`, `list_schemas`) execute strictly via `session.query()`, enforcing AST lexing/classification and per-statement `SET TRANSACTION READ ONLY` with mandatory rollback. Retries are strictly restricted to `ORA-00942`; all other database errors rethrow immediately without retrying.
2. **Fallback Integrity & Metrics:** No missing fields are falsified or presented as real values (unavailable fields in `db_overview` and `list_schemas` are explicit `NULL`s). In `tablespace_usage`, block metrics from `DBA_TABLESPACE_USAGE_METRICS` are correctly converted to bytes using `t.block_size`, distinct column names (`capacity_bytes`, `free_capacity_bytes`) avoid confusion with allocated file metrics, and comprehensive limitation disclosures are prepended to outputs and protected during truncation.
3. **Allowlist Centralization & Tamper Resistance:** Target identities are consolidated in `src/config/approvedTargets.ts` into a deeply frozen structure (`APPROVED_TARGETS`). Tampering via `config/targets.json` or environment variables is rejected by `loadConfig()` before any connection or secret read occurs. The session provider's endpoint override is unreachable from production code paths.
4. **Doctor Safety & Failure Exit:** `doctor` completely redacts connection strings, hostnames, ports, driver errors, and privilege lists on failure, reporting only fixed check names. Any failure in Strata health, session setup, target verification, privilege assertion, or session cleanup reliably sets `process.exitCode = 1`.
5. **DBA Grant Request Script:** `docs/grants-request-2026-10-26.sql` contains only read-only `SELECT` grants on specific dictionary views and sample tables for human DBA review. It contains no DDL, DML, `EXECUTE`, `ANY` privileges, or grant options, and was not executed.

Unit test suites (133/133 passing), TypeScript checks, and real Oracle 19c container integration tests pass cleanly without invoking the local Strata LLM.

---

## Detailed Priority Assessment

### Priority 1: SQL Policy, Read-Only Transactions, and Error Selectivity
- **File & Line:** `src/tools/index.ts:93-119`
- **Assessment:** **PASS**
- **Verification Details:**
  - Fallback queries for `top_sql`, `tablespace_usage`, `db_overview`, and `list_schemas` are dispatched exclusively through `session.query(sql, binds, { maxRows })`.
  - In `src/oracle/index.ts`, `session.query()` unconditionally invokes `classifySql(sql)` before issuing the statement to the driver, guaranteeing that DDL, DML, procedural statements, package invocations, and multi-statement payloads cannot bypass policy.
  - Every query is bracketed by `SET TRANSACTION READ ONLY` and rolled back in `finally`.
  - Error catching at `src/tools/index.ts:95` evaluates `if (!/ORA-00942/.test(String(error))) throw error;`. Non-grant errors (such as timeouts `ORA-01013`, connection aborts `ORA-03113`, privilege errors `ORA-01031`, or syntax errors) are immediately rethrown.
  - `wait_events` explicitly catches `ORA-00942` and throws an error detailing the missing grant on `SYS.V_$SYSTEM_EVENT` rather than looping or retrying (`src/tools/index.ts:96`).
  - Unhandled tools (`run_query`, `list_objects`, `describe_object`, `get_source`, `session_activity`) fall through to `else throw error;` and are never retried.
  - The outer `try ... finally` block guarantees `await session.close()` on every path.

### Priority 2: Fallback Result Accuracy, Unit Conversions, and Disclosure Integrity
- **File & Line:** `src/tools/index.ts:97-109, 140-153`
- **Assessment:** **PASS**
- **Verification Details:**
  - **`tablespace_usage`:** `DBA_TABLESPACE_USAGE_METRICS` stores sizes in Oracle blocks. The fallback query explicitly joins with `DBA_TABLESPACES t` on `tablespace_name` and computes `m.tablespace_size * t.block_size capacity_bytes`, `m.used_space * t.block_size used_bytes`, and `(m.tablespace_size - m.used_space) * t.block_size free_capacity_bytes`. Columns are distinctly named to avoid conflating capacity (which accounts for autoextend limits) with allocated-file size. Real container queries against `p1-19c-prod` confirm exact arithmetic consistency (`CAPACITY_BYTES = USED_BYTES + FREE_CAPACITY_BYTES`).
  - **`db_overview`:** Fields unavailable on `p1` (`CDB`, `STARTUP_TIME`, `DATAFILE_BYTES`, `SGA_BYTES`, `PGA_BYTES`) return explicit SQL `NULL`s, rather than mock defaults (`0` or `"NO"`). Verified against `p1-19c-prod` live instance where identity fields (`PRODCDB`, `19.9.1.0.0`, `AL32UTF8`) populate cleanly alongside `null` for ungranted views.
  - **`list_schemas`:** Non-Oracle schemas are enumerated via `ALL_USERS`, with objects counted via `ALL_OBJECTS`. To prevent misleading the agent into assuming a schema with no visible objects is empty, the column is named `VISIBLE_OBJECT_COUNT`, `SEGMENT_BYTES` is returned as `NULL`, and `sourceNote` cautions that zero visible objects does not prove an empty schema.
  - **`top_sql`:** Aggregates child cursors by `sql_id` (`SUM(executions)`, `SUM(elapsed_time)`, `SUM(cpu_time)`, `SUM(buffer_gets)`). Units (microseconds and blocks) match primary `V$SQLSTATS` semantics.
  - **Truncation Safety:** `boundedResult()` places `sourceNote` at the top of the rendered text and in `details.sourceNote`. If rows are truncated due to `maxToolResultBytes`, the disclosure note is preserved. If the byte budget is too small to fit the disclosure itself, it throws (`"Tool result byte limit is too small to retain fallback source and limitations"`) rather than stripping the notice.

### Priority 3: Approved Target Allowlist Enforcement and Override Isolation
- **File & Line:** `src/config/approvedTargets.ts:1-9`, `src/config/index.ts:24-31`, `src/oracle/index.ts:21-36`
- **Assessment:** **PASS**
- **Verification Details:**
  - The approved target allowlist is centralized in `src/config/approvedTargets.ts` as `APPROVED_TARGETS`, frozen using `Object.freeze` for both the array and target definitions.
  - `loadConfig()` asserts `targets.length === 2` and strictly validates all 8 structural properties (`name`, `host`, `port`, `serviceName`, `username`, `passwordFile`, `defaultSchema`, `environment`) against `APPROVED_TARGETS`. Modifying any property or pointing `PIAGENT_TARGETS_FILE` to a modified JSON file triggers `Error("Invalid or unapproved target configuration")`.
  - `createSessionProvider()` in `src/oracle/index.ts` independently enforces `approvedEndpoints.some(...)` against `APPROVED_ENDPOINTS`.
  - The optional parameter `approvedEndpoints` is used only in test files (`tests/unit/session.test.ts`, `tests/integration/wp-c.integration.test.ts`) to test 19c gate rejection. In all production entry points (`src/agent/dbToolsAdapter.ts`, `src/cli/index.ts`, `evals/runtime.ts`), `createSessionProvider(config)` is invoked without the optional second argument, defaulting strictly to `APPROVED_ENDPOINTS`.

### Priority 4: Doctor Leakage Prevention and Failure Exit Codes
- **File & Line:** `src/cli/index.ts:18-63`
- **Assessment:** **PASS**
- **Verification Details:**
  - `doctor()` masks all internal connection details and driver error messages. On failure, it outputs only deterministic, high-level failure labels:
    - `"Strata: unavailable or unloaded; no configuration changes made"`
    - `"Session provider: initialization check failed"`
    - `"${target.name}: connection check failed"`
    - `"${target.name}: 19c gate check failed"`
    - `"${target.name}: account identity check failed"`
    - `"${target.name}: read-only privileges check failed"`
    - `"Session cleanup: check failed"`
  - No database passwords, file paths, hostnames, ports, connect strings, or unexpected privilege names are ever written to stdout or stderr.
  - If any check fails, `ok` is set to `false`. When `doctor()` returns `false`, `main()` sets `process.exitCode = 1`.
  - Comprehensive unit tests in `tests/unit/doctor.test.ts` verify exit code 1 and confirm that sensitive string tokens never appear in process output across all simulated failure scenarios.

### Priority 5: Human DBA Grant Request Script Review
- **File & Line:** `docs/grants-request-2026-10-26.sql:1-43`
- **Assessment:** **PASS**
- **Verification Details:**
  - Contains exactly 31 SQL statements:
    - 11 `GRANT SELECT ON SYS.<view> TO HARNESS_RO;` for diagnostic fixed views and dictionary tables on `p1-19c-prod`.
    - 20 `GRANT SELECT ON <schema>.<table> TO HARNESS_LAB;` for sample data tables (`HR`, `OE`, `CO`) on `d1-19c-lab`.
  - Strictly limited to `SELECT`. No `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `TRUNCATE`, `EXECUTE`, or `ANY` privileges are present.
  - Contains no `WITH GRANT OPTION` or `WITH ADMIN OPTION`.
  - Prominent header warnings clarify that the script is intended solely for human DBA execution and must never be run by the agent or test automation.
  - The script was not executed during this review.

---

## Verification Results

| Check | Command / Suite | Result | Details |
|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | 0 errors (`tsc -p tsconfig.json --noEmit`) |
| **Unit Tests** | `npm test` | **PASS** | 6 test files, 133/133 tests passed (tools, doctor, session, sqlPolicy, wp-a, wp-c) |
| **Oracle Integration (19c Tools & Gate)** | `vitest run tests/integration/oracle.test.ts` | **PASS** | 3/3 tests passed against local 19c containers `d1-19c-lab`, `p1-19c-prod`, and gate-only refusal |
| **Oracle Integration (Policy & Non-19c Gate)** | `vitest run tests/integration/wp-c.integration.test.ts -t '^(?!.*answers one end-to-end ask)'` | **PASS** | 3 passed, 1 skipped (Strata inference excluded per instructions) |
| **Doctor Live Execution** | `npm run piagent -- doctor` | **PASS** | Exit 0; Strata loaded; `d1` and `p1` report Oracle 19.9.1.0.0 with `CREATE SESSION` only |
| **Doctor Failure Handling** | `tests/unit/doctor.test.ts` | **PASS** | Exit 1 verified across unloaded Strata, connection failure, gate refusal, and unexpected privileges |

---

## Verdict

**APPROVE**

The work merged in `git diff 5650b15..HEAD` fulfills all requirements of `PLAN.md` and the Round 2 review criteria. All fallbacks are safely bounded and read-only, target allowlist enforcement is unified and impervious to configuration overrides, doctor failure reporting is clean and non-leaking, and the DBA grant request script adheres strictly to read-only `SELECT` grants.
