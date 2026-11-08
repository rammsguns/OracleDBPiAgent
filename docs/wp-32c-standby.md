# WP-32C: standby awareness

Branch: `wp-32c-standby`, based on master. Oracle 19c only; no LLM calls,
container restarts or Data Guard reconfiguration.

## Delivered

- Session-cached V$DATABASE role, open mode, unique name and protection mode.
  Identity objects let audited wrappers share one detection. Check scopes,
  backup/space output, jobs notes and health_check text disclose the role.
- Standby archive-gap analysis combines V$ARCHIVE_GAP and current-incarnation,
  per-thread RFS received sequence continuity. Duplicate and copied primary
  history are excluded; deleted received files do not imply an apply gap.
  A positive apply-gap row remains critical even if received history is hidden.
  Primary restore-chain checks retain their checkpoint/media semantics.
- `dgLag`: maximum transport/apply seconds, WARN 300 / CRIT 1800, configurable
  with existing threshold, disable and unknownAs rules. Running visible MRP0
  and both measurements are required; missing evidence is UNKNOWN. Primary is
  explicitly OK/not applicable.
- Standby backupAge is UNKNOWN rather than trusting copied full/level-0 dates.
  Backup reports preserve the visible evidence and explain primary backups.
  Scheduler history and maintenance status retain measured severities with
  explicit replicated-primary notes.
- Packaged `c1s-19c-stby`, including approved identity, web selectors and server
  allowlists. The two server allowlist changes may overlap WP-32A; keep the
  configured-target validation if that WP removes the literal lists.
- Minimal SELECT grants and preflight coverage for V_$ARCHIVE_GAP,
  V_$DATAGUARD_STATS and V_$MANAGED_STANDBY. V_$DATABASE was already granted.
  Applied the three grants as SYS on primary C1/PIPDB1; confirmed replication.

## Root cause and live evidence

C1S contained SRMN duplicate sequences 32 and 33 marked DELETED=YES, followed
by sequence 34 registered by RFS. The old collector used backup checkpoints
and copied log history to demand pre-creation archives on the standby. It
reported one range even though V$ARCHIVE_GAP was empty and primary transport
reported NO GAP. With the received-redo baseline, archiveGaps is OK, zero.

C1S role is PHYSICAL STANDBY, READ ONLY WITH APPLY, DB_UNIQUE_NAME CDB19S,
MAXIMUM PERFORMANCE. Backup and space CLI JSON label it correctly. Check
backupAge is UNKNOWN with the primary-backup/copy warning; failedJobs and
maintenance disclose replication. Primary roles on C1, d1 and p1 were verified.

**Verification exception:** the requested live `dgLag OK` assertion cannot be
supported by this PDB's evidence. Root V$DATAGUARD_STATS reports zero apply lag,
but PIPDB1 returns NULL for apply lag, including when queried as SYS using OS
authentication. Transport lag is zero and MRP0 is APPLYING_LOG. Neither CON_ID=0
nor GV$ changes the PDB value. The product correctly returns UNKNOWN rather
than manufacturing zero from transport lag/open mode. The integration test
asserts OK when both measurements exist, otherwise UNKNOWN; unit tests prove
zero lag produces OK. No root login or privileged product path was introduced.

## Files

Product: `src/backup/{index,sql,role}.ts`, `src/check/{index,config}.ts`,
`src/space/index.ts`, `src/jobs/index.ts`, `src/tools/healthCheck.ts`,
`src/preflight/views.ts`, `src/config/approvedTargets.ts`, `config/targets.json`,
`src/web/server.ts`, `src/web/static/{panel,drift}.js`.

Tests: new unit standby and integration C1S suites, check/backup/space/health
regressions, C1 target test, browser Check/Drift assertions, and existing
packaged-target counts/messages/prompt fixture updated for the fourth target.
Docs: check, real-targets, grants-template-pdb, lab/c1/README and this report.

No change requested to `src/contracts.ts`, package.json or PLAN.md. Local module
interfaces add `dgLag` thresholds/check name, backup `archiveGap` evidence and an
optional space `role` string; shared contracts remain unchanged. No dependencies added.

## Validation

- `npm run typecheck`: PASS.
- `npm test -- --maxWorkers=2`: 143 files, 2,826 tests PASS.
- `npm run test:browser`: 89 PASS, 7 skipped. Restored generated docs/img.
- Browser Check standby scope regression: 6 PASS.
- Dedicated C1S live integration: 1 PASS, including primary-role regression.
- Full integration suite with
  `--testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  103 PASS, 3 FAIL, 1 skipped in 42 files (594.92 seconds). The three failures
  were stale test assumptions: two backup assertions expected 13 evidence
  sections / an unprefixed scope; the new standby dictionary test selected the
  d1 HR fixture. Corrected them and reran both affected files: **8/8 PASS**.
  The full suite was not repeated after these test-only corrections.
- C1 seed grant inventory rerun: **1/1 PASS**, now matching all 136 grants.
  lab/c1/seed.sh already extracts the executable template grants; no duplicate
  grant list exists to update.
- C1S Oracle tools / PDB-hidden LONG-source regression: **2 PASS**, 7 unrelated
  tests filtered out. The existing primary-PDB assertion now applies by actual
  session container identity to both C1 and C1S.
- An earlier standalone drift run was incomplete; a subsequent read-only
  investigation returned complete schema/object comparisons on all four targets,
  and the full integration rerun's drift test passed. No drift code was changed.
- Final focused role/check/backup assertions: **131/131 PASS**. Final full unit
  rerun after the positive-gap correction: **2,826/2,826 PASS**.
- Database password scan of implementation commits and diff: PASS (no values
  printed); no Strata credentials accessed.


## Session result

Implementation and documentation committed in small commits on the assigned
branch. Nothing pushed or merged. No container state/configuration changed;
only the three explicitly authorized SELECT grants were applied to the primary.
Remaining limit: live PDB apply lag cannot establish the requested OK result;
UNKNOWN is intentional and fully documented. No unresolved product/test failure
remains in the checks rerun after correction.

## Antigravity minor follow-up

When standby gaps are proven, the check note now names each missing sequence
range and redo thread, citing V$ARCHIVE_GAP for matching reported ranges or RFS
received-redo continuity for inferred ranges. Proven gaps take precedence over
an absent-baseline explanation; missing-view warnings remain appended.
Regression coverage includes empty and unavailable RFS history with a visible
V$ARCHIVE_GAP range (thread 1, sequences 50–55), both retaining CRIT.

Validation: `npm run typecheck` PASS; affected unit files check, standby and
backup: **132/132 PASS**. No shared contract changes or new live DB verification
needed for this explanation-only correction.
