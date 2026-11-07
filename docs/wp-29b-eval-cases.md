# WP-29B eval repairs

Branch: `wp-29b-eval-cases`. No product, scorer, contract, dependency or grant changes. No LLM calls.

## Findings and repairs

- d1 has no explicit directory-object grants to PUBLIC. The old row-list truth was therefore empty, legitimately causing a skip. Keep the exposed `hard-p21-public-directory` as a dev count question (truth 0), and add blind holdout `hard-p21-schema-directory-grants`, listing SH directory privileges discovered from the lab dictionary. Neither can silently skip.
- The reported p25 empty truth cannot be reproduced in this checkout: the existing scalar-subquery/DUAL inventory query returns exactly `V$SGA_DYNAMIC_COMPONENTS, unavailable` through both readers, and the committed baseline snapshot already records that row. The case has no `skipWhenTruthEmpty`. Direct p1 probes confirm ORA-00942 for this view and V$SGASTAT; d1 can read both. Keep the exposed component case as dev and add a fresh blind runtime pool/allocation inventory holdout against V$SGASTAT. Both validators require the actual access denial, rather than relying on dictionary absence alone. No agent answers or gated-run archives were inspected to write either replacement.
- Product sessions set CURRENT_SCHEMA and UTC, but do not set MODULE/ACTION. Thus p1 diagnostic cursors have parsing schema SHOPAPP while their parsing login is HARNESS_RO. The real price workload parses as SHOPAPP, module DBMS_SCHEDULER, action PLACE_ORDERS_JOB. Price/p19 discovery and child-level evidence now require PARSING_USER_ID resolving to SHOPAPP. Statistics plan objects also join the eligible child cursor, preventing another login's child for the same SQL_ID from leaking in.
- p1 has no SHOPAPP-login ORDERS/ORDER_LINES SELECT in the observed cache. Excluding HARNESS_RO outright makes the old seeded plan cases empty. These two cases retain their authorized read-only SELECT setup, now with dedicated `piagent_eval_plan_orders` / `piagent_eval_plan_order_lines` comments and exact SQL_TEXT plus HARNESS_RO parsing-login filters in both selection levels. These select only evaluator seeds; product/triage cursors, including CHILD_ROWS and generic count SQL, cannot match. The prompt supplies the selection rule and still requires SQL_ID/child discovery and cached access-path interpretation. No cursor IDs are pinned. The evaluator seed is deliberately the sole diagnostic-login exception.
- p19 object statistics grade PRESENT/MISSING last-analyzed metadata rather than the exact second, retaining stale-statistics evidence while tolerating nightly timestamp updates. Missing timestamps now produce explicit non-null truth. Existing cache-miss skips remain for genuinely transient p19 workload eviction.

## Files

- `evals/cases-hard/{cached-plan,phase19-sqlperf,phase21-holdout,phase25-blind-holdout}.json`: repaired cases and blind replacements.
- `evals/validate-hard.ts`: parsing-login/isolated-seed checks, statistics stability checks, fail-closed dictionary premises, exposed-versus-blind split checks.
- `evals/hard-ground-truth-validation.json`: refreshed changed case records only, added replacement truth, removed PUBLIC's obsolete skip; all unrelated records retained byte-for-byte as JSON values. Header describes the current full-suite validation (156 cases); previous header was stale at 144.
- `tests/fixtures/wp29b-previous-cases.json`: frozen exposed originals for coordinator replay, checksum protected by tests.
- `tests/unit/wp29b-eval-cases.test.ts`: regression tests for login filtering, seed isolation, timestamp stability, skips, blindness, denial handling and frozen originals.
- `tests/unit/{hard-evals,phase11-challenge,wp25d-premises}.test.ts`: updated suite counts, historical-case reconstruction and the p25 checksum/holdout identity. Historical phase11 checksum remains unchanged.
- `docs/wp29b-live.ts` and `docs/wp29b-live.json`: reproducible independent-reader checks, lab metadata and both p25 validator results. Uses packaged lab targets only and never imports LLM runtime.

## Verification

All DB commands used `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`, only the packaged lab read-only accounts, and sequential SELECT probes. The standard integration gate test alone may connect to the explicitly permitted FREEPDB1 refusal target.

- `npm run typecheck`: PASS, no diagnostics.
- `npm test -- --maxWorkers=2`: PASS, 129 files / 2,390 tests, 83.88 s.
- `validateHardCases()` after final SQL edits: PASS, 127 ground-truth queries / 156 cases, 0 skipped, both labs.
- `PIAGENT_SECRET_DIR=… node_modules/.bin/tsx docs/wp29b-live.ts`: PASS, 11 changed cases through the independent eval reader; directory/cursor/memory access probes and `validateP25` on both labs. See `docs/wp29b-live.json`.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`: PASS, 35 files / 78 passed / 1 skipped (the excluded Strata end-to-end test), 428.30 s.
- `git diff --check`: PASS.

During development the suite caught legacy cardinality, split and checksum assumptions; those tests now reconstruct frozen historical inputs or assert the intended current suite. The final full unit run above is clean.

## Contract needs and unverified work

No contract changes needed. Coordinator owns gated LLM evals and final A/B scoring with WP-29A; neither was run here. Historical p25 empty truth remains unexplained because it does not occur with the current case or either current reader, and the archived gate files are absent from this worktree. No live 19c PDB is available for validation. Dedicated seed cursors may age out; the case retains its discovery retry instruction. These changes never execute a discovered workload statement.
