# WP-21D: CLI messages

Implemented all three PLAN.md items and Low findings 1 and 2 from
`review-wp-21c:docs/review-wp-21c.md`.

- `src/config/environment.ts`: added `SafeConfigError` with a fixed constructor
  message and no input parameters. The init placeholder guard throws this class;
  its guidance contains no runtime paths, credentials or configuration values.
- `src/cli/index.ts`: the top-level catch uses `handleCliError`, which prints
  `error.message` only for `SafeConfigError`. All other failures retain the
  generic message. Both paths exit 1. Drift help now lists parameters, schema,
  objects and security.
- `tests/unit/cli-messages.test.ts`: covers safe guidance, generic masking
  (including an object spoofing the class name), the CLI placeholder failure,
  and drift help.
- `docs/install.md`: removed the masked-message caveat and documented the
  guidance and exit code. README needed no message correction.

Validation (Node v24.18.1):

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
PASS (exit 0)

npm test -- --maxWorkers=2
Test Files  89 passed (89)
     Tests  1311 passed (1311)
  Duration  17.80s
PASS (exit 0)

git diff --check
PASS (exit 0)
```

The end-to-end unit test invokes the actual CLI entry point in a subprocess with
an isolated PIAGENT_HOME initialized from the template. Its environment does not
inherit key-file settings. A preload blocks fetch, HTTP/HTTPS, TLS and socket
connections, exiting 97 and printing a sentinel on any attempt. The CLI instead
exits 1 with exactly the fixed PIAGENT_LLM_API_KEY_FILE guidance and empty stdout.
No key contents are read by this check; no Strata or DB request is sent.

The initial checks could not find tsc/vitest because this new worktree had no
node_modules. A local ignored symlink to the existing needlefish/node_modules
provided the installed dependencies; no dependencies or manifests were changed.

No contract changes are needed. No DB or LLM implementation code changed;
live integration/eval checks were not run, respecting the release gate's exclusive
Strata use. No live DB behavior was verified or changed.
