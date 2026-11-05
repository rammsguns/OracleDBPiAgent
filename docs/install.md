# Install the CLI

Use Node 24 and npm. Install from a clone:

```bash
git clone https://github.com/rammsguns/OracleDBPiAgent.git
cd OracleDBPiAgent
npm ci
npm install -g .
piagent --version
piagent init
```

Or install a packed tarball from the prepared clone:

```bash
npm pack
# Replace the filename below with the one printed by npm pack.
npm install -g ./oracledb-pi-agent-1.2.0.tgz
```

The prepare script compiles the CLI and web assets. Run `piagent` from any
directory after installation. Keep the clone directory when installing it
because npm links global directory installs to their source.

Direct global GitHub/git-source installs currently fail: npm runs git preparation
without locally available devDependencies under `-g`, so `tsc` is missing. This
was reproduced with npm 9.2.0 and npm 11 using a local git source. Use the verified
clone or packed-tarball paths above; direct git installation is not supported yet.

`piagent init` creates `~/.piagent` with mode 0700 and `.env` with mode 0600.
It copies the bundled template with placeholder paths and never overwrites an
existing file or writes credentials. Edit the two credential-file paths before
using DB or LLM commands. Passwords stay in `PIAGENT_SECRET_DIR`; the Strata key
stays in its separate file. See the [quick start](../README.md#quick-start) for
approved accounts and credential file names.

Set `PIAGENT_HOME` to choose another private home. Existing homes must be real
directories owned by the current user with no group/other permissions; they are
never chmodded. A permission failure prints `PIAGENT_HOME must be private (mode 0700)`
and exits 1; remove group/other permissions on your private home before retrying.
Fixed configuration validation messages are shown directly. Unexpected errors
(including filesystem and JSON errors that may contain private input) retain the
generic failure message. Read-only commands such as `--version` do not create the home.
On startup the CLI loads
`PIAGENT_ENV_FILE`, or `$PIAGENT_HOME/.env` (default `~/.piagent/.env`). Missing
default files are allowed; a missing explicit `PIAGENT_ENV_FILE` is an error.
Existing environment variables win, including empty values.
Env files must be private regular files: group/other permissions and symlinks
are refused. No env values are printed. The working directory's `.env` is never
automatically loaded.

Default targets come from the installed package; audit records go to
`$PIAGENT_HOME/audit.jsonl`, and report history to `$PIAGENT_HOME/reports`.
`PIAGENT_TARGETS_FILE`, `PIAGENT_AUDIT_FILE`, and `PIAGENT_REPORT_DIRECTORY`
override these paths; `report --out` overrides history for that command.
Reports are saved when `--out` or diff mode is requested, as before.

```bash
piagent targets
piagent report --target d1-19c-lab --sections identity
```

Reports make bounded read-only DB queries without an LLM call unless
`--summarize` is supplied. The approved targets, Oracle 19c gate, read-only
policy and loopback-only Strata endpoint remain mandatory.

For clone development, `npm ci` builds automatically and the existing explicit
workflow still works:

```bash
cp .env.example .env
chmod 600 .env
# Edit local paths in .env.
node --env-file=.env dist/cli/index.js targets
```

Clone users can keep artifacts in `var/` by setting
`PIAGENT_AUDIT_FILE=./var/audit.jsonl` and `PIAGENT_REPORT_DIRECTORY=./var/reports`
in their `.env` (uncomment the report setting in the template).

Explicit `--env-file` settings win over automatic private-home settings.

## Migration and scheduled reports

Since phase 9, unset audit/report path settings use `~/.piagent/`, rather than
working-directory `var/` paths. Existing files are not moved. To inspect older
history, set `PIAGENT_REPORT_DIRECTORY` to its directory. `report history` reads
saved files only and creates nothing.

```bash
piagent report history --target d1-19c-lab --last 10 --json
piagent report schedule --target d1-19c-lab --every 1h
```

The schedule helper only prints configuration and one-time setup; it installs no
units and runs no `systemctl`. Intervals are `15m`, `1h`, `6h`, `1d`. Initialize
the private home and edit its `.env` first, including `PIAGENT_SECRET_DIR`.
Inspect and run the printed setup once outside the service sandbox: create the
private report directory and touch/chmod the audit and alert files without
truncating them. Existing paths must be owned by you, private and not symlinks.
Choose either the printed systemd timer or cron alternative, with one writer per
output directory. Then test manually:

```bash
piagent report schedule run --target d1-19c-lab
```

Manual `schedule run` defaults to `<PIAGENT_HOME>/reports`; pass `--out`
explicitly when using a separate report directory. The generated schedule pins
the directory selected when it was printed.

The runner reads only `<PIAGENT_HOME>/.env`, ignores ambient `PIAGENT_ENV_FILE`,
and preflights the report directory and both log files. Explicit absolute
`--home` / `--out` override defaults. Generated commands pin Node and CLI paths;
regenerate after either changes. Exit 3 from the report appends a private local
alert and succeeds; other failures remain failures. See the
[schedule helper](report.md#schedule-helper-wp-12b) for sandbox details.

See the [full command list](../README.md#commands), [drift guide](drift.md) and
[web UI](web-ui.md) for the new metadata comparison and saved-history views.

## Upgrade to 1.2.0

Rebuild and reinstall the updated clone, or install its prepared tarball as above.
The coordinator sets the package version for the release; `piagent --version`
reports the installed package, so a pre-release checkout may still report 1.1.0.
Existing private configuration and saved reports stay in place. `init` never
replaces an existing `.env`. No npm registry release is required for this workflow.

SQL insight and security need no LLM: see [SQL insight](sqlperf.md),
[security](security.md) and the [grant-request index](grants.md). No grant script
is an install step. New security report sections are opt-in.

Before using ask/chat, replace init's `/absolute/path/to/strata-api-key` with the
existing private key-file path in `PIAGENT_LLM_API_KEY_FILE`. The placeholder is
rejected before any service contact. The CLI exits 1 with guidance naming
`PIAGENT_LLM_API_KEY_FILE` and asks you to edit your private `.env` or export
the setting.

Generated schedules pin the current Node and CLI executables. A warning now flags
Node paths outside recognized system locations, including temporary, bundled and
version-manager paths. Review the warning, use a stable Node installation and
regenerate the schedule after changing Node or the installed CLI. This heuristic
does not test that an executable will remain available to the service account.
