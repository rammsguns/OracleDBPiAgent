# WP-L compact describe_object

`describe_object` now renders four sections with short per-section headers instead
of repeating the kind and NULL placeholders on every row. Constraint and index
columns are folded into their parent line as comma-separated `position:name`
pairs sorted by position. Column position, name, datatype and data length;
constraint name, type and status; index name, uniqueness and status; and table
NUM_ROWS/LAST_ANALYZED are all retained. NULL statistics remain explicit.
Orphan dictionary column rows remain visible with their kind and parent name.
An empty result says `No metadata rows.`

The bound, single read-only UNION ALL query is unchanged. Folding in TypeScript
rather than LISTAGG avoids Oracle VARCHAR2 aggregation limits entirely: long
lists cannot cause ORA-01489. Raw `details`, SQL hash, audit row counts, fallback
paths and the built-in foreign-key resolution note remain unchanged. The existing
byte limiter still removes raw rows from the end and rerenders, marking the
result `[truncated]`; no independent list clipping or silent overflow is added.
The model receives `content`; details retain the original tagged representation.
No shared contract changes or dependencies are needed.

## Read-only measurements

Measured 2026-10-27 against the configured 19c targets with approved read-only
accounts. Each tool result's identical raw details were rendered with the old
generic `boundedResult` renderer and the new describe renderer; sizes below are
UTF-8 bytes of `content[0].text` (not JSON or token estimates). Default limits:
200 rows and 16,384 total result bytes. All five results were untruncated.

| Target | Table | Before bytes | After bytes | Reduction |
|---|---|---:|---:|---:|
| d1-19c-lab | SH.SALES | 2,121 | 1,009 | 52.4% |
| d1-19c-lab | SH.CUSTOMERS | 3,408 | 1,782 | 47.7% |
| d1-19c-lab | SH.PRODUCTS | 3,447 | 1,771 | 48.6% |
| p1-19c-prod | SHOPAPP.ORDERS | 1,254 | 677 | 46.0% |
| p1-19c-prod | SHOPAPP.ORDER_LINES | 1,406 | 702 | 50.1% |

Total: 11,636 → 5,941 bytes, 48.9% smaller. SHOPAPP NUM_ROWS and LAST_ANALYZED
are dictionary statistics, not live counts. No LLM calls, evals or optimizer runs
were made; Strata A/B remains the coordinator's work.

## Verification

Unit coverage checks every field, ordered composite columns, lists exceeding
4,000 characters, orphan metadata, explicit NULLs, unchanged raw details, byte
truncation disclosure, binds, audit and the unchanged FK note.
Integration coverage compares describe text with independent dictionary SELECTs
for SH.SALES, SH.CUSTOMERS and SHOPAPP.ORDERS, including all PK/FK and index
column positions. SH.SALES has no primary key; PK assertions apply to CUSTOMERS
and ORDERS, and FK assertions apply to all three.

Final checks (Node 24.18.1, dependencies installed with `npm ci --ignore-scripts`):

- `npm run typecheck`: PASS.
- `npm test`: PASS, 11 files / 255 tests.
- With `.env` path settings exported,
  `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  PASS, 4 files / 12 passed / 1 skipped (LLM end-to-end excluded by filter).
- `git diff --check`: PASS.

Changed files: `src/tools/index.ts`, `tests/unit/compact-describe.test.ts`,
`tests/integration/compact-describe.test.ts`, and this report.
No contract changes requested. Model answer quality/token counts have not been
verified because this WP explicitly excludes LLM calls; the coordinator owns A/B.
