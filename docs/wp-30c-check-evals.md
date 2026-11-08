# WP-30C-CHECK-EVALS

Added eight Phase 30 challenge cases, four per approved lab, in
`evals/cases-hard/phase30-check.json`. Seven use independent read-only
`rowCells` ground truth; one refuses password changes without tool calls.
Questions leave tool choice open and name neither tools nor the check command.

Coverage: open default-password account names and critical verdict driver;
non-Oracle-maintained invalid objects plus unusable index/partition/subpartition
units; nearest unlocked application-account expiry range; failed scheduler runs
in the previous complete UTC calendar day; fullest permanent tablespace by
maximum capacity including autoextend; recovery-area configuration and inability
to infer healthy zero usage; NOARCHIVELOG gap-check applicability; password-write
refusal. Expiry and utilization use explicit bounded categories rather than
inventing a numeric-tolerance extension to the shared eval contract. Completed
UTC windows avoid nightly jobs entering/leaving a rolling window during an ask.
The fullest tablespace uses metrics with allocated-minus-free fallback, matching
the existing space collector.

`evals/validate-hard.ts` validates the eight-case shape and lab balance, rejects
hinted tools/views, secret/free-text/Pack truth columns, setup queries, silent
empty-truth skips, and executable refusals. Live recovery/archive applicability
premises fail closed if lab configuration changes. The existing sequential truth
validator invokes these checks. `tests/unit/wp30c-check-evals.test.ts` covers
structure, mutation rejection, changed live premises and positive/negative scorer
examples. `tests/unit/hard-evals.test.ts` updates suite/refusal counts to 164/21.

Live truth verification (2026-11-07): all seven SELECTs passed sequentially using
the product session provider and packaged `config/targets.json`, with credentials
read by the product from PIAGENT_SECRET_DIR. Results:

- d1 default-password accounts: HR, IX, OE, PM, SH.
- p1 maintenance count: 0.
- d1 nearest expiry: OVER 14 DAYS.
- p1 failed runs in previous complete UTC day: 0.
- d1 fullest permanent tablespace: SYSAUX, LOW (below 50% of maximum).
- p1 recovery area: UNCONFIGURED.
- p1 archive mode: NOARCHIVELOG.

No evals or LLM calls were run; no Strata key file was read. No product code,
shared contracts, package manifest, dependencies or PLAN changes are required.
Browser tests are not applicable: no web code changed. Live CDB/PDB behavior and
model answers remain unverified; the coordinator owns the LLM gate.

## Test results

Dependencies were initially absent (`tsc: not found`). Installed the existing
lockfile with `npm ci --ignore-scripts` (136 packages, 0 vulnerabilities), without
manifest/lockfile edits. Subsequent `npm run typecheck` passes.

Focused tests: 2 files passed, 9 tests passed (932 ms), including all five new
WP-30C tests and four existing hard-suite tests.

Required full checks:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

npm test -- --maxWorkers=2
Test Files  136 passed (136)
Tests       2555 passed (2555)
Duration    93.92s

PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
Test Files  36 passed (36)
Tests       80 passed | 1 skipped (81)
Duration    441.83s
```

The skipped test is the explicitly excluded end-to-end Strata ask.
