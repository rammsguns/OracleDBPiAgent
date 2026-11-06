# WP-26A completion report

Latest approved-review follow-up is recorded at the end; the original validation
and live captures below are retained as historical evidence.

Branch: `wp-26a-jobs`. Implementation commits: `bbeaf70`, `30ffb5a`.

## Built

Read-only scheduler and maintenance evidence in `src/jobs/` and
`piagent jobs --target T [--since] [--owner] [--failed-only] [--json]`.
Thirteen independently bounded sections cover twelve views, including latest
failed run per job within the selected window, scheduler estimates, autotask
history and maintenance debt. Every string is credential-redacted with the
existing triage redactor before a 2,048-byte UTF-8 cap. Queries preserve Oracle
timestamp offsets and order history by typed Oracle timestamps before display formatting. Missing-view/privilege/PDB errors degrade per section.

Added jobs preflight and PDB template grants, plus an unapplied, SELECT-only
p1 grant request with target/version/grantee verification instructions.
No jobs were run or changed. No grants were applied. No Strata/LLM calls were
made. Only approved lab read-only accounts were used, with passwords loaded
through PIAGENT_SECRET_DIR. `node_modules` was absent and was symlinked to
`../needlefish/node_modules` as instructed; that ignored link is not committed.

## Files changed

- `src/jobs/index.ts`: local exported options/results, SQL readers, redaction and rendering.
- `src/jobs/cli.ts`: configuration/session/audit lifecycle and JSON/text output.
- `src/cli/index.ts`: minimal jobs command registration.
- `src/preflight/views.ts`: jobs feature group.
- `docs/jobs.md`: usage, filtering, timestamps, caps, retention/PDB caveats and result contract.
- `docs/grants-request-2026-11-06-jobs.sql`: eight proposed p1 SELECT grants, not applied.
- `docs/grants-template-pdb.sql`: six missing view grants; six feature views already covered (the separate p1 request contains eight grants).
- `tests/unit/jobs.test.ts`: filters, read-only policy, writer refusal, credential redaction,
  UTF-8 truncation, preflight coverage, PDB degradation, auditing and cleanup.
- `tests/unit/release-help.test.ts`: register jobs in existing CLI help coverage.
- `tests/integration/jobs.test.ts`: both labs, no LLM, dependency-down skip messages.
- `docs/wp-26a-jobs.md`: this report and captured output.

## Contract changes needed

None. `JobsOptions`, `JobsSection`, `JobsResult`, `readJobs` and `renderJobs`
are exported locally from `src/jobs/index.ts` for downstream consumers.
`src/contracts.ts`, `package.json` and `PLAN.md` were not changed.

## Verification

The initial unit run caught the existing help-smoke command registry needing
its new jobs entry; that was updated and the full unit suite rerun.

Final typecheck output (exit 0):

```text
> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Final full unit output (exit 0):

```text
> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  109 passed (109)
      Tests  1848 passed (1848)
   Start at  14:56:18
   Duration  66.62s (tests 74%, import 23%, worker 1%, transform 1%)

    Isolate  109 workers spawned · ~282ms startup each (spawn + environment, per file)
             at least ~15.11s faster with isolate: false — reuses workers across files instead of one per file
```

Focused jobs and preflight coverage: 2 files, 20 tests passed.
Additional p1 JSON smoke parsed successfully: target=p1-19c-prod,
13 sections, last error number=2292.

Required full database integration command (exit 0; the one skipped test is
the explicitly excluded Strata e2e):

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

Packaged lab targets were pinned through `PIAGENT_TARGETS_FILE` for every live run.

```text
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  14:51:15
   Duration  216.58s (tests 95%, import 4%, transform 1%)
```

After the final timestamp-order change, the exact jobs integration file was also
run directly with `vitest run tests/integration/jobs.test.ts --no-file-parallelism`
and the same lab target/secret environment (exit 0):

```text
RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  14:56:24
   Duration  2.92s (tests 87%, import 6%, transform 6%)
```

The additional integration invocation with both `tests/integration` and a jobs
path filter matched the entire integration directory, so it repeated the full
suite (also exit 0). Its output:

```text
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism tests/integration/jobs.test.ts --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  14:54:26
   Duration  213.21s (tests 96%, import 4%)
```

## Live output

Both following commands exited 0 with
`PIAGENT_TARGETS_FILE=$PWD/config/targets.json` and
`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.
All 13 d1 sections are readable. Eight p1 sections report ORA-00942 without
preventing readable evidence. The purge error is retained separately from
newer successful runs; SHOPAPP has three explicitly stale table-statistics rows.

### d1

```text
> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts jobs --target d1-19c-lab --since 30d --owner SH --failed-only

# Jobs: d1-19c-lab

2026-10-07T20:56:27.444Z to 2026-11-06T20:56:27.444Z (exclusive)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok


No rows returned within visible scope.

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


No rows returned within visible scope.

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


No rows returned within visible scope.

## jobLog (DBA_SCHEDULER_JOB_LOG): ok


No rows returned within visible scope.

## windows (DBA_SCHEDULER_WINDOWS): ok


| WINDOW_NAME | ENABLED | ACTIVE | LAST_START_DATE | NEXT_START_DATE | DURATION |
| --- | --- | --- | --- | --- | --- |
| FRIDAY_WINDOW | TRUE | FALSE | 2026-10-23T22:00:00.070+00:00 | 2026-11-06T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| MONDAY_WINDOW | TRUE | FALSE | 2026-10-26T22:00:00.007+00:00 | 2026-11-09T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| SATURDAY_WINDOW | TRUE | FALSE | 2026-10-24T06:00:00.005+00:00 | 2026-11-07T06:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| SUNDAY_WINDOW | TRUE | FALSE | 2026-10-25T06:00:00.161+00:00 | 2026-11-08T06:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":20,"days":0} |
| THURSDAY_WINDOW | TRUE | FALSE | 2026-11-05T22:00:00.090+00:00 | 2026-11-12T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| TUESDAY_WINDOW | TRUE | FALSE | 2026-10-27T22:00:00.149+00:00 | 2026-11-10T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEDNESDAY_WINDOW | TRUE | FALSE | 2026-11-04T22:00:00.173+00:00 | 2026-11-11T22:00:00.000+00:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":4,"days":0} |
| WEEKEND_WINDOW | FALSE | FALSE |  | 2019-04-20T00:00:00.000-07:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":0,"days":2} |
| WEEKNIGHT_WINDOW | FALSE | FALSE |  | 2019-04-17T22:00:00.000-07:00 | {"fseconds":0,"seconds":0,"minutes":0,"hours":8,"days":0} |

## autotaskClients (DBA_AUTOTASK_CLIENT): ok


| CLIENT_NAME | STATUS | WINDOW_GROUP |
| --- | --- | --- |
| auto optimizer stats collection | ENABLED | ORA$AT_WGRP_OS |
| auto space advisor | ENABLED | ORA$AT_WGRP_SA |
| sql tuning advisor | ENABLED | ORA$AT_WGRP_SQ |

## autotaskHistory (DBA_AUTOTASK_JOB_HISTORY): ok


No rows returned within visible scope.

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): ok


No rows returned within visible scope.

## invalidObjects (DBA_OBJECTS): ok


No rows returned within visible scope.

## indexes (DBA_INDEXES): ok


No rows returned within visible scope.

## indexPartitions (DBA_IND_PARTITIONS): ok


No rows returned within visible scope.

## indexSubpartitions (DBA_IND_SUBPARTITIONS): ok


No rows returned within visible scope.

## staleStatistics (DBA_TAB_STATISTICS): ok


No rows returned within visible scope.
```

### p1

```text
> oracledb-pi-agent@1.4.0 piagent
> tsx src/cli/index.ts jobs --target p1-19c-prod --since 30d --owner SHOPAPP --failed-only

# Jobs: p1-19c-prod

2026-10-07T20:56:30.202Z to 2026-11-06T20:56:30.202Z (exclusive)

Current state and maintenance debt are snapshots; history uses [from, to). Owner filters apply only to owner-bearing views. Failed-only filters scheduler jobs with recorded failures and non-successful runs/logs, failed autotask and statistics history; maintenance context remains visible. Next run is a scheduler estimate, not a guarantee. Empty rows do not prove absence beyond visible/retained history.

## jobs (DBA_SCHEDULER_JOBS): ok


| OWNER | JOB_NAME | ENABLED | STATE | LAST_START_DATE | NEXT_RUN_DATE | RUN_COUNT | FAILURE_COUNT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | TRUE | SCHEDULED | 2026-11-06T03:41:39.238+00:00 | 2026-11-07T03:41:39.239+00:00 | 9 | 1 |

## lastErrors (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | 38342 | 2026-11-04T04:30:56.304+00:00 | FAILED | 2292 | ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1<br> |

## runs (DBA_SCHEDULER_JOB_RUN_DETAILS): ok


| OWNER | JOB_NAME | LOG_ID | LOG_DATE | STATUS | ERROR# | ACTUAL_START_DATE | RUN_DURATION | ADDITIONAL_INFO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHOPAPP | NIGHTLY_PURGE_JOB | 38342 | 2026-11-04T04:30:56.304+00:00 | FAILED | 2292 | 2026-11-04T04:30:02.953+00:00 | {"fseconds":0,"seconds":53,"minutes":0,"hours":0,"days":0} | ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found<br>ORA-06512: at "SHOPAPP.WORKLOAD", line 27<br>ORA-06512: at line 1<br> |

## jobLog (DBA_SCHEDULER_JOB_LOG): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## windows (DBA_SCHEDULER_WINDOWS): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## autotaskClients (DBA_AUTOTASK_CLIENT): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## autotaskHistory (DBA_AUTOTASK_JOB_HISTORY): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## statisticsHistory (DBA_OPTSTAT_OPERATIONS): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## invalidObjects (DBA_OBJECTS): ok


No rows returned within visible scope.

## indexes (DBA_INDEXES): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## indexPartitions (DBA_IND_PARTITIONS): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## indexSubpartitions (DBA_IND_SUBPARTITIONS): unavailable

ORA-00942: not available in this PDB / not granted; no absence inferred.
Evidence unavailable.

## staleStatistics (DBA_TAB_STATISTICS): ok


| OWNER | OBJECT_TYPE | STALE_COUNT |
| --- | --- | --- |
| SHOPAPP | TABLE | 3 |
```

## Unverified and coordinator follow-up

Live 19c PDB behavior is unverified: both allowed labs are non-CDB. Unit tests
cover PDB identity and ORA-00942/01031/65040 degradation. No write or database
configuration change was attempted. No live jobs were created for fixtures.
Missing p1 maintenance evidence stays unknown until owner-reviewed grants are
applied by a human DBA. Grant-limited eval premises must be reviewed before
that step. Strata e2e and model evals were intentionally excluded as instructed.

## Approved-review follow-up (2026-11-06)

Addressed both minors and both informational findings from
`../review-wp-26a-jobs/docs/review-wp-26a-jobs.md`.

- Added `src/jobs/redact.ts`, a jobs-local second credential pass after the
  existing triage redactor and before UTF-8 truncation. It masks Authorization
  (including quoted JSON keys), Bearer tokens, connection-string userinfo and
  assignments whose keys contain PASSWORD/PASSWD/PWD/PASS/SECRET/TOKEN/KEY/CREDENTIAL,
  case-insensitively with arbitrary prefixes/suffixes. Quoted and multiline
  values, SQL literal concatenation and quoted JSON assignment keys are covered.
- `docs/jobs.md` explicitly classifies JSON job error fields as
  **application text, may contain data**. Business literals are not anonymized.
- Failed-only current jobs include positive failure counts, FAILED/BROKEN/RETRY
  SCHEDULED states and a latest retained failed run, independent of the history
  window. A correlated `KEEP (DENSE_RANK LAST ORDER BY LOG_DATE, LOG_ID)` aggregate
  checks each job before the row cap. If run details are unavailable, a separately
  audited retry retains the readable job snapshot using state/failure-count
  predicates and explicitly notes the unavailable latest-run evidence.
- Qualified both ordering columns in the latest-error analytic function.
- Corrected the template-grant erratum: six added grants, six already covered;
  the separate p1 request contains eight grants.
- Extended `tests/unit/jobs.test.ts` for the requested credential forms, business
  data preservation, new failure predicates, qualified ordering and all three
  expected run-details privilege/PDB failures. Extended the jobs integration
  tests to execute failed-only mode on both labs and check non-successful runs.

Implementation commit: `023d18d`, followed by the quoted-Authorization regression
and this report. Changed files in this follow-up: `src/jobs/index.ts`,
`src/jobs/redact.ts`, `tests/unit/jobs.test.ts`, `tests/integration/jobs.test.ts`,
`docs/jobs.md`, `docs/wp-26a-jobs.md`. No shared contract changes are needed.
No grants were applied, jobs changed, or Strata/LLM calls made. Live PDB behavior
and zero-failure-count failed/retry jobs remain unseeded on the labs; no database
fixtures were modified. Predicate construction is covered by unit tests, and the
full SELECT runs on both approved labs.

### Live follow-up

Both CLI JSON invocations exited 0 and parsed successfully. Commands:

```sh
PIAGENT_TARGETS_FILE="$PWD/config/targets.json" PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- jobs --target d1-19c-lab --since 30d --owner SH --failed-only --json
PIAGENT_TARGETS_FILE="$PWD/config/targets.json" PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run piagent -- jobs --target p1-19c-prod --since 30d --owner SHOPAPP --failed-only --json
```

Captured parsed status/row-count summary and current job/error rows (SQL and
unchanged empty row arrays omitted):

```json
{
  "d1-19c-lab": {
    "window": {
      "from": "2026-10-07T21:35:58.473Z",
      "to": "2026-11-06T21:35:58.473Z"
    },
    "sections": {
      "jobs": {
        "status": "ok",
        "rows": 0
      },
      "lastErrors": {
        "status": "ok",
        "rows": 0
      },
      "runs": {
        "status": "ok",
        "rows": 0
      },
      "jobLog": {
        "status": "ok",
        "rows": 0
      },
      "windows": {
        "status": "ok",
        "rows": 9
      },
      "autotaskClients": {
        "status": "ok",
        "rows": 3
      },
      "autotaskHistory": {
        "status": "ok",
        "rows": 0
      },
      "statisticsHistory": {
        "status": "ok",
        "rows": 0
      },
      "invalidObjects": {
        "status": "ok",
        "rows": 0
      },
      "indexes": {
        "status": "ok",
        "rows": 0
      },
      "indexPartitions": {
        "status": "ok",
        "rows": 0
      },
      "indexSubpartitions": {
        "status": "ok",
        "rows": 0
      },
      "staleStatistics": {
        "status": "ok",
        "rows": 0
      }
    },
    "jobs": [],
    "lastErrors": []
  },
  "p1-19c-prod": {
    "window": {
      "from": "2026-10-07T21:34:38.172Z",
      "to": "2026-11-06T21:34:38.172Z"
    },
    "sections": {
      "jobs": {
        "status": "ok",
        "rows": 1
      },
      "lastErrors": {
        "status": "ok",
        "rows": 1
      },
      "runs": {
        "status": "ok",
        "rows": 1
      },
      "jobLog": {
        "status": "unavailable",
        "rows": 0
      },
      "windows": {
        "status": "unavailable",
        "rows": 0
      },
      "autotaskClients": {
        "status": "unavailable",
        "rows": 0
      },
      "autotaskHistory": {
        "status": "unavailable",
        "rows": 0
      },
      "statisticsHistory": {
        "status": "unavailable",
        "rows": 0
      },
      "invalidObjects": {
        "status": "ok",
        "rows": 0
      },
      "indexes": {
        "status": "unavailable",
        "rows": 0
      },
      "indexPartitions": {
        "status": "unavailable",
        "rows": 0
      },
      "indexSubpartitions": {
        "status": "unavailable",
        "rows": 0
      },
      "staleStatistics": {
        "status": "ok",
        "rows": 1
      }
    },
    "jobs": [
      {
        "OWNER": "SHOPAPP",
        "JOB_NAME": "NIGHTLY_PURGE_JOB",
        "ENABLED": "TRUE",
        "STATE": "SCHEDULED",
        "LAST_START_DATE": "2026-11-06T03:41:39.238+00:00",
        "NEXT_RUN_DATE": "2026-11-07T03:41:39.239+00:00",
        "RUN_COUNT": 9,
        "FAILURE_COUNT": 1
      }
    ],
    "lastErrors": [
      {
        "OWNER": "SHOPAPP",
        "JOB_NAME": "NIGHTLY_PURGE_JOB",
        "LOG_ID": 38342,
        "LOG_DATE": "2026-11-04T04:30:56.304+00:00",
        "STATUS": "FAILED",
        "ERROR#": 2292,
        "ADDITIONAL_INFO": "ORA-02292: integrity constraint (SHOPAPP.SYS_C007669) violated - child record found\nORA-06512: at \"SHOPAPP.WORKLOAD\", line 27\nORA-06512: at line 1\n"
      }
    ]
  }
}
```

### Follow-up validation output

`npm run typecheck` (exit 0):

```text
> oracledb-pi-agent@1.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

`npm test -- --maxWorkers=2` (exit 0):

```text
> oracledb-pi-agent@1.4.0 test
> vitest run tests/unit --maxWorkers=2


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  109 passed (109)
      Tests  1877 passed (1877)
   Start at  15:36:42
   Duration  67.26s (tests 74%, import 23%, worker 1%, transform 1%)

    Isolate  109 workers spawned · ~287ms startup each (spawn + environment, per file)
             at least ~15.37s faster with isolate: false — reuses workers across files instead of one per file
```

Required filtered full integration command (exit 0), with packaged lab targets
pinned and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`:

```text
> oracledb-pi-agent@1.4.0 test:integration
> vitest run tests/integration --no-file-parallelism --testNamePattern=^(?!.*answers one end-to-end ask through local Strata)


 RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  29 passed (29)
      Tests  67 passed | 1 skipped (68)
   Start at  15:34:58
   Duration  209.52s (tests 96%, import 4%)
```

The one skipped test is the excluded Strata e2e. The final source also passed
the focused jobs integration file, including failed-only reads on both labs
(exit 0):

```text
RUN  v5.1.0 /home/kiwi/orca/workspaces/OracleDBPiAgent/wp-26a-jobs


 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:36:47
   Duration  3.68s (tests 90%, import 5%, transform 4%)
```

`git diff --check` passed. No outstanding review items or required shared
contract changes remain. Live PDB verification still requires an owner-run PDB.
