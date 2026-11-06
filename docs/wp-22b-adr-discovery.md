# WP-22B: alert-log and ADR discovery

Added general system-prompt guidance mapping alert log/messages and ORA- errors,
incidents, problems or ADR to V$DIAG_ALERT_EXT, V$DIAG_INCIDENT and
V$DIAG_PROBLEM, including its stored PROBLEM_KEY. No case IDs, dates, target-specific
answers or example result values enter the prompt. No optional run_query hint was
needed; tool descriptions and contracts remain unchanged.

Read the archived phase21/gate-release answers for hard-p21-alert-levels and
hard-p21-problem-identity using jq filters. Failures searched application tables
for alerts or claimed problem keys required adrci (one constructed a key from an
incident signature). The new guidance addresses discovery without supplying answers.

## Prompt cost

Exactly **+166 characters**, including the leading newline (all ASCII, also
+166 UTF-8 bytes). Estimated **+56 tokens**, rounding 166 / 3 upward using the
repository's conservative character estimate. This is an estimate, not a tokenizer
measurement or observed API usage. Target descriptions, pin and appendix are
unchanged, so this delta applies to every configuration. Existing prompt snapshot
checks preserve the historical fixture and explicitly append the expected guidance;
prefix tests retain their prior budgets plus this bounded addition.

## Live SELECT-only verification

Both configured accounts and endpoints from config/targets.json were used with
passwords read exclusively from exported PIAGENT_SECRET_DIR. Direct thin-driver
connections issued SELECT only (no session ALTER, DDL, DML or PL/SQL). Both version
gates returned 19.9.1.0.0. Each following zero-row projection succeeded on both
d1-19c-lab (HARNESS_LAB) and p1-19c-prod (HARNESS_RO), proving accessible views and
columns without reading diagnostic message contents:

```sql
SELECT ORIGINATING_TIMESTAMP, MESSAGE_LEVEL, MESSAGE_TEXT, PROBLEM_KEY
FROM V$DIAG_ALERT_EXT WHERE 1=0
SELECT INCIDENT_ID, PROBLEM_ID, CON_ID, CREATE_TIME, STATUS
FROM V$DIAG_INCIDENT WHERE 1=0
SELECT PROBLEM_ID, CON_ID, PROBLEM_KEY FROM V$DIAG_PROBLEM WHERE 1=0
```

## Validation

All commands ran with PIAGENT_SECRET_DIR exported to
/home/kiwi/OracleDBHarness/databases/secrets:

- `npm run typecheck`: PASS, no diagnostics.
- `npm test -- --maxWorkers=2`: PASS, 89 files and 1,312 tests (41.33 s).
- `npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:
  PASS, 22 files, 54 tests passed and 1 deliberately excluded Strata test skipped
  (145.44 s). No database tests skipped.
- `git diff --check`: PASS.

Missing node_modules was symlinked to ../needlefish/node_modules as instructed.
No dependencies were added.

Changed files: src/agent/index.ts; tests/unit/chat-triage.test.ts;
tests/unit/short-prefix.test.ts; tests/unit/fixtures/adr-guidance.ts; and this report.

No contract changes requested. No LLM/Strata calls made. The coordinator must run
the PLAN.md A/B 4×4 alternating measurement against master: p18, the two moved
dev cases, dev, holdout ×3, regression and MVP; establish improvement of the moved
cases, no regression beyond noise, and observed token change. Those behavioral
claims cannot be verified under this session's explicit no-LLM rule.
