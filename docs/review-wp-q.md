# Code Review: OracleDBPiAgent (WP-Q run_query Error Hints)

**Date:** 2026-10-27  
**Reviewer:** Antigravity (Review Agent)  
**Target:** Commit `63ec90a2f4d29bce03f83fb93583eb1993dd419b` on branch `rammsguns/wp-q-error-hints`  
**Files Under Review:**
- `docs/wp-q-error-hints.md`
- `src/tools/index.ts`
- `tests/unit/query-error-hints.test.ts`
- `tests/integration/query-error-hints.test.ts`

Verdict: REQUEST CHANGES

---

## Executive Summary

Commit `63ec90a` implements Work Package WP-Q ("run_query error hints") in `src/tools/index.ts`, augmenting failed `run_query` calls with bounded, read-only dictionary hints for ORA-00904, ORA-01747, ORA-00942, and ORA-00935.

The core safety architecture, bound metadata lookups, fallback behavior, timeout/row caps, character budget enforcement, and SQL tokenization (`dictionaryViews`) are implemented soundly:
- Lookups are read-only, bound, and audited under separate hashes without modifying user SQL audit records.
- Timeouts (2s) and row limits (1,000) are enforced, and any failure cleanly falls back to the original unmodified error message.
- Hint string length is strictly capped at 1,200 characters and preserves column ordering.
- `dictionaryViews` conservatively extracts local dictionary views from complex queries (joins, subqueries, comma lists, CTEs, aliases, and `SYS.` qualifiers) while safely ignoring comments, literals, quoted identifiers, and remote database links.

However, **the close-match heuristic is test-fitted and noisy**, requiring changes before merging:
1. The rules `word === column + "_X"` and `word + "D" === column` were fitted specifically to satisfy synthetic test queries (`SELECT sql_fulltext_x FROM v$sql` and `SELECT c.validate FROM all_constraints c`) rather than generalizing to real-world model mistakes. They fail on actual eval cases such as `PARSES` vs `PARSE_CALLS`.
2. The candidate word extractor `used` includes all SQL tokens matching `/[A-Z][A-Z0-9_$#]*/` that are not column names. This injects SQL keywords (`SELECT`, `FROM`, `WHERE`, `ORDER`), view names (`ALL_CONSTRAINTS`), and short aliases (`c`, `s`, `q`) into the candidate pool. Once generalized matching (prefix or edit distance) is introduced, this noise causes keywords and aliases to spuriously match unrelated dictionary columns.
3. For ORA-00904, the invalid identifier is explicitly provided by the Oracle error message and should be prioritized directly rather than scanning the entire SQL text.

---

## Detailed Evaluation Against Review Criteria

### 1. Safety & Invariants
- **Read-Only & Policy Enforcement:** Lookups execute pure `SELECT` statements against `ALL_TAB_COLUMNS`. Every statement passes `classifySql(statement)` prior to execution, ensuring the read-only policy cannot be bypassed.
- **Bound Identifiers:** Table and owner names are parameterized (`:owner`, `:name`). No identifier concatenation or dynamic SQL interpolation is used.
- **Limits & Timeouts:** Lookups are constrained to `maxRows: Math.min(1000, ctx.config.limits.maxRows)` and `timeoutSeconds: Math.min(2, ctx.config.limits.statementTimeoutSeconds)`. At most 3 views are probed sequentially.
- **Auditing Integrity:** Each metadata lookup generates its own audit event with its own `sqlSha256`. The outer `createDbTools` error catch block records the original user SQL's `sqlSha256`. The user query audit record is unchanged.
- **Safe Fallback:** The entire hint generation is wrapped in `try { ... } catch { return error; }`. Any timeout, network error, or unexpected failure aborts silently and returns the original error unchanged.
- **Original Message Preservation:** `error.message += "\n" + hint` appends to the error message. The first line containing the original Oracle error code and description is never altered.
- **No Secrets or Credentials:** Hints contain only dictionary view metadata. Bind values, passwords, and connection credentials are never included.

Verdict on Safety: **PASS**

---

### 2. Correctness of `dictionaryViews`
`dictionaryViews` uses a conservative lexical scanner to identify dictionary views (`ALL_*`, `USER_*`, `DBA_*`, `V$*`, `GV$*`):
- **Subqueries:** Tracks parenthesis depth (`depth`) and maintains state per depth level (`from.set(depth, true)`, `from.delete(depth)`). Subqueries in `FROM (...)` or `WHERE ... IN (SELECT ...)` correctly scope view names.
- **Joins:** Explicitly recognizes `JOIN` (including `LEFT`, `RIGHT`, `FULL OUTER`, `CROSS`, `NATURAL`), reliably capturing joined views.
- **Comma lists:** Maintains `from.get(depth)` active until clause terminators (`WHERE`, `GROUP`, `ORDER`, `HAVING`, `UNION`, `MINUS`, `INTERSECT`), correctly extracting views in comma-separated `FROM` lists.
- **Table Aliases:** Safely steps over table aliases (e.g. `FROM v$sql s` or `all_tables t`) because `tokens[end]` is neither `.` nor `@`.
- **CTEs (Common Table Expressions):** Inside CTE definitions (`WITH cte AS (SELECT ... FROM v$session)`), subquery views are captured at depth 1. Multiple CTE definitions separated by commas at depth 0 are not misidentified as tables because `from.get(0)` is inactive prior to the outer query's `FROM`.
- **Quoted Identifiers & Literals:** Replaced with `" ? "` before tokenization, preventing quoted names from introducing fake views.
- **Comments:** Line comments (`--`) and block comments (`/* ... */`) are stripped cleanly to spaces, even when comments contain quotes or single quotes appear in comments.
- **`SYS.` Prefix & DB Links:** Handles `SYS.` qualification by advancing past the schema token. Rejects remote objects by checking for `@` or other schema prefixes (`.`).

Verdict on `dictionaryViews`: **PASS**

---

### 3. The Close-Match Heuristic

#### 3.1 Test-Fitting Analysis
Lines 319–320 of `src/tools/index.ts`:
```typescript
const normalized = (word: string) => word.replace(/_/g, "");
const matches = columns.filter(column => [...used].some(word => normalized(word) === normalized(column) || word === column + "_X" || word + "D" === column));
```
- `word === column + "_X"`: This rule was introduced solely to satisfy the integration test `SELECT sql_fulltext_x FROM v$sql`. In production, neither LLMs nor human engineers write `_x` as a plausible typo. It fails on other common suffixes or typos (e.g., `SQL_FULLTEXT_CLOB`, `SQL_FULLTEXTS`, `SQL_FULL_TEXTS`).
- `word + "D" === column`: This rule was introduced solely to satisfy the unit test `SELECT c.validate FROM all_constraints c` matching `VALIDATED`. It is hardcoded to the single character `"D"`, failing for plural `"S"` / `"ES"` (`CONSTRAINT` vs `CONSTRAINTS`), past tense `"ED"`, or `"ING"`.

#### 3.2 Evaluation Case Performance
Reviewing the evals failure patterns cited in PLAN.md and the coordinator prompt:
1. `SQL_FULL_TEXT` vs `SQL_FULLTEXT`: Handled by `normalized(word) === normalized(column)`. Underscore normalization is general, sound, and effective.
2. `VALIDATE` vs `VALIDATED`: Handled only because of the hardcoded `+ "D"`. A general prefix/stem rule or bounded edit distance covers this without overfitting.
3. `PARSES` vs `PARSE_CALLS`: **FAILS**. Under the current heuristic, `PARSES` produces no close match against `PARSE_CALLS` on `V$SQL`.
4. `VERSION_COUNT` on `V$SQL`: `VERSION_COUNT` does not exist in `V$SQL` (it exists in `V$SQLAREA`). The heuristic correctly must not fabricate or match an unrelated column in `V$SQL`.

#### 3.3 Noise in Candidate Tokens (`used`)
Currently:
```typescript
const used = new Set((sql.toUpperCase().match(/[A-Z][A-Z0-9_$#]*/g) ?? []).filter(word => !columns.includes(word)));
```
`used` includes every word token in the query that is not a column name of the view being inspected. This includes:
- SQL reserved words: `SELECT`, `FROM`, `WHERE`, `JOIN`, `ON`, `GROUP`, `ORDER`, `BY`, `HAVING`, `UNION`, `ROWNUM`, `FETCH`, `FIRST`, `ROWS`, `ONLY`, `AND`, `OR`, `IN`, `AS`.
- View names: `ALL_CONSTRAINTS`, `V$SQL`.
- Single-letter aliases: `c`, `s`, `t`, `q`.

If a general prefix or edit distance rule is applied to `used` without filtering:
- Single-letter alias `S` would prefix-match every column starting with `S` (`SQL_ID`, `SQL_TEXT`, `SHARABLE_MEM`, `SORTS`, `SERVICE`, `STATUS`).
- Keyword `SELECT` would match columns like `SELECTED` or `SELECTION`.
- Keyword `ORDER` would match `ORDER_ID`.
- View name `ALL_CONSTRAINTS` would match `CONSTRAINT_NAME` or `CONSTRAINT_TYPE`.

**Conclusion:** The heuristic is both test-fitted and noisy.

Verdict on Close-Match Heuristic: **FAIL (REQUEST CHANGES)**

---

### 4. Hint Size & Cap
- Budget is partitioned across views: `budget = Math.floor(1180 / Math.max(1, views.length))`.
- Length cap is strictly enforced via `while (shown.length && render().length > budget) shown.pop()`, followed by `if (hint && hint.length <= 1200)`.
- Omitted columns are accurately tracked and reported using `COUNT(*) OVER ()`.
- Column order follows `COLUMN_ID` as fetched from `ALL_TAB_COLUMNS`.
- Multi-view behavior: Lookups are sequential up to 3 views. If any lookup fails, the entire hint is aborted, ensuring no partial or misleading hints are returned.

Verdict on Hint Size & Cap: **PASS**

---

### 5. Test Suite & Coverage
- Existing unit tests (`tests/unit/query-error-hints.test.ts`) cover ORA-00904, ORA-01747, ORA-00942 (both visible and not visible), ORA-00935, user tables, lookups fallback, timeout fallback, 1,200 char cap, omitted column counts, column order, tokenization edge cases, and non-error queries.
- Integration tests (`tests/integration/query-error-hints.test.ts`) run cleanly against both `d1-19c-lab` and `p1-19c-prod`.
- **Gaps:**
  - Unit tests specifically assert the test-fitted rules (`_x` and `validate` + `D`).
  - No test verifies that SQL keywords or table aliases are excluded from close matches.
  - No test covers `PARSES` vs `PARSE_CALLS`.
  - Multi-view hint formatting was verified only for lookup call counts/names, not for the rendered hint string.

Verdict on Test Suite: **REQUEST CHANGES**

---

## Required Fixes

To resolve this review, the author must apply the following changes:

### 1. Extract Bad Column from ORA-00904 Error Message
For ORA-00904, Oracle explicitly reports the bad identifier in the error text (e.g., `ORA-00904: "SQL_FULL_TEXT": invalid identifier`). Extract this identifier directly:
```typescript
const badIdentifierMatch = error.message.match(/ORA-00904:\s*(?:"([^"]+)"|([A-Z0-9_$#]+)):\s*invalid identifier/i);
const reportedBadColumn = (badIdentifierMatch?.[1] ?? badIdentifierMatch?.[2])?.split(".").pop()?.toUpperCase();
```

### 2. Sanitize Candidate Words for ORA-01747
When the bad column is not reported in the error message (such as ORA-01747), extract candidate words from SQL while strictly filtering out:
- Reserved SQL keywords (`SELECT`, `FROM`, `WHERE`, `JOIN`, `ON`, `GROUP`, `BY`, `ORDER`, `HAVING`, `UNION`, `AND`, `OR`, `IN`, `NOT`, `NULL`, `IS`, `AS`, `ROWNUM`, `FETCH`, `FIRST`, `ROWS`, `ONLY`, `CASE`, `WHEN`, `THEN`, `ELSE`, `END`, etc.)
- View names extracted by `dictionaryViews`
- Tokens shorter than 4 characters (excluding table aliases like `c`, `s`, `q`)
- Column candidates explicitly following a dot alias (e.g. `c.validate` -> `VALIDATE`)

### 3. Replace Test-Fitted Rules with General Matching
Replace `word === column + "_X" || word + "D" === column` with:
1. **Normalized equality:** `normalized(word) === normalized(column)` (handles `SQL_FULL_TEXT` vs `SQL_FULLTEXT`).
2. **Stem / prefix matching on identifiers $\ge 5$ characters:**
   If $\min(\text{length}(word), \text{length}(column)) \ge 5$:
   `column.startsWith(word) || word.startsWith(column) || normalized(column).startsWith(normalized(word)) || normalized(word).startsWith(normalized(column))`
   (handles `VALIDATE` vs `VALIDATED`, and words sharing a stem).
3. **Common stem matching for eval cases like `PARSES` vs `PARSE_CALLS`:**
   Candidate words and column names that share a common prefix of $\ge 5$ characters (e.g., `PARSE`).
4. **Bounded Levenshtein distance ($\le 2$) for words $\ge 5$ characters:**
   Provides general tolerance for minor spelling errors.

### 4. Update Documentation and Unit Tests
- In `docs/wp-q-error-hints.md`, remove references to the `_X` typo rule and document the general stem/prefix/edit-distance matching and keyword filtering.
- In `tests/unit/query-error-hints.test.ts`, add test cases for:
  - `PARSES` matching `PARSE_CALLS` on `V$SQL`
  - Table aliases (e.g. `s`, `c`) and keywords (e.g. `SELECT`, `WHERE`) NOT being matched as close column names
  - A view with no close matches rendering column list without a `close matches:` segment
  - Multi-view hint formatting where multiple views appear in the hint body

---

## Verification Results

Pre-review local test suite execution:
- `npm run typecheck`: passed
- `npm test`: 14 files passed, 291 tests passed
- `node --env-file=.env ./node_modules/.bin/vitest run tests/integration/query-error-hints.test.ts`: 6 tests passed against `d1-19c-lab` and `p1-19c-prod`
