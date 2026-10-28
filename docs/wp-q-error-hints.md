# WP-Q: run_query error hints

Only failed `run_query` calls change. Successful results, tool descriptions and
other tools stay unchanged. The original Error object, ORA message and first line
are retained; a hint is appended after the original message.

- ORA-00904 / ORA-01747: inspect plain dictionary names in FROM, JOIN and comma
  lists, including nested queries. Recognize ALL_*, USER_*, DBA_*, V$*, GV$*,
  optionally qualified by SYS. Ignore quoted identifiers, other owners, comments
  and literals. This is a conservative tokenizer, not a full SQL parser.
- Query SYS metadata through bound `ALL_TAB_COLUMNS` lookups in COLUMN_ID order;
  map V$SQL to SYS.V_$SQL and GV$SQL to SYS.GV_$SQL. Close matches come first:
  underscore differences, a trailing `_X` typo, and VALIDATE/VALIDATED. These
  heuristics are suggestions, not SQL rewriting; unavailable columns without a
  close match are not invented (for example VERSION_COUNT in V$SQL).
- ORA-00942: for the first DBA_* view, one bound metadata probe reports whether
  ALL_* is visible, with the warning that it covers only objects visible to the
  login. No ORA-00942 hints for user tables.
- ORA-00935: static advice to aggregate in a subquery before aggregating its result.

At most three views are inspected sequentially. Each lookup uses the existing
session, read-only policy and limits, at most 1,000 rows (or the configured row
limit), and at most two seconds (or the configured statement timeout). Column
counts use COUNT(*) OVER () so the omitted count includes unfetched metadata.
Hints are capped at 1,200 characters and preserve COLUMN_ID order within column
lists. Multi-view hints share the space. Lookup failure, timeout, or missing
metadata falls back to the original error; if any lookup fails, no partial hint
is appended. Unsupported syntax may receive no hint.

Each lookup receives its own audit event and SQL hash without bind values or
error text. The final failed tool event keeps the hash of the user's SQL. No
contract changes or new dependencies are required.

## Read-only integration evidence

Both d1-19c-lab and p1-19c-prod produced the following messages on 2026-10-27.
The V$SQL example below abbreviates the column list for this document only; the
actual result ended with `EXACT_MATCHING_SIGNATURE; 27 columns omitted`.

```text
SELECT sql_fulltext_x FROM v$sql WHERE ROWNUM=1
ORA-00904: "SQL_FULLTEXT_X": invalid identifier
Help: https://docs.oracle.com/error-help/db/ora-00904/
Hint: V$SQL close matches: SQL_FULLTEXT; columns: SQL_TEXT, SQL_FULLTEXT, SQL_ID, SHARABLE_MEM, ...; 27 columns omitted

SELECT c.validate FROM all_constraints c WHERE ROWNUM=1
ORA-01747: invalid user.table.column, table.column, or column specification
Help: https://docs.oracle.com/error-help/db/ora-01747/
Hint: ALL_CONSTRAINTS close matches: VALIDATED; columns: OWNER, CONSTRAINT_NAME, CONSTRAINT_TYPE, TABLE_NAME, SEARCH_CONDITION, SEARCH_CONDITION_VC, R_OWNER, R_CONSTRAINT_NAME, DELETE_RULE, STATUS, DEFERRABLE, DEFERRED, VALIDATED, GENERATED, BAD, RELY, LAST_CHANGE, INDEX_OWNER, INDEX_NAME, INVALID, VIEW_RELATED, ORIGIN_CON_ID
```

The exact requested `SELECT validate FROM all_constraints WHERE ROWNUM=1`
returns ORA-00936 (missing expression) on both targets, so it intentionally has
no hint. The coordinator approved asserting this unchanged error and adding the
qualified `c.validate` integration case; product hint codes were not broadened.

Validation:

```text
npm run typecheck: passed
npm test: 14 files passed, 291 tests passed
npm run test:integration -- -t "^(?!.*answers one end-to-end)" --silent=false:
  5 files passed, 18 tests passed, 1 skipped (LLM end-to-end excluded by filter)
```

No LLM calls, evals, optimization runs or database changes were performed.
Strata A/B evaluation remains with the coordinator; retry reduction is unverified.
