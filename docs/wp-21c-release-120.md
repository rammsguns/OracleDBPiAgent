# WP-21C: 1.2.0 release documentation

Branch: `wp-21c-release-120`. Date: 2026-11-05.
Read AGENTS.md, Phase 21 and the Phase 15 release precedent before editing.

## Delivered

- CHANGELOG.md: empty Unreleased above 1.2.0 dated 2026-11-05; retained phases
  16–20 and added WP-21A hardening and WP-21B eval hygiene/12 blind holdouts.
- README.md: command options, security drift scope, web panels and grants section.
- docs/sqlperf.md: selectors, formats, unique CLI matches, metadata and DATE limits.
- docs/security.md: user-facing report, drift and web use, status/exit semantics,
  required access and deliberate exclusions; preserved historical WP-20A evidence.
- docs/install.md: 1.2.0 upgrade, tarball example, placeholder guidance and Node warning.
- docs/web-ui.md and docs/README.md: current tab behavior and navigation.
- docs/grants.md: all five grants-request files, exact objects grouped by date,
  target and grantee, enabled capabilities, application history and excluded views.

## Verification

- `npm ci`: passed; prepare/build passed; audit reported zero vulnerabilities.
  No manifests, lockfiles or dependencies changed.
- `npm run typecheck`: passed, exit 0.
- `npm test -- --maxWorkers=2`: passed, exit 0; **88 files, 1,304 tests**;
  duration 19.41 seconds.
- `git diff --check`: passed.

Executed `node_modules/.bin/tsx src/cli/index.ts ... --help`, exit 0 for all
19 entries: root, init, targets, doctor, ask, chat, web, report, report history,
report schedule, report schedule run, drift, plsql, plsql list, plsql doc,
triage, alertlog, sql and security. Reviewed output against documented command
names/flags and src/cli registrations. Help only: no ask/chat execution or model
requests. Scope values and behavior were also checked in their implementations;
help's drift description omits security even though its scope parser supports it.

Read-only CLI smokes used an isolated private temporary PIAGENT_HOME and exported
`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets`:

| Invocation (after piagent) | Result |
| --- | --- |
| `targets` | Exit 0, two approved targets. |
| `report schedule --target d1-19c-lab --every 1h` | Exit 0, printed configuration; installed nothing. |
| `security --target d1-19c-lab --who-can HR.EMPLOYEES --json` | Exit 0, status ok, 8 checks. |
| `security --target p1-19c-prod --who-can SHOPAPP.ORDERS --json` | Exit 0, status ok, 8 checks. |
| `sql --target d1-19c-lab --text SELECT --json` | Exit 0, skipped insight, 10 candidates for explicit selection. |
| `sql --target p1-19c-prod --text SELECT --json` | Exit 0, skipped insight, 10 candidates for explicit selection. |
| `sql --target d1-19c-lab --sql-id 0013n159wycxh --child 0 --json` | Exit 0, status ok, DISPLAY_CURSOR; mismatches skipped. |
| `sql --target p1-19c-prod --sql-id 009b3a1xttgju --child 0 --json` | Exit 0, status ok, DISPLAY_CURSOR; indexes/mismatches skipped. |

IDs were selected from the live candidate lists, not treated as permanent fixtures.
All database reads used configured HARNESS_LAB/HARNESS_RO sessions with the product
19c gate and read-only policy. No grant script or database-changing SQL was run.

## Findings and remaining verification

Two implementation details need coordinator attention; no contract changes needed:

1. `assertConfiguredLlmKeyFile` throws a clear PIAGENT_LLM_API_KEY_FILE error,
   but the executable catch in src/cli/index.ts discards its message and prints
   the generic failure. Thus WP-21A's promised user-facing error is not yet
   observable at the executable boundary. Documented this accurately rather
   than claiming it is fixed. No ask invocation was made to verify it live.
2. src/sqlperf/index.ts formats LAST_ACTIVE_TIME/LAST_ANALYZED DATE values with
   a literal Z, without converting their stored clock to UTC. Corrected the
   guide's old claim that a UTC session converts those values. The web heading
   still says all times UTC. Both targets currently use UTC per prior smoke notes;
   another database time-zone configuration was not tested.

CLI text selection opens a unique match, whereas web text selection always lists
candidates. Web Drift currently offers parameters/schema/objects; security scope
is available through the CLI. Documentation reflects these distinctions.

No src/, PLAN.md, package.json, contracts or grant scripts changed. No LLM,
Strata health, doctor action, ask/chat action or evals were run. Full integration,
browser, release-gate and global tarball-install tests remain with the coordinator;
this documentation-only WP did not touch DB/LLM code. Version remains 1.1.0 until
the coordinator bumps it. No tag, push, merge or PR was performed.
