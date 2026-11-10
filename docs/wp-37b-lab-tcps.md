# WP-37B delivery report

## Built

- Added an idempotent C1 TCPS setup script with marker-based listener/SQL*Net edits, pre-edit backups, host-generated CA and leaf certificates, encrypted Thin-mode client PEM, and a separate verification script.
- Added a TCPS target example and a live product-session integration test. The test is written against `TargetConfig.protocol` and `TargetConfig.wallet`; it skips with a clear WP-37A message if wallet target support is not present.
- Added the lab setup, repeat, and rollback instructions in `docs/lab-c1-tcps.md`.

## Files

- `scripts/lab/c1-tcps/setup.sh`
- `scripts/lab/c1-tcps/verify.sh`
- `config/targets.tcps.example.json`
- `tests/integration/c1-tcps-live.test.ts`
- `docs/lab-c1-tcps.md`
- `docs/wp-37b-lab-tcps.md`

## Lab and verification

- Backed up the original C1 listener and SQL*Net files, removed the repeated unmarked trial additions, and restored the original settings before installing one managed block.
- Listener and SQL*Net backups were made before cleanup. The repeated unmarked additions were removed. The main `LISTENER` remains IPC + TCP/1521; TCPS now runs on separate `LISTENER_TCPS` with IPC control, TCPS/2484, static `pipdb1` registration, auto-login server wallet, and listener-scoped wallet/authentication settings. Setup reloads but never stops/starts the main listener; reruns stop/start only `LISTENER_TCPS`.
- OpenSSL verified the mutual TLS handshake and server certificate. Direct node-oracledb Thin mode connected through `pipdb1_tcps`, returning PIPDB1, `tcps`, and an Oracle 19c banner. Existing TCP/1521 PIPDB1 connected. A SYSDBA read-only query over stdin reported `v$archive_dest_status.dest_id=2` as `VALID` with no error.
- Repeated `setup.sh` and `verify.sh`; setup replaced rather than duplicated marker blocks, and all four listener/SQL*Net begin/end marker counts remained exactly one. The main listener continued to report only TCP/1521.
- The host wallet directory and files were checked as mode 0700/0600. No password or private key was printed.

## Gates

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: passed (148 files, 2,961 tests).
- `PIAGENT_SECRET_DIR=... npx vitest run tests/integration/c1-tcps-live.test.ts --no-file-parallelism`: passed with one clear skip; the product branch here does not yet support the phase 37 wallet target.
- `git diff --check`: passed.
- `bash -n scripts/lab/c1-tcps/setup.sh scripts/lab/c1-tcps/verify.sh`: passed.

## Contract changes and outstanding items

No edits to `src/contracts.ts` are needed; the phase 37 contract already contains `protocol` and `wallet`. WP-37A support is not in this branch, so the product integration test skips with its WP-37A explanation. The independent Thin-mode wallet connection was verified. `LISTENER_TCPS` does not survive a container restart; rerun setup after restart.
