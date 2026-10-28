# WP-L compact describe_object

`describe_object` now renders four sections with short per-section headers instead
of repeating the kind and NULL placeholders on every row. Constraint and index
columns are folded into their parent line as comma-separated `position:name`
pairs sorted by position. Column position, name, datatype and data length;
constraint name, type and status (with `child_columns(position:name)`); index name, uniqueness and status; and table
NUM_ROWS/LAST_ANALYZED are all retained. NULL statistics remain explicit.
Orphan dictionary column rows remain visible with their kind and parent name.
An empty result says `No metadata rows.`

The bound, single read-only UNION ALL query is unchanged. Folding in TypeScript
rather than LISTAGG avoids Oracle VARCHAR2 aggregation limits entirely: long
lists cannot cause ORA-01489. Untruncated raw `details`, SQL hash, fallback paths and the built-in foreign-key
resolution note remain unchanged. The describe byte limiter first renders all
entities from the full raw rows, then drops whole trailing entities until the
complete JSON result fits. A constraint or index is retained with every child
column or omitted entirely; raw details remove the same parent and children
atomically. Every affected section reports `N more not shown [truncated]`, even
when all its entries are omitted, and the overall `[truncated]` marker and
`details.truncated: true` remain. Audit row counts reflect retained raw rows.
A cap too small to retain section disclosures throws instead of silently dropping
them. If the database row cap has already truncated metadata, constraint and index
entities are conservatively omitted because their child lists may be incomplete.
The model receives `content`; details retain the original tagged representation
for retained entities. Other tools use the unchanged generic byte limiter.
No shared contract changes or dependencies are needed.

## Read-only measurements

Measured 2026-10-27 against the configured 19c targets with approved read-only
accounts. Each tool result's identical raw details were rendered with the old
generic `boundedResult` renderer and the new describe renderer; sizes below are
UTF-8 bytes of `content[0].text` (not JSON or token estimates). Default limits:
200 rows and 16,384 total result bytes. All five results were untruncated. Remeasured after review fixes on the same day;
the clarified child-column header adds six bytes per result.

| Target | Table | Before bytes | After bytes | Reduction |
|---|---|---:|---:|---:|
| d1-19c-lab | SH.SALES | 2,121 | 1,015 | 52.1% |
| d1-19c-lab | SH.CUSTOMERS | 3,408 | 1,788 | 47.5% |
| d1-19c-lab | SH.PRODUCTS | 3,447 | 1,777 | 48.4% |
| p1-19c-prod | SHOPAPP.ORDERS | 1,254 | 683 | 45.5% |
| p1-19c-prod | SHOPAPP.ORDER_LINES | 1,406 | 708 | 49.6% |

Total: 11,636 → 5,971 bytes, 48.7% smaller. SHOPAPP NUM_ROWS and LAST_ANALYZED
are dictionary statistics, not live counts. No LLM calls, evals or optimizer runs
were made; Strata A/B remains the coordinator's work.

## Verification

Unit coverage checks every field, ordered composite columns, lists exceeding
4,000 characters, orphan metadata, explicit NULLs, unchanged raw details, byte
truncation disclosure, binds, audit and the unchanged FK note. Review regression
tests assert exact truncated output and raw details for each section, including
partly retained sections, composite PK/index integrity, total JSON byte caps,
`details.truncated`, refusal of impossibly small caps, database row-cap safety,
and byte-for-byte generic tool output (full and truncated).
Integration coverage compares describe text with independent dictionary SELECTs
for SH.SALES, SH.CUSTOMERS and SHOPAPP.ORDERS, including all PK/FK and index
column positions. SH.SALES has no primary key; PK assertions apply to CUSTOMERS
and ORDERS, and FK assertions apply to all three.

Final checks (Node 24.18.1, dependencies installed with `npm ci --ignore-scripts`):

- `npm run typecheck`: PASS.
- `npm test`: PASS, 11 files / 264 tests.
- With `.env` path settings exported,
  `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  PASS, 4 files / 12 passed / 1 skipped (LLM end-to-end excluded by filter).
- `git diff --check`: PASS.

Review-fix changed files: `src/tools/index.ts`,
`tests/unit/compact-describe.test.ts`, and this report. The existing integration
test file remains unchanged in this round.
No contract changes requested. Model answer quality/token counts have not been
verified because this WP explicitly excludes LLM calls; the coordinator owns A/B.
