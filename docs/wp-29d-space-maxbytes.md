# WP-29D: space MAXBYTES clarification

Built on branch `wp-29d-space-maxbytes`.

## Evidence

Read `AGENTS.md`, `PLAN.md` Phase 29, the case in
`evals/cases-hard/phase24-space.json`, and matching answers/toolResultTexts
in phase25-27 and phase23 archives. The phase23 gate record
`2026-11-06T16-03-55-312Z-695391b9-a7ac-487f-a70e-3a4fff340a78.json`
used `GREATEST(BYTES, MAXBYTES * (BYTES/BLOCKS))`. It inflated
34359721984 bytes to 281474842492928 and 4294967296 to 35184372088832:
MAXBYTES was mistaken for blocks and multiplied by 8192. The other nine
matching archived records use the correct byte totals.

## Files and exact tool text change

- `src/tools/index.ts`: append an existing-style `sourceNote` footer for primary
  `tablespace_usage` results and `run_query` SQL mentioning MAXBYTES and a
  DBA/ALL/USER_DATA_FILES or TEMP_FILES view. Existing source disclosures take
  precedence, including the metrics fallback (whose capacities are converted
  from blocks correctly). No extra SQL, changed SQL, new tool, or description
  changes. Numeric rows, columns, limits and shared space consumer structures
  are unchanged. The optional sourceNote is also present in tool details.
- `tests/unit/tools.test.ts`: verify both routes, fixed/autoextend numeric
  evidence preservation, tempfiles, and no guidance on unrelated queries.
- `tests/integration/oracle.test.ts`: primary tablespace output now expects the
  explanatory note; other primary tools still have no sourceNote.
- `docs/wp-29d-space-maxbytes.md`: this report.

The exact added footer is:

> Note: BYTES and MAXBYTES are bytes, not blocks; never multiply by BLOCK_SIZE. AUTOEXTENSIBLE=NO means autoextend OFF: capacity is current BYTES; MAXBYTES=0 means no autoextend limit applied, not zero capacity or unlimited growth. YES means ON: capacity is GREATEST(BYTES,MAXBYTES). Sum per tablespace. Smallfile limits depend on block size: at 8 KiB, the per-file cap is about 32 GiB (34359721984 bytes), not 32 TiB; bigfile limits differ.

This is deliberately limited to agent space output; the space CLI, web, report,
collector and their calculations are untouched. A query that already computed
incorrect units still returns its actual evidence, with a note allowing the
model to notice and retry; no numeric result is silently repaired.

## Validation

- `npm run typecheck`: PASS (`tsc -p tsconfig.json --noEmit`, exit 0).
- `npm test -- --maxWorkers=2`: PASS, 128 files / 2387 tests; 83.20 s.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`:
  PASS, 35 files / 78 tests passed, 1 skipped (Strata e2e); 439.22 s, exit 0.
  The initial run had 77 passed / 1 failed / 1 skipped: the primary-output
  assertion described above. Corrected it and reran the entire suite.
  Both allowed lab targets were exercised; the existing non-19c gate-only
  test exercised the explicitly permitted refusal target.
- `git diff --check`: PASS.

## Contracts and unverified behavior

No contract changes, dependencies, grants or coordinator edits needed.
No Strata calls made. Model improvement is unverified pending the coordinator's
gated A/B. No new live-PDB behavior is claimed. Dependencies were supplied by the
requested ignored `node_modules` symlink to `../needlefish/node_modules`.

## Antigravity review follow-up

Addressed the Minor and inexpensive comment/literal Info from
`review-wp-29d-space-maxbytes/docs/review-wp-29d-space-maxbytes.md`:

- `src/space/queryNote.ts`: small identifier matcher for already policy-validated
  SQL. Skips line/block comments, ordinary strings (including escaped quotes),
  and Oracle alternative-quoted strings. Preserves quoted identifiers. Matches
  MAXBYTES with DBA/ALL/USER/**CDB** DATA_FILES or TEMP_FILES identifiers.
- `src/tools/index.ts`: use that matcher for the existing run_query note trigger.
  The exact note text above, tablespace_usage behavior, SQL execution and
  numeric evidence remain unchanged.
- `tests/unit/tools.test.ts`: add CDB data/temp and quoted-identifier positives;
  nine negatives for comments, ordinary/alternative strings, view names only
  in prose and identifier suffixes.

Follow-up validation:

- `npm run typecheck`: PASS, exit 0.
- `npm test -- --maxWorkers=2`: PASS, 128 files / 2399 tests, 81.09 s,
  exit 0. Output included `context canceled` but all test files/tests passed.
- `git diff --check`: PASS.
- Integration was not rerun for this SQL-text matching-only follow-up; the
  original integration results above remain the latest DB verification.

No contract changes or dependencies. No DB or Strata calls in this follow-up.
CDB note matching is verified with stubs; live CDB/PDB behavior and model A/B
remain unverified.
