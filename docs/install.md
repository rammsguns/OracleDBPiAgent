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
npm install -g ./oracledb-pi-agent-1.0.0.tgz
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
never chmodded. Read-only commands such as `--version` do not create the home.
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
