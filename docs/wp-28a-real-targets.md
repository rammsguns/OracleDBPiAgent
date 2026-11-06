# WP-28A: private targets, account check and preflight

Implemented on branch `wp-28a-real-targets`. No shared contract, package manifest or PLAN edits. No dependencies added; the missing node_modules directory was linked to ../needlefish/node_modules as instructed.

## Implementation

- Target source precedence: explicit PIAGENT_TARGETS_FILE, private-home targets.json when present, packaged lab targets.json. A dangling private-file symlink fails rather than silently falling back.
- Private files are opened without following symlinks and checked through the open descriptor: regular file, current owner, no group/other write bits, bounded size. Existing private-home ownership/mode checks apply. Malformed data and unknown properties fail closed with fixed safe guidance.
- Strict 1–20 target validation covers unique names, DNS/IPv4/bracketed IPv6 hosts, integer ports, service names, Oracle identifiers, password basenames, environments, descriptions and existing logTables validation. Every phase-28 denied username is blocked case-insensitively at load and connect.
- Packaged-source targets retain exact pinned values at load and connect. The explicit approvedEndpoints override remains available for the non-19c refusal integration test. Private target files are the product's endpoint allowlist.
- After the 19c gate, before schema setup or feature queries, SELECT-only account checks require matching SESSION_USER, ISDBA=FALSE, no PROXY_USER, and refuse CON_ID=1 or CDB$ROOT with PDB-service guidance. SESSION_PRIVS uses exactly the seven approved privileges. USER_TAB_PRIVS direct grants and ROLE_TAB_PRIVS grants through SESSION_ROLES allow SELECT/READ, or EXECUTE/FLASHBACK only when ALL_USERS.ORACLE_MAINTAINED='Y' confirms an Oracle-maintained owner. Query failures and unknown EXECUTE/FLASHBACK owners refuse the connection. Failed connections close.
- Direct grants are filtered to the session grantee; outgoing grants and PUBLIC grants are not misclassified as direct account grants. There is no role-name exception for SELECT_CATALOG_ROLE. REFERENCES remains refused; EXECUTE and FLASHBACK use the same Oracle-maintained-owner check.
- Identity now populates the coordinator-provided optional containerName. Non-CDB labs remain supported.
- `targets` reports its source. `targets check --target X [--json] [--grants-sql]` prints identity/account status and per-view feature access, including individual report sections and dynamic DBA/ALL PL/SQL dictionary families. Fixed probes use SELECT 1 / ROWNUM=0, cached once per view. Missing grants are identified through ORA-00942/01031; PDB-inapplicable checks and ORA-65040 are marked not-applicable. Unexpected probe failures do not masquerade as missing grants. Suggested SYS.V_$ / dictionary SELECT grants are printed only when requested and never executed.
- Doctor checks all targets even if health fails, relies on the connect-time account policy, preserves view dependency checks, and reports account refusal details. No live doctor/Strata health request was made during this work.
- Init creates a mode-0600 commented targets.example.json from packaged lab values, independently of whether .env exists, and never overwrites it. Remove the introductory comment before copying the example to strict-JSON targets.json.

## Historical account blocker (resolved by the approved FLASHBACK decision)

Initial verification, before the coordinator approved Oracle-maintained-owner FLASHBACK, used only the two approved lab targets and PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets:

- **HARNESS_LAB / d1-19c-lab fails:** `Account check failed: FLASHBACK on SYS`. A separate SELECT-only account diagnostic confirms SELECT_CATALOG_ROLE grants FLASHBACK on 14 SYS-owned objects. This is prohibited by phase 28. No system-privilege violation or other direct/enabled-role object privilege violation was returned. FLASHBACK was not added to the allowlist, and no grants were changed.
- **HARNESS_RO / p1-19c-prod passes:** Oracle 19.9.1.0.0, non-CDB PRODCDB, containerName PRODCDB, current schema SHOPAPP.
- A separate smoke loaded a temporary owner-private targets.json copying only the packaged labs. Results were identical. P1 preflight returned 252 feature/view entries, with only V$ARCHIVED_LOG, V$LOG_HISTORY and V$RMAN_BACKUP_JOB_DETAILS missing. Suggested grants mapped them to SYS.V_$ARCHIVED_LOG, SYS.V_$LOG_HISTORY and SYS.V_$RMAN_BACKUP_JOB_DETAILS for HARNESS_RO; none were applied.
- D1 JSON command smoke reports the named account failure and exit 1. Feature probes do not run after its account refusal.

The original implementation deliberately retained the initial policy and reported this mismatch. The coordinator subsequently approved FLASHBACK only on Oracle-maintained owners; the follow-up below resolves this blocker without changing database grants.

## Files

Production: src/config/index.ts, src/config/targets.ts (new), src/config/environment.ts, src/oracle/index.ts, src/oracle/account.ts (new), src/preflight/index.ts and views.ts (new), and targets/doctor wiring in src/cli/index.ts.

Tests: tests/unit/real-targets.test.ts (new), session.test.ts, doctor.test.ts, release-help.test.ts, safe-config-errors.test.ts and the configuration assertions in wp-a.test.ts; tests/integration/real-targets.test.ts (new).

Tests cover denied usernames, malformed fields, identifiers/hosts, count/duplicates, private source precedence, ownership/modes/type/size/symlinks, init preservation, every allowed system privilege, forbidden system/object privileges, Oracle-owner EXECUTE/FLASHBACK checks, proxy/DBA/mismatched identities, both root indicators, query failures, connection cleanup/order, packaged pinning, missing-view grants and preflight cleanup.

## Contracts and unverified behavior

No contract changes needed: TargetEnvironment production and DatabaseIdentity.containerName already exist in the coordinator's contract. No changes requested in package.json or PLAN.md.

Live PDB/root refusal and real-owner targets remain unverified because workers may connect only to the labs (plus the existing non-19c gate refusal). Root/PDB and widened-account cases use unit fakes. No LLM/Strata calls, database-changing statements, privilege modifications, container operations, pushes, merges or PRs were performed. Browser and LLM eval gates remain coordinator work.

## Initial verification output (before FLASHBACK approval)

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

## Coordinator-approved FLASHBACK follow-up

Implemented the explicit coordinator decision: FLASHBACK object privileges follow exactly the EXECUTE rule, allowed only when ALL_USERS.ORACLE_MAINTAINED='Y'. An application owner or unknown owner remains a refusal. The shared direct/enabled-role query and all system privilege rules remain unchanged.

Files changed in this follow-up: src/oracle/account.ts, tests/unit/real-targets.test.ts, and this report. The table-driven tests explicitly allow FLASHBACK on SYS with Oracle-maintained='Y', refuse FLASHBACK on APP with 'N', and refuse FLASHBACK on UNKNOWN with no owner classification. No contract changes are needed.

Fresh live SELECT-only account checks and preflight on the packaged lab targets:

```text
d1-19c-lab  HARNESS_LAB  passed  Oracle 19.9.1.0.0  container ORCL     252 view entries  no missing views
p1-19c-prod HARNESS_RO   passed  Oracle 19.9.1.0.0  container PRODCDB  252 view entries
```

P1's missing views remain V$ARCHIVED_LOG, V$LOG_HISTORY and V$RMAN_BACKUP_JOB_DETAILS. No grants or database state were changed. No LLM/Strata calls were made. Live PDB/root behavior remains unverified under the lab-only connection restriction.

Follow-up verification:

- `npm run typecheck`: exit 0, no TypeScript diagnostics.
- `npm test -- --maxWorkers=2`:

```text
Test Files  104 passed (104)
     Tests  1723 passed (1723)
  Duration  64.59s
```

Exit 0, including the new FLASHBACK owner cases.

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:

```text
Test Files  27 passed (27)
     Tests  63 passed | 1 skipped (64)
  Duration  207.04s
```

Exit 0. All d1 tests pass again, including account/preflight checks; both labs pass. The only skipped test is the explicitly excluded local-Strata e2e. These results supersede the initial FLASHBACK blocker and failed integration run documented above. `git diff --check` passes.

## Approved review follow-up

Addressed all four minor/info findings from the approved review at ../review-wp-28a-real-targets/docs/review-wp-28a-real-targets.md:

1. CON_NAME is compared case-insensitively with CDB$ROOT, independently of the existing CON_ID=1 refusal. Regression cases cover lowercase and mixed-case names with non-root IDs.
2. Non-JSON `targets check` failure text now goes to stderr and retains exit 1. JSON failure output remains a single object on stdout with exit 1. CLI tests verify the streams, status and cleanup.
3. Username denial uppercases and strips one leading C## before matching the fixed deny list. Tests cover every denied name with upper/lowercase common-user prefixes at load time; connect tests prove C##SYS and c##system are refused before password reads or connections. Existing C##READER acceptance remains covered.
4. Doctor's report callback now identifies AccountCheckError as `target: account check`, rather than `target: connection`. The regression verifies the callback, continued checks of the next target and provider cleanup.

Files changed: src/oracle/account.ts, src/config/targets.ts, src/cli/index.ts; tests/unit/real-targets.test.ts, session.test.ts, doctor.test.ts; this report. No contract changes or dependencies are needed. No database state or grants changed, and no LLM/Strata calls were made. Live PDB behavior remains unverified; root variants use unit fakes under the lab-only connection rule.

Review follow-up verification:

`npm run typecheck`:

```text
> oracledb-pi-agent@1.3.0 typecheck
> tsc -p tsconfig.json --noEmit
```

Exit 0, no diagnostics.

`npm test -- --maxWorkers=2`:

```text
Test Files  104 passed (104)
     Tests  1752 passed (1752)
  Duration  67.60s
```

Exit 0. All 29 new regression cases pass.

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`:

```text
Test Files  27 passed (27)
     Tests  63 passed | 1 skipped (64)
  Duration  205.18s
```

Exit 0. Both approved labs pass account/preflight checks and all d1 tests pass. The only skipped test remains the explicitly excluded local-Strata e2e. `git diff --check` also passes. All four requested review findings are resolved; no new verification limitations beyond the live-PDB restriction noted above.

## Coordinator owner-usability follow-up

Implemented on wp-28a-real-targets after the merged review fixes. src/preflight/views.ts and src/report/ were left untouched.

Target-file errors now use structured SafeConfigError templates with a one-based target index and a valid target name when available. They distinguish file permissions/type/ownership/open failures, file size, JSON syntax, top-level shape/version/count, unknown properties, duplicate names, denied usernames, and invalid name/host/port/serviceName/username/passwordFile/defaultSchema/environment/description/logTables fields. Unknown properties explicitly direct passwords into PIAGENT_SECRET_DIR files. Diagnostics do not echo field values, JSON parse text, paths, password contents, hosts or connection descriptors; the denied username is the sole permitted value exception. Property names are JSON-escaped, and malformed target names are omitted.

Common Oracle connection errors map to fixed guidance with their ORA/NJS code: ORA-01017 (credentials/password file), ORA-28000 (locked), ORA-12514/12505 (PDB service), ORA-12541/12170/NJS-503 (listener/network/timeout), ORA-01045 (CREATE SESSION), and ORA-28001 (expired password). Other failures remain generic. Mapping is shared by targets check, doctor console/report callbacks, and the common CLI error handler. The session provider sanitizes rejected connection errors before they reach features. A command-scoped AsyncLocalStorage record preserves terminal guidance and failure status when a feature converts a connection refusal into unavailable sections, without changing any report reader. Doctor and targets check acknowledge failures they already report, avoiding duplicate output. Targets check keeps exit 1 and stderr for text failures; JSON retains its existing single-object stdout failure shape.

Default targets check text now prints the identity/account line, one summary per feature (ok or missing count/list, plus inapplicable count), and a --grants-sql hint. --all retains the previous per-view listing. JSON output is unchanged, including when --all is also specified. Grant SQL remains printed suggestions only.

New files: src/config/targetErrors.ts, src/oracle/connectionErrors.ts, src/preflight/render.ts, tests/unit/target-usability.test.ts. Updated files: src/config/targets.ts, src/config/safeErrors.ts, src/oracle/index.ts, src/cli/index.ts, tests/unit/session.test.ts, tests/unit/safe-config-errors.test.ts, and this report. No shared contract or package changes are needed.

Tests exercise every requested connection code through targets check, doctor (console and report callback), and the shared handler; generic unknown failures; swallowed connection refusals; all requested target refusal categories and value redaction; default/--all/--json combinations; feature summary counts; and provider rejection sanitization. Connection-failure tests use mocks rather than bad live login attempts, avoiding account-lock risk.

Live default-output smokes on only the two packaged labs pass: HARNESS_LAB shows all features ok; HARNESS_RO shows the known V$ARCHIVED_LOG, V$LOG_HISTORY and V$RMAN_BACKUP_JOB_DETAILS gaps in relevant report/triage summaries, with other features ok. Both print identity/container/account status and the grants hint. No grants, database state, containers or Strata configuration were changed, and no LLM/Strata calls were made. Live PDB behavior and deliberate real login failures remain unverified under the worker restrictions.

Owner-usability verification:

`npm run typecheck`: exit 0, no TypeScript diagnostics.

`npm test -- --maxWorkers=2`:

```text
Test Files  105 passed (105)
     Tests  1784 passed (1784)
  Duration  66.96s
```

Exit 0, including 32 new usability/provider cases. Existing safe-error expectations were updated to the specific file refusal template.

The first filtered integration run completed with 62 passed, 1 failed and 1 skipped (207.69s). The sole failure was the existing p1 report free-space equality assertion at tests/integration/report.test.ts:36: the report observed 592183296 free bytes, while a later independent query observed 591134720 (1 MiB less). All account/preflight checks passed. This is consistent with the live SHOPAPP workload changing free space between separate reads, not a target-validation or connection-guidance failure. No report code, report test, workload or database state was changed; the exact filtered suite was rerun to verify.

Final filtered integration rerun (same command, unchanged code and tests):

`PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npm run test:integration -- --testNamePattern='^(?!.*answers one end-to-end ask through local Strata)'`

```text
Test Files  27 passed (27)
     Tests  63 passed | 1 skipped (64)
  Duration  208.57s
```

Exit 0. Both lab account/preflight checks and all d1 tests pass; the p1 report check passes on the rerun. Only the explicitly excluded local-Strata e2e is skipped. `git diff --check` passes. Implementation commit: 86ae888; this final verification report is committed separately.
