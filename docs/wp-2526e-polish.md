# WP-25E/26E coordinator smoke polish

Built on branch `wp-2526e-polish` (implementation commits `e0c7455` and `f3bccf9`, `177e22c` for the backup grant expectation test update).

## Changes

- Backup groups overdue or missing full / level 0 backups into one finding with sorted file numbers. The no-backups finding suppresses redundant file findings; PDB visibility safeguards remain in place.
- Restore estimates render as status, bounds, evidence bullets and explanatory prose. NOARCHIVELOG explicitly rules out point-in-time recovery and permits only consistent (cold/mounted) backups.
- Non-CDB backup scope remains `Database-wide (non-CDB)`. The p25 validator now selects the non-CDB label unless container metadata identifies a PDB.
- Jobs renders all nine timestamp columns and window bounds in UTC (`Z`); JSON retains the source zone. All 13 sections use contiguous tables and single spacing, without blank lines between headings and tables.

Files changed: `src/backup/index.ts`, `src/jobs/index.ts`, `evals/validate-p25.ts`, `tests/unit/backup.test.ts`, `tests/unit/jobs.test.ts`, `tests/unit/phase25-evals.test.ts`, `tests/integration/backup.test.ts`, this report, and the eight live captures linked below. Missing dependencies were supplied by the authorized `node_modules -> ../needlefish/node_modules` symlink.

## Live before/after

Captured using the original branch baseline renderers first, then the revised renderers, through the real CLI on both approved labs. Each command pinned `PIAGENT_TARGETS_FILE` to this worktree's `config/targets.json` and used `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`. No LLM calls, RMAN execution, scheduler execution or database writes. Live workload values can change between captures.

### d1-19c-lab

Backup: [Before](wp-2526e-polish/before-d1-19c-lab-backup.md), [after](wp-2526e-polish/after-d1-19c-lab-backup.md).

Jobs: [Before](wp-2526e-polish/before-d1-19c-lab-jobs.md), [after](wp-2526e-polish/after-d1-19c-lab-jobs.md).

Backup findings: 5 high findings before → 1 after. Both captures report `Database-wide (non-CDB).` After: one no-backups finding, readable restore bounds, and the explicit NOARCHIVELOG limit.

Before timestamp example (same retained job timestamps):

```text
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-03T21:30:03.224-07:00 | 2026-11-08T00:00:00.227-07:00 | 8 | 0 |
```

After timestamp example (same retained job timestamps):

```text
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.224Z | 2026-11-08T07:00:00.227Z | 8 | 0 |
```

All 13 Jobs sections are readable. Automated inspection of the after capture found no triple newlines, blank lines splitting tables, or remaining numeric timestamp offsets.

### p1-19c-prod

Backup: [Before](wp-2526e-polish/before-p1-19c-prod-backup.md), [after](wp-2526e-polish/after-p1-19c-prod-backup.md).

Jobs: [Before](wp-2526e-polish/before-p1-19c-prod-jobs.md), [after](wp-2526e-polish/after-p1-19c-prod-jobs.md).

Backup findings: 6 high findings before → 1 after. Both captures report `Database-wide (non-CDB).` After: one no-backups finding, readable restore bounds, and the explicit NOARCHIVELOG limit.

Before timestamp example (same retained job timestamps):

```text
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-03T21:30:03.108-07:00 | 2026-11-08T00:00:00.110-07:00 | 3 | 0 |
```

After timestamp example (same retained job timestamps):

```text
| SYS | BSLN_MAINTAIN_STATS_JOB | TRUE | SCHEDULED | 2026-11-04T04:30:03.108Z | 2026-11-08T07:00:00.110Z | 3 | 0 |
```

All 13 Jobs sections are readable. Automated inspection of the after capture found no triple newlines, blank lines splitting tables, or remaining numeric timestamp offsets.

## Validation

- `npm run typecheck`: PASS (exit 0).
- `npm test -- --maxWorkers=2`: PASS, 115 files, 2,154 tests, 59.01 s. The initial run caught the preflight scanner interpreting natural-language “from this database” as a view reference; the status wording was adjusted and the complete suite rerun successfully.
- Integration: PASS, 32 files, 71 tests passed, 2 deliberately skipped, 260.32 s. The initial run passed 70 tests and failed the stale p1 expectation that backup grants were missing; the owned integration test now requires readable backup evidence on both labs.

Integration command (two deliberate exclusions):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets PIAGENT_TARGETS_FILE="$PWD/config/targets.json" npm run test:integration -- --testNamePattern='^(?!.*(?:answers one end-to-end ask through local Strata|rejects the out-of-scope database at the gate only))'
```

- `git diff --check`: PASS.
- Browser tests: not run; no web changes.

## Contracts and limits

No shared contract edits or coordinator changes required. Report schemas and restore-estimate fields remain unchanged. Grouped backup findings use the single local ID `level0` instead of `level0-<file>`; consumers should use the listed files/detail rather than expect one finding per file. NOARCHIVELOG explanation is included in the existing detail field. Jobs JSON timestamps retain their source zones.

Live candidate recovery bounds and grouped stale-backup findings could not be exercised on these labs because both have no recorded backups and run NOARCHIVELOG; unit fixtures cover grouping, suppression, candidate bounds and PDB restrictions. Live PDB behavior remains unverified. No eval runs or browser tests (no web changes). The integration invocation excludes both Strata e2e and the FREEPDB1 gate test to honor the instruction to connect only to the two labs.
