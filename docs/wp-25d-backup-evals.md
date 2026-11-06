WP-25D — backup evals and premise migration

Built

Premises were migrated and committed first (15f2eba), before adding the p25 cases. Three existing access-gap cases now use V$SGASTAT / V$SGA_DYNAMIC_COMPONENTS, which remain unreadable on p1 and are outside phase 25–27 proposed grants. Frozen originals and checksums preserve historical comparisons. The exposed archive holdout moved to dev; a fresh runtime-component inventory holdout replaces it. No LLM has seen the replacement. Historical IDs are retained for archive lineage.

Offline replay over ../eval-archive and ../needlefish/evals/results: 635 JSON files, 11,857 answer records, 194 affected records, 188 intentional true-to-false expectation flips, zero unrelated flips. Breakdown: archive case 97, backup regression 47, partial-backup challenge 44. Each flip includes its answer and justification in wp-25d-replay.json. Six affected records already failed. The replay preserves archived tool/truth checks, compares only changed facts/forbidden claims, and does not regrade old answers against new live data. The global scorer is unchanged. See wp-25d-premises.md and reproducible wp-25d-replay.ts.

The phase 26–27 grant scan covers every field of all 179 cases in evals/cases and evals/cases-hard. No requested view appears, including the DBA_AUTOTASK_* prefix. No further re-premise was needed. Machine-readable evidence: wp-25d-grant-scan.json.

Four new d1 challenge cases cover last recorded level-0 completion time; current-incarnation, per-thread, deduplicated interior archived-sequence gaps; stored RMAN retention configuration and its documented default; and the no-backups-recorded contract. The last checks jobs, datafile backups, sets and pieces. An absent level-0 baseline produces NOT VERIFIABLE rather than a zero gap count. Empty stored retention produces NOT EXPLICITLY CONFIGURED plus the documented policy REDUNDANCY 1. Oracle 19c documents that default in its [CONFIGURE reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/rcmrf/CONFIGURE.html); it is labelled separately from a stored override. Backup records alone do not prove usable media or restoration capability.

`--suite p25` selects only the four backup cases; it excludes the fresh access-gap holdout. The full hard suite includes that holdout. Membership, safe SQL and question-shape validation run before any connection. validate-hard and the new eval-only validator explicitly pin the packaged lab targets instead of following an owner's private targets file.

New command (DB-only, no LLM):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-p25.ts --target d1-19c-lab
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-p25.ts --target p1-19c-prod
```

It probes all ten proposed backup views independently and runs the four truth queries. ORA-00942 / ORA-01031 / ORA-65040 become per-source "not verifiable from this database" results, with no inferred zero counts. Unexpected failures propagate. It labels the evidence CDB-wide (shared by all PDBs). For PDB identity it withholds control-file absence conclusions because visibility can hide rows; this path is unit-tested only.

The proposed grants-request-2026-11-06-backup.sql contains ten SELECT grants to p1 HARNESS_RO, with explicit human DB-name/version/grantee verification instructions. It was not applied. The backup preflight group and PDB template cover the sources. No command was wired in src/cli: the product `backup` command belongs to WP-25A and is absent from this branch; this WP's command is the eval validator above.

Files

- evals/cases-hard/phase5-grant-limited-p1.json, phase8-grant-limited-p1.json, phase11b-challenge.json: revised premises.
- evals/cases-hard/phase25-blind-holdout.json: blind replacement.
- evals/cases-hard/phase25-backup.json: four new cases.
- evals/validate-hard.ts, evals/validate-p25.ts, evals/run.ts, evals/hard-ground-truth-validation.json: validation, selection and recorded live truth.
- src/preflight/views.ts: permitted backup feature group only.
- tests/fixtures/wp25d-previous-premises.json; tests/unit/wp25d-premises.test.ts, phase25-evals.test.ts: frozen definitions, hashes, access semantics and scoring checks.
- tests/unit/hard-evals.test.ts, phase11-challenge.test.ts, phase11b-challenge.test.ts, phase11d-baseline.test.ts, phase5-evals.test.ts, phase8-evals.test.ts: update population assertions and current-premise examples; archived baseline comparisons restore frozen originals.
- tests/integration/phase25-evals.test.ts: DB-only lab validation, usable after grants too.
- docs/grants-request-2026-11-06-backup.sql, docs/grants-template-pdb.sql; docs/wp-25d-* evidence, replay, scan, live output and reports.
- node_modules: untracked/ignored symlink to ../needlefish/node_modules as instructed; no dependency changes.

Contract changes

None required in src/contracts.ts, package.json or PLAN.md. Optional coordinator convenience: add `validate:p25` pointing at `tsx evals/validate-p25.ts`; the direct command already works. WP-25A should reconcile its backup preflight group/grant request with this one at merge, keeping any additional product views (for example the recovery area) in the feature inventory.

Unverified

No Strata calls or agent eval runs were made, and the Strata e2e test was excluded. Both labs have no readable positive backup history available to this worker: d1 history is empty and p1 grants are pending. Positive level-0 timestamps, nonzero archived gaps, retained explicit retention settings and real backup media usability cannot be validated live. The SQL's empty branches were validated live; no fixtures were inserted and no database changed. No live PDB, RAC or Data Guard checks were possible. The coordinator must rerun validate-hard after grants are applied; the revised access-gap premises are independent of those grants.

Validation output and live command output follow below.

Commits

- 15f2eba — re-premise before grants (first).
- cfe1ea3 — backup cases, validator, preflight/grants and updated eval tests.

Checks

The full unit rerun passed after the final SQL changes. A final focused rerun also passed after strengthening the historical partial-access negative test to require a passing current-premise answer before testing omissions. The full integration command excludes only the named Strata e2e test; all 66 remaining tests passed. The two eval integration tests were repeated after the final SQL adjustment.

Typecheck

```text
$ npm run typecheck
> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Unit suite

```text
$ npm test -- --maxWorkers=2
> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25d-backup-evals


 Test Files  110 passed (110)
      Tests  1842 passed (1842)
   Start at  14:57:56
   Duration  67.16s (tests 73%, import 24%, worker 1%, transform 1%)

    Isolate  110 workers spawned · ~283ms startup each (spawn + environment, per file)
             at least ~15.27s faster with isolate: false — reuses workers across files instead of one per file
```

Integration suite

```text
$ PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25d-backup-evals


 Test Files  29 passed (29)
      Tests  66 passed | 1 skipped (67)
   Start at  14:54:11
   Duration  216.92s (tests 96%, import 4%, transform 1%)
```

Hard truth

```text
$ PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-hard.ts
Validated 118 ground-truth queries for 140 hard cases; row counts recorded.
```

Final focused DB checks

```text
$ PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/hard-evals.test.ts tests/integration/phase25-evals.test.ts --no-file-parallelism
RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25d-backup-evals


 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  14:58:22
   Duration  30.00s (tests 99%, import 1%)
```

Final focused unit checks

```text
$ npx vitest run tests/unit/phase11d-baseline.test.ts tests/unit/phase25-evals.test.ts
RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-25d-backup-evals


 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  14:59:00
   Duration  2.13s (tests 62%, import 27%, transform 10%, worker 1%)
```

Additional strict typecheck for the eval validator and its tests passed (exit 0, no output):

```sh
npx tsc --ignoreConfig --noEmit --target es2023 --module nodenext --strict --skipLibCheck --esModuleInterop src/oracle/driver.d.ts evals/validate-p25.ts tests/unit/phase25-evals.test.ts tests/integration/phase25-evals.test.ts
```

Live output (verbatim JSON from both new command invocations)

d1-19c-lab

```json
{
	"target": "d1-19c-lab",
	"validatedAt": "2026-11-06T20:57:53.274Z",
	"scope": "CDB-wide (shared by all PDBs)",
	"note": "Readable empty control-file history does not prove external backups absent or restoration impossible.",
	"views": [
		{
			"view": "V$RMAN_BACKUP_JOB_DETAILS",
			"status": "readable"
		},
		{
			"view": "V$BACKUP_SET",
			"status": "readable"
		},
		{
			"view": "V$BACKUP_PIECE",
			"status": "readable"
		},
		{
			"view": "V$BACKUP_DATAFILE",
			"status": "readable"
		},
		{
			"view": "V$ARCHIVED_LOG",
			"status": "readable"
		},
		{
			"view": "V$LOG_HISTORY",
			"status": "readable"
		},
		{
			"view": "V$CONTROLFILE",
			"status": "readable"
		},
		{
			"view": "V$RMAN_CONFIGURATION",
			"status": "readable"
		},
		{
			"view": "V$DATABASE_BLOCK_CORRUPTION",
			"status": "readable"
		},
		{
			"view": "V$RECOVER_FILE",
			"status": "readable"
		}
	],
	"records": [
		{
			"id": "hard-p25-d1-last-level0",
			"status": "readable",
			"rows": [
				[
					"NONE RECORDED"
				]
			]
		},
		{
			"id": "hard-p25-d1-archive-gaps",
			"status": "readable",
			"rows": [
				[
					"NO LEVEL 0 RECORDED",
					"NOT VERIFIABLE"
				]
			]
		},
		{
			"id": "hard-p25-d1-retention-setting",
			"status": "readable",
			"rows": [
				[
					"RETENTION POLICY",
					"NOT EXPLICITLY CONFIGURED",
					"REDUNDANCY 1"
				]
			]
		},
		{
			"id": "hard-p25-d1-no-backups-recorded",
			"status": "readable",
			"rows": [
				[
					"NO BACKUPS RECORDED",
					0,
					0,
					0,
					0
				]
			]
		}
	]
}
```

p1-19c-prod

```json
{
	"target": "p1-19c-prod",
	"validatedAt": "2026-11-06T20:57:54.281Z",
	"scope": "CDB-wide (shared by all PDBs)",
	"note": "Readable empty control-file history does not prove external backups absent or restoration impossible.",
	"views": [
		{
			"view": "V$RMAN_BACKUP_JOB_DETAILS",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$BACKUP_SET",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$BACKUP_PIECE",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$BACKUP_DATAFILE",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$ARCHIVED_LOG",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$LOG_HISTORY",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$CONTROLFILE",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$RMAN_CONFIGURATION",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$DATABASE_BLOCK_CORRUPTION",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"view": "V$RECOVER_FILE",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		}
	],
	"records": [
		{
			"id": "hard-p25-d1-last-level0",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"id": "hard-p25-d1-archive-gaps",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"id": "hard-p25-d1-retention-setting",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		},
		{
			"id": "hard-p25-d1-no-backups-recorded",
			"status": "not verifiable from this database",
			"code": "ORA-00942"
		}
	]
}
```
