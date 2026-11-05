# WP-22C: safe configuration errors

Built on WP-21D's SafeConfigError. The class now lives in
`src/config/safeErrors.ts`, with the existing environment-module export retained
for compatibility. Its constructor accepts only the reviewed literal catalog,
checks catalog membership at runtime, and retains the original no-argument
placeholder guidance. No message interpolates configuration input.

Audited every explicit throw in `src/config/` and the CLI preflight:

- `environment.ts`: private-home type, ownership and permissions; fixed
  environment-file open, permissions, parse and initialization guidance.
  Home checks now preserve SafeConfigError by class rather than message prefix.
- `index.ts`: loopback/Strata validation, approved-target validation, default
  target, thinking and numeric limits. Numeric setting names map to fixed
  literals rather than an interpolated message.
- `tunables.ts`: bounded-file checks, switches, reasoning budget, temperature,
  tool-note structure and unknown tool names.
- `logTables.ts`: table/column validation.
- `eval.ts`: fixed secondary-endpoint configuration validation; this changes no
  endpoint behavior and sends no requests.
- `paths.ts` and `approvedTargets.ts`: no explicit throws.
- CLI preflight: port, report options, schedule options and unknown target.
  Identity/privilege checks and model-request failures remain operational errors
  and retain generic output.

Native filesystem, URL, JSON, path/type and other unexpected exceptions remain
generic, including rethrown native exceptions. They may include private runtime
input and are never promoted based on their message or name. The top-level CLI
boundary still exposes only actual SafeConfigError instances.

Changed files: the five configuration files with throws above plus `safeErrors.ts`,
`src/cli/index.ts`, `tests/unit/cli-messages.test.ts`,
`tests/unit/safe-config-errors.test.ts`, `docs/install.md`, and this report.
No changes were needed in paths.ts or approvedTargets.ts.

Tests explicitly list every safe message, exercise the CLI boundary for each,
reject unreviewed constructor input, and verify native URL/filesystem errors stay
masked. Subprocess tests run the actual CLI for init's placeholder and a home
with mode 0755, asserting exit 1, empty stdout and the exact fixed guidance. A
preload blocks fetch, HTTP/HTTPS, TLS and sockets; neither test contacts a service.
The mode case invokes `init`, which performs the home permission check.

Dependencies were supplied by the requested ignored symlink to
`../needlefish/node_modules`; no dependency or manifest changes were made.
No contract changes are needed. No LLM/Strata calls or eval measurements were
made. The Strata end-to-end test was deliberately excluded.

Validation (Node v24.18.1):

```text
npm run typecheck
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files 90 passed (90)
Tests 1315 passed (1315)
Duration 39.09s
PASS (exit 0)

git diff --check
PASS (exit 0)
```

```text
export PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets
npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
Test Files 22 passed (22)
Tests 54 passed | 1 skipped (55)
Duration 151.65s
PASS (exit 0)
```

The one skipped test is the explicitly excluded Strata end-to-end ask. Live DB
integration checks passed; LLM behavior was intentionally not verified.
Implementation commit: `f123951`.
