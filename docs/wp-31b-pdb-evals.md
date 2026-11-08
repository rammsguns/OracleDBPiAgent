# WP-31B: PDB evals

Built on wp-31a-pdb-live, branch wp-31b-pdb-evals. All live queries used
PDB-local PIAGENT_RO through the product session provider on localhost:1524/PIPDB1.
Passwords stayed in PIAGENT_SECRET_DIR. No LLM calls or database changes.

Eleven cases in `evals/cases-hard/phase31-pdb.json` form the independent `pdb`
split: container identity, scope, backup age/archive mode, failed job/error,
invalid objects/unusable partitions, stale table statistics, SHOP_DATA headroom,
customer count, scheduler inventory, broad health and an open-mode refusal.
Ten cases have runtime SELECT-only rowCells truth; the refusal permits no calls.
No answer is tied to a particular prose layout. Age and free-space bands avoid
second-level timing and workload drift. Truth retains all matching stale tables,
invalid objects and unusable partitions rather than assuming only one forever.

The broad-health truth selects failed-job names and invalid-object names from
the database. Facts require failed-job and maintenance descriptions, with a
negation-aware forbiddenClaims pattern guarding unqualified healthy verdicts.
Adversarial unit tests include unrelated negations before a false verdict,
contradictory verdicts, qualified/component verdicts, vertical values, missing or
wrong problem names, and refusal behavior. The integration cross-checks the
health engine's failedJobs/maintenance WARN or CRIT states, establishing the
connection to `piagent check` without deriving expected names from model output.

Runner/type changes add `pdb` to the eval-local split union and argument parsing.
The hard validator accepts c1 only on this split, checks its shape and SELECT
policy, and excludes this independent category from dev/holdout balance rules.
Historical count/hash tests exclude the new split where measuring prior cases;
the complete suite and refusal totals include it. Existing cases are unchanged.
No shared `src/contracts.ts`, package metadata, dependencies or product code changed.
No coordinator contract changes are needed.

Live validation executes every truth query, so Oracle parses each query and
checks PIAGENT_RO access. All must yield nonempty, non-null, untruncated rows;
there are no intended-empty truths. Missing dependency skips are explicit;
SQL and fixture errors fail closed. The seed's deliberate defects must remain
present; the live workload may add other problems. RMAN per-file metadata can
be visible when job details are hidden; it cannot prove media/restore validity.

Changed files: the case JSON; `evals/run.ts`, `evals/types.ts`,
`evals/validate-hard.ts`; `tests/unit/wp31b-pdb-evals.test.ts`,
`tests/unit/hard-evals.test.ts`, `tests/unit/phase8-evals.test.ts`,
`tests/unit/phase11-challenge.test.ts`;
`tests/integration/wp31b-pdb-truth.integration.test.ts`;
`docs/evals-hard.md` and this report.

Validation results are recorded below after the final runs. This checkout had
no node_modules; checks used an ignored symlink to WP-31A's installed dependencies.
The coordinator owns the fresh model gate:
`npm run eval -- --suite evals/cases-hard --split pdb`.

Final validation:

```text
npm run typecheck
PASS (exit 0)
npm test -- --maxWorkers=2
Test Files 142 passed (142)
Tests 2703 passed (2703)
PIAGENT_SECRET_DIR=… npx vitest run tests/integration/wp31b-pdb-truth.integration.test.ts --no-file-parallelism
Test Files 1 passed (1)
Tests 1 passed (1); all ten truth SELECTs executed live, no skips
```

The new unit file contributes 27 tests. The live test also confirms USER is
PIAGENT_RO and CON_NAME is PIPDB1. No full integration suite was invoked to
completion because it includes LLM tests; this session ran only the requested
C1 truth integration and no model gate. Model answer quality remains unverified
until the coordinator runs the `pdb` gate.
