# WP-24E: space and sessions output polish

Implemented on branch `wp-24e-space-polish`.

- Space Markdown has one blank line after section headings, including grouped temp, undo and redo output.
- Every empty section with a note omits the redundant “No rows” details block.
- Redo reports archive log mode and an info finding explaining the NOARCHIVELOG recovery limitation. ARCHIVELOG gets a high finding only when complete, successful supporting reads confirm no FRA and no nonblank `log_archive_dest_n`. Redo-only requests check both prerequisites themselves. Missing mode access preserves redo group/member rows, marks mode `unavailable`, records unavailable evidence and returns a partial report rather than failing.
- Sessions status lines no longer end in a space when a skipped/unavailable section has no note.

Changed files: `src/space/index.ts`, `src/space/sql.ts`, the status-line expression in `src/sessions/index.ts`, `tests/unit/space.test.ts`, `tests/unit/sessions.test.ts`, `docs/space.md`, and this report.

Only API addition: optional `SpaceReport.sections.redo.logMode: string`, populated when redo is selected, with `unavailable` for unreadable/missing mode. All other exported types and signatures are unchanged. No coordinator contract changes are needed. No dependencies added; the local worktree uses a symlink to the existing installed node_modules.

## Validation

`npm run typecheck`: PASS (exit 0).

`npm test -- --maxWorkers=2`: PASS (exit 0).

```text
Test Files  97 passed (97)
     Tests  1477 passed (1477)
  Duration  54.39s
```

Unit fixtures cover every requested polish item, both missing-grant error codes for log mode, NOARCHIVELOG, ARCHIVELOG without destinations, configured FRA, local/remote destinations (including destination 31), blank destinations and inaccessible prerequisite views. Existing SQL parser/policy scans cover the new SELECTs.

With `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`:

```sh
npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'
```

PASS (exit 0):

```text
Test Files  24 passed (24)
     Tests  58 passed | 1 skipped (59)
  Duration  151.10s
```

The single skipped test is the explicitly excluded Strata end-to-end test. Both live space integration tests passed. After the final empty-note rendering edge-case fix, the full unit suite passed again (results above), and a focused live rerun of `tests/integration/space.test.ts` passed 2/2 tests (2.31s). `git diff --check` passed.

## Live checks and limits

Before relying on mode, `SELECT log_mode FROM v$database` succeeded using the configured read-only accounts on both d1 and p1; each returned `NOARCHIVELOG`. Fresh full-report smokes returned all six sections `ok` on both. Independent SELECTs confirmed mode, three equal 209715200-byte redo groups, three total members and no FRA. Both actual CLI Markdown smokes also exited 0 and passed assertions for mode, recovery finding and absence of the redundant empty block. Full captured Markdown and timestamps are in `docs/space.md`.

No live ARCHIVELOG or missing-grant configuration was available; those paths were verified with unit fixtures without changing either database. No Strata calls, database writes, grants, container changes or changes to other projects were made. Nothing was pushed or merged.
