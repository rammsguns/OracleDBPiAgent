# C1 PIPDB1 TCPS lab endpoint

`oracle19c-cdb` uses a separate `LISTENER_TCPS` for mutual TLS on container port 2484, at bridge IP `172.17.0.6`, with static service `pipdb1`. The main `LISTENER` remains IPC plus TCP/1521 and does not include TCPS. The host client wallet lives at `/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps`; its password is stored privately as `c1_tcps_wallet.pw` under `PIAGENT_SECRET_DIR`.

## Repeat setup and verify

Run:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets scripts/lab/c1-tcps/setup.sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets scripts/lab/c1-tcps/verify.sh
```

Setup backs up listener and SQL*Net configuration for each run. It maintains exactly one `# BEGIN WP-37B TCPS` / `# END WP-37B TCPS` block in each file, replacing that block on subsequent runs. The listener block defines `LISTENER_TCPS`, its static `pipdb1` registration, and its listener-scoped wallet/authentication values. The SQL*Net block supplies the database-side TLS wallet and client authentication; these settings are used for TLS and do not change the plain TCP listener. Setup reuses wallet state only when the host PEM/tnsnames pair and container auto-login server wallet both exist; otherwise it rotates WP-37B wallet state. Client private key generation happens in a private host temporary directory, and only server certificates/key are staged into the container for Oracle wallet import. The container staging key is removed after import.

The wallet directory and files should remain mode 0700 and 0600 respectively. Setup does not recreate the C1 container or alter port mappings. It reloads the main `LISTENER` without stopping it, and starts `LISTENER_TCPS` separately. On reruns it stops and starts only `LISTENER_TCPS`. The secondary listener does not survive a container restart, so run `setup.sh` again after the container restarts.

## Roll back

Stop only the secondary listener with `lsnrctl stop LISTENER_TCPS`. Restore the original `listener.ora` and `sqlnet.ora` from the chosen backup under `/opt/oracle/oradata/dbconfig/CDB19/wp37b-backup-*`, then run `lsnrctl reload LISTENER` (do not stop/start the main listener). Remove `/opt/oracle/admin/CDB19/tcps`, the host `wallets/c1-tcps` directory, and `c1_tcps_wallet.pw` only when the TCPS endpoint is no longer needed. Do not remove or replace C1 database files.

## Verification status

Verified: the main `LISTENER` retains IPC and TCP/1521; `LISTENER_TCPS` reports TCPS/2484 and static `pipdb1`; OpenSSL completed a client-authenticated TLS handshake with certificate verification; node-oracledb Thin connected through `pipdb1_tcps` and returned PIPDB1, `tcps`, and Oracle Database 19c; the existing TCP PIPDB1 connection succeeded; and Data Guard destination 2 was `VALID` with no error. `LISTENER_TCPS` is not configured to survive container restart; rerun setup after restart.
