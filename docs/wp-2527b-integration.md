# WP-25B / WP-26B / WP-27B integration

Branch: `wp-2527b-integration`.

## Built

- Triage routes recoverability/backup failures, RMAN errors and ORA-19xxx to `readBackup`. Evidence, findings, scope and restore-estimate limitations are included without running RMAN.
- Scheduler failures, named jobs and ORA-12012 discovery reuse `readJobs`. Named evidence is filtered to the resolved job/owner. Existing retained-run fallback, stack/source lookup and related-object graph remain in use. Job errors get the jobs credential-redaction pass before legacy history is rendered or parsed.
- “Slow right now” takes exactly one 15-second `sampleTop` measurement. The highest elapsed-time SQL ID goes to `collectSql`; no polling or ASH/AWR. API callers can supply `TriageOptions.signal`; the triage CLI handles Ctrl-C and closes the sample session.
- `/top [--seconds N]` returns the deterministic top rendering in CLI chat, with a default of 15 and range 5–120. Ctrl-C cancels the wait. It returns before `agent.prompt`; no prompt or tool-definition change.
- Opt-in `report --sections backup,jobs` uses the feature readers. Saved scalar rows contain metric/value/status/detail; evidence detail is serialized as JSON strings compatible with the existing history schema. Backup findings, archive gaps (unknown without a full-backup baseline), oldest full age and rolling-24-hour failed runs have trends. Missing, capped or unavailable evidence produces gaps, not zeroes. Partial evidence remains visible in Markdown.
- `drift --scope backup` compares explicit RMAN settings (including retention and autobackup when configured) and log mode only. It excludes backup history, file names, DBIDs, SCNs and workload data. Missing PDB rows withhold comparison; shared facts carry the CDB-wide label. Absent RMAN rows do not establish effective defaults.

Examples:

```sh
piagent triage --target p1-19c-prod --issue 'can we recover?'
piagent triage --target p1-19c-prod --issue 'NIGHTLY_PURGE_JOB failed' --since 30d
piagent triage --target p1-19c-prod --issue 'slow right now'
piagent report --target p1-19c-prod --sections backup,jobs
piagent drift --left d1-19c-lab --right p1-19c-prod --scope backup
# Inside CLI chat:
/top --seconds 5
```

## Files

- `src/triage/features.ts`: routing, audited bounded feature session, cancellation adapter.
- `src/triage/index.ts`, `alerts.ts`, `cli.ts`: composition, ORA-12012 matching, CLI cancellation.
- `src/report/features.ts`, `index.ts`, `trends.ts`: opt-in sections and history metrics.
- `src/drift/queries.ts`, `index.ts`: configuration-only backup comparison.
- `src/cli/chatTop.ts`, `index.ts`: deterministic slash command and scope help.
- `tests/unit/integration-features.test.ts`, `triage-alerts.test.ts`: routing positives/negatives, SQL handoff, redaction/object link, partial evidence/trends, drift and cancellation.
- Existing unit tests `cli-messages`, `triage-history`, `triage-sessions`: scope help and assertions adapted to the new jobs queries while retaining the prior session baseline.
- `tests/integration/integration-features.test.ts`: both-lab report/triage/chat adapter and backup drift checks.
- `tests/unit/interactive-connection-errors.test.ts`: readline event mock and Ctrl-C cancellation through the actual CLI command handler without a model request.

## Coordinator changes needed

No `src/contracts.ts`, `package.json`, `PLAN.md`, backup/jobs/top internals, agent prompt or tool changes were made. Triage's locally defined options gain optional `signal`; its inferred result gains optional backup/jobEvidence/top/topSql fields. Existing report-history and drift contracts accommodate the additions.

`src/preflight/views.ts` is outside this WP's allowed paths and must be updated by its owner:

- Include `V$RMAN_CONFIGURATION` and `V$DATABASE` in `FEATURE_VIEWS.drift`. The new fixed drift query causes the existing per-module coverage test to fail for `V$DATABASE` until this is done. The imported RMAN query is also a dependency even though the source scanner does not follow imports.
- Union the existing backup/jobs/top feature lists into triage, and backup/jobs into report.
- Add `report:backup` and `report:jobs` aliases to their corresponding feature lists so preflight probes these opt-in sections.

Suggested coordinator catalog addition, after the backup/jobs/top lists are initialized:

```ts
FEATURE_VIEWS.drift = [...new Set([...FEATURE_VIEWS.drift!, 'V$RMAN_CONFIGURATION', 'V$DATABASE'])];
FEATURE_VIEWS.triage = [...new Set([...FEATURE_VIEWS.triage!, ...FEATURE_VIEWS.backup!, ...FEATURE_VIEWS.jobs!, ...FEATURE_VIEWS.top!])];
FEATURE_VIEWS.report = [...new Set([...FEATURE_VIEWS.report!, ...FEATURE_VIEWS.backup!, ...FEATURE_VIEWS.jobs!])];
FEATURE_VIEWS['report:backup'] = FEATURE_VIEWS.backup!;
FEATURE_VIEWS['report:jobs'] = FEATURE_VIEWS.jobs!;
```

All referenced views already exist in the backup/jobs/top feature catalogs and the PDB grants template. No new database grant is needed for this WP.

The jobs reader currently reads every section even when a caller needs only scheduler jobs/runs/errors. An optional section selector or job-name filter would reduce triage queries and avoid fetching unrelated maintenance data; triage filters the returned scheduler evidence locally for now. This requires the jobs owner's change; no internals were edited here.

## Validation and live evidence

Required commands executed:

```sh
npm run typecheck
npm test -- --maxWorkers=2
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

The Strata e2e was excluded. `npm run typecheck` exits 0. The final full-suite output summaries follow below.

No Strata calls, evals, writes, RMAN, or DBMS_SCHEDULER execution were used. Only lab feature readers were exercised. Browser files were not edited, so `test:browser` was not required.

Final unit output (exit 1):

```text
 FAIL  tests/unit/preflight-catalog.test.ts > each module has its grantable views in its own feature
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "drift/queries.ts (drift): V$DATABASE",
+ ]

 ❯ tests/unit/preflight-catalog.test.ts:100:34
     98| });
     99| it('each module has its grantable views in its own feature', () => {
    100|  expect(missingReferences(true)).toEqual([]);
       |                                  ^
    101| });
    102| it('captures unfamiliar dictionary names and SYS qualification without…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 115 passed (116)
      Tests  1 failed | 2177 passed (2178)
   Start at  19:52:57
   Duration  75.51s (tests 76%, import 22%, worker 1%, transform 1%)
```

Focused CLI cancellation and feature tests: 2 files / 30 tests pass, 1.54 s. The new live integration file also passed 3/3 (145.56 s) in its focused run; the final full integration run covers the final routing and report source.

Final integration output (exit 1; 434.34 s):

```text
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
      Tests  1 failed | 74 passed | 1 skipped (76)
   Start at  19:48:42
   Duration  434.34s (tests 98%, import 2%)
```

Both-lab integration tests added by this WP pass in the final full run. The only skipped test is the explicitly excluded Strata e2e.

The full checks are not green until two out-of-lane changes are made:

1. The preflight catalog addition above. The failure is `drift/queries.ts (drift): V$DATABASE`, from `tests/unit/preflight-catalog.test.ts`.
2. `tests/integration/backup.test.ts:13` still asserts p1 backup status is `partial` because its premise predates the grants. The live status is now `ok`. Its owner should update the assertion to require readable evidence on both labs. This test belongs to the backup WP and was left unchanged.

The added live integration tests pass on both labs, including default 15-second triage sampling and the deterministic `/top --seconds 5` execution adapter. d1's SQL cache exceeds the sampler cap and correctly reports partial coverage. p1's 24-hour job snapshot exceeds a row cap and correctly reports unavailable trend metrics while retaining the visible evidence.

### Captured live output (2026-11-06)

Final scalar report output; `null` means unknown, and an unavailable failed-run value is excluded from trends:

```jsonl
{"target":"d1-19c-lab","sections":[{"name":"backup","status":"ok","capped":false,"metrics":[["findings",5,"ok"],["archive_gaps",null,"ok"],["restore_estimate",null,"ok"],["oldest_full_age_hours",null,"ok"]]},{"name":"jobs","status":"ok","capped":false,"metrics":[["failed_runs_24h",0,"ok"]]}]}
{"target":"p1-19c-prod","sections":[{"name":"backup","status":"ok","capped":false,"metrics":[["findings",6,"ok"],["archive_gaps",null,"ok"],["restore_estimate",null,"ok"],["oldest_full_age_hours",null,"ok"]]},{"name":"jobs","status":"unavailable","capped":true,"metrics":[["failed_runs_24h",0,"unavailable"]]}]}
```

Job triage, five-second top adapter samples and configuration-only drift:

```jsonl
{"target":"d1-19c-lab","issue":"K7Q_FAILJOB failed","codes":["ORA-20001","ORA-06512"],"relatedObjects":["K7Q_OWNER.K7Q_FAILJOB"],"schedulerSections":["jobs","lastErrors","runs"]}
{"target":"d1-19c-lab","sampleSeconds":5,"status":"partial","sql":"partial","sqlNotes":["Row cap reached; coverage incomplete and missing rows do not prove cursor aging."],"topSqlIds":["2rs36av3juhnr","4hjn9y8c7hzwm","3u99narb2a5dq"],"load":"ok","host":"ok"}
{"target":"p1-19c-prod","issue":"NIGHTLY_PURGE_JOB failed","codes":["ORA-12012","ORA-02292","ORA-06512"],"relatedObjects":["SHOPAPP.WORKLOAD","SHOPAPP.NIGHTLY_PURGE_JOB"],"schedulerSections":["jobs","lastErrors","runs"]}
{"target":"p1-19c-prod","sampleSeconds":5,"status":"ok","sql":"ok","sqlNotes":[],"topSqlIds":["dcs11f9gutsbh","2rs36av3juhnr","3u99narb2a5dq"],"load":"ok","host":"ok"}
{"backupDrift":{"complete":true,"hasDrift":false,"sections":[{"name":"rman_configuration","status":"ok","onlyLeft":0,"onlyRight":0,"different":0},{"name":"log_mode","status":"ok","onlyLeft":0,"onlyRight":0,"different":0}]}}
```

The restore estimates on both labs remain not-verifiable. A readable view is not proof that a restore will work; no backup media or recovery was exercised.

## Unverified

Live CDB/PDB behavior, RAC, Data Guard, remote targets and media restore validation are unverified. PDB visibility and missing-view behavior have fake-session unit coverage. Model/eval gate and any A/B gate remain coordinator work, as requested. CLI chat's `/top` execution adapter is tested live without starting a model conversation; readline Ctrl-C cancellation is covered through the CLI handler with mocked dependencies, but an interactive terminal smoke against a live database is unverified.

## Commits

- `f3fcbe3`: integrate backup/jobs/top evidence, reports, drift and slash command.
- `e8f79e1`: integration and regression coverage.
- `a34a311`: precise job routing and unknown gap counts without a full baseline.
- `a758edc`: readline Ctrl-C cancellation.
- `1b79939`: CLI cancellation regression coverage without model calls.

No push, merge, rebase or PR was performed.

## Authorized preflight follow-up

With coordinator authorization, added only `V$DATABASE` to `FEATURE_VIEWS.drift` in `src/preflight/views.ts`. Confirmed the existing `GRANT SELECT ON SYS.V_$DATABASE TO &ro_user CONTAINER=CURRENT;` at `docs/grants-template-pdb.sql:101`; the template was unchanged. The p1 backup integration assertion was left untouched for its owning branch.

Validation: `npm run typecheck` exits 0. `npx vitest run tests/unit/preflight-catalog.test.ts tests/unit/release-help.test.ts` exits 0: 2 files, 30 tests pass (26.99 s), including per-feature coverage and grant-template reconciliation. This resolves the previously reported drift catalog coverage failure; the broader catalog suggestions above remain coordinator follow-ups.

## Review Minor-1: whitespace around `/top`

`parseTopCommand` now trims surrounding whitespace before checking the slash-command boundary and parsing arguments. Leading spaces, tabs and trailing whitespace therefore reach the deterministic sampler. Unit coverage includes indented `/top --seconds 10`, surrounding whitespace around bare `/top`, whitespace-only input, and `/topx` non-matches. The CLI handler test verifies the indented command invokes the sampler and never prompts the agent.

Validation: `npm run typecheck` exits 0. `npm test -- --maxWorkers=2` exits 0: 116 files, 2,179 tests pass (78.38 s). No DB or Strata calls were made for this fix.
