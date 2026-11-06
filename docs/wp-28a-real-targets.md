# WP-28A: private targets, account check and preflight

Implemented on branch `wp-28a-real-targets`. No shared contract, package manifest or PLAN edits. No dependencies added; the missing node_modules directory was linked to ../needlefish/node_modules as instructed.

## Implementation

- Target source precedence: explicit PIAGENT_TARGETS_FILE, private-home targets.json when present, packaged lab targets.json. A dangling private-file symlink fails rather than silently falling back.
- Private files are opened without following symlinks and checked through the open descriptor: regular file, current owner, no group/other write bits, bounded size. Existing private-home ownership/mode checks apply. Malformed data and unknown properties fail closed with fixed safe guidance.
- Strict 1–20 target validation covers unique names, DNS/IPv4/bracketed IPv6 hosts, integer ports, service names, Oracle identifiers, password basenames, environments, descriptions and existing logTables validation. Every phase-28 denied username is blocked case-insensitively at load and connect.
- Packaged-source targets retain exact pinned values at load and connect. The explicit approvedEndpoints override remains available for the non-19c refusal integration test. Private target files are the product's endpoint allowlist.
- After the 19c gate, before schema setup or feature queries, SELECT-only account checks require matching SESSION_USER, ISDBA=FALSE, no PROXY_USER, and refuse CON_ID=1 or CDB$ROOT with PDB-service guidance. SESSION_PRIVS uses exactly the seven approved privileges. USER_TAB_PRIVS direct grants and ROLE_TAB_PRIVS grants through SESSION_ROLES allow SELECT/READ, or EXECUTE only when ALL_USERS confirms an Oracle-maintained owner. Query failures and unknown EXECUTE owners refuse the connection. Failed connections close.
- Direct grants are filtered to the session grantee; outgoing grants and PUBLIC grants are not misclassified as direct account grants. The check does not introduce an exception for SELECT_CATALOG_ROLE, REFERENCES or FLASHBACK.
- Identity now populates the coordinator-provided optional containerName. Non-CDB labs remain supported.
- `targets` reports its source. `targets check --target X [--json] [--grants-sql]` prints identity/account status and per-view feature access, including individual report sections and dynamic DBA/ALL PL/SQL dictionary families. Fixed probes use SELECT 1 / ROWNUM=0, cached once per view. Missing grants are identified through ORA-00942/01031; PDB-inapplicable checks and ORA-65040 are marked not-applicable. Unexpected probe failures do not masquerade as missing grants. Suggested SYS.V_$ / dictionary SELECT grants are printed only when requested and never executed.
- Doctor checks all targets even if health fails, relies on the connect-time account policy, preserves view dependency checks, and reports account refusal details. No live doctor/Strata health request was made during this work.
- Init creates a mode-0600 commented targets.example.json from packaged lab values, independently of whether .env exists, and never overwrites it. Remove the introductory comment before copying the example to strict-JSON targets.json.

## Live account blocker: do not widen the policy

Using only the two approved lab targets and PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets:

- **HARNESS_LAB / d1-19c-lab fails:** `Account check failed: FLASHBACK on SYS`. A separate SELECT-only account diagnostic confirms SELECT_CATALOG_ROLE grants FLASHBACK on 14 SYS-owned objects. This is prohibited by phase 28. No system-privilege violation or other direct/enabled-role object privilege violation was returned. FLASHBACK was not added to the allowlist, and no grants were changed.
- **HARNESS_RO / p1-19c-prod passes:** Oracle 19.9.1.0.0, non-CDB PRODCDB, containerName PRODCDB, current schema SHOPAPP.
- A separate smoke loaded a temporary owner-private targets.json copying only the packaged labs. Results were identical. P1 preflight returned 252 feature/view entries, with only V$ARCHIVED_LOG, V$LOG_HISTORY and V$RMAN_BACKUP_JOB_DETAILS missing. Suggested grants mapped them to SYS.V_$ARCHIVED_LOG, SYS.V_$LOG_HISTORY and SYS.V_$RMAN_BACKUP_JOB_DETAILS for HARNESS_RO; none were applied.
- D1 JSON command smoke reports the named account failure and exit 1. Feature probes do not run after its account refusal.

The coordinator/owner must resolve the lab grant mismatch or explicitly approve a policy revision. This branch deliberately does not make both labs pass by weakening the approved rules.

## Files

Production: src/config/index.ts, src/config/targets.ts (new), src/config/environment.ts, src/oracle/index.ts, src/oracle/account.ts (new), src/preflight/index.ts and views.ts (new), and targets/doctor wiring in src/cli/index.ts.

Tests: tests/unit/real-targets.test.ts (new), session.test.ts, doctor.test.ts, release-help.test.ts, safe-config-errors.test.ts and the configuration assertions in wp-a.test.ts; tests/integration/real-targets.test.ts (new).

Tests cover denied usernames, malformed fields, identifiers/hosts, count/duplicates, private source precedence, ownership/modes/type/size/symlinks, init preservation, every allowed system privilege, forbidden system/object privileges, Oracle-owner EXECUTE checks, proxy/DBA/mismatched identities, both root indicators, query failures, connection cleanup/order, packaged pinning, missing-view grants and preflight cleanup.

## Contracts and unverified behavior

No contract changes needed: TargetEnvironment production and DatabaseIdentity.containerName already exist in the coordinator's contract. No changes requested in package.json or PLAN.md.

Live PDB/root refusal and real-owner targets remain unverified because workers may connect only to the labs (plus the existing non-19c gate refusal). Root/PDB and widened-account cases use unit fakes. No LLM/Strata calls, database-changing statements, privilege modifications, container operations, pushes, merges or PRs were performed. Browser and LLM eval gates remain coordinator work.

## Verification output

`npm run typecheck` (Node 24.18.1):

```text
> oracledb-pi-agent@1.3.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Exit 0, no diagnostics.

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:

```text
Test Files  26 failed | 1 passed (27)
     Tests  34 failed | 29 passed | 1 skipped (64)
  Duration  81.33s
```

Exit 1. The skipped test is the explicitly excluded Strata e2e. The 34 failures concern d1-dependent cases: 33 fail with the account refusal above, and report-space expects `ok` but receives `unavailable` after d1 refusal. They were not skipped or weakened. The new live account/preflight tests pass for p1 and fail explicitly for d1. The 19c gate refusal remains exercised. No unapproved database was contacted.

Final CLI smoke: p1 `targets check --json --grants-sql` parsed as JSON, accountCheck passed, 252 feature/view entries, three suggested grants. D1 `targets check --json` reported the account refusal. Live PDB semantics remain unverified.

`npm test -- --maxWorkers=2` (final run after incomplete-container fail-closed checks):

```text
Test Files  104 passed (104)
     Tests  1721 passed (1721)
  Duration  66.14s
```

Exit 0. Final `git diff --check` also passed. Earlier intermediate unit failures from the old two-target assumptions and CLI registration list were corrected; the final run above includes those tests. The final incomplete-container guard also passed a fresh live p1 CLI preflight after the integration run.

Implementation commits: d7c4e43 (private targets/account policy), 983c97e (preflight/init/tests), 92c16ea (incomplete container refusal). This report is committed separately.
