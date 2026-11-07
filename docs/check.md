# Monitoring with piagent check

`piagent check --target d1-19c-lab --json` runs sequential, read-only Oracle 19c collectors without an LLM. Use `--all-targets` instead of `--target` to check all configured owner-approved targets. Agents verify only the two packaged labs.

Text output is a Markdown table. JSON has a versioned envelope: `version: 1`, `capturedAt` (UTC), aggregate `status`, and ordered `targets`. Each target has `target`, `status`, and `checks`. Each check has a stable `id`, `status`, numeric `value` (or null for UNKNOWN), `unit`, `threshold`, `scope`, `command`, and `note`. Named tablespaces produce `tablespace:NAME`, `undo:NAME` and `temp:NAME` IDs. Missing/inapplicable sections have an UNKNOWN placeholder. Raw SQL, binds, job messages, alert messages, account names and connection credentials are omitted.

Defaults (limits are inclusive):

| Check | WARN | CRIT |
| --- | --- | --- |
| Tablespace/temp/undo used % of maximum allocation | 85 | 95 |
| Recovery area used % after reclaimable space | 80 | 90 |
| Longest blocked session wait, seconds | 60 | 300 |
| Full/level-0 backup age, hours | 26 | 50 |
| Archived-log sequence gaps | — | any |
| Failed scheduler runs in window | 1 | 3 |
| Alert ORA occurrences in window | 1 | incident (separate check) |
| Invalid objects plus unusable index units | 1 | 20 |
| Earliest unlocked application-account expiry, days | 14 | 3 |
| Open accounts with default passwords | — | any |

Full backup age is the oldest latest full/level-0 completion across visible datafiles, requiring successful RMAN job evidence. Incremental level 1 is not a full backup. Missing completion history is UNKNOWN; control-file history can age out. Sequence gaps reuse the existing backup collector's checkpoint/incarnation/thread analysis. NOARCHIVELOG makes gap checking UNKNOWN. Neither check proves restore feasibility or media readability.

Tablespaces and temp include autoextend headroom, respecting fixed allocations. Undo occupancy includes active and unexpired extents through the existing tablespace collector. Maintenance excludes Oracle-maintained owners using the security collector's user metadata. Indexes, partitions and subpartitions are separate units. Locked accounts do not enter expiry checks. No applicable expiring account yields UNKNOWN with an explanatory note; no artificial expiry date is invented.

The default lookback is one hour. Failed runs and alerts use the configured lookback on every invocation, including the first. This is a rolling window, not a persisted cursor; schedule runs at or below the lookback interval to avoid gaps. Overlap intentionally repeats evidence. Counts are limited to visible retained history.

Missing privileges (ORA-00942, ORA-01031, ORA-65040), timeouts, errors, incomplete row-capped results and inapplicable evidence yield UNKNOWN, never OK. A missing optional view used by a check also makes that check UNKNOWN. Scope labels distinguish this PDB, shared CDB metadata and non-CDB databases. PDB-empty backup and recovery metadata cannot establish absence. Live CDB/PDB behavior has not been verified on the non-CDB labs.

Exit codes are 0 OK, 1 WARN, 2 CRIT, 3 UNKNOWN. UNKNOWN takes precedence over CRIT, then WARN, so lost visibility cannot disappear behind a known finding. `--fail-on warn` uses these defaults. `--fail-on crit` maps WARN to 0 and preserves CRIT=2 and UNKNOWN=3. Usage and threshold configuration errors exit 2 with a `Usage/config error:` stderr message and no verdict JSON. Commander syntax errors also exit 2 with `error:` on stderr. A CRIT health result instead prints a normal verdict containing `status: "CRIT"`. Existing application configuration errors retain the CLI's exit 1 semantics. Output persistence errors retain exit 1 unless the output file fails the private-file validation (exit 2).

## Private thresholds

Create `~/.piagent/check.json` (or `$PIAGENT_HOME/check.json`) as the current user with **exact mode 0600**. It must be a regular file, not a symlink, and no larger than 128 KiB. Without it, built-in defaults apply. Example:

```json
{
  "version": 1,
  "defaults": {
    "windowHours": 2,
    "space": { "warn": 80, "crit": 92 }
  },
  "targets": {
    "d1-19c-lab": {
      "backupAge": { "warn": 30, "crit": 60 }
    }
  }
}
```

Known threshold keys are `space`, `recovery`, `blocking`, `backupAge`, `failedJobs`, `alertErrors`, `maintenance`, `expiry`, and `windowHours`. Pairs require exactly `warn` and `crit`; a pair override replaces the entire pair. All numeric thresholds must be finite, nonnegative, and no greater than 1000000 (percentages no greater than 100). WARN must be below CRIT, except expiry where CRIT must be below WARN. `alertErrors.crit` may be null (default: no count-based critical level; incidents remain critical). `windowHours` must be an integer from 1 through 720. Unknown keys and unconfigured target overrides are rejected. Per-target pairs override global pairs, which override built-ins. Threshold files contain no passwords or SQL.

## Trends and operational bounds

`piagent check --all-targets --json --out /private/health` appends exactly one redacted JSON record per invocation to `check.jsonl`, containing all selected targets. The directory is created mode 0700; a new file is created mode 0600. Existing files must be owner-owned regular files mode 0600; symlinks are refused. Protect the parent directory yourself. Every string in output is passed through the shared credential redactors before display and append.

Collectors, targets, queries and pages run sequentially. Each collector gets one statement-timeout budget; every query receives the remaining budget and no further query begins after it expires. Native driver call timeout handles an in-flight database call; cancellation is never implemented as an abandoned Promise racing the next probe. Connection establishment and native cleanup use existing provider limits. This is a sequence of bounded snapshots, not one transactionally consistent snapshot. The preflight `check` group is exactly the union of space, backup, sessions, jobs, alertlog and security views; no new grants are needed.

For programmatic consumers, `src/check/index.ts` exports `runChecks(ctx, targets, thresholdsForTarget?)`, `CheckRun`, `Verdict`, `Status`, `collectors`, `renderCheckMarkdown` and `exitCode`. The context uses the existing `ToolContext` contract. Cancellation wrappers can be supplied through its session provider. Collectors never close the underlying shared session; the caller owns `closeAll()`.
