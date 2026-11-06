# WP-28D preflight catalog follow-up

Implemented on `wp-28d-preflight-catalog`, 2026-11-06.

## Changes

- `src/preflight/index.ts`: resolve missing-view grants through `grantObject`.
- `src/preflight/views.ts`: explicit synonym exception map, `ask` group with
  overview, dictionary fallback, cached-plan support and statistics views;
  SQL baselines/profiles and composed table/index statistics views; unified-audit
  security views; connection-gate dictionary views. Additions to deterministic
  groups precede report/triage composition so those groups inherit them.
- `tests/unit/preflight-catalog.test.ts`: source coverage, missing-grant rendering
  and deduplication, and grant-template reconciliation.
- `tests/integration/preflight-catalog.test.ts`: all catalog V$ public synonyms
  on both packaged lab targets, with listener-unavailable skips.
- This report is the only documentation change. No contract changes needed.

## Oracle 19c references and live verification

Oracle 19c [About Dynamic Performance Views](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/about-dynamic-performance-views.html)
explains the public V$ synonyms and underlying V_$ objects.
The 19c [V$TEMPSEG_USAGE reference](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-TEMPSEG_USAGE.html)
documents temporary-segment usage under the public name. That page does not
spell out the exceptional base-object mapping; the live dictionary establishes it.
Do not infer `V_$TEMPSEG_USAGE` from the public name.

With `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`, using only
`config/targets.json` lab accounts, queried each of the 33 catalog V$ names with:

```sql
SELECT owner, table_name FROM all_synonyms
WHERE synonym_name=:name AND owner=:owner
```

Bound `owner` to `PUBLIC`. Both targets returned exactly one row per name,
with synonym owner `PUBLIC`. `d1-19c-lab` and `p1-19c-prod` each reported
`19.9.1.0.0`; all 66 comparisons passed. The only nonstandard mapping is
`V$TEMPSEG_USAGE` to `SYS.V_$SORT_USAGE`, now explicit in the map.
Every other probed name maps by replacing `V$` with `V_$`.

| Public synonym | Base object on both labs |
|---|---|
| `V$ARCHIVED_LOG` | `SYS.V_$ARCHIVED_LOG` |
| `V$DATABASE` | `SYS.V_$DATABASE` |
| `V$DIAG_ALERT_EXT` | `SYS.V_$DIAG_ALERT_EXT` |
| `V$DIAG_INCIDENT` | `SYS.V_$DIAG_INCIDENT` |
| `V$DIAG_PROBLEM` | `SYS.V_$DIAG_PROBLEM` |
| `V$FLASH_RECOVERY_AREA_USAGE` | `SYS.V_$FLASH_RECOVERY_AREA_USAGE` |
| `V$INSTANCE` | `SYS.V_$INSTANCE` |
| `V$LOCK` | `SYS.V_$LOCK` |
| `V$LOCKED_OBJECT` | `SYS.V_$LOCKED_OBJECT` |
| `V$LOG` | `SYS.V_$LOG` |
| `V$LOGFILE` | `SYS.V_$LOGFILE` |
| `V$LOG_HISTORY` | `SYS.V_$LOG_HISTORY` |
| `V$PARAMETER` | `SYS.V_$PARAMETER` |
| `V$PGASTAT` | `SYS.V_$PGASTAT` |
| `V$PWFILE_USERS` | `SYS.V_$PWFILE_USERS` |
| `V$RECOVERY_FILE_DEST` | `SYS.V_$RECOVERY_FILE_DEST` |
| `V$RMAN_BACKUP_JOB_DETAILS` | `SYS.V_$RMAN_BACKUP_JOB_DETAILS` |
| `V$SESSION` | `SYS.V_$SESSION` |
| `V$SESSION_LONGOPS` | `SYS.V_$SESSION_LONGOPS` |
| `V$SGA` | `SYS.V_$SGA` |
| `V$SORT_SEGMENT` | `SYS.V_$SORT_SEGMENT` |
| `V$SQL` | `SYS.V_$SQL` |
| `V$SQLSTATS` | `SYS.V_$SQLSTATS` |
| `V$SQL_BIND_CAPTURE` | `SYS.V_$SQL_BIND_CAPTURE` |
| `V$SQL_PLAN` | `SYS.V_$SQL_PLAN` |
| `V$SQL_PLAN_STATISTICS_ALL` | `SYS.V_$SQL_PLAN_STATISTICS_ALL` |
| `V$SQL_SHARED_CURSOR` | `SYS.V_$SQL_SHARED_CURSOR` |
| `V$SYSTEM_EVENT` | `SYS.V_$SYSTEM_EVENT` |
| `V$SYS_TIME_MODEL` | `SYS.V_$SYS_TIME_MODEL` |
| `V$TEMPSEG_USAGE` | `SYS.V_$SORT_USAGE` |
| `V$TRANSACTION` | `SYS.V_$TRANSACTION` |
| `V$UNDOSTAT` | `SYS.V_$UNDOSTAT` |
| `V$WAIT_CHAINS` | `SYS.V_$WAIT_CHAINS` |

No database changes and no Strata requests were made. The integration suite's
sole non-19c connection is its existing permitted FREEPDB1 refusal test.
Live PDB behavior remains unverified: both permitted labs are non-CDB.

## Source and template reconciliation

Audited fixed FROM/JOIN references throughout `src/` with `rg`, including nested
queries, schema qualification and case differences. The regression test walks
all TypeScript and JavaScript source files and checks those references plus
standalone dictionary-view literals used as query arguments. It excludes the
catalog itself so declarations cannot conceal missing source references.
Known composed queries are checked separately: PL/SQL dictionary `this.read`
suffixes, ask's ALL-to-DBA fallback views, and SQL insight TAB/IND statistics.
Arbitrary user SQL and runtime user-selected objects cannot be pre-cataloged.
`V$DIAG` is a routing prefix, not a queried view, and is explicitly excluded.

The explicit no-additional-grant exclusion list in the unit test is:

```
ALL_ARGUMENTS ALL_CONSTRAINTS ALL_CONS_COLUMNS ALL_DEPENDENCIES ALL_ERRORS
ALL_INDEXES ALL_IND_COLUMNS ALL_IND_EXPRESSIONS ALL_IND_PARTITIONS ALL_IND_STATISTICS
ALL_IND_SUBPARTITIONS ALL_OBJECTS ALL_PROCEDURES ALL_SCHEDULER_JOBS
ALL_SCHEDULER_JOB_RUN_DETAILS ALL_SOURCE ALL_SYNONYMS ALL_TABLES ALL_TAB_COLUMNS
ALL_TAB_STATISTICS ALL_USERS ALL_VIEWS USER_TAB_PRIVS USER_TAB_PRIVS_RECD
SESSION_PRIVS SESSION_ROLES DUAL
```

These expose session-visible objects or session privileges without additional
object grants. Existing probes of ALL_ views remain useful for feature visibility;
exclusion from the source-coverage requirement does not remove those probes.
New USER_/SESSION_/ALL_ names require explicit review; there is no wildcard waiver.

Compared all 69 unique probed DBA_/V$ views, resolved to base grant objects,
against `docs/grants-template-pdb.sql`: **no missing grants**. In particular the
template already grants `SYS.V_$SORT_USAGE`. No coordinator template changes
are required. The unit test now enforces this comparison on future catalog edits.

## Validation outputs

Commands and captured outputs (all exit 0):

```text
$ npm run typecheck
> oracledb-pi-agent@1.3.0 typecheck
> tsc -p tsconfig.json --noEmit

$ npm test -- --maxWorkers=2
 Test Files  106 passed (106)
      Tests  1788 passed (1788)
   Duration  30.80s

$ PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets \
  PIAGENT_TARGETS_FILE="$PWD/config/targets.json" \
  npm run test:integration -- \
  --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
 Test Files  28 passed (28)
      Tests  65 passed | 1 skipped (66)
   Duration  118.35s
```

The one skipped test is the explicitly excluded end-to-end Strata ask.
The synonym integration tests passed on both labs. A final focused rerun after
catalog edits also passed: 3 unit tests and 2 lab integration tests.
`git diff --check` passed. `node_modules` was absent and was symlinked to
`../needlefish/node_modules` as authorized; no dependency files were changed.

Initial source-coverage test failure exposed the missing unified-audit views
and non-view strings matched by the first scanner version; the final scanner
and catalog resolve those findings. Nothing remains unverified beyond live
PDB behavior and the deliberately excluded Strata test. No contract changes,
coordinator edits, or grant-template additions are needed.
