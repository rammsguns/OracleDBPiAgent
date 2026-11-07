# Connect an owner-approved Oracle 19c PDB

This is the phase 28 setup path for a human DBA and database owner. The owner
approves the endpoint and metadata exposure; the DBA provisions access; the CLI
only reads. Agents and development workers still connect only to `d1-19c-lab`
and `p1-19c-prod` (plus the dedicated non-19c refusal test).

**Availability:** private targets and account/view preflight shipped in 1.4.0;
backup, jobs and top are included in 1.5.0. Check `piagent --version` and
`piagent targets check --help`. No live PDB has been tested here. The two labs
are Oracle 19.9.1 non-CDBs, including the service named PRODCDB.

## 1. Agree the PDB and provision its login (DBA)

Obtain the Oracle 19c PDB listener host, port and **PDB service name**, the expected
container name, and the application schema from the DBA. The product uses thin
Easy Connect (`host:port/serviceName`). A service name is not a SID or a container
name; use the registered PDB service, not the root service. The client must be able
to reach the listener. No SSH tunnel, listener or firewall setup is automated.

Using your normal authorized DBA process, connect directly to that PDB and inspect:

```sql
SELECT SYS_CONTEXT('USERENV','DB_NAME') db_name,
	SYS_CONTEXT('USERENV','CON_NAME') container_name,
	SYS_CONTEXT('USERENV','CON_ID') container_id
FROM dual;
SELECT version_full FROM product_component_version
WHERE product LIKE 'Oracle%Database%';
```

Require major version 19 and the expected non-root PDB (`CON_ID` greater than 1).
`CDB$ROOT` is refused by the product. Non-CDB labs remain supported.

The DBA creates a fresh **PDB-local** account, for example `PIAGENT_RO`, through
their approved secure provisioning tool, with a strong password delivered privately
to the owner. Do not paste passwords into shell history, command arguments, tickets
or SQL scripts. Create the account in this PDB with `CONTAINER=CURRENT`, with no
object-creation privileges, quotas, DBA/administrative roles or application roles.
Do not use a common `C##` user for this recipe. The product never provisions users.
Oracle documents local user creation in [CREATE USER (19c)](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/CREATE-USER.html).

Review [grants-template-pdb.sql](grants-template-pdb.sql). Define the trusted
SQL*Plus substitutions `pdb_name` (expected container) and `ro_user` (the new login).
The template first prints identity: execute that inspection separately, verify the
container, then execute the reviewed grants in the same PDB. The comment is a
manual gate, not an automatic assertion. Do not blindly run the entire file.
The template creates no objects; it grants only CREATE SESSION and explicit SELECT
on the [reviewed view union](grants.md#fresh-pdb-inventory-phase-28), locally with
`CONTAINER=CURRENT`. Neither the agent nor the app applies it. See Oracle's
[local grant semantics](https://docs.oracle.com/en/database/oracle/oracle-database/19/dbseg/managing-commonly-and-locally-granted-privileges.html).

`SELECT_CATALOG_ROLE` is an optional, broader DBA shortcut, rather than the explicit
view grants. It exposes substantially more metadata and can include excluded
sources: it is deliberately absent from executable template statements. Prefer
the explicit grants. Review the role's actual nested privileges on this database;
the connect-time account check may refuse a modified role. No AWR/ASH access is
permitted by the product even if a role makes it readable. Never grant write or
ANY privileges to make setup pass. The template never grants `DBA_HIST_*`,
`V$ACTIVE_SESSION_HISTORY`, `DBA_EXTENTS`, `UNIFIED_AUDIT_TRAIL` or `SYS.USER$`.

Application data access is separate. The DBA may grant SELECT on individually
approved application tables/views if the owner wants data questions answered.
`defaultSchema` only controls name resolution; it grants nothing. Do not copy the
historical HR/OE/CO sample grants into a real PDB. Reading source, SQL text and
alert messages can expose sensitive application information; approve that scope.

## 2. Install and write private files (owner)

Follow [installation](install.md) using Node 24, a prepared clone or tarball, then:

```bash
piagent init
```

Default home is `~/.piagent`; set `PIAGENT_HOME` before init to select another.
The home must be a real directory owned by you with mode 0700. Init writes a
private `.env` and a commented `targets.example.json`, without overwriting existing
files. That generated example is a guide: the actual `targets.json` must be strict
JSON without comments. A ready strict JSON example also lives at
[config/targets.example.json](../config/targets.example.json) in the source clone.
Replace every example value before use:

```json
{
	"version": 1,
	"targets": [{
		"name": "app-pdb",
		"description": "Owner-approved Oracle 19c application PDB",
		"host": "db.example.internal",
		"port": 1521,
		"serviceName": "apppdb.example.internal",
		"username": "PIAGENT_RO",
		"passwordFile": "app-pdb.pw",
		"defaultSchema": "APP_OWNER",
		"environment": "production"
	}]
}
```

Save as `$PIAGENT_HOME/targets.json` (default `~/.piagent/targets.json`), mode 0600,
owned by your OS user. File selection is `PIAGENT_TARGETS_FILE` first, then an
existing home `targets.json`, then the packaged lab file. An invalid selected file
fails; it is not a reason to fall back to labs. The private file replaces the
packaged list; it does not append targets. Set `PIAGENT_DEFAULT_TARGET=app-pdb`
in your private `.env` when the list omits the old default lab.

The allowlist contains 1–20 unique names, each lowercase letters/digits/hyphens,
starting with a letter/digit and at most 63 characters. Hosts are DNS/IP without
URL syntax (bracketed IPv6 allowed); ports are 1–65535. Service names begin with
an alphanumeric and contain only alphanumerics, `_`, `.`, `$`, `#`, `-` (128 max).
Use unquoted Oracle identifiers for username/schema and a basename for
`passwordFile`, not an absolute path. Environments are `development`,
`production-like`, `production`. Give each target a nonempty description. The
file must be regular, owned by you and not group/other-writable; use 0600 and the
private home, not a shared location. Privileged Oracle accounts are deny-listed,
including SYS, SYSTEM and administrative accounts; HARNESS_APP and SHOPAPP are
also refused as logins. An application schema name may still be `SHOPAPP`.

Choose a private secret directory, mode 0700. Write the password to
`<secret-directory>/app-pdb.pw`, mode 0600, using a local secure editor or your
approved secret-delivery tool. The contents are only the password, optionally
followed by a newline. Do not put it in JSON or `.env`. In the private `.env`, set:

```dotenv
PIAGENT_SECRET_DIR=/absolute/private/secret-directory
PIAGENT_DEFAULT_TARGET=app-pdb
# Optional: overrides the home targets.json
# PIAGENT_TARGETS_FILE=/absolute/private/targets.json
```

Keep `.env` at mode 0600. Existing shell environment settings take precedence;
check for old target-file/default-target overrides without printing secrets.
Use the same private-home configuration for the CLI and web server.

## 3. Preflight without an LLM

```bash
piagent targets
piagent targets check --target app-pdb
piagent targets check --target app-pdb --json
piagent targets check --target app-pdb --grants-sql
```

`targets` lists configured names and the source file. `targets check` connects,
checks 19c, container, login and privileges, then probes report, sessions, space,
security, SQL, alertlog, PL/SQL, triage, ask, drift, backup, jobs and top views with zero-row SELECTs. Read the
reported container and user before proceeding. The default output summarizes
feature readiness; `--all` lists every feature view. Connection-gate views also
have their own group. `--json` selects machine output;
`--grants-sql` prints suggested SELECT grants for missing views and **applies
nothing**. A DBA must review every suggestion and run approved grants in that PDB,
then repeat the check. Readable means permission to query, not complete evidence;
missing and not-applicable are distinct from an empty result.

The connect-time check fails closed: SESSION_USER must match configuration, with
no proxy and no ISDBA. Session system privileges are limited to CREATE SESSION,
ALTER SESSION, SET CONTAINER, SELECT ANY DICTIONARY, SELECT ANY TABLE, READ ANY
TABLE and SELECT ANY SEQUENCE. These are the validator's tolerated privileges,
not provisioning recommendations: this recipe grants only CREATE SESSION.
Direct/enabled-role object privileges must be SELECT/READ, or EXECUTE/FLASHBACK
only on objects owned by Oracle-maintained users. SELECT_CATALOG_ROLE carries
FLASHBACK on SYS objects, which this rule permits. Failure to inspect privileges
also refuses the connection. On refusal, have the DBA review the named privilege and remove excess
access or provision a fresh account. Do not broaden grants or weaken the check.

Cached plan formatting calls `DBMS_XPLAN.DISPLAY_CURSOR` through SELECT. The
template supplies its fixed-view dependencies, but supplies no EXECUTE grants.
If local PUBLIC/package access is hardened, cached-plan formatting can remain
unavailable; inspect the view-based fallback and availability notes. See Oracle's
[DBMS_XPLAN prerequisites](https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_XPLAN.html).

## 4. Run deterministic commands, then ask

```bash
piagent report --target app-pdb --sections identity
piagent report --target app-pdb
piagent sessions --target app-pdb
piagent space --target app-pdb
piagent backup --target app-pdb
piagent jobs --target app-pdb --since 24h
piagent top --target app-pdb --seconds 15
piagent report --target app-pdb --sections backup,jobs
piagent security --target app-pdb
piagent alertlog --target app-pdb --since 24h
piagent triage --target app-pdb --since 24h
```

These commands make bounded read-only DB calls without an LLM; omit `--summarize`.
Use `piagent plsql doc --target app-pdb --object APP_OWNER.PACKAGE_NAME` for a real
approved object, or `piagent sql --target app-pdb --sql-id <cached-sql-id>` with an
ID observed on this target. Missing grants or PDB-inapplicable evidence should
produce availability notes. Check those notes before interpreting an empty panel
as healthy. Root/instance facts such as redo or recovery-area capacity are not
necessarily PDB-local; do not add totals across PDBs.

See [backup](backup.md), [jobs](jobs.md) and [top](top.md) for evidence limits.
Their view inventories and preflight groups are listed in [grants](grants.md).
Backup/RMAN, redo, control-file and FRA facts are CDB-wide; SYSSTAT and OSSTAT
load/host facts are also CDB-wide. Job views and SQLSTATS have current-container
visibility. Empty PDB rows do not establish absence or whole-CDB recoverability.
The p1 lab grants were applied on 2026-11-06 with owner approval (“Apply all”);
a new PDB still needs its own reviewed grants.

Only after DB checks, configure `PIAGENT_LLM_API_KEY_FILE` in the private `.env`
to the existing Strata key file, and have the operator confirm the existing local
Strata service is loaded. It must be `http://127.0.0.1:8080/v1`; do not register a
cloud provider, restart, unload or reconfigure Strata. Stop if unloaded. Then run
one request at a time:

```bash
piagent ask "Show database identity and current container with evidence" --target app-pdb
```

`doctor` checks Strata health and every configured DB, so use it after configuring
both dependencies. Never send credentials in a question. The product keeps the
19c gate, SELECT/WITH policy, bounded fetches, read-only transactions, rollback and
credential-free audit records; these do not replace least-privilege DBA review.

## Verification limits and troubleshooting

Live PDB behaviour remains **unverified until the owner's first run**. The current
lab evidence is 19.9.1 non-CDB only. RAC, Data Guard standby, other release updates,
TCPS/wallets and remote network setups have not been verified; TCPS/wallet support
is outside this setup path. There is no promise that each fixed view is meaningful
inside a PDB. Local undo, ADR visibility and CDB-wide views require particular
attention. Keep sanitized availability results for the coordinator; do not send
passwords, keys or raw sensitive SQL/source/log text.

- Unknown command: use 1.5.0 for backup/jobs/top; private targets require at least 1.4.0.
- Root refused: obtain the PDB service, rather than changing containers in the app.
- ORA-12514/connection failure: DBA checks service registration and network reachability.
- Login failure: verify account status, PDB service and private password-file basename.
- File validation failure: check ownership, mode and private-home configuration.
- Missing view: DBA reviews `--grants-sql`; not-applicable does not require more access.
- Version/account refusal: use 19c and a dedicated read-only login; never bypass the gate.

### Password-file and secret-directory setup errors

Every database command exits 1 and writes setup guidance to stderr if its
password file cannot be read. The message names the target and password-file
basename only. It never includes the secret-directory path or file contents.
For example:

```text
Password file d1_lab.pw for target d1-19c-lab is missing, unreadable, non-regular or empty in PIAGENT_SECRET_DIR (chmod 600, owned by you)
```

Check that the configured `passwordFile` basename exists inside the exported
`PIAGENT_SECRET_DIR`, is a regular file readable by your user, and contains the
password. Keep it owned by you with mode 600. Do not paste its contents into a
terminal transcript, issue, or chat.

If the message says `Set PIAGENT_SECRET_DIR to the same private secret directory
configured for this process.`, export the same absolute directory used by the
process configuration. Avoid a literal `~` in the environment value; use an
absolute path or shell-expanded `$HOME`. Restart the command after correcting
its environment.

A report that cannot establish a connection exits 1 before printing or saving a
report. Missing view grants after a successful connection still produce the
usual per-section unavailable notes. `targets check --json` keeps its structured
failure on stdout and also writes the guidance to stderr. Doctor reports setup
failures per target. Web responses and chat `/top` and `/triage` show the same
safe guidance; interactive sessions remain usable after a handled error.
