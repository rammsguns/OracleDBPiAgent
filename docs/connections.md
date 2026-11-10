# Oracle connections

This guide configures targets for OracleDBPiAgent. The product supports Oracle Database **19c only**, uses node-oracledb Thin mode (no Instant Client), and stays read-only. Every connection checks the server version, rejects system and `ADMIN` accounts, runs the account safety checks, refuses `CDB$ROOT`, and executes user queries in a read-only transaction. ADB services on 23ai/26ai are refused by the same 19c gate.

## Prerequisites

Install Node 24, run `piagent init`, and set `PIAGENT_SECRET_DIR` to a private directory. Target passwords and wallet passwords are separate files in that directory. Store each one in a file with mode 0600; never put credentials in `targets.json`, shell arguments, or audit output. Network routing, DNS, listener configuration, firewall rules and cloud IP allowlists are managed by the database/network owner.

## Plain TCP

Create a password file without putting the password in shell history, then restrict its permissions:

```sh
umask 077
cat > "$PIAGENT_SECRET_DIR/app.pw"
chmod 600 "$PIAGENT_SECRET_DIR/app.pw"
```

Enter the password on stdin and finish with Ctrl-D. Add a target to `~/.piagent/targets.json` (or the file selected by `PIAGENT_TARGETS_FILE`):

```json
{
  "version": 1,
  "targets": [{
    "name": "app-pdb",
    "description": "Approved Oracle 19c PDB",
    "host": "db.example.internal",
    "port": 1521,
    "serviceName": "apppdb.example.internal",
    "username": "PIAGENT_RO",
    "passwordFile": "app.pw",
    "defaultSchema": "APP_OWNER",
    "environment": "production",
    "protocol": "tcp"
  }]
}
```

Check and connect with `piagent targets check --target app-pdb` and `piagent doctor`.

## One-way TLS (TCPS)

For server-authenticated TLS using the system CA trust, keep the TCP fields and set `"protocol": "tcps"`. This uses `tcps://host:port/serviceName`. The client verifies the server certificate using the runtime's system trust configuration. Wallet is omitted. Certificate chain, hostname and listener must be configured by the DBA. This mode has not been verified against a live endpoint in this work package.

## Oracle Cloud Autonomous Database 19c wallet

ADB wallets provide mutual TLS. Confirm that the database is Oracle 19c; current ADB offerings may use newer versions and will be refused. In OCI, download the instance wallet with a wallet password (do not choose auto-login only). Import it locally:

```sh
piagent wallet import /path/to/Wallet_<database>.zip --name adb-prod
piagent wallet list
```

The importer retains only `ewallet.pem` and `tnsnames.ora`, writes them under `$PIAGENT_HOME/wallets/adb-prod` with mode 0600 in a 0700 directory, and prints alias names and whether a wallet password is needed. Choose the `low` or `medium` service for diagnostics; `high`, `tp`, and `tpurgent` are also listed by Oracle's wallet. Add the database password file as described above and (if the PEM is encrypted) a distinct wallet password file. Both filenames refer to files inside `PIAGENT_SECRET_DIR`:

```json
{
  "version": 1,
  "targets": [{
    "name": "adb-prod",
    "description": "Oracle 19c Autonomous Database",
    "username": "PIAGENT_RO",
    "passwordFile": "adb-prod.pw",
    "defaultSchema": "APP_OWNER",
    "environment": "production",
    "protocol": "tcps",
    "wallet": {
      "directory": "/home/you/.piagent/wallets/adb-prod",
      "tnsAlias": "example_low",
      "passwordFile": "adb-wallet.pw"
    }
  }]
}
```

For wallet targets, `host`, `port` and `serviceName` may be omitted: they are resolved from the alias in `tnsnames.ora`. If supplied, they must agree with the alias. The wallet directory must be an absolute real directory owned by you with mode 0700; both required files must be owned by you and mode 0600. `protocol` defaults to TCPS when a wallet is present; explicitly setting TCP is refused.

Create a dedicated read-only user as ADB `ADMIN` using your approved secure provisioning process; do not connect the product as `ADMIN`. Use the explicit grants in [grants.md](grants.md) and [grants-template-pdb.sql](grants-template-pdb.sql), adapting and reviewing them for the database. ADB does not expose every on-premises dictionary or diagnostic view, so `targets check` may report unavailable features; do not grant broad roles just to make every check pass. Restrict the ADB network access control list to the client egress IPs and use the private endpoint where required by your network design. `targets check`, `doctor`, and a read-only `check` invocation verify the configured target.

## Self-managed DB wallet

A self-managed Oracle 19c server can use a client wallet created with `orapki`. Thin mode requires PEM wallet material: convert/export the client private key and certificate chain to `ewallet.pem`, and provide a `tnsnames.ora` alias with a TCPS descriptor. An auto-login `cwallet.sso` alone is not supported. Keep the wallet directory and files at the required permissions. The exact `orapki`/conversion commands depend on the site's PKI and were not verified in this work package; have the DBA validate the PEM and server trust configuration before use.

## Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `wallet is invalid` | Missing, symlinked, non-private or unowned wallet file/directory; alias missing | Use a real owned directory at 0700, files at 0600, and match `tnsAlias` to `tnsnames.ora` |
| `wallet.passwordFile is required for an encrypted wallet` | Encrypted PEM without password file configured | Add `wallet.passwordFile` naming a file in `PIAGENT_SECRET_DIR` |
| `Invalid password file` | Password file missing, empty, unreadable or not regular | Check filename, ownership, contents and mode 0600 |
| `unknown wallet alias` | Alias not present in `tnsnames.ora` | Use an alias printed by `piagent wallet list` |
| `ORA-29024` / `ORA-28860` | TLS certificate validation/handshake failure | Check wallet, certificate chain, TLS listener and system time |
| `ORA-12541`, `NJS-503` | Listener unreachable or timeout | Check DNS, route, firewall, allowlist, host and port |
| `ORA-12514` / `ORA-12505` | Service not registered or service name incorrect | Choose the correct PDB/ADB service alias |
| Oracle version rejected | Endpoint is not Oracle 19c | Use a supported 19c target |
| Account check rejected | System/admin or over-privileged account | Use a dedicated read-only account and reviewed grants |

## Security

Wallet ZIPs are treated as untrusted input. The importer bounds archive and entry sizes, rejects unsupported ZIP features, ignores archive paths, and writes only the two Thin-mode files. Keep the original ZIP and extracted wallet private. Wallet and database passwords are read only from `PIAGENT_SECRET_DIR`; they are not printed or included in audit records. The product never writes to the database.

**Verification status:** plain TCP remains covered by the existing lab integration suite. TCPS, Autonomous Database, encrypted-wallet connection, and self-managed wallet examples have not been live-verified by WP-37A.
