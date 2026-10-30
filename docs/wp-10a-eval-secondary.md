# WP-10A implementation report

Built eval-only secondary endpoint selection, exact URL validation, separate key
file and context settings, strict loaded/model health prechecks, PID file locks,
endpoint/health result metadata, and endpoint imbalance warnings in both
comparison modes. Setup and balanced-gate guidance is in
[evals-two-servers.md](evals-two-servers.md).

Product isolation: loadConfig is unchanged and never reads PIAGENT_EVAL_*.
The public createStrataProvider wrapper always selects the primary-only internal
path, and product health/inference continue rejecting port 18080. The eval
runtime alone imports the secondary config/provider modules and injects provider
wiring through the agent factory's existing optional argument. No contracts,
dependencies, package settings or product entry points changed.

Changed files: evals/run.ts, evals/runtime.ts, evals/compare.ts,
evals/endpoint-lock.ts, src/config/eval.ts, src/llm/index.ts,
src/llm/internal.ts, src/llm/eval.ts, tests/unit/eval-secondary.test.ts,
docs/README.md, docs/evals-two-servers.md, and this report.

Verification:

- npm run typecheck: passed.
- npm test: 35 files, 626 tests passed.
- With the coordinator workspace environment loaded:
  npm run test:integration -- -t "^(?!.*answers one end-to-end)"
  passed 7 files, 24 tests passed and 1 skipped.
- git diff --check: passed.
- Unit tests use fake health responses and fake key files. Child-process lock
  coverage proves exclusivity and automatic exit cleanup.
- No eval runner execution against a server, no LLM calls, and no contact with
  192.168.3.254. No key or password values printed or persisted.

Contract changes needed: none.

Not verified: the owner's tunnel and secondary server are unavailable for live
checks; actual health response compatibility and same-code evals remain for the
coordinator, together with Antigravity security review and balanced gate script.
Health snapshots intentionally contain only loaded and model fields, avoiding
arbitrary server response fields. SIGKILL can leave a PID lock, recovered on the
next run; malformed locks and interrupted recovery files require inspection.
