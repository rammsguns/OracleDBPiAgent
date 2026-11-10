# C1 PIPDB1 TCPS lab endpoint

`oracle19c-cdb` is configured for a mutual TLS endpoint on container port 2484, using the existing `172.17.0.6` bridge address and the lower-case `pipdb1` service. The ordinary TCP listener on 1521 and the primary database were left intact. The host client wallet lives at `/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps`; its password is stored privately as `c1_tcps_wallet.pw` under `PIAGENT_SECRET_DIR`.

## Repeat setup and verify

Run:

```sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets scripts/lab/c1-tcps/setup.sh
PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets scripts/lab/c1-tcps/verify.sh
```

Setup backs up listener and SQL*Net configuration for each run. It maintains exactly one `# BEGIN WP-37B TCPS` / `# END WP-37B TCPS` block in each file, replacing that block on subsequent runs. It reuses wallet state only when the host PEM/tnsnames pair and container auto-login server wallet both exist; otherwise it rotates the WP-37B wallet state. Client private key generation happens in a private host temporary directory, and only server certificates/key are staged into the container for Oracle wallet import. The container staging key is removed after import.

The wallet directory and files should remain mode 0700 and 0600 respectively. Setup does not recreate the C1 container or alter port mappings. It requests an `lsnrctl reload LISTENER`, never a restart.

## Roll back

Restore the latest `listener.ora` and `sqlnet.ora` backups from `/opt/oracle/oradata/dbconfig/CDB19/wp37b-backup-*` after removing the managed TCPS block, then request a listener reload. Remove `/opt/oracle/admin/CDB19/tcps`, the host `wallets/c1-tcps` directory, and `c1_tcps_wallet.pw` only when the TCPS endpoint is no longer needed. Do not remove or replace C1 database files.

## Verification status

At this WP-37B run, Oracle accepted the listener reload command but the running listener continued to report only TCP/1521; its process did not bind the newly configured 2484 endpoint. The TCPS live check therefore cannot pass without a listener restart, which was intentionally not performed. TCP/1521 PIPDB1 and Data Guard destination 2 were separately checked; destination 2 reported `VALID` with no error. Repeat the verification after an approved listener maintenance window.
