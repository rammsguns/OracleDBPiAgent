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

---

## Re-Review (2026-10-27)

**Target:** Commit `02721a2` on branch `rammsguns/wp-l-compact-describe` (reviewed against `c6bdb50` and `needlefish`)  
**Verdict:** **APPROVE**

### Summary of Changes

Commit `02721a2` refactors `renderDescribe` and introduces a dedicated `boundedDescribe` pipeline that operates on whole entities rather than popping arbitrary raw SQL rows:
1. **Entity-Aware Section Parsing:** `describeSections` groups parent rows (`CONSTRAINT`, `INDEX`, `COLUMN`, `STATS`) with all corresponding child rows (`CONSTRAINT_COLUMN`, `INDEX_COLUMN`) into discrete entity records.
2. **Atomic Entity Truncation:** When enforcing byte caps, `boundedDescribe` pops entire entities (`section.entries.pop()`) from the tail section and synchronously filters all constituent rows (`parent` + all `children`) from `details.rows`. Composite constraints and indexes can never have child columns stripped while keeping the parent.
3. **Explicit Section Omission Disclosures:** `renderDescribeSections` tracks `section.omitted`. If entries are truncated (partially or entirely), it renders `${section.header.split(":")[0]}: ${section.omitted} more not shown [truncated]`. No section header is ever dropped silently. If a byte cap is too small to display omission notices, it fails closed by throwing an informative error.
4. **Header Clarification:** Updated constraint header to `Constraints: name|type|status|child_columns(position:name)`.
5. **Comprehensive Truncation Tests:** Added 6 parametric exact-match unit tests asserting entity integrity and disclosures across every section, plus DB row-cap handling, refusal of impossible caps, and generic tool pass-through byte fidelity.

---

### Verification Against Prior Findings

| Prior Finding | Status | Verification & Resolution Details |
|---|---|---|
| **Finding 1 (HIGH):** Composite constraint/index columns stripped from right to left | **RESOLVED** | `describeSections` ties parents and children together in `entry.rows`. `boundedDescribe` removes whole entities atomically from both rendered output and `details.rows`. Probed across decreasing byte limits: composite PKs and indexes are either retained with all columns or cleanly omitted with a disclosure. No incomplete column list can be rendered. |
| **Finding 2 (MEDIUM):** Sections dropped silently without section-level notice | **RESOLVED** | `renderDescribeSections` checks `section.omitted`. When all entries of a section are truncated (e.g. `Stats` or `Indexes`), the section header is retained with `${section.header.split(":")[0]}: ${section.omitted} more not shown [truncated]`. Silent drops are impossible. |
| **Finding 3 (MEDIUM):** Test suite failed to assert truncation integrity | **RESOLVED** | `tests/unit/compact-describe.test.ts` now tests exact truncated strings and exact retained row sets for `Stats`, `Indexes`, `Constraints partly`, `Constraints`, `Columns partly`, and `Columns`, as well as overly small caps and DB row-cap behavior. |
| **Finding 4 (LOW):** Single-line constraint header risks FK parent misinterpretation | **RESOLVED** | Header updated to `Constraints: name|type|status|child_columns(position:name)`. |

---

### Evaluation of Design Choice: Database Row Cap (`maxRows`) Handling

**Design Question:** When the database row cap (`maxRows`) truncates the raw UNION ALL query, `boundedDescribe` drops all constraint and index entries and reports them as omitted (`Constraints: N more not shown [truncated]`, `Indexes: M more not shown [truncated]`), rather than attempting to keep seemingly complete ones. Is that acceptable, too lossy, or should it keep entities whose column lists are provably complete?

**Judgment:** **ACCEPTABLE** (Recommended, sound engineering design).

**Technical Analysis & Rationale:**
1. **Unverifiability of Entity Completeness:**
   The underlying query orders by `1, 5, 2` (`kind, position, name`). `CONSTRAINT_COLUMN` rows are sorted by `position` ascending across constraints. If `maxRows` (default 200) cuts off the query during `CONSTRAINT_COLUMN` or `INDEX_COLUMN`, column position 1 might be returned for all constraints while column position 2 or 3 is truncated. Because Oracle's `ALL_CONSTRAINTS` and `ALL_INDEXES` views do not provide a total column count column in the projection, the client has no way to prove whether a constraint returned with column 1 was a single-column constraint or an incomplete composite constraint.
2. **Preservation of Soundness Invariants:**
   Presenting an apparently "complete" constraint that is secretly missing columns truncated by the DB row cap would reintroduce the exact hazard flagged in Finding 1: models generating invalid single-column joins or unique assumptions on multi-column keys.
3. **Lossiness Is Minimal and Contextual:**
   - In normal schema introspection, tables rarely exceed 200 metadata rows.
   - For wide tables exceeding `maxRows`, `Columns` (which are 1 row per column, each having explicit `column_id`) are preserved up to the row limit, and `Stats` is retained if reached.
   - Constraints and indexes are omitted with explicit, prominent disclosures (`Constraints: N more not shown [truncated]`), clearly signaling to the agent that relational metadata was cut off and prompting it to query `ALL_CONSTRAINTS` directly via `run_query`.
4. **Fail-Closed Robustness:**
   Attempting heuristic entity preservation (e.g., keeping constraints only if the last fetched row was `INDEX_COLUMN` or `STATS`) would tightly couple TypeScript logic to the specific UNION ALL collation and Oracle null-ordering semantics, creating fragile failure modes. The all-or-nothing omission for relational sections under DB-level truncation is the right fail-closed default.

---

### Verification Results

All tests executed cleanly against the worktree and live targets:

| Test / Check | Result | Command & Output Details |
|---|---|---|
| TypeScript Typecheck | **PASS** | `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) exited 0 |
| Unit Test Suite | **PASS** | `npm test` (`vitest run tests/unit`): 264 passed across 11 files (657ms) |
| Compact Describe Unit Tests | **PASS** | `tests/unit/compact-describe.test.ts`: 13/13 tests passed, covering all section truncation permutations |
| Integration Tests (19c) | **PASS** | `tests/integration/compact-describe.test.ts`: 3/3 passed against `d1-19c-lab` (`SH.SALES`, `SH.CUSTOMERS`) and `p1-19c-prod` (`SHOPAPP.ORDERS`) (470ms) |
| Full Integration Suite | **PASS** | 13/13 passed across 4 files against approved targets |
| Git Formatting & Hygiene | **PASS** | `git diff --check needlefish..02721a2` returned 0 issues |
| Generic Tools Pass-Through | **PASS** | Verified that `run_query`, `list_objects`, `get_source`, and other tools retain unchanged output, pagination, and byte truncation |

---

### Numbered Findings

None. All previous findings have been completely resolved.

---

### Final Verdict

**APPROVE**
