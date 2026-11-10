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
- Listener and SQL*Net backups were made before cleanup. The repeated unmarked additions were removed; current files each have exactly one managed marker block. The listener remains running and TCP-only. `lsnrctl reload LISTENER` returned successfully, but the live listener continued to report only 1521; no listener restart was performed. Consequently, TCPS/2484 and the direct wallet connection remain unverified and the live integration test skips while wallet support/endpoint availability is not met.
- C1 PIPDB1 TCP/1521 was checked. A SYSDBA read-only query over stdin reported `v$archive_dest_status.dest_id=2` as `VALID` with no error.
- The host wallet directory and files were checked as mode 0700/0600. No password or private key was printed.

## Gates

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: passed (148 files, 2,961 tests).
- `PIAGENT_SECRET_DIR=... npx vitest run tests/integration/c1-tcps-live.test.ts --no-file-parallelism`: passed with one clear skip; the product branch here does not yet support the phase 37 wallet target.
- `git diff --check`: passed.

## Contract changes and outstanding items

No edits to `src/contracts.ts` are needed; the phase 37 contract already contains `protocol` and `wallet`. WP-37A support is not in this branch. The listener socket does not become live on reload alone in this C1 state, so an approved listener restart window is needed before endpoint and mTLS verification can pass.
