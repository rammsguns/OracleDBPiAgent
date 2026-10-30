# Rules for agents working in OracleDBPiAgent

Read `PLAN.md` first. It is the source of truth for scope, layout and the work package
(WP) you own.

## Hard rules

1. **Oracle 19c only.** Connect only to the two targets in `config/targets.json`.
   The one exception is the 19c-gate integration test, which may connect to
   `localhost:1521/FREEPDB1` to prove refusal. Never use SYS, SYSTEM, HARNESS_APP or
   SHOPAPP credentials. Never run DML, DDL or PL/SQL that changes anything on any
   database, including during development and debugging.
2. **Local LLM only.** The product talks only to Strata at `http://127.0.0.1:8080/v1`.
   Do not add or register any cloud LLM provider, SDK or API key. Do not restart,
   unload or reconfigure Strata. If `/health` shows it unloaded, stop and report
   back. Send LLM calls one at a time, never in parallel.
   **Eval-only exception (phase 10):** the eval runner, and nothing else, may also
   use the owner's second Strata through a loopback SSH tunnel
   (`http://127.0.0.1:18080/v1`), with its key read from the file named in
   `PIAGENT_EVAL_SECONDARY_API_KEY_FILE`. Send at most one call at a time to each
   server. The product (CLI, web, report) never uses it. The same no-restart and
   no-reconfigure rules apply to it, and no other endpoint is allowed.
3. **Secrets.** Read passwords only from `PIAGENT_SECRET_DIR`. Never copy, print, log
   or commit a password or the Strata API key. The audit log stores SQL hashes and
   short SQL text, never bind values or credentials.
4. **Stay in your lane.** Edit only the paths your WP owns in PLAN.md (plus tests for
   them, and `docs/` notes about them). `src/contracts.ts`, `package.json` and
   `PLAN.md` belong to the coordinator. If you need a change there, describe it in
   your final report and code against a local adapter in the meantime. Do not add
   dependencies without approval; the needed ones are already installed.
5. **Git.** Work and commit only on your own branch, with small commits and clear
   messages. Do not push, merge, rebase other branches or open PRs; the coordinator
   merges. Never use bare `git stash`.
6. **Don't touch other projects.** Do not modify `/home/kiwi/OracleDBHarness`, the
   Docker containers, or `~/llm-rig`. Reading their docs is fine.

## Conventions

- TypeScript (ESM, `NodeNext`, strict). Node 24. Use tabs for indentation, matching
  `src/contracts.ts`.
- Tests use vitest. Unit tests (`tests/unit/`) must not need a DB or the LLM.
  Integration tests (`tests/integration/`) skip with a clear message when a
  dependency is down.
- PI tools: define `AgentTool` with `typebox` schemas. Throw on failure; don't
  return error text as content.
- Before you finish, run `npm run typecheck` and `npm test` (and
  `npm run test:integration` if you touched DB or LLM code), and paste the results in
  your final report.

## Final report (end of your session)

Report what you built, the files you changed, test results, every contract change
you need, and anything you could not verify.
