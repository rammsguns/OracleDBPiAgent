# Install the CLI

Use Node 24 and npm. Install directly from GitHub (no npm publication):

```bash
npm install -g github:rammsguns/OracleDBPiAgent
piagent --version
piagent init
```

Or install from a clone with `npm install -g .`. The prepare script compiles the
CLI and web assets. Run `piagent` from any directory after installation.

`piagent init` creates `~/.piagent` with mode 0700 and `.env` with mode 0600.
It copies the bundled template with placeholder paths and never overwrites an
existing file or writes credentials. Edit the two credential-file paths before
using DB or LLM commands. Passwords stay in `PIAGENT_SECRET_DIR`; the Strata key
stays in its separate file. See the [quick start](../README.md#quick-start) for
approved accounts and credential file names.

Set `PIAGENT_HOME` to choose another private home. On startup the CLI loads
`PIAGENT_ENV_FILE`, or `$PIAGENT_HOME/.env` (default `~/.piagent/.env`). Missing
files are allowed. Existing environment variables win, including empty values.
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

Explicit `--env-file` settings win over automatic private-home settings.
