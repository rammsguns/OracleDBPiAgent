# Continuous integration

[The CI workflow](../.github/workflows/ci.yml) runs on pushes and pull requests
to `main`, on `ubuntu-latest` with Node 24 and npm's dependency cache. It runs:

1. `npm ci` (install the lockfile's dependencies).
2. `npm run typecheck`.
3. `npm test` (unit tests only).
4. `npm run build` (TypeScript output and static web assets).

Actions are pinned to full commit SHAs with release versions in comments. The
workflow has only `contents: read` permissions, does not persist checkout
credentials, and needs no configured secrets, database or LLM.

Integration tests deliberately stay outside CI because they require the local
Oracle 19c targets and/or Strata. Browser tests require the separate browser
setup and application fixtures. Evals require the local database targets and
sequential Strata requests. Run those checks separately in the configured local
environment; they are not prerequisites for a contributor's unit-test build.

## Reproduce the clean-clone check

With Node 24 and npm on `PATH`, run this from the repository. It clones the
current branch's committed state outside the repository, creates a fresh home,
and runs exactly the CI commands with the inherited environment removed:

```sh
source_repo=$(git rev-parse --show-toplevel)
source_branch=$(git branch --show-current)
check_root=$(mktemp -d)
git clone --no-local --single-branch --branch "$source_branch" "$source_repo" "$check_root/repo"
mkdir "$check_root/home"
cd "$check_root/repo"
test ! -e .env
env -i HOME="$check_root/home" PATH="$PATH" bash --noprofile --norc -c \
  'npm ci && npm run typecheck && npm test && npm run build'
```

Commit changes before cloning so they are included. No `.env`, `PIAGENT_*`
variables, existing npm user configuration, secret files, `var/`, or
`eval-archive/` are needed. Keep the temporary directory to inspect failures,
then remove it when finished.

## Local verification (2026-10-29)

Verified workflow commit `3f5fbd9` with Node `v24.18.1`. Both the worktree and
fresh clone passed typecheck and unit tests; the clone also passed `npm ci`
and build under `env -i` with a fresh home and no `.env`:

```text
Test Files  32 passed (32)
     Tests  594 passed (594)
```

All four clean-clone commands exited successfully. No unit-test fixes, product
changes or contract changes were needed. Integration, browser and eval checks
were deliberately not run. The hosted GitHub run and Antigravity review remain
for the coordinator after merge/push; this worker did not push.
