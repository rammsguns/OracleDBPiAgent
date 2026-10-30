# WP-9A security review fixes

Implemented section 3, Fixes 1–4 of the 2026-10-29 security review.

- `src/config/environment.ts`: inspect homes with `lstat`, create missing homes
  with mode 0700, and refuse symlinks, non-directories, foreign ownership, or
  group/other permissions. Never chmod an existing home. Errors name
  `PIAGENT_HOME` without including file contents. Missing explicitly selected env
  files now fail; missing default env files remain optional.
- `src/cli/index.ts`: remove startup home creation. Initialization still ensures
  the home. `src/audit/index.ts` and `src/report/history.ts` ensure the home before
  default writes, covering CLI and web consumers.
- Explicit audit/report environment settings retain their behavior. An optional
  fourth `saveReport` argument, `ensureDefaultHome` (default true), allows CLI
  `--out` and injected web report directories to retain explicit-path behavior,
  even when they happen to match the default directory. `src/web/server.ts`
  passes this distinction through. No shared contracts, dependencies, or
  coordinator-owned package settings need changes.
- `.env.example` adds the authorized commented report-directory setting;
  `docs/install.md` documents home validation, env-file failure behavior and
  clone-local audit/report paths.
- `tests/unit/global-install.test.ts` covers home refusal without chmod, symlink
  and file refusal, simulated foreign uid, explicit/default missing env files,
  `main --version` without home creation, first default audit/report writes,
  unsafe default-write homes, and explicit path behavior. All directories are
  temporary; the foreign-owner check mocks `process.getuid`, without chown.

Validation:

- `npm run typecheck`: passed.
- `npm test`: 34 files passed, 615 tests passed.
- `npm run build`: passed.
- `npm run test:integration -- -t "^(?!.*answers one end-to-end)"`:
  7 files passed, 24 tests passed, 1 excluded LLM test skipped. The worktree has
  no `.env`; the initial requested source command therefore skipped dependency
  tests. The verified run sourced the coordinator worktree's `.env` directly
  from `/home/kiwi/orca/workspaces/OracleDBPiAgent/needlefish/.env`, without
  displaying or copying it. Both back-to-back report-diff tests passed; the
  earlier transient failure did not recur.
- Temporary-prefix tarball: `npm pack`, global install into a temporary prefix
  with temporary HOME/cache, from an unrelated directory; version was 1.0.0 and
  created no agent home; init created home 0700 and env 0600; repeated init
  preserved env bytes; targets listed exactly the two approved targets. All
  temporary artifacts were removed. No DB or LLM calls in this install check.
- `git diff --check`: passed.

No LLM calls were made. Database verification used the existing read-only
integration suite; no database code changed. No push or merge was performed.
