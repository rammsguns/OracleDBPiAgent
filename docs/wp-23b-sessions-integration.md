# WP-23B: triage and report integration

Implemented on `wp-23b-sessions-integration`, using WP-23A's exported sessions API without editing `src/sessions/`.

## Behavior

Triage collects session evidence for hang/hung, lock/locked, blocked/blocking, waiting, enqueue, deadlock and stuck language, and slowness without a named SQL_ID. The evidence includes the blocking tree, cumulative top waits and transactions at the default 300-second threshold. Deadlock and blocking leads rank before other causes; idle-in-transaction leads name the blocker SID and user. Without blocking, the dominant wait class is explicitly cumulative context, not proof of the current cause. Up to two distinct blocker SQL_IDs enter the existing SQL evidence reader, sequentially. `/triage` inherits this behavior through the existing triage function.

Session queries share one underlying session so self-exclusion remains consistent. Existing triage auditing and credential redaction apply. Missing grants preserve partial evidence; other diagnostic failures produce safe, fixed guidance.

Reports accept `--sections sessions`, alone or combined with existing selectors. The section saves scalar table rows containing blocking paths and cycle/vanished/depth markers, top wait events, transaction details, findings, and history metrics. Defaults exclude sessions. Existing history validation and persistence need no schema changes.

Example commands (no summary/LLM option):

```sh
npm run piagent -- triage --target p1-19c-prod --issue 'Requests are blocked'
npm run piagent -- report --target p1-19c-prod --sections sessions --md
npm run piagent -- report --target p1-19c-prod --sections identity,sessions --diff
```

History adds blocker and long-transaction counts, plus non-idle wait seconds per class as deltas between adjacent reports. Deltas require an unchanged, nonempty instance startup timestamp and matching source. Missing reports, unavailable/row-limited evidence, restarts and decreasing counters yield gaps. Deltas are seconds per reporting interval, not rates. Diff marks count changes and shifts in the dominant cumulative wait class; it withholds wait comparisons across restarts, missing classes or decreasing counters.

## Changed files

- `src/triage/sessions.ts`: trigger, audited adapter, blocker SQL_ID selection and ranked session leads.
- `src/triage/index.ts`: optional collection, SQL evidence and Markdown wiring.
- `src/report/sessions.ts`: audited sessions adapter, scalar report rows and saved-metric validation.
- `src/report/index.ts`: opt-in selector and safe unavailable handling.
- `src/report/trends.ts`: session counts and restart-safe wait deltas.
- `src/report/diff.ts`: session count and wait-class shift markers.
- `tests/unit/triage-sessions.test.ts`, `tests/unit/fixtures/triage-before-sessions.json`: pre-WP triage JSON/Markdown snapshot and trigger, ranking, cap, audit, cleanup and failure coverage.
- `tests/unit/report-sessions.test.ts`: collection, SELECT policy, counters, gaps and diff markers. Existing `report-security.test.ts` checks default JSON/Markdown against its master snapshot.
- `tests/integration/sessions-integration.test.ts`: read-only triage/report evidence on both configured 19c targets.
- This report.

## Validation

All final commands completed successfully on Node 24.18.1:

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
Exit 0; no diagnostics.

npm test -- --maxWorkers=2
Test Files  96 passed (96)
Tests       1381 passed (1381)
Duration    47.78s

PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern="^(?!.*answers one end-to-end ask through local Strata)"
Test Files  24 passed (24)
Tests       58 passed | 1 skipped (59)
Duration    151.91s
```

The sole skipped test is the explicitly excluded Strata end-to-end ask. Both configured 19c targets passed the new sessions triage/report integration checks, including available startup identity. The default report master snapshot and the pre-WP triage JSON/Markdown snapshot pass. `git diff --check` is clean.

The worktree initially had no `node_modules`; verification uses an ignored symlink to this project's existing `needlefish/node_modules`. No dependencies or lockfiles changed.

Implementation commits: `32454a3` (triage), `156a8ea` (report, trends and diff).

## Contract needs and limits

No shared contract changes, dependencies, CLI registration changes, prompt changes or coordinator edits are required. `src/contracts.ts`, `package.json`, `PLAN.md` and `src/sessions/` are unchanged.

No LLM calls were made. The requested integration name filter excludes the existing Strata end-to-end ask. No locks or transactions were created as fixtures; blocking chains, cycles and idle blockers are exercised with unit fixtures. Live blocking and deadlock reproduction was intentionally not attempted. Session snapshots remain sequences of SELECTs and can observe sessions vanishing between queries. Count trends describe visible snapshots, not historical database-wide totals.
