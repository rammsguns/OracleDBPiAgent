# WP-32B — reproducible scale and probe footprint

Branch: `wp-32b-footprint`. Scope: Phase 32 footprint work only; no LLM calls.

Built:

- `lab/c1/scale.sql` and `scale.sh`: OS-authenticated SYS setup restricted to
  oracle19c-cdb/PIPDB1. Creates BULK_DATA/BULKAPP and the requested object/cursor
  workload. Existing objects, data, statistics and scheduler definitions are kept.
  Repeated live runs completed successfully.
- `src/oracle/observability.ts` and collector entry wrappers: MODULE=piagent,
  command/tool ACTION, retaining the outer action through nested collectors.
  Sessions created by an external caller start with action=query and acquire the
  collector action on its first query. Cursor MODULE/ACTION identifies the first
  parse; measurement uses unique SQL tags to avoid ambiguity across shared cursors.
- Optional concrete-provider instrumentation captures statement text, client
  execute time and Oracle failure code without binds. It is unused by normal
  product calls. No shared contract changed.
- PUBLIC-grant predicates split into disjoint SYS/application cases, and account
  object counts restricted to the application owners consumed by that check.
- `src/top/snapshot.ts`: provider-private fixed SQL snapshot capability, retaining
  the existing 10,000-row cap while eliminating repeated OFFSET scans/sorts.
  Ordinary `OracleSession.query` limits and third-party adapter behavior remain.
- `tests/helpers/footprint.ts`, `measure-footprint.ts`, `render-footprint.ts`:
  repeatable sequential measurement and documentation with per-statement elapsed,
  CPU, gets, physical reads, parses and rows; C1 SYS observation, d1/p1 RO observation.
- `tests/integration/footprint.test.ts`: all command elapsed/get budgets on C1,
  exactly two top snapshot executions, and old/new security SQL row equivalence on
  all three targets. Dependency outages skip with an explicit reason; observer
  failures fail rather than producing a zero-cost pass.
- [Footprint report](footprint.md), [final ledger](footprint-results.json) and
  [baseline ledger](footprint-baseline.json).

Live lab operations and corrections:

The coordinator's views use even table suffixes and procedures use multiples of
five. An initial verification using consecutive suffixes created additional
views/procedures. Only those newly created objects were removed, verified by
creation time; the script was corrected and subsequent runs were no-ops. Final
counts: 1,502 tables, 750 views, 300 generated procedures plus CURSOR_CHURN, 3,004
indexes, and 401 table plus 401 index partitions. All BULKAPP objects remained
VALID. No SHOPAPP objects or d1/p1 data were changed.

The first integration run found that BULK_DATA was not covered by the coordinator's
older level-0 backup. A new `backup incremental level 0 pluggable database PIPDB1`
and `backup archivelog all` completed through OS-authenticated RMAN in
oracle19c-cdb. No containers or Strata services were restarted or reconfigured.
No credentials or container environment were displayed; Docker output handling
filters ORACLE_PWD.

Validation results are recorded below after the final runs. An intermediate full
unit run caught the fixed top SQL being located under oracle/ rather than top/:
the preflight catalog correctly required its V$SQLSTATS grant to belong to the
collector feature. Moving the capability into top/ resolved the catalog failure;
its 48 targeted catalog/top tests passed.

Contract changes required: none. No changes to contracts.ts, package.json or
PLAN.md; no dependencies added. SQL remains Oracle 19c read-only on product paths.
No push, merge, rebase or PR.

Limitations: these are bounded live snapshots with fresh tagged cursors, not a
production load certification. Arbitrary run_query SQL/input-dependent error
hints and missing-grant branches not encountered are not exhaustively measured.
Fresh-lab creation was reviewed but not run on an empty PDB, to preserve the
existing seeded workload. Idempotency was verified on the existing scaled C1.

Validation completed:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 143 files, 2,821 tests passed (107.49 s, exit 0).
- Targeted footprint integration: 14 tests passed (88.66 s), including the C1
  budget checks and security equivalence on C1/d1/p1.
- Live measurement: 81 command/tool/variant runs recorded; no run-level errors.
  Final top snapshots executed twice per command on every target. d1 wall time
  fell from 34.4 s to 7.7 s, database elapsed from approximately 28.4 s to 2.1 s
  including setup; results still explicitly mark a 10,000-row cap as partial.

Changed source files: `src/oracle/index.ts`, `src/oracle/observability.ts`,
`src/top/index.ts`, `src/top/snapshot.ts`, `src/security/sql.ts`,
`src/tools/index.ts`, `src/tools/healthCheck.ts`, and `index.ts` in `src/alertlog`,
`src/backup`, `src/check`, `src/drift`, `src/jobs`, `src/preflight`, `src/report`,
`src/security`, `src/sessions`, and `src/space`. Other changed files are the lab
scripts/README, the three footprint helpers, the integration test,
`tests/unit/oracle-observability.test.ts`, and the four footprint documents/data
files linked above.

Full integration command:

```sh
PIAGENT_TARGETS_FILE="$PWD/config/targets.json" \
PIAGENT_SECRET_DIR=/private/secrets \
  npm run test:integration -- \
  --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

Result: **41 files passed, 1 failed; 109 tests passed, 1 failed, 1 skipped**
(589.43 s). The excluded test is the Strata end-to-end ask. The only failure is
`c1-seed.test.ts`: it expects exactly 133 object grants from this branch's PDB
grant template, while live C1 now has 136. SYS inspection identified the three
additional SELECT grants as `SYS.V_$ARCHIVE_GAP`, `SYS.V_$MANAGED_STANDBY` and
`SYS.V_$DATAGUARD_STATS`. These were not added by this WP and are consistent with
concurrent standby work. They were preserved. The coordinator needs to reconcile
the standby grant template/test with WP-32C; this is not a product-contract change.

Final adapter review also caught that top's CLI/web/triage paths wrap sessions for
audit and cancellation. The fixed snapshot now travels through `session.query`
with a private fixed-SQL capability and recognizes the original identity through
these wrappers. It does not bypass their audit or cancellation handling. A unit
regression covers the wrapper and the absence of a capability on ordinary queries;
the C1 budget harness now explicitly uses an audit adapter for top.

After the final adapter fix, the affected integration run passed **3 files / 17
tests** (157.31 s): `footprint.test.ts`, `top.test.ts`, and `c1-pdb-live.test.ts`.
This includes the audited top path, all C1 budgets, all three targets' security
row-equivalence checks, and the existing C1 all-web-tabs test. Final typecheck
passed, and the final complete unit run passed **143 files / 2,821 tests**
(107.49 s, exit 0). The full-suite grant-inventory mismatch above remains an
external lab/template coordination item; no grants were revoked to hide it.
