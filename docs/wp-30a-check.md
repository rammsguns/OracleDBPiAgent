# WP-30A: Phase 30 check engine and CLI

Implemented the deterministic health check engine in `src/check/`, minimal `check` command registration in `src/cli/index.ts`, the `check` union in `src/preflight/views.ts`, and operator documentation in `docs/check.md`. Added fake-driven engine/config/CLI tests, both-lab integration tests, and the command to the release help smoke.

The engine calls the existing space, sessions, backup, jobs, alertlog and security functions. It adds no SQL or grants, calls no LLM, and uses one connection per target. Collector probes run sequentially with a remaining-time query budget. Missing grants, incomplete data and inapplicable checks remain UNKNOWN. Threshold files require owner-owned regular files mode 0600, no symlinks, bounded values and known keys. Overrides apply per configured target. Output uses version 1 JSON or a Markdown table; `--out` appends one redacted record for the whole run. Documented exit mapping includes UNKNOWN precedence and distinct stderr for usage/configuration failures.

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
