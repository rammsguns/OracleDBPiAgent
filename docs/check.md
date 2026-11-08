# Monitoring with piagent check

`piagent check --target d1-19c-lab --json` runs sequential, read-only Oracle 19c collectors without an LLM. Use `--all-targets` instead of `--target` to check all configured owner-approved targets. The packaged labs are d1-19c-lab, p1-19c-prod c1-19c-pdb and c1s-19c-stby.

Text output is a Markdown table. JSON has a versioned envelope: `version: 1`, `capturedAt` (UTC), aggregate `status`, and ordered `targets`. Each target has `target`, `status`, and `checks`. Each check has a stable `id`, `status`, numeric `value` (or null for UNKNOWN/SKIPPED or an established absence of expiry), rounded `display` string, `unit`, `threshold`, `scope`, `command`, and `note`. Named tablespaces produce `tablespace:NAME`, `undo:NAME` and `temp:NAME` IDs. Missing/inapplicable sections have an UNKNOWN placeholder. Raw SQL, binds, job messages, alert messages and connection credentials are omitted. The default-password note names at most ten validated usernames, followed by `+N more`; only simple Oracle identifiers of at most 128 characters are accepted. Percentages, days and hours display one decimal; seconds display as integers. JSON retains the original numeric measurement alongside `display`. CLI Markdown escapes pipes and backticks without HTML entities.

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

Tablespaces and temp include autoextend headroom, respecting fixed allocations. Undo occupancy includes active and unexpired extents through the existing tablespace collector. Maintenance excludes Oracle-maintained owners using the security collector's user metadata. Indexes, partitions and subpartitions are separate units. Locked accounts do not enter expiry checks. When the users view is readable and complete and no unlocked non-Oracle-maintained account has an expiry date, expiry is OK with `value: null`, `display: "none"` and the note `No expiring unlocked accounts (unlimited or no expiry)`. No artificial expiry date is invented. Missing or truncated user metadata remains UNKNOWN; an explicitly EXPIRED unlocked account remains critical even if its date is absent.

The default lookback is one hour. Failed runs and alerts use the configured lookback on every invocation, including the first. This is a rolling window, not a persisted cursor; schedule runs at or below the lookback interval to avoid gaps. Overlap intentionally repeats evidence. Counts are limited to visible retained history.

By default, missing privileges (ORA-00942, ORA-01031, ORA-65040), timeouts, errors, incomplete row-capped results and inapplicable evidence yield UNKNOWN. A readable truncated alert-log result is a count lower bound: if visible ORA occurrences already reach WARN or CRIT, that threshold status is retained with `display: ">= N errors"`, numeric `value: N`, `lowerBound: true`, and a truncation note. A truncated count below threshold stays UNKNOWN because omitted rows could change the verdict. The same rule preserves an already-proven incident CRIT. Complete counts remain exact and omit `lowerBound`. Notes retain the view and Oracle code, or explain NOARCHIVELOG, PDB-hidden metadata, no configured recovery area (DB_RECOVERY_FILE_DEST unset), or no backups recorded in visible control-file history (external catalogs and aged-out records not checked). An explicit `unknownAs` policy can change the effective status, while retaining the UNKNOWN observation, null measurement and original reason. A missing optional view used by a check also makes that check UNKNOWN. Scope labels distinguish this PDB, shared CDB metadata and non-CDB databases. PDB-empty backup and recovery metadata cannot establish absence. Live PDB behavior is verified on C1; d1 and p1 remain non-CDB regression targets.

Exit codes are 0 OK, 1 WARN, 2 CRIT, 3 UNKNOWN. Aggregation uses the monitoring-plugins `max_state_alt` order **OK < UNKNOWN < WARN < CRIT**, rather than numeric exit-code order. Any CRIT makes the overall result CRIT (exit 2); otherwise any WARN makes it WARN (exit 1); otherwise any UNKNOWN makes it UNKNOWN (exit 3); otherwise it is OK (exit 0). Apply this order within each target and across all targets. SKIPPED checks do not contribute. The header includes actual effective-status counts and selected target names, for example `# Check: CRIT — 1 CRIT, 1 WARN, 3 UNKNOWN, 10 OK (d1-19c-lab)`. `--fail-on warn` uses these defaults. `--fail-on crit` maps WARN to 0 and preserves CRIT=2 and UNKNOWN=3. Usage and threshold configuration errors exit 2 with a `Usage/config error:` stderr message and no verdict JSON. Commander syntax errors also exit 2 with `error:` on stderr. A CRIT health result instead prints a normal verdict containing `status: "CRIT"`. Existing application configuration errors retain the CLI's exit 1 semantics. Output persistence errors retain exit 1 unless the output file fails the private-file validation (exit 2).

## Private thresholds

Create `~/.piagent/check.json` (or `$PIAGENT_HOME/check.json`) as the current user with **mode 0600 or 0400** (owner-only; read-only configuration is supported). It must be a regular file, not a symlink, and no larger than 128 KiB. Without it, built-in defaults apply. Example:

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

Known threshold keys are `space`, `recovery`, `blocking`, `backupAge`, `dgLag`, `failedJobs`, `alertErrors`, `maintenance`, `expiry`, and `windowHours`; `disable` and `checks` configure monitoring policies. Pairs require exactly `warn` and `crit`; a pair override replaces the entire pair. All numeric thresholds must be finite, nonnegative, and no greater than 1000000 (percentages no greater than 100). WARN must be below CRIT, except expiry where CRIT must be below WARN. `alertErrors.crit` may be null (default: no count-based critical level; incidents remain critical). `windowHours` must be an integer from 1 through 720. Unknown keys and unconfigured target overrides are rejected. Per-target pairs override global pairs, which override built-ins. Threshold files contain no passwords or SQL.

## Disabling checks and setting UNKNOWN policy

Monitoring policies can be placed in `defaults` or a configured target override. Example for the packaged p1 lab, which has no recovery area, no retained backup history and uses NOARCHIVELOG:

```json
{
  "version": 1,
  "targets": {
    "p1-19c-prod": {
      "disable": ["backupAge", "archiveGaps"],
      "checks": {
        "recovery": { "unknownAs": "warn" }
      }
    }
  }
}
```

`disable` accepts unique names from `tablespaces`, `temp`, `undo`, `recovery`, `blocking`, `backupAge`, `archiveGaps`, `dgLag`, `failedJobs`, `alertErrors`, `incidents`, `maintenance`, `expiry`, `defaultPasswords`. Use the configured target name (the coordinator's private target aliases may differ). The three space families disable all their named tablespaces. Disabled rows show `SKIPPED`, a null value and `display: "SKIPPED"`; they are excluded from aggregate status and header counts. An entirely disabled collector is not invoked. A partially disabled collector may still read its shared views for enabled checks.

`checks.NAME.unknownAs` accepts exactly `ok`, `warn`, `crit`, or `unknown` (default). It only maps an UNKNOWN result; it never changes a measured WARN or CRIT. Mapped JSON retains `observedStatus: "UNKNOWN"`, `value: null`, `display: "UNKNOWN"` and the original reason, with an explicit policy note. Header counts and exit codes use the effective mapped status. A disabled check stays SKIPPED regardless of `unknownAs`.

Per-target `disable` replaces the defaults list; an empty list enables the checks again. `checks` policies merge by check name, with target policy taking precedence. Unknown check names, duplicate disable names, extra policy keys and invalid mapping values are rejected with exit 2. An all-disabled run is OK with zero counted checks, and its table makes the skipped checks explicit.

## Trends and operational bounds

`piagent check --all-targets --json --out /private/health` appends exactly one redacted JSON record per invocation to `check.jsonl`, containing all selected targets. The directory is created mode 0700; a new file is created mode 0600. Existing files must be owner-owned regular files mode 0600; symlinks are refused. Protect the parent directory yourself. Every string in output is passed through the shared credential redactors before display and append.

Collectors, targets, queries and pages run sequentially. Each collector gets one statement-timeout budget; every query receives the remaining budget and no further query begins after it expires. Native driver call timeout handles an in-flight database call; cancellation is never implemented as an abandoned Promise racing the next probe. Connection establishment and native cleanup use existing provider limits. This is a sequence of bounded snapshots, not one transactionally consistent snapshot. The preflight `check` group is exactly the union of space, backup, sessions, jobs, alertlog and security views; standby probes additionally need the three SELECT grants below.

For programmatic consumers, `src/check/index.ts` exports `runChecks(ctx, targets, thresholdsForTarget?)`, `CheckRun`, `Verdict`, `Status`, `collectors`, `renderCheckMarkdown` and `exitCode`. The context uses the existing `ToolContext` contract. Cancellation wrappers can be supplied through its session provider. Collectors never close the underlying shared session; the caller owns `closeAll()`.

## Live PDB verification (2026-11-08)

PDB backup age can use labelled per-datafile full/level-0 metadata when RMAN jobs are empty. Alert-error collection filters ORA text in the requested window and current container plus CON_ID 0/1 (CDB-wide/instance) before applying the cap; capped counts retain the existing lower-bound rule. TEMP measures active usage; UNDO measures active plus unexpired bytes, excluding reusable expired extents. See [WP-31A](wp-31a-pdb-live.md).


## Review follow-up: instance ADR visibility

For a PDB target, alertErrors and incidents explicitly disclose mixed PDB and visible CDB-wide/instance ADR scope (CON_ID 0/1) in their notes and scope labels. Other PDBs are excluded. Oracle may hide instance rows from a local PDB login; an empty or clean visible result does not prove instance-wide absence. Existing row caps and lower-bound rules still apply to the combined visible window.

## Physical standby (Phase 32)

Role, open mode, DB_UNIQUE_NAME and protection mode are read once per session
from V$DATABASE and included in every check scope, backup/space output and
health_check text. The web Check tab displays the same scope. Hidden identity
is labelled UNKNOWN; backup age cannot become healthy without a known role.

`dgLag` measures the maximum of transport and apply lag from V$DATAGUARD_STATS,
with WARN 300 seconds and CRIT 1800 seconds (inclusive). Configure `dgLag` as
any other threshold pair, disable it with `disable`, or map UNKNOWN with
`checks.dgLag.unknownAs`. MRP0 must be visible and running in V$MANAGED_STANDBY.
Missing/NULL lag, missing grants, capped results or absent MRP produce UNKNOWN.
A primary returns OK, zero, explicitly labelled not applicable. This prevents
normal primary installations acquiring an inapplicable UNKNOWN.

Standby archive gaps combine V$ARCHIVE_GAP with continuity of distinct RFS
received sequences in the current incarnation, per thread. RMAN duplicate's
SRMN records and copied primary V$LOG_HISTORY do not establish the standby's
baseline. Deleted received log files still count as received; they do not imply
an apply gap. Missing RFS history produces UNKNOWN, not a healthy zero. Primary
backup-chain media availability retains its separate checkpoint-based semantics:
deleted logs can genuinely break a primary restore chain.

Standby backupAge is UNKNOWN: visible per-datafile completion times and RMAN
history may have been copied during duplicate or redo apply. The backup command
still reports that evidence, with a note that backups are normally taken on the
primary; it does not claim these are local standby backups. Failed scheduler
runs and maintenance still retain their measured severity and explicitly label
the history and object status as replicated from the primary.

Minimal additional PDB grants: SELECT on SYS.V_$ARCHIVE_GAP,
SYS.V_$DATAGUARD_STATS and SYS.V_$MANAGED_STANDBY. V_$DATABASE is already granted.
Preflight includes these views. On C1, grants were applied on the primary PDB
and replicated to C1S. Oracle 19.9 C1S exposes NULL apply lag from the PDB while
the root shows zero; this correctly stays UNKNOWN. It is not inferred from
OPEN_MODE or transport lag. No container or recovery configuration was changed.
