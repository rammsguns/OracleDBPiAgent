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
- `npm test -- --maxWorkers=2`: passed, 149 files / 2,975 tests.
- Focused wallet, session and safe-config tests after the review fixes: passed, 3 files / 33 tests.
- A private scratch target file outside the repository connected to the separate WP-37B lab using the provided wallet alias and secret filenames. `targets check` reported Oracle 19.9.1.0.0, PIPDB1, PIAGENT_RO, account check passed, and the feature checks completed. No credentials were printed.
- The earlier full integration run from the initial WP-37A implementation remained active until stopped at five minutes; that run is unverified. The C1 TCPS scratch check independently verified live wallet-backed TCPS.
- Autonomous Database, one-way TCPS, and self-managed wallet connections remain unverified.
- `git diff --check`: passed.

## Contract changes

No changes needed to `src/contracts.ts`; its phase 37 protocol and wallet fields were sufficient. The safe configuration message catalog was extended locally for wallet CLI/config failures. No dependencies were added.
