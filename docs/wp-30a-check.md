# WP-30A: Phase 30 check engine and CLI

Implemented the deterministic health check engine in `src/check/`, minimal `check` command registration in `src/cli/index.ts`, the `check` union in `src/preflight/views.ts`, and operator documentation in `docs/check.md`. Added fake-driven engine/config/CLI tests, both-lab integration tests, and the command to the release help smoke.

The engine calls the existing space, sessions, backup, jobs, alertlog and security functions. It adds no SQL or grants, calls no LLM, and uses one connection per target. Collector probes run sequentially with a remaining-time query budget. Missing grants, incomplete data and inapplicable checks remain UNKNOWN. Threshold files require owner-owned regular files mode 0600, no symlinks, bounded values and known keys. Overrides apply per configured target. Output uses version 1 JSON or a Markdown table; `--out` appends one redacted record for the whole run. Documented exit mapping (corrected after coordinator smoke below) and distinct stderr for usage/configuration failures.

Changed files:

- `src/check/config.ts`, `src/check/index.ts`, `src/check/cli.ts`
- `src/cli/index.ts` (only command registration)
- `src/preflight/views.ts` (collector-view union only)
- `docs/check.md`, this report
- `tests/unit/check.test.ts`, `tests/unit/check-cli.test.ts`, `tests/unit/release-help.test.ts`
- `tests/integration/check.test.ts`

Contract changes needed: **none**. The exported local `CheckRun`, `Verdict`, `Status`, thresholds and runner are available to WP-30B and WP-30C without modifying `src/contracts.ts`.

Verification:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: **130 files passed, 2,444 tests passed**, 82.38 s (includes 60 new engine/config/CLI cases and the added release-help case).
- Both-lab focused integration: **2 passed**, 4.67 s. Uses only the packaged lab targets and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`.
- Live CLI JSON smokes on both labs: both returned UNKNOWN as expected for unavailable/inapplicable backup/recovery evidence. d1 additionally reported maintenance WARN and default-password CRIT. These values are observations, not stable expectations.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`: **36 files passed; 80 tests passed, 1 skipped (81)**, 427.43 s. The excluded Strata e2e is the skipped test.
- `git diff --check`: passed.

Final full-suite output:

```text
> npm run typecheck
> tsc -p tsconfig.json --noEmit
(no errors)

> npm test -- --maxWorkers=2
Test Files  130 passed (130)
     Tests  2444 passed (2444)
  Duration  82.38s

> npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"
Test Files  36 passed (36)
     Tests  80 passed | 1 skipped (81)
  Duration  427.43s
```

No Strata calls, no database changes, no new dependencies, no pushes or merges. Missing `node_modules` was linked to `../needlefish/node_modules` as instructed.

Unverified: real Oracle 19c CDB/PDB behavior (both labs are non-CDB); restore feasibility and external RMAN catalogs/media (intentionally outside the collectors); external Nagios/Icinga/Zabbix deployment. Native driver call cancellation and connection/cleanup time use the existing provider; no abandoned Promise overlaps the next probe. Windowed checks use a configurable rolling lookback (default one hour), not persisted last-run cursors; scheduling guidance is in `docs/check.md`.


## Coordinator smoke fixes (2026-11-07)

The original coordinator output is preserved verbatim in `docs/wp-30a-smoke-lab-d1.md`, committed as `72363a0`. It records the incorrect UNKNOWN-over-CRIT aggregation, raw floating-point terminal output, HTML entities and generic UNKNOWN notes that prompted this revision.

Changes:

- `src/check/index.ts`: aggregate using monitoring-plugins `max_state_alt` order OK < UNKNOWN < WARN < CRIT, count effective statuses in the header, keep raw JSON numbers with rounded `display`, escape Markdown pipes/backticks without HTML entities, and derive actionable UNKNOWN reasons using existing collector evidence. Default-password notes include up to ten validated usernames and `+N more`.
- `src/check/config.ts`: strictly validate `disable` lists and `checks.NAME.unknownAs` policy objects in defaults and target overrides. Disabled checks are SKIPPED and not counted; fully disabled collectors are not invoked. Explicit UNKNOWN mappings retain `observedStatus: "UNKNOWN"`, the null raw measurement, `display: "UNKNOWN"`, and the original reason.
- Unit tests cover mixed status precedence, display precision, terminal formatting/counts, each Oracle grant code/view, NOARCHIVELOG, no configured recovery area, empty retained backup history, PDB-hidden evidence, every mapping value, invalid policies, merge precedence, disabled checks, and username validation/capping. Integration tests compare reasons with the actual collector evidence on both labs.
- `docs/check.md` documents the new policy schema, behavior and precedence. No new SQL, views, grants or dependencies. No LLM calls. No shared contract edits required; local API additions are `Verdict.display`, optional `Verdict.observedStatus`, `CheckStatus` including SKIPPED, and threshold policy fields.

### Both-lab reruns with built-in defaults

These runs explicitly selected `config/targets.json`, used only the two approved labs and `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`. The target names below are packaged names; the coordinator's `lab-d1` alias names the same d1 lab. Counts are actual observed counts: d1 has 15 verdict rows, p1 has 16. No artificial OK row is added to match an example header.

Command: `piagent check --target d1-19c-lab`; exit **2**.

```text
# Check: CRIT — 1 CRIT, 1 WARN, 3 UNKNOWN, 10 OK (d1-19c-lab)
Captured 2026-11-07T19:21:54.704Z (UTC). Sequential snapshots; windowed history is not a continuous monitor.

| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| d1-19c-lab | tablespace:SYSAUX | OK | 3.7 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target d1-19c-lab |  |
| d1-19c-lab | tablespace:SYSTEM | OK | 3.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target d1-19c-lab |  |
| d1-19c-lab | tablespace:USERS | OK | 1.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target d1-19c-lab |  |
| d1-19c-lab | undo:UNDOTBS1 | OK | 0.1 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target d1-19c-lab |  |
| d1-19c-lab | temp:TEMP | OK | 0.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target d1-19c-lab |  |
| d1-19c-lab | recovery | UNKNOWN | UNKNOWN | 80 / 90 | Database-wide (non-CDB) | piagent space --target d1-19c-lab | No recovery area configured (DB_RECOVERY_FILE_DEST unset); V$RECOVERY_FILE_DEST has no configured area. |
| d1-19c-lab | blocking | OK | 0 seconds | 60 / 300 | Database-wide (non-CDB) | piagent sessions --target d1-19c-lab |  |
| d1-19c-lab | backupAge | UNKNOWN | UNKNOWN | 26 / 50 | Database-wide (non-CDB) | piagent backup --target d1-19c-lab | No backups recorded in the visible control-file history; external catalogs and aged-out records are not checked. |
| d1-19c-lab | archiveGaps | UNKNOWN | UNKNOWN | > 0 = CRIT | Database-wide (non-CDB) | piagent backup --target d1-19c-lab | NOARCHIVELOG: archived-log sequence-gap check is not applicable. |
| d1-19c-lab | failedJobs | OK | 0 runs | 1 / 3 | Database-wide (non-CDB) | piagent jobs --target d1-19c-lab |  |
| d1-19c-lab | maintenance | WARN | 3 objects/index units | 1 / 20 | Database-wide (non-CDB) | piagent jobs --target d1-19c-lab | Index, partition and subpartition units counted separately. |
| d1-19c-lab | alertErrors | OK | 0 errors | 1 / incident only | Database-wide (non-CDB) | piagent alertlog --target d1-19c-lab | ORA occurrences in the lookback window. |
| d1-19c-lab | incidents | OK | 0 incidents | > 0 = CRIT | Database-wide (non-CDB) | piagent alertlog --target d1-19c-lab |  |
| d1-19c-lab | expiry | OK | 123.2 days | 14 / 3 | Database-wide (non-CDB) | piagent security --target d1-19c-lab |  |
| d1-19c-lab | defaultPasswords | CRIT | 5 accounts | > 0 = CRIT | Database-wide (non-CDB) | piagent security --target d1-19c-lab | Accounts: HR, IX, OE, PM, SH. |
```

Command: `piagent check --target p1-19c-prod`; exit **3**.

```text
# Check: UNKNOWN — 0 CRIT, 0 WARN, 3 UNKNOWN, 13 OK (p1-19c-prod)
Captured 2026-11-07T19:22:00.536Z (UTC). Sequential snapshots; windowed history is not a continuous monitor.

| Target | Check | Status | Value | Threshold WARN / CRIT | Scope | Drill down | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p1-19c-prod | tablespace:SHOP_DATA | OK | 3.9 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | tablespace:SYSAUX | OK | 3.2 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | tablespace:SYSTEM | OK | 3.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | tablespace:USERS | OK | 0.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | undo:UNDOTBS1 | OK | 0.1 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | temp:TEMP | OK | 0.0 % | 85 / 95 | Database-wide (non-CDB) | piagent space --target p1-19c-prod |  |
| p1-19c-prod | recovery | UNKNOWN | UNKNOWN | 80 / 90 | Database-wide (non-CDB) | piagent space --target p1-19c-prod | No recovery area configured (DB_RECOVERY_FILE_DEST unset); V$RECOVERY_FILE_DEST has no configured area. |
| p1-19c-prod | blocking | OK | 0 seconds | 60 / 300 | Database-wide (non-CDB) | piagent sessions --target p1-19c-prod |  |
| p1-19c-prod | backupAge | UNKNOWN | UNKNOWN | 26 / 50 | Database-wide (non-CDB) | piagent backup --target p1-19c-prod | No backups recorded in the visible control-file history; external catalogs and aged-out records are not checked. |
| p1-19c-prod | archiveGaps | UNKNOWN | UNKNOWN | > 0 = CRIT | Database-wide (non-CDB) | piagent backup --target p1-19c-prod | NOARCHIVELOG: archived-log sequence-gap check is not applicable. |
| p1-19c-prod | failedJobs | OK | 0 runs | 1 / 3 | Database-wide (non-CDB) | piagent jobs --target p1-19c-prod |  |
| p1-19c-prod | maintenance | OK | 0 objects/index units | 1 / 20 | Database-wide (non-CDB) | piagent jobs --target p1-19c-prod | Index, partition and subpartition units counted separately. |
| p1-19c-prod | alertErrors | OK | 0 errors | 1 / incident only | Database-wide (non-CDB) | piagent alertlog --target p1-19c-prod | ORA occurrences in the lookback window. |
| p1-19c-prod | incidents | OK | 0 incidents | > 0 = CRIT | Database-wide (non-CDB) | piagent alertlog --target p1-19c-prod |  |
| p1-19c-prod | expiry | OK | 166.4 days | 14 / 3 | Database-wide (non-CDB) | piagent security --target p1-19c-prod |  |
| p1-19c-prod | defaultPasswords | OK | 0 accounts | > 0 = CRIT | Database-wide (non-CDB) | piagent security --target p1-19c-prod |  |
```

The corresponding `--json` commands returned the same overall states and exit codes. A representative numeric record retained `value: 3.7128466190560436` alongside `display: "3.7 %"`; the Markdown table displays only the rounded string. No HTML entities were printed.

### Live policy verification

Each scenario used a temporary owner-owned private home and mode-0600 `check.json`; the owner's configuration was not changed. Policies were applied per target:

- `disable`: `disable: ["backupAge", "archiveGaps", "recovery"]`.
- `unknown-warn`: `disable: ["backupAge", "archiveGaps"]`, `checks: {"recovery": {"unknownAs": "warn"}}`.
- `unknown-ok`: `checks` maps each of backupAge/archiveGaps/recovery UNKNOWN to `ok`; their raw UNKNOWN observations and reasons remain in JSON.

```text
disable: d1-19c-lab: CRIT, exit 2; recovery=SKIPPED; backupAge=SKIPPED; archiveGaps=SKIPPED
disable: p1-19c-prod: OK, exit 0; recovery=SKIPPED; backupAge=SKIPPED; archiveGaps=SKIPPED
unknown-warn: d1-19c-lab: CRIT, exit 2; recovery=WARN; backupAge=SKIPPED; archiveGaps=SKIPPED
unknown-warn: p1-19c-prod: WARN, exit 1; recovery=WARN; backupAge=SKIPPED; archiveGaps=SKIPPED
unknown-ok: d1-19c-lab: CRIT, exit 2; recovery=OK; backupAge=OK; archiveGaps=OK
unknown-ok: p1-19c-prod: OK, exit 0; recovery=OK; backupAge=OK; archiveGaps=OK
```

Representative JSON from the live `unknown-ok` p1 run:

```json
{
  "id": "recovery",
  "status": "OK",
  "observedStatus": "UNKNOWN",
  "value": null,
  "display": "UNKNOWN",
  "note": "No recovery area configured (DB_RECOVERY_FILE_DEST unset); V$RECOVERY_FILE_DEST has no configured area. Policy unknownAs=ok maps UNKNOWN to OK."
}
```

This also verifies that mapped or skipped UNKNOWN results cannot hide d1's measured default-password CRIT. The default-password account names in the report are usernames only, not passwords or credential values.

### Revision validation

`npm run typecheck`: passed. `npm test -- --maxWorkers=2`: **130 files passed, 2,474 tests passed**, 81.17 s. Focused check/preflight tests: **95 passed**. Focused check integration: **2 passed** on the two labs, 4.85 s. The first unit run caught a preflight-scanner false positive on prose containing “from totals”; the prose was rewritten, without changing scanner exceptions or adding any view. `git diff --check`: passed.

Full integration command: `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"`: **36 files passed, 80 tests passed, 1 skipped**, 434.07 s. The excluded Strata end-to-end test is the skipped test.

Final revision output:

```text
> npm run typecheck
> tsc -p tsconfig.json --noEmit
(no errors)

> npm test -- --maxWorkers=2
Test Files  130 passed (130)
     Tests  2474 passed (2474)
  Duration  81.17s

> npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"
Test Files  36 passed (36)
     Tests  80 passed | 1 skipped (81)
  Duration  434.07s
```

Implementation commit: `ffb3e9a`. Original coordinator smoke evidence commit: `72363a0`. No push or merge was performed.

Live 19c CDB/PDB behavior remains unverified; both labs are non-CDB. Missing-grant and PDB-hidden branches were verified with fakes, without changing any grants or database state. Native driver cancellation/cleanup bounds are unchanged.
