WP-26D — phase 26 scheduler and maintenance evals

Built four challenge cases selected with `--suite p26`: latest retained failed SHOPAPP job and its error code/meaning, invalid SHOPAPP object count, optimizer statistics autotask client status, and next-run semantics. Questions name neither tools nor dictionary views. No moving run counts or timestamps are graded. Truth reads only job names, numeric error codes, counts, enabled/status flags and next-run presence. It never reads free-form error text, job actions or data values. Latest failure is scoped to SHOPAPP and ordered by LOG_DATE then LOG_ID; historical failure is independent of current job state.

Oracle documents [ORA-02292](https://docs.oracle.com/en/error-help/db/ora-02292/) as a parent-key operation blocked by a dependent child record. The [19c scheduler columns](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/ALL_SCHEDULER_JOBS.html) describe NEXT_RUN_DATE as a scheduled date and SCHEDULE_LIMIT as permitting rescheduling; scheduled time is not proof of actual execution or success. Enabled autotask status likewise does not prove successful collection.

The DB-only validator pins config/targets.json and accepts only the two lab names. It probes four truth sources independently; ORA-00942, ORA-01031 and ORA-65040 become evidence gaps, never zero counts. Unexpected errors propagate. Container metadata comes from SYS_CONTEXT. PDB truth conclusions are withheld as unverified, rather than interpreting hidden rows as absence. Both actual labs are non-CDB (CON_ID 0). Unit tests exercise source failures and the conservative PDB branch.

Reproduce live checks (no LLM):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-p26.ts --target d1-19c-lab
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-p26.ts --target p1-19c-prod
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx tsx evals/validate-hard.ts
npx tsx docs/wp-26d-replay.ts ../eval-archive ../needlefish/evals/results
```

Live output on both labs is recorded verbatim in wp-26d-live-d1-19c-lab.json and wp-26d-live-p1-19c-prod.json. All four sources are readable on both. On p1: NIGHTLY_PURGE_JOB / ORA-02292; SHOPAPP invalid objects 0; auto optimizer stats collection ENABLED; NIGHTLY_PURGE_JOB enabled TRUE with next run PRESENT. On d1: no retained failed SHOPAPP job (NONE RECORDED / NO ERROR RECORDED); SHOPAPP invalid objects 0; stats client ENABLED; no visible row for the named SHOPAPP job. D1's empty named-job result is recorded explicitly without inventing a next-run value. The runnable cases target p1; d1 checks the same SQL's empty branches.

Offline replay: baseline d25f1cb3e613572db3195dee9d6bd931b1af7d40; 41 existing case files / 179 definitions byte-identical, with SHA-256 hashes in wp-26d-replay.json. Replayed 14,343 answer records in 635 JSON files with zero flips. Archived truth/tool checks are preserved, avoiding retrospective grading against current database values. The scorer is unchanged. The baseline commit is pinned in the reproducible script.

Files changed: evals/cases-hard/phase26-jobs.json; evals/validate-p26.ts; evals/validate-hard.ts (p26 shape checks); evals/run.ts (p26 selection); evals/hard-ground-truth-validation.json (fresh full live evidence); tests/unit/phase26-evals.test.ts; tests/unit/hard-evals.test.ts (population 144); tests/integration/phase26-evals.test.ts; this report and docs/wp-26d-live-*.json, wp-26d-replay.ts/json. node_modules is an ignored symlink to ../needlefish/node_modules as instructed.

Contract changes: none. No changes to src/contracts.ts, package.json, PLAN.md or product source. Optional coordinator script alias: validate:p26 -> tsx evals/validate-p26.ts. The four source views already belong to the jobs feature; no new product query or grant is introduced.

Unverified: no Strata or agent eval calls made; coordinator owns eval runs. No live PDB, RAC or Data Guard verification. The lab truths are stable structural/status facts, freshly queried on every eval; changes to job configuration, retained history or invalid-object state can legitimately change them. No DB changes, RMAN or scheduler package calls were made. Browser tests are not applicable because web was untouched.

Validation output follows.

Required checks completed on this branch:

- Typecheck: pass (exit 0).
- Unit suite: 116 files, 2,157 tests passed (exit 0).
- Integration excluding the named Strata e2e: 32 files passed, one failed; 72 tests passed, one failed, one skipped (exit 1). The new p26 DB-only integration test passed. The sole failure is the existing tests/integration/backup.test.ts:13 assertion that p1 status should be partial; actual status is ok now that grants are applied. This belongs to the backup WP and is not changed here. Coordinator/backup owner must update its stale pre-grant expectation.
- Additional strict TypeScript check of eval validator, tests and replay script: pass (exit 0, no output).
- validate-hard: 122 ground-truth queries validated for 144 cases, including all four new p26 cases.
- No browser tests: web untouched.

Implementation commit: acf369c. Evidence/report committed separately.

Typecheck

```text
> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Unit suite

```text
> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26d-p26-evals


 Test Files  116 passed (116)
      Tests  2157 passed (2157)
   Start at  16:04:09
   Duration  78.33s (tests 75%, import 21%, transform 3%, worker 1%)

    Isolate  116 workers spawned · ~285ms startup each (spawn + environment, per file)
             at least ~16.27s faster with isolate: false — reuses workers across files instead of one per file
```

Integration suite (Strata e2e excluded)

```text
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26d-p26-evals

 ❯ tests/integration/backup.test.ts (2 tests | 1 failed) 707ms
   × reads backup metadata on p1-19c-prod 178ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/backup.test.ts > reads backup metadata on p1-19c-prod
AssertionError: expected 'ok' to be 'partial' // Object.is equality

Expected: "partial"
Received: "ok"

 ❯ tests/integration/backup.test.ts:13:26
     11|   expect(Object.keys(r.evidence)).toHaveLength(13);
     12|   if(target==='d1-19c-lab') expect(r.status).toBe('ok');
     13|   else {expect(r.status).toBe('partial');expect(r.restoreEstimate.stat…
       |                          ^
     14|  } catch(e) {
     15|   if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.te…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 32 passed (33)
      Tests  1 failed | 72 passed | 1 skipped (74)
   Start at  16:04:10
   Duration  258.68s (tests 96%, import 3%)
```

Additional strict check command:

```sh
npx tsc --ignoreConfig --noEmit --target es2023 --module nodenext --strict --skipLibCheck --esModuleInterop src/oracle/driver.d.ts evals/validate-p26.ts tests/unit/phase26-evals.test.ts tests/integration/phase26-evals.test.ts docs/wp-26d-replay.ts
```

Live hard-truth command output:

```text
Validated 122 ground-truth queries for 144 hard cases; row counts recorded.
```

Live output: d1-19c-lab

```json
{
	"target": "d1-19c-lab",
	"validatedAt": "2026-11-06T22:02:58.287Z",
	"scope": "Current container visible scheduler and maintenance metadata",
	"container": {
		"id": 0,
		"name": "ORCL"
	},
	"note": "Retained visible history only; a scheduled next run is an estimate, not a guarantee.",
	"views": [
		{
			"view": "DBA_SCHEDULER_JOBS",
			"status": "readable"
		},
		{
			"view": "DBA_SCHEDULER_JOB_RUN_DETAILS",
			"status": "readable"
		},
		{
			"view": "DBA_OBJECTS",
			"status": "readable"
		},
		{
			"view": "DBA_AUTOTASK_CLIENT",
			"status": "readable"
		}
	],
	"records": [
		{
			"id": "hard-p26-p1-last-failed-job",
			"status": "readable",
			"rows": [
				[
					"NONE RECORDED",
					"NO ERROR RECORDED"
				]
			]
		},
		{
			"id": "hard-p26-p1-invalid-objects",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					0
				]
			]
		},
		{
			"id": "hard-p26-p1-stats-autotask",
			"status": "readable",
			"rows": [
				[
					"auto optimizer stats collection",
					"ENABLED"
				]
			]
		},
		{
			"id": "hard-p26-p1-next-run-semantics",
			"status": "readable",
			"rows": [],
			"note": "No rows visible; no absence outside this scope inferred."
		}
	]
}
```

Live output: p1-19c-prod

```json
{
	"target": "p1-19c-prod",
	"validatedAt": "2026-11-06T22:02:48.715Z",
	"scope": "Current container visible scheduler and maintenance metadata",
	"container": {
		"id": 0,
		"name": "PRODCDB"
	},
	"note": "Retained visible history only; a scheduled next run is an estimate, not a guarantee.",
	"views": [
		{
			"view": "DBA_SCHEDULER_JOBS",
			"status": "readable"
		},
		{
			"view": "DBA_SCHEDULER_JOB_RUN_DETAILS",
			"status": "readable"
		},
		{
			"view": "DBA_OBJECTS",
			"status": "readable"
		},
		{
			"view": "DBA_AUTOTASK_CLIENT",
			"status": "readable"
		}
	],
	"records": [
		{
			"id": "hard-p26-p1-last-failed-job",
			"status": "readable",
			"rows": [
				[
					"NIGHTLY_PURGE_JOB",
					"ORA-02292"
				]
			]
		},
		{
			"id": "hard-p26-p1-invalid-objects",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					0
				]
			]
		},
		{
			"id": "hard-p26-p1-stats-autotask",
			"status": "readable",
			"rows": [
				[
					"auto optimizer stats collection",
					"ENABLED"
				]
			]
		},
		{
			"id": "hard-p26-p1-next-run-semantics",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					"NIGHTLY_PURGE_JOB",
					"TRUE",
					"PRESENT"
				]
			]
		}
	]
}
```

Review fixes (review-wp-26d-p26-evals, approved with minors)

Minor 1: inspectP26 now refuses CON_ID 1 (and the CDB$ROOT container name)
immediately after validating container metadata. It fails before view probes or
truth SQL. A unit test asserts that only the container metadata query ran. Live
root refusal remains unverified because workers connect only to the two labs.

Minor 3: validateP26 selects test.id.startsWith('hard-p26-'), so unrelated
future cases in the jobs category do not enter this four-case validator.

Minor 2: hard-p26-p1-last-failed-job's requiredFacts assume the p1 fixture
failure is ORA-02292, whose meaning involves dependent child records / foreign
keys. This prerequisite is now explicit in evals/cases-hard/phase26-jobs.notes.md.
checkP26Cases accepts live truth and fails loudly if the latest retained p1
failure does not return ORA-02292, including absent failed history. Both
validateHardCases and inspectP26 invoke this check after reading live truth.
It is scoped to the actual session target; the d1 empty-branch smoke does not
inherit p1's prerequisite. Unit tests cover the expected error, another error,
absent history and propagation through inspectP26.

No existing case definitions, scoring rules or product contracts changed.
Changed files in this review fix: evals/validate-p26.ts,
evals/validate-hard.ts, evals/cases-hard/phase26-jobs.notes.md,
tests/unit/phase26-evals.test.ts, refreshed docs/wp-26d-live-*.json and
hard-ground-truth-validation.json, and this report. No LLM calls were made.
Both lab validator commands passed again; live values match the earlier
output, with fresh timestamps in the JSON artifacts.

Review-fix verification output

Typecheck (exit 0)

```text
> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Unit suite (exit 0)

```text
> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26d-p26-evals


 Test Files  116 passed (116)
      Tests  2159 passed (2159)
   Start at  20:04:40
   Duration  78.11s (tests 78%, import 20%, worker 1%, transform 1%)

    Isolate  116 workers spawned · ~284ms startup each (spawn + environment, per file)
             at least ~16.21s faster with isolate: false — reuses workers across files instead of one per file
```

Full hard truth (exit 0)

```text
Validated 122 ground-truth queries for 144 hard cases; row counts recorded.
```

The additional strict eval/test typecheck passed (exit 0, no output). Both p26 validator commands passed (exit 0). Refreshed live output follows.

d1-19c-lab

```json
{
	"target": "d1-19c-lab",
	"validatedAt": "2026-11-07T02:04:49.959Z",
	"scope": "Current container visible scheduler and maintenance metadata",
	"container": {
		"id": 0,
		"name": "ORCL"
	},
	"note": "Retained visible history only; a scheduled next run is an estimate, not a guarantee.",
	"views": [
		{
			"view": "DBA_SCHEDULER_JOBS",
			"status": "readable"
		},
		{
			"view": "DBA_SCHEDULER_JOB_RUN_DETAILS",
			"status": "readable"
		},
		{
			"view": "DBA_OBJECTS",
			"status": "readable"
		},
		{
			"view": "DBA_AUTOTASK_CLIENT",
			"status": "readable"
		}
	],
	"records": [
		{
			"id": "hard-p26-p1-last-failed-job",
			"status": "readable",
			"rows": [
				[
					"NONE RECORDED",
					"NO ERROR RECORDED"
				]
			]
		},
		{
			"id": "hard-p26-p1-invalid-objects",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					0
				]
			]
		},
		{
			"id": "hard-p26-p1-stats-autotask",
			"status": "readable",
			"rows": [
				[
					"auto optimizer stats collection",
					"ENABLED"
				]
			]
		},
		{
			"id": "hard-p26-p1-next-run-semantics",
			"status": "readable",
			"rows": [],
			"note": "No rows visible; no absence outside this scope inferred."
		}
	]
}
```

p1-19c-prod

```json
{
	"target": "p1-19c-prod",
	"validatedAt": "2026-11-07T02:04:51.735Z",
	"scope": "Current container visible scheduler and maintenance metadata",
	"container": {
		"id": 0,
		"name": "PRODCDB"
	},
	"note": "Retained visible history only; a scheduled next run is an estimate, not a guarantee.",
	"views": [
		{
			"view": "DBA_SCHEDULER_JOBS",
			"status": "readable"
		},
		{
			"view": "DBA_SCHEDULER_JOB_RUN_DETAILS",
			"status": "readable"
		},
		{
			"view": "DBA_OBJECTS",
			"status": "readable"
		},
		{
			"view": "DBA_AUTOTASK_CLIENT",
			"status": "readable"
		}
	],
	"records": [
		{
			"id": "hard-p26-p1-last-failed-job",
			"status": "readable",
			"rows": [
				[
					"NIGHTLY_PURGE_JOB",
					"ORA-02292"
				]
			]
		},
		{
			"id": "hard-p26-p1-invalid-objects",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					0
				]
			]
		},
		{
			"id": "hard-p26-p1-stats-autotask",
			"status": "readable",
			"rows": [
				[
					"auto optimizer stats collection",
					"ENABLED"
				]
			]
		},
		{
			"id": "hard-p26-p1-next-run-semantics",
			"status": "readable",
			"rows": [
				[
					"SHOPAPP",
					"NIGHTLY_PURGE_JOB",
					"TRUE",
					"PRESENT"
				]
			]
		}
	]
}
```

Review-fix integration rerun (Strata e2e excluded): 72 passed, one skipped,
one failed; the sole failure remains the pre-existing backup.test.ts:13
expectation of partial p1 access after grants. The p26 integration test passes.
No changes made to that other WP's assertion.

```text
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26d-p26-evals

 ❯ tests/integration/backup.test.ts (2 tests | 1 failed) 768ms
   × reads backup metadata on p1-19c-prod 210ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/backup.test.ts > reads backup metadata on p1-19c-prod
AssertionError: expected 'ok' to be 'partial' // Object.is equality

Expected: "partial"
Received: "ok"

 ❯ tests/integration/backup.test.ts:13:26
     11|   expect(Object.keys(r.evidence)).toHaveLength(13);
     12|   if(target==='d1-19c-lab') expect(r.status).toBe('ok');
     13|   else {expect(r.status).toBe('partial');expect(r.restoreEstimate.stat…
       |                          ^
     14|  } catch(e) {
     15|   if(/NJS-511|ECONNREFUSED|ORA-12541|ORA-12514|ORA-01034|ORA-27101/.te…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 32 passed (33)
      Tests  1 failed | 72 passed | 1 skipped (74)
   Start at  20:04:50
   Duration  269.09s (tests 96%, import 3%)
```
