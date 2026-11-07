# WP-2527F — release 1.5.0 documentation accuracy

Completed 2026-11-06 on branch `wp-2527f-docs`.

## Changes

- README: added backup/jobs/top command rows and feature links; documented chat
  `/top`, opt-in report sections, backup configuration drift, triage routing and
  the three web tabs. Included all implemented drift scopes.
- Backup: documented grouped missing-full findings, prose restore bounds,
  NOARCHIVELOG limits, applied grants, report trends and integrations.
- Jobs: corrected Markdown timestamps to UTC while JSON preserves source offsets;
  documented applied grants, integrations and rolling-window trend semantics.
- Top: corrected JSON counter wording, recorded applied grants and described chat,
  triage and manual web sampling.
- Real targets: removed unfinished phase-28 wording, expanded preflight groups
  and deterministic examples, corrected the PL/SQL subcommand and retained live
  PDB verification limits.
- Grants: indexed the three requests, recorded the owner's “Apply all” approval
  and 2026-11-06 application (13 backup + 8 jobs + 2 top), and replaced stale
  pre-phase-25 inventory counts with current catalog guidance and exact feature
  view lists. Historical SQL headers remain unchanged because SQL is outside scope.

Changed files: `README.md`, `docs/backup.md`, `docs/jobs.md`, `docs/top.md`,
`docs/real-targets.md`, `docs/grants.md`, and this report.

## Verification

Reviewed PLAN.md phases 25–27 and “Progress and second wave (2026-11-06)”,
the feature readers/renderers/CLI registrations, chat parser, triage routing,
report adapters/trends, drift configuration reader, preflight catalog, PDB grant
template, web operations panels and corresponding unit tests.

- `npm run typecheck`: passed (`tsc -p tsconfig.json --noEmit`).
- `npx vitest run tests/unit/release-help.test.ts`: 1 file, 25 tests passed.
- `npm test`: 119 files, 2,203 tests passed.
- `npx tsx src/cli/index.ts <cmd> --help`: checked backup, jobs, top, report,
  drift, triage, chat, targets check, and all other commands referenced in the
  edited guides/README. Documented CLI flags exist in help. Chat `/top` syntax
  was checked against `src/cli/chatTop.ts` because slash commands are REPL syntax.
- Compared all backup/jobs/top preflight views with explicit PDB template grants.
- `git diff --check`: passed.

The installed package still reports 1.4.0; release versioning belongs to the
coordinator. No contract changes or dependencies are needed. No DB connection,
LLM request, integration test or eval was run. Grant application history is taken
from the owner/coordinator record in PLAN.md, not freshly probed. Live PDB,
RAC/standby and restore/media behavior remain unverified.
