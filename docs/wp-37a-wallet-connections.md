# WP-37A wallet and TCPS connections

## Built

- Added Thin-mode wallet ZIP extraction, `tnsnames.ora` parsing, encrypted PEM detection, strict private wallet validation, alias resolution and TCPS connection options.
- Added `piagent wallet import` and `piagent wallet list`; imported wallets are written with directory mode 0700 and file mode 0600.
- Target listings, `doctor`, and the web target list show protocol and wallet alias without exposing wallet paths or contents.
- Added a connection guide covering plain TCP, one-way TCPS, wallet-backed ADB 19c, self-managed wallet prerequisites, troubleshooting and security.

## Files

Implementation: `src/oracle/wallet.ts`, `src/config/targets.ts`, `src/config/targetErrors.ts`, `src/config/safeErrors.ts`, `src/oracle/index.ts`, `src/oracle/connectionErrors.ts`, `src/cli/index.ts`, `src/config/environment.ts`, `src/web/server.ts`.

Tests: `tests/unit/wallet.test.ts`, `tests/unit/session.test.ts`, `tests/unit/web-server.test.ts`, `tests/unit/safe-config-errors.test.ts`, `tests/unit/release-help.test.ts`.

Docs/config: `docs/connections.md`, `README.md`, `docs/real-targets.md`, `config/targets.example.json`.

## Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/session.test.ts tests/unit/wallet.test.ts --maxWorkers=1`: passed, 2 files / 29 tests.
- `npm test -- --maxWorkers=2`: invoked twice. The first run exposed the expected CLI help list needing wallet entries. The second run exited without its final output being returned by the command session; the wallet/session tests were run directly and passed. Full suite result is therefore unverified.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`: remained alive without output for five minutes and was stopped. Integration result is unverified.
- Live TCPS, ADB, and encrypted wallet connections were not verified; WP-37B is separate.
- `git diff --check`: passed.

## Contract changes

No changes needed to `src/contracts.ts`; its phase 37 protocol and wallet fields were sufficient. The safe configuration message catalog was extended locally for wallet CLI/config failures. No dependencies were added.
