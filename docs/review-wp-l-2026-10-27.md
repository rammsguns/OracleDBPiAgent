# Code Review: OracleDBPiAgent (WP-L Compact Describe)

**Date:** 2026-10-27
**Reviewer:** Antigravity (Review Agent)
**Target:** Commit `c6bdb50` on branch `rammsguns/wp-l-compact-describe` (reviewed against `needlefish`)
**Files Under Review:**
- `src/tools/index.ts` (`renderDescribe`, `boundedResult` wiring)
- `tests/unit/compact-describe.test.ts`
- `tests/integration/compact-describe.test.ts`
- `docs/wp-l-compact-describe.md`

**Verdict:** **REQUEST CHANGES**

---

## Executive Summary

Commit `c6bdb50` implements a compact renderer (`renderDescribe`) for `describe_object` in `src/tools/index.ts`, aiming to reduce tool result token footprint by folding composite column lists into parent constraint and index lines and grouping output into four distinct sections (`Columns`, `Constraints`, `Indexes`, `Stats`).

1. **Fact Preservation & Attribution (Untruncated Case):** **PASS**
   In normal (untruncated) execution, all dictionary facts from the original tabular UNION ALL query are preserved:
   - Column positions (`column_id`), names, datatypes, and data lengths are accurately mapped.
   - Constraint and index columns are correctly sorted by position ascending (`Number(a[4]) - Number(b[4])`) and formatted as `position:name`.
   - `NUM_ROWS` and `LAST_ANALYZED` are retained, and dictionary `NULL` values are explicitly preserved as `NULL` via the `cell()` formatter.
   - Orphan dictionary column rows are retained, and an empty result produces `"No metadata rows."`.

2. **Tool Boundary, Audit & Safety:** **PASS**
   - The third argument to `boundedResult` (`renderTable`) is supplied only when `name === "describe_object"`. Other tools (`run_query`, `list_objects`, `get_source`, `top_sql`, etc.) evaluate `renderTable && details.columns` as false and render identically to `needlefish`.
   - Audit logging via `ctx.audit.record` retains identical semantics: recording `kind: "tool_call"`, `sqlSha256`, `rows: q.rows?.length`, `truncated: q.truncated`, and `elapsedMs: q.elapsedMs`.
   - The underlying read-only SQL query and bind variables (`{ owner, name }`) are unchanged; no DDL, DML, or side-effecting operations are introduced.

3. **Byte-Limit Truncation & Integrity Under Truncation:** **FAIL (BLOCKING)**
   A critical design flaw was discovered in the interaction between `boundedResult` and `renderDescribe`:
   - `boundedResult` enforces byte limits by popping raw rows from `details.rows` from the end (`details.rows.pop()`).
   - Because the underlying SQL query sorts by `ORDER BY 1, 5, 2`, all child column rows (`CONSTRAINT_COLUMN`, `INDEX_COLUMN`) appear after parent rows (`CONSTRAINT`, `INDEX`), and `STATS` appears last.
   - When raw rows are popped, trailing column positions of composite constraints or indexes are discarded while their parent rows remain intact. `renderDescribe` folds whatever children remain, rendering composite constraints and indexes with fewer columns than they actually possess (e.g. `PK_ORDER_LINES|P|ENABLED|1:ID` instead of `1:ID,2:LINE_NO`), or even with completely empty column lists (`PK_ORDER_LINES|P|ENABLED|`). The constraint line contains no indication of truncation; only a generic `[truncated]` is appended to the bottom of the entire tool response.
   - Furthermore, when all rows of a section are popped (which happens first to `STATS`), `renderDescribe` executes `if (!parents.length && !children.length) continue;` and silently drops the entire section header (`Stats: table|NUM_ROWS|LAST_ANALYZED`). The consumer cannot distinguish between an unanalyzed table and one whose stats were truncated away.
   - This directly violates requirement (2): *"byte-limit truncation still always discloses [truncated] and cannot drop a section silently or make a constraint look like it has fewer columns than it really does."*

4. **Test Suite Verification:** **FAIL**
   The unit test in `tests/unit/compact-describe.test.ts:26-36` sets a cap of 900 bytes and asserts `expect(bounded.content[0]!.text).toContain('[truncated]')`. However, it never asserts the content or structure of the truncated output. In that test, the `Stats` section was silently dropped and rows were removed without assertion. There are zero unit tests for truncation of composite constraints or indexes, and integration tests only test untruncated fixtures (`output.details.truncated === false`). The tests fail to prove requirement (2).

---

## Detailed Check-by-Check Review

### Check 1: Fact Preservation and Attribution
- **Columns:**
  - Header: `Columns: position|name|type|length`
  - Row mapping: `[row[4], row[1], row[2], row[3]]` maps to `column_id`, `column_name`, `data_type`, `data_length`.
  - Column order: SQL orders `kind='COLUMN'` by `column_id` ascending (`ORDER BY 1, 5, 2`). Verified in integration tests against `SH.SALES`, `SH.CUSTOMERS`, `SHOPAPP.ORDERS`.
- **Constraints & Indexes:**
  - Headers: `Constraints: name|type|status|columns(position:name)` and `Indexes: name|uniqueness|status|columns(position:name)`.
  - Children are grouped by parent name (`child[1] === row[1]`) and sorted by `Number(a[4]) - Number(b[4])` (position ascending).
  - Formatted as comma-separated `position:name` pairs.
  - Orphan children (children without a parent row) are rendered as `${kind}_COLUMN|${name}|${position}:${column}`.
- **Stats:**
  - Header: `Stats: table|NUM_ROWS|LAST_ANALYZED`.
  - Maps `table_name`, `num_rows`, and `last_analyzed`.
- **NULL Handling:**
  - `cell()` maps `null` and `undefined` to `"NULL"`.
  - Untruncated fact preservation passes all checks.

### Check 2: Byte-Limit Truncation Integrity
**Failed.**
To verify behavior under truncation, a probe script executed `boundedResult(result, cap, renderDescribe)` on a table with composite primary key `(ID, LINE_NO)` and composite index `(ID, LINE_NO)` across decreasing caps:
1. When cap drops enough to pop row 9 (`STATS`), the `Stats` section vanishes completely without any section-level truncation notice.
2. When cap drops enough to pop row 8 (`INDEX_COLUMN LINE_NO`), the index line renders as:
   `PK_ORDER_LINES|UNIQUE|VALID|1:ID`
   Trailing column `LINE_NO` is removed, and the index is rendered as if it were a single-column index on `ID`.
3. When cap drops enough to pop row 5 (`CONSTRAINT_COLUMN LINE_NO`), the constraint line renders as:
   `PK_ORDER_LINES|P|ENABLED|1:ID`
   The composite primary key is rendered as a single-column primary key on `ID`.
4. When cap drops enough to pop row 4 (`CONSTRAINT_COLUMN ID`), the constraint line renders as:
   `PK_ORDER_LINES|P|ENABLED|`
   An enabled primary key is presented with zero columns.
5. In all cases, `[truncated]` is only placed at the end of the full tool response.

This behavior is unacceptable for database code generation and analysis: an agent reading `PK_ORDER_LINES|P|ENABLED|1:ID` followed by `[truncated]` at the bottom of the output will naturally conclude that `PK_ORDER_LINES` has a single column `ID` and that subsequent objects or sections were truncated.

### Check 3: Other Tools Rendering
**Passed.**
In `src/tools/index.ts:151`:
```ts
const output = boundedResult(result, ctx.config.limits.maxToolResultBytes, name === "describe_object" ? renderDescribe : undefined);
```
In `boundedResult`:
```ts
const render = () => renderTable && details.columns ? renderTable(details) : Array.isArray(details) ? JSON.stringify(details) : details.columns ? [...(details.sourceNote ? [details.sourceNote] : []), ...(typeof details.totalLines === "number" ? [`Total lines: ${details.totalLines}; more: ${details.hasMore}; next startLine: ${details.nextStartLine ?? "none"}`] : []), details.columns.join(" | "), ...details.rows.map((r: unknown[]) => r.map(v => v == null ? "NULL" : String(v).replace(/\s+/g, " ")).join(" | ")), ...(details.truncated ? ["[truncated]"] : [])].join("\n") : JSON.stringify(details);
```
When `renderTable` is `undefined`, the code path is byte-for-byte identical to `needlefish`.

### Check 4: Audit, Fallback and Safety
**Passed.**
- Audit recording in `src/tools/index.ts:152-154` records `rows: q.rows?.length`, `truncated: q.truncated`, and `elapsedMs: q.elapsedMs` from `output.details`.
- SQL statement is read-only against Oracle dictionary views. Binds are correctly applied.
- `describe_object` has no fallback query logic; its error handling on query failure remains unchanged.

### Check 5: Test Suite Rigor
**Failed.**
- In `tests/unit/compact-describe.test.ts:32-34`:
  ```ts
  const bounded = boundedResult(input, 900, renderDescribe);
  expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(900);
  expect(bounded.content[0]!.text).toContain('[truncated]');
  ```
  The test merely checks that `[truncated]` is present somewhere in `text`. It does not check that the `Stats` section was silently dropped in that very test run, nor does it test composite constraint/index column integrity under truncation.
- Integration test `tests/integration/compact-describe.test.ts` only runs on untruncated objects.

---

## Model Vulnerability / Misleading Analysis

### Foreign Key References & Parent Table Inference
In Oracle dictionary, `ALL_CONSTRAINTS` stores the referenced table and foreign key target in `R_CONSTRAINT_NAME` and `R_OWNER`. The `describe_object` query returns `NAME` (constraint name), `INFO` (type 'R'), and `VALUE` (status), joined with `ALL_CONS_COLUMNS` for the local table's columns.

In the compact format:
`FK_ORDERS_CUSTOMERS|R|ENABLED|1:CUSTOMER_ID`
- **Risk:** Models frequently attempt to infer foreign key targets from the constraint name (e.g. guessing parent table `CUSTOMERS` from `FK_ORDERS_CUSTOMERS`).
- **Existing Mitigation:** The tool description in `src/tools/index.ts:16` explicitly warns:
  *"Constraint rows give constraint name, type and status only; they do NOT include the referenced (parent) table or column of a foreign key. Never infer a parent from a constraint's name: resolve it with run_query on ALL_CONSTRAINTS (R_OWNER, R_CONSTRAINT_NAME) joined to ALL_CONS_COLUMNS."*
- **Assessment:** The compact representation does not introduce false parent information, but because it formats the row as a single cohesive record (`name|type|status|columns`), the model may perceive it as a complete specification. Changing the header to `Constraints: name|type|status|child_columns(position:name)` would make it even clearer that only child columns are listed.
- **Compounded Risk Under Truncation:** If a composite foreign key has one column stripped by truncation (Finding 1), the model will generate foreign key joins on only a single column, causing severe query inaccuracy.

---

## Verification Results

| Check | Result | Details |
|---|---|---|
| `npm ci --ignore-scripts` | **PASS** | Dependencies installed cleanly in worktree |
| `npm run typecheck` | **PASS** | `tsc -p tsconfig.json --noEmit` exited 0 |
| `npm test` | **PASS** | 255/255 tests passed across 11 files (1.59s) |
| `tests/integration/compact-describe.test.ts` | **PASS** | 3/3 passed against `d1-19c-lab` and `p1-19c-prod` (541ms) |
| Truncation Simulation Probe | **FAIL** | Revealed partial column stripping and silent section dropping |

---

## Numbered Findings

### Finding 1: Truncation strips composite constraint and index columns from right to left while keeping parent rows
- **File & Line:** `src/tools/index.ts:183, 205-213`
- **Severity:** **HIGH**
- **Description:**
  `boundedResult` removes raw SQL rows from `details.rows` using `.pop()` until `JSON.stringify(output)` meets `cap`. In the UNION ALL query, `CONSTRAINT_COLUMN` and `INDEX_COLUMN` rows sort after `CONSTRAINT` and `INDEX` parent rows. Popping raw rows strips trailing child column positions while leaving parent rows in `parents`. `renderDescribe` folds the remaining children into the parent line, producing false constraint and index definitions (e.g. multi-column PK `(ID, LINE_NO)` becomes single-column PK `1:ID`, or zero-column constraint `PK_T|P|ENABLED|`).
- **Fix:**
  Truncation for `describe_object` must maintain entity and column completeness:
  1. If `boundedResult` truncates rows for `describe_object`, it must not peel individual column rows away from their parent constraint or index. Constraints and indexes must be treated atomically: either all columns are retained, or the constraint/index is explicitly marked as truncated (e.g. `1:ID,[truncated]`), or removed as an entire unit with a section-level disclosure.
  2. Never render a constraint or index with an incomplete column list without a local `[truncated]` marker on that line.

### Finding 2: Truncation silently drops entire sections without section-level truncation notice
- **File & Line:** `src/tools/index.ts:178, 192`
- **Severity:** **MEDIUM**
- **Description:**
  In `renderDescribe`, line 178 checks `if (!parents.length && !children.length) continue;`. When all rows of a kind (e.g. `STATS` or `INDEX`) are popped by `boundedResult`, the entire section header is skipped. The resulting text has no `Stats:` line, and only appends `[truncated]` at the bottom of the tool output. A consumer cannot tell whether the table lacks statistics/indexes or if they were truncated away.
- **Fix:**
  When `result.truncated` is true and a section that had rows in the raw result has zero rows remaining in `details.rows`, emit the section header with a truncated marker (e.g. `Stats: [truncated]` or `Indexes: [truncated]`), rather than skipping the section entirely.

### Finding 3: Test suite fails to assert truncation integrity and masks silent section omission
- **File & Line:** `tests/unit/compact-describe.test.ts:26-36`, `tests/integration/compact-describe.test.ts:23`
- **Severity:** **MEDIUM**
- **Description:**
  `tests/unit/compact-describe.test.ts` only checks `expect(bounded.content[0]!.text).toContain('[truncated]')` and byte length. It passes even though the `Stats` section was completely omitted. It contains no tests for composite constraints or indexes under truncation.
- **Fix:**
  Add unit tests in `tests/unit/compact-describe.test.ts` covering:
  1. Truncation of multi-column constraints and indexes, asserting that partial columns cannot be presented as complete constraints.
  2. Truncation of sections (`STATS`, `INDEX`, `CONSTRAINT`), asserting that sections are not dropped silently without disclosure.
  3. Exact string matching on truncated outputs.

### Finding 4: Single-line constraint formatting could tempt models to infer parent table from constraint name
- **File & Line:** `src/tools/index.ts:171, 183`
- **Severity:** **LOW**
- **Description:**
  Foreign key rows in `describe_object` only list local child table columns, because parent tables require joining `ALL_CONSTRAINTS`. The compact line `FK_ORDERS_CUSTOMERS|R|ENABLED|1:CUSTOMER_ID` presents `columns(position:name)` on the same line as the constraint name, which models may misread as naming the parent table or parent column.
- **Fix:**
  Clarify the header label to `Constraints: name|type|status|child_columns(position:name)` to reinforce that the columns listed belong to the described table, not the referenced table.
