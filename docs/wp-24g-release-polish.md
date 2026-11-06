# WP-24G: release-smoke polish

Implemented on branch `wp-24g-release-polish`, 2026-11-06.

## Changes

1. Triage embeds sessions beneath its existing Sessions evidence heading:
   the standalone title is dropped, section headings become H4, and skipped
   sections are omitted. Triage does not currently embed space. The existing
   byte-for-byte fixture for issues without session keywords still passes.
2. Empty sessions and space sections use the plain line
   “None in this snapshot.” Existing explanatory notes remain visible.
   Renderers collapse repeated blank lines, including before session wait groups.
   Nonempty tablespace configuration disclosures remain available.
3. Every command and subcommand has a description. Drift help names parameters,
   schema, objects, security and space. Help tests check every registered command,
   successful help output, nonempty descriptions, and supported drift scopes.
4. The secret-directory mismatch/unset error is a reviewed fixed-literal
   `SafeConfigError`:
   “Set PIAGENT_SECRET_DIR to the same private secret directory configured for this process.”
   It includes no runtime paths. Provider checks for unknown targets, accounts,
   schemas, password filenames, endpoints, thin mode and query limits also use
   catalog messages. Native file/driver errors retain generic CLI handling;
   session closed/busy remains a lifecycle error. Tests check guidance, safe
   messages, early refusal, and config-derived invalid query limits.

## Files changed

- `src/triage/index.ts`: embedding only.
- `src/sessions/index.ts`, `src/space/index.ts`: rendering only.
- `src/cli/index.ts`: command descriptions only.
- `src/config/safeErrors.ts`, `src/oracle/index.ts`: reviewed configuration errors.
- `tests/unit/triage-sessions.test.ts`, `tests/unit/sessions.test.ts`,
  `tests/unit/space.test.ts`: rendering regression coverage.
- `tests/unit/release-help.test.ts`, `tests/unit/cli-messages.test.ts`: help coverage.
- `tests/unit/safe-config-errors.test.ts`, `tests/unit/session.test.ts`:
  catalog, provider configuration and CLI guidance coverage.
- This report.

No dependencies, shared contracts, exported signatures, SQL, agent prompts or
snapshots changed. No coordinator contract changes are needed.

## Validation

Node 24.18.1. This worktree initially lacked dependencies; `npm ci --ignore-scripts`
installed the existing lockfile without changing package files.

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: exit 0; **103 files passed; 1,606 tests passed** (63.30 s).
- `npm run test:browser`: exit 0; **71 passed, 6 skipped** (59.2 s).
  The six optional live browser captures were not enabled.
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  exit 0; **26 files passed; 61 tests passed, 1 skipped** (161.69 s).
  The skipped test is the explicitly excluded Strata end-to-end test.

Live CLI smokes used `node --import tsx src/cli/index.ts` with the requested secret
directory, without `--summarize`:

- `triage --target p1-19c-prod --issue 'sessions are blocked waiting on a row lock'`:
  completed with no stderr; one H1, H4 session sections, no skipped sections.
- `sessions --target d1-19c-lab` and `sessions --target p1-19c-prod`:
  both exit 0; 90 and 88 Markdown lines respectively.
- `space --target d1-19c-lab` and `space --target p1-19c-prod`:
  both exit 0; 137 and 129 Markdown lines respectively.
- All four sessions/space outputs passed checks for single blank lines and no
  empty-section disclosure blocks.
- Root `--help` and help for all 20 command/subcommand paths succeeded:
  init, web, report, report history, report schedule, report schedule run,
  triage, space, sessions, security, sql, alertlog, plsql, plsql list, plsql doc,
  drift, targets, doctor, ask and chat.

Local smoke artifacts are under ignored `var/wp24g-smokes/`. They are live
snapshots, so counts and current activity can change. No Strata calls were made.
All diagnostic SQL uses the existing read-only provider and approved targets;
the integration version gate retains its sole permitted non-19c refusal test.
No database data or schema changes were performed.

## Limits

Optional live browser screenshots and the Strata end-to-end test were not run.
No other verification remains outstanding.
